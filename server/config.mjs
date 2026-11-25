// Runtime configuration. Everything secret or machine-specific comes from .env (see .env.example).
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const num = (v, d) => (Number.isFinite(+v) && v !== undefined && v !== "" ? +v : d);

export const config = {
  host: env.HOST || "127.0.0.1",
  port: num(env.PORT, 5190),
  // Public origin of the app (https://sub.example.com). Used for the origin check and handed to the voice worker.
  publicUrl: (env.PUBLIC_URL || "").replace(/\/+$/, ""),
  dataDir: path.resolve(ROOT, env.DATA_DIR || "data"),
  publicDir: path.join(ROOT, "public"),
  // A dated copy of the saved progress is made here once a day. Point it at another disk if you have one.
  backupDir: path.resolve(ROOT, env.BACKUP_DIR || "data/backups"),
  backupKeep: num(env.BACKUP_KEEP, 30),

  passwordHash: env.APP_PASSWORD_HASH || "",
  sessionSecret: env.SESSION_SECRET || "",
  sessionDays: num(env.SESSION_DAYS, 30),

  claude: {
    apiKey: env.ANTHROPIC_API_KEY || "",
    cli: env.CLAUDE_CLI || "claude",
    // Three kinds of request: "main" writes lessons, problems and tutor replies; "check" marks an answer and has
    // to feel instant; "quick" is a one-line job such as reading a formula aloud.
    tiers: {
      main: { model: env.CLAUDE_MODEL || "claude-opus-5-5", effort: env.CLAUDE_EFFORT || "" },
      check: { model: env.CLAUDE_CHECK_MODEL || "claude-sonnet-5-5", effort: env.CLAUDE_CHECK_EFFORT || "low" },
      quick: { model: env.CLAUDE_QUICK_MODEL || "claude-haiku-5-5", effort: env.CLAUDE_QUICK_EFFORT || "low" },
    },
    maxConcurrent: num(env.CLAUDE_MAX_CONCURRENT, 3),
  },

  voice: {
    workerToken: env.VOICE_WORKER_TOKEN || "",
    // Command that starts the Colab GPU worker; empty disables the "natural voice" button.
    launchCmd: env.VOICE_LAUNCH_CMD || "",
    stopCmd: env.VOICE_STOP_CMD || "",
    gpu: env.VOICE_GPU || "T4",
    idleMinutes: num(env.VOICE_IDLE_MINUTES, 15),
    maxMinutes: num(env.VOICE_MAX_MINUTES, 180),
  },
};

export function assertConfig() {
  const missing = [];
  if (!config.passwordHash) missing.push("APP_PASSWORD_HASH");
  if (config.sessionSecret.length < 32) missing.push("SESSION_SECRET");
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")} in .env. Run: npm run setup`);
    process.exit(1);
  }
}
