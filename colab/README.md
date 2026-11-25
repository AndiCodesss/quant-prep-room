# Natural voice on a Colab GPU

The tutor's natural voice is [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), an open 82-million-parameter text-to-speech model. On a GPU it produces speech many times faster than real time, so audio starts well under a second after a request. On a CPU it is slower than real time, which is why the app rents a GPU while you study and gives it back afterwards.

## Pieces

| File | Runs on | Job |
|---|---|---|
| `launch.sh` | the app server's machine | Creates the Colab runtime, uploads the worker, stays attached, releases the runtime at the end. |
| `kernel_boot.py` | the Colab kernel | Installs Kokoro and its few missing dependencies, runs the worker, releases the runtime when it ends. |
| `tts_worker.py` | the Colab runtime | Loads the model, connects to the app server, turns text into streamed audio. |
| `stop.sh` | the app server's machine | Releases the runtime if it is still assigned. |

## Setup

1. Install the [google-colab-cli](https://github.com/googlecolab/google-colab-cli) where the app server can run it (Linux, macOS or WSL) and sign in once: `colab --auth oauth2 usage`.
2. In `.env`, set `VOICE_LAUNCH_CMD` and `VOICE_STOP_CMD` to run `launch.sh` and `stop.sh` (see `.env.example` for the WSL form), and make sure `PUBLIC_URL` and `VOICE_WORKER_TOKEN` are set.
3. Restart the server. The header now has a voice button: *Start natural voice*.

## Lifecycle and cost

- **Start:** the first tap of a visit (if "start by itself" is on), the voice button, or the first explanation that wants to speak. Startup takes one to three minutes; the device voice covers that time. If Colab has no GPU free or a fresh runtime does not answer, the launcher tries again, up to three times.
- **Stop:** the voice button, 15 minutes without speech (`VOICE_IDLE_MINUTES`), or 3 hours in total (`VOICE_MAX_MINUTES`). The worker also stops by itself if it cannot reach the server for three minutes.
- **Cost:** a T4 uses roughly 1.5 to 2 Colab compute units per hour while it is assigned. `colab usage` shows the balance and the current rate; `colab sessions` shows anything still running.
- `"gpu": "none"` (`VOICE_GPU=none`) runs the same pipeline on a free CPU runtime. Speech is then slower than real time, but it is a free way to test the plumbing.

Three things release the GPU independently, so a crash in one place does not leave it running: `launch.sh` stops the runtime when the worker exits, the kernel unassigns its own runtime, and the server runs `stop.sh` on shutdown requests and once after each restart.

## Voices

`af_heart` (default), `af_bella`, `af_nicole`, `am_michael`, `am_fenrir` are American English; `bf_emma` and `bm_george` are British. Pick one from the voice button while the natural voice is on. To offer others, add them to `VOICES` in `tts_worker.py`.
