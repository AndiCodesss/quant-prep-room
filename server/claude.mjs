// The tutor's connection to Claude.
//
// Two transports, one interface:
//   - ANTHROPIC_API_KEY set  -> the Anthropic API through the official SDK.
//   - otherwise              -> the Claude Code CLI in headless mode, which uses the Claude login on this machine.
//
// streamClaude({messages, images, tier, signal, onText}) resolves with the full text.
// Errors carry a `code` the web app knows how to word: rate_limited, session_expired, refused, empty_completion, cancelled, upstream.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";

const SYSTEM =
  "You are a patient, rigorous mathematics and finance tutor inside a private study app. " +
  "Answer with exactly what the request asks for, in the format it asks for, with no preamble.";

const fail = (code, message) => Object.assign(new Error(message || code), { code });

let active = 0;
export async function streamClaude(req) {
  if (active >= config.claude.maxConcurrent) throw fail("rate_limited");
  active++;
  try {
    const run = config.claude.apiKey ? viaApi : viaCli;
    const text = await run(req);
    if (!text.trim()) throw fail("empty_completion");
    return text;
  } finally {
    active--;
  }
}

export const transport = () => (config.claude.apiKey ? "api" : "cli");
const profile = (tier) => config.claude.tiers[tier] || config.claude.tiers.main;

/** Images ride along with the last user message. */
function withImages(messages, images) {
  const out = messages.map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] }));
  const last = out[out.length - 1];
  last.content = [
    ...images.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/png", data } })),
    ...last.content,
  ];
  return out;
}

/* ---------------- Anthropic API ---------------- */
let sdk;
async function viaApi({ messages, images = [], tier, signal, onText }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  sdk ||= new Anthropic({ apiKey: config.claude.apiKey });
  try {
    const stream = sdk.beta.messages.stream(
      {
        model: profile(tier).model,
        max_tokens: 64000,
        system: SYSTEM,
        messages: withImages(messages, images),
        ...(profile(tier).effort ? { output_config: { effort: profile(tier).effort } } : {}),
        // If a safety classifier declines, the API retries on a fallback model instead of failing the lesson.
        ...(tier === "main" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
      },
      { signal },
    );
    stream.on("text", (delta) => onText?.(delta));
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw fail("refused");
    return message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  } catch (e) {
    if (e.code) throw e;
    if (signal?.aborted || e instanceof Anthropic.APIUserAbortError) throw fail("cancelled");
    if (e instanceof Anthropic.RateLimitError) throw fail("rate_limited");
    if (e instanceof Anthropic.AuthenticationError) throw fail("session_expired");
    throw fail("upstream", e.message);
  }
}

/* ---------------- Claude Code CLI (headless) ---------------- */
// The CLI takes one user message. Earlier turns of a chat are folded into it as a transcript.
function asSinglePrompt(messages) {
  if (messages.length === 1) return messages[0].content;
  const earlier = messages.slice(0, -1).map((m) => `${m.role === "assistant" ? "Tutor" : "Student"}: ${m.content}`);
  return `Conversation so far:\n\n${earlier.join("\n\n")}\n\nThe student now says:\n\n${messages.at(-1).content}`;
}

const cliCwd = path.join(config.dataDir, "claude-cwd");

function spawnCli(tier) {
  fs.mkdirSync(cliCwd, { recursive: true });
  const { model, effort } = profile(tier);
  const child = spawn(config.claude.cli, [
    "--print",
    "--model", model,
    "--system-prompt", SYSTEM,
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--tools", "",                 // a plain completion: no file, shell or web access
    "--setting-sources", "",       // ignore the machine's own Claude Code settings, hooks and memory
    "--strict-mcp-config",
    "--no-session-persistence",
    ...(effort ? ["--effort", effort] : []),
  ], { cwd: cliCwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  child.on("error", () => {});
  return child;
}

// Starting the CLI costs about two seconds. So one process per tier is kept started and waiting for its
// question; a request takes it and a fresh one is started behind it. Waiting processes are replaced every
// few minutes, and dropped when a tier has not been used for a while ("check" is always kept ready).
const WARM_MAX_AGE = 4 * 60e3, WARM_KEEP = 20 * 60e3;
const warm = new Map(), lastUsed = new Map();
const alive = (child) => child.exitCode === null && child.signalCode === null && !child.killed;

function prewarm(tier) {
  if (config.claude.apiKey || warm.has(tier)) return;
  const child = spawnCli(tier);
  warm.set(tier, { child, born: Date.now() });
  child.once("exit", () => { if (warm.get(tier)?.child === child) warm.delete(tier); });
}
function takeCli(tier) {
  const w = warm.get(tier);
  warm.delete(tier);
  lastUsed.set(tier, Date.now());
  setTimeout(() => prewarm(tier), 250).unref();
  if (w && alive(w.child) && Date.now() - w.born < WARM_MAX_AGE) return w.child;
  if (w) w.child.kill();
  return spawnCli(tier);
}
setInterval(() => {
  for (const [tier, w] of warm) {
    const keep = tier === "check" || Date.now() - (lastUsed.get(tier) || 0) < WARM_KEEP;
    if (keep && Date.now() - w.born < WARM_MAX_AGE) continue;
    warm.delete(tier);
    w.child.kill();
    if (keep) prewarm(tier);
  }
}, 30e3).unref();
process.on("exit", () => { for (const w of warm.values()) w.child.kill(); });
setTimeout(() => prewarm("check"), 1000).unref();

function viaCli({ messages, images = [], tier, signal, onText }) {
  const input = {
    type: "user",
    message: { role: "user", content: withImages([{ role: "user", content: asSinglePrompt(messages) }], images)[0].content },
  };

  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(fail("cancelled"));
    const child = takeCli(tier);
    let text = "", buf = "", stderr = "", errCode = null, settled = false;
    const done = (err, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      err ? reject(err) : resolve(value);
    };
    const onAbort = () => { child.kill(); done(fail("cancelled")); };
    signal?.addEventListener("abort", onAbort, { once: true });

    const handle = (line) => {
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === "stream_event" && ev.event?.type === "content_block_delta" && ev.event.delta?.type === "text_delta") {
        text += ev.event.delta.text;
        onText?.(ev.event.delta.text);
      } else if (ev.type === "stream_event" && ev.event?.type === "message_delta" && ev.event.delta?.stop_reason === "refusal") {
        errCode = "refused";
      } else if (ev.type === "rate_limit_event" && ev.rate_limit_info?.status === "rejected") {
        errCode = "rate_limited";
      } else if (ev.type === "result" && ev.is_error) {
        const why = String(ev.result || ev.subtype || "");
        errCode ||= /log ?in|auth|credential|401/i.test(why) ? "session_expired" : /limit|429/i.test(why) ? "rate_limited" : "upstream";
        stderr += why;
      }
    };
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    child.stderr.setEncoding("utf8").on("data", (c) => { stderr = (stderr + c).slice(-2000); });
    child.on("error", (e) => done(fail("upstream", `could not start the Claude CLI (${config.claude.cli}): ${e.message}`)));
    child.on("close", (code) => {
      if (buf.trim()) handle(buf);
      if (errCode) return done(fail(errCode, stderr.trim()));
      if (code !== 0 && !text) return done(fail("upstream", stderr.trim() || `claude exited with code ${code}`));
      done(null, text);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input) + "\n");
  });
}
