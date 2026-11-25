// Natural voice. A text-to-speech model runs on a rented GPU (Google Colab) only while it is needed.
//
//   browser  --POST /api/voice/speak-->  this server  --WebSocket-->  GPU worker (colab/tts_worker.py)
//   browser  <-----streamed PCM audio--  this server  <--audio frames--
//
// The worker dials in to us, so the GPU machine needs no public address. This module starts the worker on
// request, relays speech jobs, and shuts the GPU down again after a period without use.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";
import { config } from "./config.mjs";
import { tokenMatches } from "./auth.mjs";

const SAMPLE_RATE = 24000;
const START_TIMEOUT_MS = 10 * 60e3;
const workerConfigFile = path.join(config.dataDir, "voice-worker.json");

let state = "off"; // off | starting | ready | stopping
let worker = null, workerInfo = null, launcher = null;
let lastError = "", startedAt = 0, lastUsed = 0, startTimer = null;
let nextJob = 1;
const jobs = new Map(); // id -> {onAudio, onEnd}

const log = (...a) => console.log(new Date().toISOString(), "[voice]", ...a);
export const enabled = () => !!(config.voice.launchCmd && config.voice.workerToken && config.publicUrl);

export function status() {
  return {
    enabled: enabled(),
    state,
    error: lastError,
    sampleRate: SAMPLE_RATE,
    voices: workerInfo?.voices || [],
    device: workerInfo?.device || "",
    gpu: config.voice.gpu,
    idleMinutes: config.voice.idleMinutes,
    startedAt: startedAt || null,
  };
}

function setState(next, error = "") {
  if (state !== next) log(state, "->", next, error);
  state = next;
  lastError = error;
  if (next !== "starting") { clearTimeout(startTimer); startTimer = null; }
}

// Detached: a restart of this server must not orphan a GPU session half-way through its own shutdown.
// The scripts write their own log (data/logs/voice-launch.log).
function runShell(cmd) {
  return spawn(cmd, { shell: true, detached: true, windowsHide: true, stdio: "ignore", cwd: config.dataDir });
}

export function start() {
  if (!enabled()) throw Object.assign(new Error("voice worker is not configured"), { status: 409 });
  if (state === "ready" || state === "starting") return status();
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(workerConfigFile, JSON.stringify({
    url: config.publicUrl.replace(/^http/, "ws") + "/api/voice/worker",
    token: config.voice.workerToken,
    gpu: config.voice.gpu,
    idle_minutes: config.voice.idleMinutes + 5, // the worker's own backstop, slightly behind ours
    max_minutes: config.voice.maxMinutes,
  }));
  setState("starting");
  startedAt = Date.now();
  launcher = runShell(config.voice.launchCmd);
  const mine = launcher;
  launcher.on("exit", (code) => {
    if (launcher !== mine) return;
    launcher = null;
    if (state === "starting") setState("off", `The GPU session ended before the voice was ready (exit ${code}). See data/logs/voice-launch.log.`);
    else if (state === "stopping") setState("off");
  });
  launcher.on("error", (e) => { if (launcher === mine) { launcher = null; setState("off", e.message); } });
  startTimer = setTimeout(() => { if (state === "starting") stop("The GPU session took too long to start."); }, START_TIMEOUT_MS);
  return status();
}

/** Ask the worker to exit and make sure the GPU runtime is released. */
export function stop(error = "") {
  if (worker) { try { worker.send(JSON.stringify({ type: "shutdown" })); } catch {} }
  for (const id of [...jobs.keys()]) endJob(id, "voice_off");
  setState(state === "off" ? "off" : "stopping", error);
  if (config.voice.stopCmd) {
    const child = runShell(config.voice.stopCmd);
    child.on("exit", () => { if (state === "stopping" && !worker) setState("off", error); });
  } else if (!worker) setState("off", error);
  return status();
}

function endJob(id, error) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.delete(id);
  job.onEnd(error);
}

/** Stream one piece of text as PCM16 mono audio. Returns a cancel function. */
export function speak({ text, voice, speed }, onAudio, onEnd) {
  if (state !== "ready" || !worker) { onEnd("voice_off"); return () => {}; }
  const id = nextJob++ & 0x7fffffff;
  jobs.set(id, { onAudio, onEnd });
  lastUsed = Date.now();
  worker.send(JSON.stringify({ type: "speak", id, text, voice, speed }));
  return () => {
    if (!jobs.delete(id)) return;
    try { worker?.send(JSON.stringify({ type: "cancel", id })); } catch {}
  };
}

/* ---------------- the worker's WebSocket ---------------- */
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

export function handleUpgrade(req, socket, head) {
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!tokenMatches(given, config.voice.workerToken)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => adopt(ws));
}

function adopt(ws) {
  if (worker) { try { worker.close(4000, "replaced"); } catch {} }
  worker = ws;
  workerInfo = null;
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (data, isBinary) => {
    if (ws !== worker) return;
    if (isBinary) {
      const job = jobs.get(data.readUInt32BE(0));
      if (job) { lastUsed = Date.now(); job.onAudio(data.subarray(4)); }
      return;
    }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === "hello") {
      workerInfo = { device: String(msg.device || ""), voices: Array.isArray(msg.voices) ? msg.voices.map(String).slice(0, 40) : [] };
      lastUsed = Date.now();
      if (state === "stopping") { try { ws.send(JSON.stringify({ type: "shutdown" })); } catch {} return; }
      startedAt ||= Date.now();
      setState("ready");
    } else if (msg.type === "done") endJob(msg.id);
    else if (msg.type === "error") endJob(msg.id, "upstream_error");
  });
  ws.on("close", () => {
    if (ws !== worker) return;
    worker = null;
    workerInfo = null;
    for (const id of [...jobs.keys()]) endJob(id, "voice_off");
    // While the launcher is alive the worker may still reconnect (network blip); otherwise the session is over.
    if (state === "ready") setState(launcher ? "starting" : "off");
    else if (state === "stopping") setState("off", lastError);
    if (state === "starting" && !startTimer) startTimer = setTimeout(() => { if (state === "starting") stop(); }, 3 * 60e3);
    if (state === "off") startedAt = 0;
  });
  ws.on("error", () => {});
}

// Housekeeping: keep the worker connection honest, and stop paying for a GPU nobody is listening to.
setInterval(() => {
  if (worker) {
    if (!worker.isAlive) return worker.terminate();
    worker.isAlive = false;
    try { worker.ping(); } catch {}
  }
  if (state === "ready" && Date.now() - lastUsed > config.voice.idleMinutes * 60e3) {
    log(`idle for ${config.voice.idleMinutes} min, stopping the GPU session`);
    stop();
  }
}, 30e3).unref();

// A session left over from before a restart either reconnects within moments or gets cleaned up here.
setTimeout(() => {
  if (state === "off" && !worker && config.voice.stopCmd) runShell(config.voice.stopCmd);
}, 90e3).unref();
