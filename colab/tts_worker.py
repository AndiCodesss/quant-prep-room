"""GPU voice worker for Quant Prep Room.

Runs on the GPU machine (a Google Colab runtime). It loads the Kokoro text-to-speech model, dials in to the
app server over a WebSocket, and turns each piece of text it is sent into 24 kHz mono PCM16 audio, streamed
back sentence by sentence.

Protocol (JSON text frames unless noted):
  worker -> server   {"type": "hello", "device": "...", "voices": [...]}
  server -> worker   {"type": "speak", "id": 7, "text": "...", "voice": "af_heart", "speed": 1.0}
  worker -> server   binary frame: 4-byte big-endian job id, then PCM16 little-endian samples
  worker -> server   {"type": "done", "id": 7}  or  {"type": "error", "id": 7, "message": "..."}
  server -> worker   {"type": "cancel", "id": 7}   {"type": "shutdown"}

The worker exits by itself when told to, after `idle_minutes` without a job, after `max_minutes` in total,
or when it has been unable to reach the server for three minutes. Whoever started it then releases the GPU.
"""
import asyncio
import json
import os
import struct
import time

import numpy as np
import torch
import websockets
from kokoro import KPipeline

CONFIG = json.load(open(os.environ.get("QPR_VOICE_CONFIG", "/qpr_voice.json")))
URL, TOKEN = CONFIG["url"], CONFIG["token"]
IDLE_S = float(CONFIG.get("idle_minutes", 20)) * 60
MAX_S = float(CONFIG.get("max_minutes", 180)) * 60
OFFLINE_S = 180

SAMPLE_RATE = 24000
# First letter of a Kokoro voice is its language: a = American English, b = British English.
VOICES = ["af_heart", "af_bella", "af_nicole", "am_michael", "am_fenrir", "bf_emma", "bm_george"]
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

started = time.time()
last_job = time.time()
pipelines = {}


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, flush=True)


def pipeline_for(voice):
    lang = voice[0]
    if lang not in pipelines:
        shared = next(iter(pipelines.values())).model if pipelines else True  # one model, several accents
        pipelines[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M", model=shared, device=DEVICE)
    return pipelines[lang]


def to_pcm16(audio):
    samples = audio.detach().cpu().numpy() if torch.is_tensor(audio) else np.asarray(audio)
    return (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()


async def speak(ws, job, cancelled):
    voice = job.get("voice") if job.get("voice") in VOICES else VOICES[0]
    speed = min(1.5, max(0.6, float(job.get("speed") or 1.0)))
    segments = pipeline_for(voice)(str(job["text"]), voice=voice, speed=speed, split_pattern=r"\n+")
    header = struct.pack(">I", job["id"])
    t0, seconds = time.time(), 0.0
    while job["id"] not in cancelled:
        segment = await asyncio.to_thread(next, segments, None)  # synthesis runs off the event loop
        if segment is None:
            break
        pcm = to_pcm16(segment[2])
        seconds += len(pcm) / 2 / SAMPLE_RATE
        for i in range(0, len(pcm), 48000):  # one-second frames
            await ws.send(header + pcm[i:i + 48000])
    log(f"job {job['id']}: {seconds:.1f}s of audio in {time.time() - t0:.2f}s ({voice})")


async def serve(ws):
    """Handle one connection. Returns True when the server asked us to shut down."""
    global last_job
    await ws.send(json.dumps({"type": "hello", "device": DEVICE_NAME, "voices": VOICES}))
    log("connected to", URL)
    queue, cancelled = asyncio.Queue(), set()

    async def work():
        global last_job
        while True:
            job = await queue.get()
            last_job = time.time()
            try:
                await speak(ws, job, cancelled)
                await ws.send(json.dumps({"type": "done", "id": job["id"]}))
            except websockets.ConnectionClosed:
                return
            except Exception as e:  # one bad sentence must not end the session
                log("job failed:", repr(e))
                await ws.send(json.dumps({"type": "error", "id": job["id"], "message": str(e)[:200]}))
            cancelled.discard(job["id"])
            last_job = time.time()

    worker = asyncio.create_task(work())
    try:
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") == "speak":
                queue.put_nowait(msg)
            elif msg.get("type") == "cancel":
                cancelled.add(msg.get("id"))
            elif msg.get("type") == "shutdown":
                return True
        return False
    finally:
        worker.cancel()


async def watchdog():
    """Heartbeat for whoever is watching our output, and the idle / lifetime limits."""
    while True:
        await asyncio.sleep(20)
        now = time.time()
        log(f"alive: up {int((now - started) / 60)} min, idle {int((now - last_job) / 60)} min")
        if now - last_job > IDLE_S:
            return "idle limit reached"
        if now - started > MAX_S:
            return "maximum session length reached"


async def connect_loop():
    offline_since = None
    while True:
        try:
            async with websockets.connect(
                URL,
                additional_headers={"Authorization": "Bearer " + TOKEN},
                user_agent_header="QuantPrepRoom-VoiceWorker/1.0",
                max_size=2 ** 22,
                ping_interval=20,
            ) as ws:
                offline_since = None
                if await serve(ws):
                    return "shutdown requested"
        except Exception as e:
            log("connection problem:", repr(e))
        offline_since = offline_since or time.time()
        if time.time() - offline_since > OFFLINE_S:
            return "server unreachable"
        await asyncio.sleep(5)


async def main():
    done, pending = await asyncio.wait(
        [asyncio.create_task(connect_loop()), asyncio.create_task(watchdog())],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()
    log("stopping:", next(iter(done)).result())


DEVICE_NAME = torch.cuda.get_device_name(0) if DEVICE == "cuda" else "CPU"
log("loading Kokoro on", DEVICE_NAME)
for _ in pipeline_for(VOICES[0])("Ready when you are.", voice=VOICES[0]):  # warm-up: model, voice and GPU kernels
    pass
log(f"model ready after {time.time() - started:.0f}s")
last_job = time.time()
asyncio.run(main())
