/* ---------- Desktop→phone handoff (receiver side) ----------
 * HOSTED-ONLY by nature: the desktop is the *receiver*, so it needs a real
 * origin the phone can POST to via /api/relay/:token. file:// can't be the
 * receiving end. Degrades gracefully if the QR library can't be fetched.
 *
 * Flow: click Scan -> mint an unguessable token -> show a QR encoding
 *   <origin>/scan?token=…  -> poll GET /api/relay/:token until the phone POSTs
 * a payload -> ingest it through the normal import path (clipFp / autoCategorize
 * / saveState) tagged batch:"handoff" -> confirm. Times out at the token TTL.
 *
 * Definitions only — the Scan button is wired in boot.js. */

const HANDOFF = {
  token: null,
  timer: null,
  deadline: 0,
  busy: false,
  POLL_MS: 2000,
  TTL_MS: 600000,                 // ~10 min, matches the KV TTL on the relay (time to scan + correct text on the phone)
  QR_SRC: "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js",
  qrLoading: null,
};

// Crypto-strong, unguessable token. 128 bits is plenty for a one-shot ~2-min
// mailbox, and base64url keeps the URL (and therefore the QR) short and easy to
// scan. Possession == permission.
function handoffToken(){
  const a = new Uint8Array(16);
  (crypto || window.crypto).getRandomValues(a);
  const s = btoa(String.fromCharCode.apply(null, a));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); // url-safe
}

function handoffUrl(token){
  return location.origin + "/scan?token=" + encodeURIComponent(token);
}

// Lazily fetch the QR lib from a CDN on demand (like the app's other external
// calls). Resolves null on failure so the caller can degrade to a plain link.
function loadQrLib(){
  if (typeof window.QRCode !== "undefined") return Promise.resolve(window.QRCode);
  if (HANDOFF.qrLoading) return HANDOFF.qrLoading;
  HANDOFF.qrLoading = new Promise(res => {
    const s = document.createElement("script");
    s.src = HANDOFF.QR_SRC; s.async = true;
    s.onload = () => res(typeof window.QRCode !== "undefined" ? window.QRCode : null);
    s.onerror = () => res(null);
    document.head.appendChild(s);
  });
  return HANDOFF.qrLoading;
}

function buildHandoffModal(){
  let ov = document.getElementById("handoffOverlay");
  if (ov) return ov;
  ov = document.createElement("div");
  ov.id = "handoffOverlay";
  ov.className = "handoff-overlay";
  ov.innerHTML =
    '<div class="handoff-modal" role="dialog" aria-label="Receive a highlight from your phone">'
    + '<button class="handoff-close" id="handoffClose" type="button" aria-label="Close">✕</button>'
    + '<h3 class="handoff-h">Send a highlight from your phone</h3>'
    + '<p class="handoff-sub">Scan this with your phone’s camera, then tap the button it shows.</p>'
    + '<div class="handoff-qr" id="handoffQr"></div>'
    + '<p class="handoff-link" id="handoffLink"></p>'
    + '<div class="handoff-status" id="handoffStatus"></div>'
    + '</div>';
  document.body.appendChild(ov);
  ov.addEventListener("click", e => { if (e.target === ov) closeHandoff(); });
  ov.querySelector("#handoffClose").onclick = closeHandoff;
  return ov;
}

function setHandoffStatus(html, cls){
  const el = document.getElementById("handoffStatus");
  if (!el) return;
  el.className = "handoff-status" + (cls ? " " + cls : "");
  el.innerHTML = html;
}

function startHandoff(){
  const ov = buildHandoffModal();
  ov.classList.add("show");
  stopHandoffPolling();
  HANDOFF.token = handoffToken();
  HANDOFF.deadline = Date.now() + HANDOFF.TTL_MS;
  const url = handoffUrl(HANDOFF.token);

  const link = document.getElementById("handoffLink");
  // Compact label (host + /scan) so the link doesn't sprawl; href stays full.
  const label = (location.host || location.origin.replace(/^https?:\/\//, "")) + "/scan";
  if (link) link.innerHTML = "or open <a href=\"" + url + "\" target=\"_blank\" rel=\"noopener\">" + escHandoff(label) + "</a>";
  setHandoffStatus("Waiting for your phone…", "waiting");

  // Render the QR (graceful fallback to the link above).
  const qr = document.getElementById("handoffQr");
  if (qr) qr.innerHTML = "";
  loadQrLib().then(QR => {
    if (HANDOFF.token == null) return;            // closed while loading
    if (!qr) return;
    if (!QR) { qr.classList.add("noqr"); qr.textContent = "QR unavailable — use the link below."; return; }
    qr.classList.remove("noqr");
    try {
      new QR(qr, { text: url, width: 208, height: 208,
        colorDark: "#2a221d", colorLight: "#f4e9cf",
        correctLevel: QR.CorrectLevel ? QR.CorrectLevel.M : 0 });
    } catch (e) {
      qr.classList.add("noqr"); qr.textContent = "QR unavailable — use the link below.";
    }
  });

  // Start polling for the phone's payload.
  HANDOFF.timer = setInterval(pollHandoffOnce, HANDOFF.POLL_MS);
  pollHandoffOnce();
}

function stopHandoffPolling(){
  if (HANDOFF.timer) { clearInterval(HANDOFF.timer); HANDOFF.timer = null; }
}

function closeHandoff(){
  stopHandoffPolling();
  HANDOFF.token = null;
  const ov = document.getElementById("handoffOverlay");
  if (ov) ov.classList.remove("show");
}

async function pollHandoffOnce(){
  if (HANDOFF.busy || !HANDOFF.token) return;
  if (Date.now() > HANDOFF.deadline){
    stopHandoffPolling();
    setHandoffStatus('QR expired. <button class="btn sm" id="handoffRetry" type="button">Try again</button>', "expired");
    const r = document.getElementById("handoffRetry");
    if (r) r.onclick = startHandoff;
    return;
  }
  HANDOFF.busy = true;
  const token = HANDOFF.token;
  try {
    const res = await fetch("/api/relay/" + encodeURIComponent(token), { method: "GET", cache: "no-store" });
    if (res.status === 200){
      let payload = null;
      try { payload = await res.json(); } catch (e) { payload = null; }
      if (payload){
        stopHandoffPolling();
        HANDOFF.token = null;
        const n = receiveHandoff(payload);
        setHandoffStatus("✓ Received " + n + " highlight" + (n === 1 ? "" : "s") + " from your phone.", "ok");
        if (typeof toast === "function") toast("Received " + n + " highlight" + (n === 1 ? "" : "s") + " from your phone.");
        setTimeout(closeHandoff, 1600);
      }
    }
    // 204 (nothing yet) -> keep polling.
  } catch (e) {
    // Network blip; keep polling until the deadline.
  } finally {
    HANDOFF.busy = false;
  }
}

// Ingest a handoff payload (one clip object or an array of them) through the
// normal merge/dedup/persist path. Returns the number of new clips added.
function receiveHandoff(payload){
  const items = Array.isArray(payload) ? payload : [payload];
  // Don't merge into the built-in sample; start a real library if needed.
  if (typeof IS_SAMPLE !== "undefined" && IS_SAMPLE) createLibraryQuiet("My Library");
  ensureActiveLib("My Library", false);

  const byFp = new Map(STATE.clips.map(c => [c.fp, c]));
  let maxId = STATE.clips.reduce((m, c) => Math.max(m, c.id || 0), 0);
  let added = 0, changed = 0; const addedFps = [];

  items.forEach(p => {
    if (!p || !(p.text && String(p.text).trim())) return;
    const c = {
      title: p.title || "Untitled", author: p.author || "",
      text: String(p.text).trim(), type: p.type || "highlight",
      page: p.page || "", loc: p.loc || "",
      added: p.added || Date.now(), cat: p.cat || "", batch: "handoff",
      edited: !!p.edited,                          // phone-corrected OCR text
    };
    c.fp = clipFp(c);
    if (!c.cat) c.cat = autoCategorize(c);
    else c.catLocked = true;                       // honor a phone-supplied tag
    const ex = byFp.get(c.fp);
    if (!ex){ c.id = ++maxId; STATE.clips.push(c); byFp.set(c.fp, c); added++; addedFps.push(c.fp); }
    else if (ex.text !== c.text){
      if (ex.edited) ex.incoming = c.text;
      else { ex.text = c.text; ex.cat = ex.catLocked ? ex.cat : autoCategorize(ex); }
      changed++;
    }
  });

  if (added || changed){
    IMPORT_LOG.unshift({ batch: "handoff", date: Date.now(), name: "Phone handoff",
      added, updated: changed, total: STATE.clips.length, fps: addedFps });
    IMPORT_LOG = IMPORT_LOG.slice(0, 100);
  }
  if (typeof IS_SAMPLE !== "undefined") IS_SAMPLE = false;
  saveState();

  const drop = document.getElementById("drop"); if (drop) drop.classList.add("hidden");
  const app = document.getElementById("app"); if (app) app.classList.remove("hidden");
  if (typeof showSurprise === "function") showSurprise();
  render();
  if (typeof renderDropPanel === "function") renderDropPanel();
  return added;
}

// Local escape (handoff.js is self-contained; doesn't assume escHtml's presence).
function escHandoff(s){
  return String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}
