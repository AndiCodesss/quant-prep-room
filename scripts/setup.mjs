// First-time setup and password changes.
//
//   npm run setup                 create .env with fresh secrets and a generated password
//   npm run set-password          set a password you type (asked twice, not echoed)
//
// The password itself is never stored: only its scrypt hash goes into .env.
// A generated password is written once to data/initial-password.txt so you can read it; delete that file afterwards.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../server/auth.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const mode = process.argv[2] || "init";

function readEnv() {
  if (!fs.existsSync(envFile)) return fs.readFileSync(path.join(root, ".env.example"), "utf8");
  return fs.readFileSync(envFile, "utf8");
}
function setVar(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
  return re.test(text) ? text.replace(re, () => line) : text.trimEnd() + "\n" + line + "\n";
}
const hasValue = (text, key) => new RegExp(`^${key}=\\S+`, "m").test(text);

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

// Six random words-worth of entropy, easy to type on a tablet keyboard.
function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const group = () => Array.from(crypto.randomBytes(5), (b) => alphabet[b % alphabet.length]).join("");
  return [group(), group(), group(), group()].join("-");
}

let env = readEnv();

if (mode === "password") {
  const a = await askHidden("New password: ");
  const b = await askHidden("Repeat it: ");
  if (a !== b) { console.error("The two entries differ. Nothing changed."); process.exit(1); }
  if (a.length < 10) { console.error("Use at least 10 characters. Nothing changed."); process.exit(1); }
  env = setVar(env, "APP_PASSWORD_HASH", hashPassword(a));
  // A new session secret signs everyone out, which is what you want after a password change.
  env = setVar(env, "SESSION_SECRET", crypto.randomBytes(32).toString("hex"));
  fs.writeFileSync(envFile, env);
  console.log("Password changed. Restart the server for it to take effect.");
} else {
  if (!hasValue(env, "SESSION_SECRET")) env = setVar(env, "SESSION_SECRET", crypto.randomBytes(32).toString("hex"));
  if (!hasValue(env, "VOICE_WORKER_TOKEN")) env = setVar(env, "VOICE_WORKER_TOKEN", crypto.randomBytes(32).toString("hex"));
  if (!hasValue(env, "APP_PASSWORD_HASH")) {
    const password = generatePassword();
    env = setVar(env, "APP_PASSWORD_HASH", hashPassword(password));
    const note = path.join(root, "data", "initial-password.txt");
    fs.mkdirSync(path.dirname(note), { recursive: true });
    fs.writeFileSync(note, password + "\n");
    console.log(`Generated a password and wrote it to ${note}\nRead it, sign in, then delete that file. Change it any time with: npm run set-password`);
  }
  fs.writeFileSync(envFile, env);
  console.log(".env is ready.");
}
