"""Runs inside the Colab kernel (`colab exec -f kernel_boot.py`): installs what the voice worker needs,
runs the worker as a child process while relaying its output, and releases the runtime when it ends."""
import subprocess
import sys


def sh(cmd):
    print(">>", cmd, flush=True)
    r = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if r.returncode:
        print(r.stdout[-2000:], flush=True)
    return r.returncode


PY = sys.executable
# Colab already ships torch (with CUDA), spaCy and transformers. Kokoro's own pins lag behind Colab's Python,
# so it goes in without its dependency list and the few small missing pieces are added by hand.
sh("apt-get -qq install -y espeak-ng")
sh(f"{PY} -m pip install -q --no-deps --ignore-requires-python 'kokoro==0.9.4' 'misaki>=0.9.4'")
sh(f"{PY} -m pip install -q loguru num2words addict phonemizer-fork espeakng-loader 'websockets>=14'")
sh(f"{PY} -m spacy download en_core_web_sm -q")

worker = subprocess.Popen([PY, "-u", "/qpr_tts_worker.py"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
for line in worker.stdout:
    if "Warning" not in line and "warn" not in line:
        print(line, end="", flush=True)
print("worker exited with code", worker.wait(), flush=True)

# Belt and braces: the launcher stops the runtime too, but if it is gone, this ends the billing.
try:
    from google.colab import runtime
    runtime.unassign()
except Exception as e:
    print("could not release the runtime from inside:", e, flush=True)
