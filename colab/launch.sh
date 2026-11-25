#!/usr/bin/env bash
# Start the GPU voice worker on Google Colab and stay attached until it exits; then release the GPU.
# Needs the google-colab-cli (`colab`), signed in. Linux, macOS or WSL.
#
# The app server runs this (VOICE_LAUNCH_CMD) after writing data/voice-worker.json, which tells the worker
# where to connect and which GPU to ask for. "gpu": "none" gives a free CPU runtime, good for testing the plumbing.
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH" PYTHONUNBUFFERED=1
HERE="$(cd "$(dirname "$0")" && pwd)"
CONF="${QPR_VOICE_CONFIG:-$HERE/../data/voice-worker.json}"
PREFIX="${QPR_VOICE_SESSION:-qpr-voice}"
# Each launch gets its own session name, so the clean-up of an earlier launch can never stop a newer one.
SESSION="$PREFIX-$(date +%H%M%S)"
colab() { command colab --auth oauth2 "$@" 2>&1 | grep --line-buffered -vE 'new version of Colab CLI|colab update|enable_update_check|^\s*$'; return "${PIPESTATUS[0]}"; }
say() { echo "[$(date '+%F %T')] $*"; }

# Log to a file ourselves: the server starts this detached, with no console to write to.
LOG="${QPR_VOICE_LOG:-$HERE/../data/logs/voice-launch.log}"
mkdir -p "$(dirname "$LOG")" && exec >>"$LOG" 2>&1

[ -f "$CONF" ] || { say "missing $CONF"; exit 2; }
GPU="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("gpu") or "T4")' "$CONF")"

# One launcher at a time. The Colab CLI keeps a local session registry that concurrent runs can corrupt.
LOCK="/tmp/$PREFIX.lock"
for _ in $(seq 60); do mkdir "$LOCK" 2>/dev/null && break; sleep 2; done
[ -d "$LOCK" ] || { say "another launcher is still running"; exit 3; }
STOPFLAG="/tmp/$PREFIX.stop"   # written by stop.sh: the user switched the voice off, so do not retry
rm -f "$STOPFLAG"
STARTED=0
cleanup() { [ "$STARTED" = 1 ] && { say "releasing $SESSION"; colab stop -s "$SESSION"; }; rmdir "$LOCK" 2>/dev/null; }
trap cleanup EXIT

# Colab sometimes has no GPU free for a moment ("Service Unavailable"), and a fresh kernel occasionally
# never answers. Both usually pass on a second try, so the whole start is attempted up to three times.
for attempt in 1 2 3; do
  [ -e "$STOPFLAG" ] && { say "stop requested"; exit 0; }
  say "starting $SESSION (GPU: $GPU), attempt $attempt"
  if [ "$GPU" = "none" ]; then colab new -s "$SESSION"; else colab new -s "$SESSION" --gpu "$GPU"; fi
  if [ $? -ne 0 ]; then say "no runtime available"; sleep 20; continue; fi
  STARTED=1
  T0=$(date +%s)
  colab upload -s "$SESSION" "$CONF" qpr_voice.json &&
  colab upload -s "$SESSION" "$HERE/tts_worker.py" qpr_tts_worker.py &&
  # --timeout is the longest silence allowed: setup prints each step, the worker a heartbeat every 20 seconds.
  colab exec -s "$SESSION" -f "$HERE/kernel_boot.py" --timeout 150
  RC=$?
  RAN=$(( $(date +%s) - T0 ))
  say "worker finished (exit $RC) after ${RAN}s"
  colab stop -s "$SESSION"; STARTED=0
  # A worker that ran for a while did its job; only a start that failed early is worth repeating.
  if [ "$RC" -eq 0 ] || [ "$RAN" -gt 300 ]; then exit "$RC"; fi
  sleep 10
done
say "giving up after three attempts"
exit 1
