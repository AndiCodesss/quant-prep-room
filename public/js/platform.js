/* The app's connection to its own server: Claude, saved documents, the tutor's voice and dictation.
   Everything here returns the small interfaces app.js works with, so the study logic never touches fetch itself. */
const Platform = (() => {
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} };
  const toLogin = () => { location.href = "/login" };

  async function call(method, url, body, signal) {
    const res = await fetch(url, { method, signal, headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 401) { toLogin(); throw { code: "session_expired" } }
    return res;
  }

  /* ---------------- Claude ---------------- */
  const blobToBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej({ code: "image_failed" }); r.readAsDataURL(blob) });

  // sample(prompt | [{role, content}], {signal, onText, images, modelTier}) -> {text}
  async function sample(input, o = {}) {
    const turns = typeof input === "string" ? [{ role: "user", content: input }] : input;
    const messages = [];
    for (const m of turns) { // the API wants alternating roles: merge neighbours with the same role
      const last = messages[messages.length - 1];
      if (last && last.role === m.role) last.content += "\n\n" + m.content; else messages.push({ role: m.role, content: String(m.content) });
    }
    let res;
    try {
      const images = await Promise.all((o.images || []).map(blobToBase64));
      res = await call("POST", "/api/claude", { messages, images, tier: o.modelTier === "quick" || o.modelTier === "check" ? o.modelTier : "main" }, o.signal);
    } catch (e) { throw e && e.code ? e : { code: e && e.name === "AbortError" ? "cancelled" : "upstream" } }
    if (!res.ok || !res.body) throw { code: res.status === 429 ? "rate_limited" : "upstream" };
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", text = "", finished = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (!line.startsWith("data: ")) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "delta") { text += ev.text; if (o.onText) o.onText({ text }) }
          else if (ev.type === "error") throw { code: ev.code || "upstream" };
          else if (ev.type === "done") finished = true;
        }
      }
    } catch (e) { throw e && e.code ? e : { code: e && e.name === "AbortError" ? "cancelled" : "upstream" } }
    if (!finished) throw { code: o.signal && o.signal.aborted ? "cancelled" : "upstream" };
    return { text };
  }
  // The reply should be one JSON value; tolerate a code fence or a sentence around it.
  sample.json = async (prompt, o) => {
    const { text } = await sample(prompt, o);
    const t = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const a = t.search(/[[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    try { return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t) } catch (e) { throw { code: "invalid_json" } }
  };
  sample.limits = async () => ({ images: { max: 4 } });

  /* ---------------- Saved documents ---------------- */
  const store = {
    doc: name => ({
      async get() { const res = await call("GET", "/api/store/" + name); if (!res.ok) throw { code: "store" }; const j = await res.json(); return { exists: j.exists, data: () => j.data } },
      async set(obj) { const res = await call("PUT", "/api/store/" + name, obj); if (!res.ok) throw { code: "store" } }
    })
  };

  /* ---------------- Voice ----------------
     Natural voice: speech synthesised on a GPU and streamed here as raw audio.
     Device voice: the browser's own speech synthesis, used until the natural voice is up, or if it drops out. */
  function deviceVoice() {
    const sy = window.speechSynthesis; if (!sy || !window.SpeechSynthesisUtterance) return null;
    let st = "idle", rate = 1, run = 0; const onL = [], onS = [];
    const set = (s, reason) => { st = s; onS.forEach(f => { try { f({ state: s, reason }) } catch (e) {} }) };
    // Best-sounding English voice first: downloaded Premium/Enhanced voices, then the usual good ones; novelty voices are left out.
    const BAD = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Good News|Fred|Junior|Ralph|Kathy|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|eSpeak/i;
    const score = v => (/premium/i.test(v.name) ? 8 : 0) + (/enhanced|natural|neural/i.test(v.name) ? 6 : 0) + (/Siri|Google|Online/i.test(v.name) ? 3 : 0) + (/Ava|Zoe|Evan|Samantha|Daniel|Karen|Serena|Aria|Jenny/i.test(v.name) ? 2 : 0) + (/^en[-_]US/i.test(v.lang) ? 1 : 0);
    const all = () => { let vs = []; try { vs = sy.getVoices() || [] } catch (e) {} return vs.filter(v => /^en/i.test(v.lang) && !BAD.test(v.name)).sort((a, b) => score(b) - score(a)) };
    // "sys:<lang>" names no voice at all: the device then reads in the voice chosen for that language in its own settings,
    // which is the only way to reach a downloaded Premium voice that Safari does not list for web pages.
    const voice = () => { const want = lsGet("qpr-voice") || "sys:en-US"; if (want.indexOf("sys:") === 0) return { sys: want.slice(4) }; const vs = all(); return vs.find(v => v.name === want) || { sys: "en-US" } };
    try { sy.getVoices() } catch (e) {}
    return {
      // iPad only lets a page speak after a tap: a silent utterance during the tap unlocks the later, automatic reading.
      prime() { if (st !== "idle") return; try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; sy.speak(u) } catch (e) {} },
      speak(lines, o = {}) {
        if (o.rate) rate = o.rate; const my = ++run; try { sy.cancel() } catch (e) {}
        return new Promise((res, rej) => {
          let left = lines.length; if (!left) { set("idle", "completed"); return res() }
          set("starting"); const v = voice();
          lines.forEach((l, i) => {
            const u = new SpeechSynthesisUtterance(l.text); if (v.sys) u.lang = v.sys; else { u.lang = v.lang; u.voice = v } u.rate = rate;
            u.onstart = () => { if (my !== run) return; set("speaking"); onL.forEach(f => { try { f({ line: i, id: l.id }) } catch (e) {} }) };
            u.onend = () => { if (my !== run) return; if (--left <= 0) { set("idle", "completed"); res() } };
            u.onerror = e => { if (my !== run) return; run++; try { sy.cancel() } catch (_) {} set("idle", "upstream_error"); rej({ code: e && e.error === "not-allowed" ? "no_gesture" : "upstream_error" }) };
            sy.speak(u);
          });
        });
      },
      list: () => ["sys:en-US", "sys:en-GB", ...all().map(v => v.name)], current: () => { const v = voice(); return v.sys ? "sys:" + v.sys : v.name }, setVoice(n) { lsSet("qpr-voice", String(n)) },
      active: () => st !== "idle",
      pause() { try { sy.pause() } catch (e) {} if (st !== "idle") set("paused") },
      resume() { try { sy.resume() } catch (e) {} if (st === "paused") set("speaking") },
      stop() { run++; try { sy.cancel() } catch (e) {} if (st !== "idle") set("idle", "stopped") },
      setRate(r) { rate = r }, onLine(f) { onL.push(f) }, onState(f) { onS.push(f) }
    };
  }

  const NATURAL = { af_heart: "Heart · US, warm", af_bella: "Bella · US, lively", af_nicole: "Nicole · US, soft", am_michael: "Michael · US", am_fenrir: "Fenrir · US, deep", bf_emma: "Emma · British", bm_george: "George · British" };

  function makeVoice() {
    const dev = deviceVoice();
    const AC = window.AudioContext || window.webkitAudioContext;
    let info = { enabled: false, state: "off", voices: [], error: "" };
    let st = "idle", rate = 1, run = 0, ctx = null, sources = [], aborter = null, viaDevice = false, ticker = 0, pollT = 0;
    const onL = [], onS = [], onI = [];
    const set = (s, reason) => { st = s; onS.forEach(f => { try { f({ state: s, reason }) } catch (e) {} }) };
    const line = e => onL.forEach(f => { try { f(e) } catch (_) {} });
    if (dev) { dev.onLine(e => { if (viaDevice) line(e) }); dev.onState(e => { if (viaDevice) set(e.state, e.reason) }) }

    const natReady = () => !!AC && info.state === "ready" && lsGet("qpr-engine") !== "device";
    const natVoice = () => { const want = lsGet("qpr-nat-voice") || "af_heart"; return info.voices.includes(want) ? want : (info.voices[0] || "af_heart") };
    // Starting by itself is on unless switched off, and is held back for this visit once you switch the voice off
    // yourself or a start has failed: a GPU that will not come up should not be asked for again and again.
    let held = false;
    const auto = () => lsGet("qpr-voice-auto") !== "off";
    const mayWake = () => info.enabled && info.state === "off" && !info.error && !held && auto();

    /* --- the GPU session --- */
    function gotInfo(j) { info = j; onI.forEach(f => { try { f(info) } catch (e) {} }); clearTimeout(pollT); if (info.enabled) pollT = setTimeout(refresh, info.state === "starting" || info.state === "stopping" ? 4000 : 30000) }
    async function refresh() { try { const r = await call("GET", "/api/voice/status"); if (r.ok) gotInfo(await r.json()) } catch (e) { clearTimeout(pollT); pollT = setTimeout(refresh, 30000) } }
    async function startSession() { if (!info.enabled || info.state === "ready" || info.state === "starting") return; held = false; try { const r = await call("POST", "/api/voice/start", {}); if (r.ok) gotInfo(await r.json()) } catch (e) {} }
    async function stopSession() { held = true; if (st !== "idle" && !viaDevice) api.stop(); try { const r = await call("POST", "/api/voice/stop", {}); if (r.ok) gotInfo(await r.json()) } catch (e) {} }

    /* --- natural playback: PCM16 chunks scheduled back to back on a Web Audio clock --- */
    function halt() { if (aborter) { try { aborter.abort() } catch (e) {} aborter = null } sources.forEach(s => { try { s.onended = null; s.stop() } catch (e) {} }); sources = []; clearInterval(ticker); ticker = 0 }
    function speakNatural(lines, my) {
      return new Promise((res, rej) => {
        aborter = new AbortController(); const signal = aborter.signal;
        let t = 0, fetched = false; const marks = [];
        const finish = (err) => { clearInterval(ticker); ticker = 0; if (my !== run) return; sources = []; set("idle", err ? "upstream_error" : "completed"); err ? rej(err) : res() };
        ticker = setInterval(() => {
          if (my !== run) { clearInterval(ticker); return }
          while (marks.length && marks[0].time <= ctx.currentTime + 0.02) { const m = marks.shift(); if (st === "starting") set("speaking"); line({ line: m.i, id: m.id }) }
          if (fetched && !marks.length && ctx.currentTime >= t) finish();
        }, 50);
        (async () => {
          for (let i = 0; i < lines.length; i++) {
            if (my !== run) return;
            let r = null;
            try { r = await call("POST", "/api/voice/speak", { text: lines[i].text, voice: natVoice(), speed: rate }, signal) } catch (e) { if (my !== run) return }
            if (!r || !r.ok || !r.body) {
              // The GPU voice dropped out: let what is already queued finish, then carry on in the device voice.
              refresh();
              const wait = Math.max(0, (t - ctx.currentTime) * 1000);
              clearInterval(ticker); ticker = 0;
              const rest = lines.slice(i);
              setTimeout(() => { if (my !== run) return; if (!dev) return finish(i ? null : { code: "unavailable" }); viaDevice = true; dev.speak(rest, { rate }).then(res, rej) }, wait);
              while (marks.length) { const m = marks.shift(); setTimeout(() => { if (my === run) line({ line: m.i, id: m.id }) }, Math.max(0, (m.time - ctx.currentTime) * 1000)) }
              return;
            }
            const sr = +r.headers.get("X-Sample-Rate") || 24000, reader = r.body.getReader();
            let carry = null, first = true;
            for (;;) {
              let chunk; try { chunk = await reader.read() } catch (e) { break }
              if (chunk.done || my !== run) break;
              let bytes = chunk.value;
              if (carry) { const m = new Uint8Array(carry.length + bytes.length); m.set(carry); m.set(bytes, carry.length); bytes = m; carry = null }
              if (bytes.length % 2) { carry = bytes.slice(bytes.length - 1); bytes = bytes.subarray(0, bytes.length - 1) }
              if (!bytes.length) continue;
              const pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
              const buf = ctx.createBuffer(1, pcm.length, sr), ch = buf.getChannelData(0);
              for (let k = 0; k < pcm.length; k++) ch[k] = pcm[k] / 32768;
              const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
              t = Math.max(t, ctx.currentTime + 0.06);
              if (first) { first = false; marks.push({ time: t, i, id: lines[i].id }) }
              src.start(t); t += buf.duration; sources.push(src);
            }
            t += 0.28; // a breath between lines
          }
          fetched = true;
        })();
      });
    }

    const api = {
      prime() { if (AC && info.state === "ready") { try { ctx = ctx || new AC(); if (ctx.state === "suspended") ctx.resume() } catch (e) {} } if (dev) dev.prime() },
      speak(what, o = {}) {
        const lines = (typeof what === "string" ? [{ text: what }] : (what || [])).filter(l => l && l.text);
        if (o.rate) rate = o.rate;
        const my = ++run; halt(); if (dev) dev.stop();
        if (!lines.length) { set("idle", "completed"); return Promise.resolve() }
        if (mayWake()) startSession(); // ready for the next explanation
        if (natReady()) {
          try { ctx = ctx || new AC() } catch (e) { ctx = null }
          if (ctx) { viaDevice = false; set("starting"); return Promise.resolve(ctx.state === "suspended" ? ctx.resume() : 0).then(() => speakNatural(lines, my)) }
        }
        if (!dev) return Promise.reject({ code: "unavailable" });
        viaDevice = true; return dev.speak(lines, { rate });
      },
      active: () => st !== "idle",
      pause() { if (viaDevice) dev.pause(); else if (ctx && st !== "idle") { ctx.suspend(); set("paused") } return Promise.resolve() },
      resume() { if (viaDevice) dev.resume(); else if (ctx && st === "paused") { ctx.resume(); set("speaking") } return Promise.resolve() },
      stop() { if (viaDevice) { run++; dev.stop() } else { run++; halt(); if (ctx && ctx.state === "suspended") ctx.resume(); if (st !== "idle") set("idle", "stopped") } return Promise.resolve() },
      setRate(r) { rate = r; if (dev) dev.setRate(r); return Promise.resolve() },
      onLine(f) { onL.push(f) }, onState(f) { onS.push(f) },
      // Voices on offer right now: the natural ones while the GPU session is up, and always the device's own.
      list: () => [...(info.state === "ready" && AC ? info.voices.map(v => "nat:" + v) : []), ...(dev ? dev.list() : [])],
      current: () => natReady() ? "nat:" + natVoice() : (dev ? dev.current() : ""),
      setVoice(n) { n = String(n); if (n.indexOf("nat:") === 0) { lsSet("qpr-nat-voice", n.slice(4)); lsSet("qpr-engine", "natural") } else { if (dev) dev.setVoice(n); lsSet("qpr-engine", "device") } },
      label: n => n.indexOf("nat:") === 0 ? "Natural · " + (NATURAL[n.slice(4)] || n.slice(4)) : n === "sys:en-US" ? "Device voice · US English" : n === "sys:en-GB" ? "Device voice · UK English" : "Device · " + n,
      // the GPU session
      info: () => info, onInfo(f) { onI.push(f) }, refresh, startSession, stopSession,
      auto, mayWake, setAuto(on) { lsSet("qpr-voice-auto", on ? "on" : "off") }
    };
    return api;
  }

  /* ---------------- Dictation (the browser's own speech recognition) ---------------- */
  function makeDictation() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return null;
    let rec = null, st = "idle"; const onF = [], onP = [], onS = [];
    const set = s => { st = s; onS.forEach(f => { try { f({ state: s }) } catch (e) {} }) };
    return {
      active: () => st !== "idle",
      start(o = {}) {
        return new Promise((res, rej) => {
          let opened = false;
          try { rec = new SR() } catch (e) { return rej({ code: "unavailable" }) }
          rec.lang = o.language === "de" ? "de-DE" : "en-US"; rec.continuous = true; rec.interimResults = true;
          rec.onstart = () => { opened = true; set("listening"); res() };
          rec.onresult = e => {
            let partial = "";
            for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i], t = r[0].transcript; if (r.isFinal) onF.forEach(f => f({ text: t.trim() + " " })); else partial += t }
            onP.forEach(f => f({ text: partial }));
          };
          rec.onerror = e => { const c = e.error === "not-allowed" || e.error === "service-not-allowed" ? "not_granted" : e.error === "aborted" ? "stopped" : e.error === "no-speech" ? "" : "unavailable"; if (!opened && c) rej({ code: c }) };
          rec.onend = () => { rec = null; set("idle"); if (!opened) rej({ code: "stopped" }) };
          set("starting");
          try { rec.start() } catch (e) { set("idle"); rej({ code: "unavailable" }) }
        });
      },
      stop() { if (rec) { set("finishing"); try { rec.stop() } catch (e) {} } return Promise.resolve() },
      onFinal(f) { onF.push(f) }, onPartial(f) { onP.push(f) }, onState(f) { onS.push(f) }
    };
  }

  return {
    sample, store, makeVoice, makeDictation,
    session: async () => { const r = await call("GET", "/api/session"); if (!r.ok) throw { code: "upstream" }; return r.json() },
    logout: async () => { try { await call("POST", "/api/logout", {}) } catch (e) {} toLogin() }
  };
})();
