# Quant Prep Room

A private study room for a quantitative finance admission interview. It runs a 52-week plan from school algebra to martingales and no-arbitrage pricing, and it is built around how people actually retain mathematics: try first, read, explain it back, practise closed-book, and meet old problems again just before you would forget them.

It is a self-hosted web app for one person. You write with a stylus on an endless graph-paper page, Claude reads the handwriting, and the feedback lands on the page where the mistake is.

## What it does

- **A full course.** 52 weeks, six sessions a week, mapped to the self-assessment topics of the UZH/ETH MSc Quantitative Finance. Week 1 is written by hand; every later lesson is written by Claude on demand, at the student's level, and then kept.
- **Lessons you can scan.** Every lesson is laid out as numbered sections with coloured boxes: the idea, each rule or definition, worked examples, common mistakes, why it matters in finance, and a closing "things to remember".
- **A short video per lesson.** Under the opening paragraph sits a YouTube explanation of under five minutes, loaded only when played. Week 1 has picked videos; any lesson takes a pasted link.
- **Handwriting checks.** Write an answer with an Apple Pencil, a finger or a mouse and tap *Check my work*. The verdict appears within a second or two. Correct steps get a green tick, mistakes a red circle, and the book answer is written next to your work. Each mistake is explained like a tutor would: the rule that was broken, why your step breaks it, the corrected step and a quick self-check for next time. A wrong answer is explained aloud, and while a line of the book answer is read, the exact piece the sentence is about lights up. A right answer is not read out.
- **A real writing palette.** Pen, highlighter and eraser with colours and sizes, undo and redo, a page that pans without end and zooms with a pinch, and a floating toolbar you can drag anywhere or fold away. Two quick taps of the Pencil tip switch to the eraser and back.
- **A calculator that reads your page.** Write `1000 · 1.04^3 =`, tap *= Calc*, and the result is written after your equals sign. Claude only reads the expression; the arithmetic is done locally by a small parser (`public/js/calc.js`).
- **As much practice as you want.** Eight problems per lesson, each rule practised at least twice, and a button that writes four more, aimed at what went badly. Checking an answer rates it, and a lesson marks itself done once its problems are checked.
- **Notation where it appears.** The first time a sign such as the mapping arrow or "for all" shows up in a lesson, a box right there says how to read it and what it means, until you tap "Got it".
- **Spaced review.** Every practice problem you rate returns after 1, 4, 10, 30 and 90 days in a short warm-up of mixed, unlabelled problems.
- **Training and mock interviews.** Fresh problems on any week or interview topic, as untimed practice or a timed test graded at the end. Anything missed joins the review deck.
- **A tutor with a natural voice.** Walkthroughs light up formula steps while a voice explains them. The voice is an open text-to-speech model (Kokoro) running on a rented GPU that the app starts when you begin studying and releases when you stop. Until it is up, the device's own voice reads.
- **Notation in words.** Tap any formula to have it read out in plain English, with each unfamiliar sign named.
- **Private.** One password, one user. Progress is stored on your own server and follows you from tablet to desktop.

## How it is put together

```
browser (public/)                    server (server/)                       elsewhere
─────────────────                    ────────────────                       ─────────
app.js       study logic     ──▶     server.mjs   routes, static files
calc.js      calculator
platform.js  server calls            auth.mjs     password, session cookie
curriculum.js course data            claude.mjs   Claude proxy       ──▶    Anthropic API or Claude Code CLI
                                     store.mjs    JSON documents on disk
                                     voice.mjs    voice relay        ◀──    GPU worker (colab/tts_worker.py)
```

No framework and no build step. The server is plain Node with two dependencies: `ws` for the voice worker's WebSocket and the official `@anthropic-ai/sdk`.

**Claude.** With `ANTHROPIC_API_KEY` set, the server calls the Anthropic API. Without it, the server runs the Claude Code CLI in headless mode (`claude --print`, no tools, no local settings), which uses the Claude login of the account the server runs under. Either way the browser only ever talks to `/api/claude`, and the reply streams back as server-sent events.

Requests come in three tiers, each with its own model and effort: `main` writes lessons, problems and tutor replies (Claude Opus by default); `check` marks an answer or reads a calculation and has to feel instant (Claude Sonnet at low effort); `quick` does one-line jobs. For the CLI transport the server keeps one process per tier started and waiting, which removes about two seconds of start-up from every check.

**Voice.** The GPU worker dials *in* to the server over an authenticated WebSocket, so the GPU machine needs no public address. A speech request is relayed to the worker and its audio (24 kHz PCM) streams straight back to the browser, which schedules it on a Web Audio clock for gapless playback. The server shuts the worker down after 15 minutes without speech; the worker has its own idle and lifetime limits as a backstop. See [colab/README.md](colab/README.md).

## Run it

Requires Node 22 or newer.

```bash
npm install
npm run setup      # writes .env with fresh secrets and a generated password (data/initial-password.txt)
npm start          # http://127.0.0.1:5190
```

Then set `PUBLIC_URL` in `.env` and put the server behind HTTPS (a reverse proxy or a tunnel): the session cookie is `Secure`, so sign-in only works over HTTPS or on localhost. Change the password with `npm run set-password`.

For Claude, either put an API key in `.env` or install [Claude Code](https://claude.com/claude-code) and sign in as the user that runs the server.

### Behind a Cloudflare Tunnel

```bash
cloudflared tunnel create quant-prep-room
cloudflared tunnel route dns quant-prep-room quant.example.com
cp deploy/tunnel.example.yml deploy/tunnel.yml      # fill in the tunnel id and hostname
cloudflared tunnel --config deploy/tunnel.yml run
```

On Windows, `deploy/windows/install-autostart.ps1` registers a scheduled task that keeps both the server and the tunnel running (`deploy/windows/serve.ps1` is the supervisor). To restart the server after an update, create an empty file `deploy/restart.flag`.

## Configuration

Everything is in `.env`; `.env.example` documents each setting.

| Setting | Meaning |
|---|---|
| `PUBLIC_URL` | Public address of the app. Used for the same-origin check and given to the voice worker. |
| `APP_PASSWORD_HASH`, `SESSION_SECRET` | Written by `npm run setup` / `npm run set-password`. Only a scrypt hash of the password is stored. |
| `ANTHROPIC_API_KEY` | Optional. Without it the Claude Code CLI is used. |
| `CLAUDE_MODEL`, `CLAUDE_CHECK_MODEL`, `CLAUDE_QUICK_MODEL` and the matching `..._EFFORT` | Model and effort for each tier: writing lessons, checking work, one-line jobs. |
| `VOICE_LAUNCH_CMD`, `VOICE_STOP_CMD`, `VOICE_GPU` | How to start and release the GPU voice worker. Leave unset to use the device voice only. |
| `VOICE_IDLE_MINUTES`, `VOICE_MAX_MINUTES` | When the GPU is released: after this long without speech, and at the latest after this long in total. |

## Security notes

- Every page and API route except the sign-in page requires the session cookie (HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Lax`).
- Wrong passwords are throttled: 8 per address and 40 overall in 15 minutes.
- State-changing requests are refused unless they come from the app's own origin.
- A Content-Security-Policy allows scripts only from the app itself and two pinned CDN libraries.
- The voice worker authenticates with a separate random token and can do nothing but return audio.
- `data/` (progress, logs, the initial password note) and `.env` are never committed.

## Tests

```bash
npm test      # the calculator's parser: 125 cases
```

## Adapting it

The course lives in `public/js/curriculum.js`: phases, weeks, the hand-written first week, the interview topic list and the book list. The prompts that describe the student and the target programme are in `public/js/app.js` (`lessonPrompt`, `checkWork`, `runQuiz`, `startDrill`). Change those and the same machinery teaches a different course.

## License

MIT. See [LICENSE](LICENSE).
