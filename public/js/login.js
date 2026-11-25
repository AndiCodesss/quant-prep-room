const form = document.getElementById("loginForm"), msg = document.getElementById("loginMsg"), pw = document.getElementById("pw");
form.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = form.querySelector("button");
  btn.disabled = true; msg.hidden = true;
  try {
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw.value }) });
    if (res.ok) { location.replace("/" + location.hash); return }
    const wait = Math.ceil((+res.headers.get("Retry-After") || 0) / 60);
    msg.textContent = res.status === 429 ? `Too many attempts. Try again in ${wait || 15} minutes.` : "That password isn't right.";
  } catch (err) {
    msg.textContent = "Couldn't reach the server. Check your connection and try again.";
  }
  msg.hidden = false; btn.disabled = false; pw.select();
});
