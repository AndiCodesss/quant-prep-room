#!/usr/bin/env bash
# Release every Colab runtime the voice worker may still hold. Safe to run at any time.
export PATH="$HOME/.local/bin:$PATH" PYTHONUNBUFFERED=1
PREFIX="${QPR_VOICE_SESSION:-qpr-voice}"
LOG="${QPR_VOICE_LOG:-$(cd "$(dirname "$0")" && pwd)/../data/logs/voice-launch.log}"
mkdir -p "$(dirname "$LOG")" && exec >>"$LOG" 2>&1
touch "/tmp/$PREFIX.stop"   # tells a launcher that is still retrying to give up
# Note the sessions that exist now, wait, then stop exactly those: a session started in the meantime is left alone.
NAMES="$(colab --auth oauth2 sessions 2>&1 | grep -oE "$PREFIX[A-Za-z0-9-]*" | sort -u)"
sleep "${1:-20}"   # give a worker that was just told to shut down the chance to leave by itself
STILL="$(colab --auth oauth2 sessions 2>&1 | grep -oE "$PREFIX[A-Za-z0-9-]*" | sort -u)"
for name in $NAMES; do
  echo "$STILL" | grep -qx "$name" || continue
  echo "[$(date '+%F %T')] stopping $name"
  colab --auth oauth2 stop -s "$name" 2>&1 | grep -E 'Stopping|terminated|rror'
done
