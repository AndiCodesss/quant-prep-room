// Tiny document store: one JSON file per document under data/store. Enough for one person's study progress.
// Each document has a version (a hash of its content), so a browser can say "save this only if nothing changed
// since I read it" and merge instead of overwriting when another device got there first.
// The whole store is copied to a dated backup folder once a day.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";

const dir = path.join(config.dataDir, "store");
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/i;
export const MAX_DOC_BYTES = 8 * 1024 * 1024;

const fileOf = (name) => {
  if (!NAME.test(name)) throw Object.assign(new Error("bad document name"), { status: 400 });
  return path.join(dir, name + ".json");
};
const versionOf = (text) => crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);

async function readText(file) {
  try { return await fs.readFile(file, "utf8"); }
  catch (e) { if (e.code === "ENOENT") return null; throw e; }
}

/** {data, version}, or null when the document does not exist. */
export async function readDoc(name) {
  const text = await readText(fileOf(name));
  return text === null ? null : { data: JSON.parse(text), version: versionOf(text) };
}

// Writes to one document run one after another, and go to a temp file first so a crash never leaves half a file.
// ifVersion: the version the writer last saw ("" for "it did not exist"). If the document has moved on since,
// nothing is written and the error carries the current content for the writer to merge.
const chains = new Map();
export function writeDoc(name, data, ifVersion) {
  const file = fileOf(name);
  const run = async () => {
    if (ifVersion !== undefined) {
      const now = await readText(file);
      const version = now === null ? "" : versionOf(now);
      if (version !== ifVersion) throw Object.assign(new Error("conflict"), { status: 409, current: { data: now === null ? null : JSON.parse(now), version } });
    }
    await fs.mkdir(dir, { recursive: true });
    const text = JSON.stringify(data), tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, text);
    await fs.rename(tmp, file);
    return versionOf(text);
  };
  const next = (chains.get(name) || Promise.resolve()).then(run, run);
  chains.set(name, next.catch(() => {}));
  return next;
}

/* ---------------- daily backup ---------------- */
const day = () => new Date().toISOString().slice(0, 10);

/** Copies the store to <backupDir>/<date> if today's copy is missing, and keeps the newest `backupKeep` days. */
export async function backupIfDue() {
  try {
    const target = path.join(config.backupDir, day());
    try { await fs.access(target); return; } catch {}
    try { await fs.access(dir); } catch { return; }     // nothing saved yet
    await fs.mkdir(config.backupDir, { recursive: true });
    await fs.cp(dir, target + ".part", { recursive: true });
    await fs.rename(target + ".part", target);
    const days = (await fs.readdir(config.backupDir)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    for (const old of days.slice(0, Math.max(0, days.length - config.backupKeep))) await fs.rm(path.join(config.backupDir, old), { recursive: true, force: true });
    console.log(new Date().toISOString(), `[backup] saved ${target}`);
  } catch (e) {
    console.error(new Date().toISOString(), "[backup] failed:", e.message);
  }
}
export function startBackups() {
  backupIfDue();
  setInterval(backupIfDue, 60 * 60e3).unref();
}
