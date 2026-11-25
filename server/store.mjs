// Tiny document store: one JSON file per document under data/store. Enough for one person's study progress.
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

export async function readDoc(name) {
  try {
    return JSON.parse(await fs.readFile(fileOf(name), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

// Writes go to a temp file first, so a crash never leaves a half-written document.
const chains = new Map();
export function writeDoc(name, data) {
  const file = fileOf(name);
  const run = async () => {
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data));
    await fs.rename(tmp, file);
  };
  const next = (chains.get(name) || Promise.resolve()).then(run, run);
  chains.set(name, next.catch(() => {}));
  return next;
}
