// Single-user password gate: scrypt password hash, HMAC-signed session cookie, login throttling.
import crypto from "node:crypto";
import { config } from "./config.mjs";

const COOKIE = "qpr_session";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize("NFKC"), salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const want = Buffer.from(hashHex, "hex");
  const got = crypto.scryptSync(String(password).normalize("NFKC"), Buffer.from(saltHex, "hex"), want.length);
  return crypto.timingSafeEqual(want, got);
}

const sign = (value) => crypto.createHmac("sha256", config.sessionSecret).update(value).digest("base64url");

function newSessionCookie() {
  const expires = Date.now() + config.sessionDays * 864e5;
  const value = `${expires}.${sign(String(expires))}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${config.sessionDays * 86400}`;
}

export const clearedCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function isAuthed(req) {
  const m = /(?:^|;\s*)qpr_session=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return false;
  const [expires, mac] = m[1].split(".");
  if (!expires || !mac || +expires < Date.now()) return false;
  const want = Buffer.from(sign(expires));
  const got = Buffer.from(mac);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// At most 8 wrong passwords per address in 15 minutes, and 40 overall, so guessing is not practical.
const WINDOW = 15 * 60e3;
const fails = new Map();
let allFails = [];
const recent = (list) => list.filter((t) => t > Date.now() - WINDOW);

export function clientIp(req) {
  return String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "?");
}

/** Returns {ok, cookie} or {ok:false, status, retryAfter}. */
export function login(req, password) {
  const ip = clientIp(req);
  const mine = recent(fails.get(ip) || []);
  allFails = recent(allFails);
  if (mine.length >= 8 || allFails.length >= 40) {
    const oldest = (mine.length >= 8 ? mine : allFails)[0];
    return { ok: false, status: 429, retryAfter: Math.ceil((oldest + WINDOW - Date.now()) / 1000) };
  }
  if (typeof password === "string" && password.length <= 256 && verifyPassword(password, config.passwordHash)) {
    fails.delete(ip);
    return { ok: true, cookie: newSessionCookie() };
  }
  mine.push(Date.now());
  fails.set(ip, mine);
  allFails.push(Date.now());
  return { ok: false, status: 401 };
}

export function tokenMatches(given, expected) {
  if (!given || !expected) return false;
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}
