// Quant Prep Room: a small HTTP server with no framework.
// Static web app behind a password, a Claude proxy, a JSON store for progress, and the voice relay.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config, assertConfig } from "./config.mjs";
import { isAuthed, login, clearedCookie } from "./auth.mjs";
import { readDoc, writeDoc, MAX_DOC_BYTES } from "./store.mjs";
import { streamClaude, transport } from "./claude.mjs";
import * as voice from "./voice.mjs";

assertConfig();

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const PUBLIC_WITHOUT_LOGIN = new Set(["/login", "/login.html", "/styles.css", "/js/login.js", "/favicon.svg"]);
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

const sendJson = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(Object.assign(new Error("invalid JSON"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

// Browsers send Origin on every state-changing request; anything from another site is refused.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (config.publicUrl && origin === config.publicUrl) return true;
  return origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}

// Pages are never cached. The scripts and styles they load are addressed with a version taken from the file's
// last change (/js/app.js?v=...), so they can be cached for good and an update still shows on the next reload,
// whatever a CDN in front of the server does with cache headers.
function versioned(html) {
  return html.replace(/(src|href)="(\/(?:js\/[\w.-]+\.js|styles\.css))"/g, (m, attr, url) => {
    try { return `${attr}="${url}?v=${Math.round(fs.statSync(path.join(config.publicDir, url)).mtimeMs).toString(36)}"`; }
    catch { return m; }
  });
}

function serveStatic(req, res, pathname, isVersioned) {
  let rel = pathname === "/" ? "/index.html" : pathname === "/login" ? "/login.html" : pathname;
  const file = path.join(config.publicDir, path.normalize(rel));
  if (!file.startsWith(config.publicDir + path.sep)) return sendJson(res, 404, { error: "not_found" });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendJson(res, 404, { error: "not_found" });
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    if (file.endsWith(".html")) {
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      return res.end(req.method === "HEAD" ? undefined : versioned(fs.readFileSync(file, "utf8")));
    }
    const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
    const headers = { "Content-Type": type, "Cache-Control": isVersioned ? "public, max-age=31536000, immutable" : "no-cache", ETag: etag };
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------------- API ---------------- */
async function apiClaude(req, res) {
  const body = await readBody(req, 24 * 1024 * 1024);
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
    .slice(-40);
  if (!messages.length || messages.at(-1).role !== "user") return sendJson(res, 400, { error: "bad_request" });
  const images = (Array.isArray(body.images) ? body.images : [])
    .filter((s) => typeof s === "string" && /^[A-Za-z0-9+/=]+$/.test(s))
    .slice(0, 4);

  // Server-sent events: text deltas as they arrive, then one final "done" or "error".
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const ctl = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
  const beat = setInterval(() => res.write(": keep-alive\n\n"), 15e3);
  try {
    await streamClaude({ messages, images, tier: ["quick", "check"].includes(body.tier) ? body.tier : "main", signal: ctl.signal, onText: (text) => send({ type: "delta", text }) });
    send({ type: "done" });
  } catch (e) {
    if (e.code !== "cancelled") console.error(new Date().toISOString(), "[claude]", e.code || "", e.message);
    send({ type: "error", code: e.code || "upstream" });
  } finally {
    clearInterval(beat);
    res.end();
  }
}

async function apiSpeak(req, res) {
  const body = await readBody(req, 64 * 1024);
  const text = String(body.text || "").trim().slice(0, 2000);
  if (!text) return sendJson(res, 400, { error: "bad_request" });
  const speed = Math.min(1.5, Math.max(0.6, +body.speed || 1));
  const voiceName = /^[a-z]{2}_[a-z0-9]{2,20}$/.test(body.voice || "") ? body.voice : "";
  let started = false;
  const cancel = voice.speak({ text, voice: voiceName, speed },
    (pcm) => {
      if (!started) {
        started = true;
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Sample-Rate": String(voice.status().sampleRate) });
      }
      res.write(pcm);
    },
    (error) => {
      if (res.writableEnded || res.destroyed) return;
      if (!started) return sendJson(res, error === "voice_off" ? 503 : 502, { error: error || "empty" });
      res.end();
    });
  res.on("close", () => { if (!res.writableEnded) cancel(); });
}

async function api(req, res, pathname) {
  const { method } = req;
  if (method !== "GET" && !sameOrigin(req)) return sendJson(res, 403, { error: "bad_origin" });

  if (pathname === "/api/login" && method === "POST") {
    const { password } = await readBody(req, 4096);
    const r = login(req, password);
    if (r.ok) return sendJson(res, 200, { ok: true }, { "Set-Cookie": r.cookie });
    return sendJson(res, r.status, { error: r.status === 429 ? "too_many_attempts" : "wrong_password" }, r.retryAfter ? { "Retry-After": String(r.retryAfter) } : {});
  }
  if (!isAuthed(req)) return sendJson(res, 401, { error: "session_expired" });

  if (pathname === "/api/logout" && method === "POST") return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearedCookie });
  if (pathname === "/api/session" && method === "GET") return sendJson(res, 200, { ok: true, claude: transport(), voice: voice.status() });
  if (pathname === "/api/claude" && method === "POST") return apiClaude(req, res);

  const doc = /^\/api\/store\/([^/]+)$/.exec(pathname);
  if (doc && method === "GET") {
    const data = await readDoc(doc[1]);
    return sendJson(res, 200, { exists: data !== null, data });
  }
  if (doc && method === "PUT") {
    await writeDoc(doc[1], await readBody(req, MAX_DOC_BYTES));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/voice/status" && method === "GET") return sendJson(res, 200, voice.status());
  if (pathname === "/api/voice/start" && method === "POST") return sendJson(res, 200, voice.start());
  if (pathname === "/api/voice/stop" && method === "POST") return sendJson(res, 200, voice.stop());
  if (pathname === "/api/voice/speak" && method === "POST") return apiSpeak(req, res);

  return sendJson(res, 404, { error: "not_found" });
}

/* ---------------- server ---------------- */
const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Strict-Transport-Security", "max-age=31536000");
  let pathname, isVersioned;
  try { const u = new URL(req.url, "http://x"); pathname = decodeURIComponent(u.pathname); isVersioned = u.searchParams.has("v"); }
  catch { return sendJson(res, 400, { error: "bad_request" }); }
  try {
    if (pathname.startsWith("/api/")) return await api(req, res, pathname);
    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "method_not_allowed" });
    if (pathname === "/healthz") return sendJson(res, 200, { ok: true });
    if (pathname === "/robots.txt") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("User-agent: *\nDisallow: /\n"); }
    const authed = isAuthed(req);
    if (pathname === "/login" && authed) { res.writeHead(302, { Location: "/" }); return res.end(); }
    if (!authed && !PUBLIC_WITHOUT_LOGIN.has(pathname)) { res.writeHead(302, { Location: "/login", "Cache-Control": "no-store" }); return res.end(); }
    serveStatic(req, res, pathname, isVersioned);
  } catch (e) {
    if (!e.status) console.error(new Date().toISOString(), "[http]", req.method, pathname, e);
    if (!res.headersSent) sendJson(res, e.status || 500, { error: e.status ? e.message : "server_error" });
    else res.end();
  }
});

server.on("upgrade", (req, socket, head) => {
  if (new URL(req.url, "http://x").pathname === "/api/voice/worker") return voice.handleUpgrade(req, socket, head);
  socket.destroy();
});

server.listen(config.port, config.host, () => {
  console.log(new Date().toISOString(), `Quant Prep Room on http://${config.host}:${config.port} · Claude via ${transport()} · natural voice ${voice.enabled() ? "available" : "not configured"}`);
});
