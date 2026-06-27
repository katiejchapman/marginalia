/* ---------- Phone handoff (sender side): capture + OCR ----------
 * Lightweight /scan page, scoped to the token in the URL. Tap "Scan" to open
 * the rear camera (or a file picker on desktop), OCR the photo with a lazily
 * loaded tesseract.js, correct the text in an editable form, then POST a
 * clip-shaped payload to /api/relay/:token. The image never leaves the phone —
 * only the recognized text is sent, and the image is discarded after send.
 *
 * HOSTED-ONLY (https / localhost origin): the worker runs fine here — the
 * file:// worker restrictions from the offline-OCR step do not apply. */
(function(){
  var TESS_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";

  var params = new URLSearchParams(location.search);
  var token  = params.get("token") || "";
  if ((params.get("mode") || "").toLowerCase() === "dark")
    document.documentElement.setAttribute("data-mode", "dark");   // match desktop theme
  var scanBtn = document.getElementById("scanBtn");
  var imgInput = document.getElementById("imgInput");
  var status = document.getElementById("scanStatus");
  var preview = document.getElementById("preview");
  var form = document.getElementById("form");
  var fText = document.getElementById("fText");
  var fTitle = document.getElementById("fTitle");
  var fAuthor = document.getElementById("fAuthor");
  var fPage = document.getElementById("fPage");
  var fTag = document.getElementById("fTag");
  var fNote = document.getElementById("fNote");
  var sendBtn = document.getElementById("sendBtn");
  var rescanBtn = document.getElementById("rescanBtn");
  var coverBtn = document.getElementById("coverBtn");
  var coverInput = document.getElementById("coverInput");
  var crop = document.getElementById("crop");
  var cropStage = document.getElementById("cropStage");
  var cropImg = document.getElementById("cropImg");
  var cropBox = document.getElementById("cropBox");
  var readBtn = document.getElementById("readBtn");
  var cropCancel = document.getElementById("cropCancel");
  var tokBox = document.getElementById("tokBox");

  var previewUrl = null;            // object URL for the on-screen preview
  var tessLoading = null;
  var cropUrl = null;               // object URL for the photo being cropped
  var sel = null;                   // current selection rect, in stage CSS px

  function setStatus(msg, cls){ status.textContent = msg; status.className = "scan-status" + (cls ? " " + cls : ""); }
  function show(el){ el.classList.remove("hidden"); }
  function hide(el){ el.classList.add("hidden"); }

  if (tokBox) tokBox.textContent = token ? (token.slice(0, 8) + "…") : "(none)";
  if (!token){
    if (scanBtn) scanBtn.disabled = true;
    setStatus("No token in the link — open this page by scanning the QR on your desktop.", "err");
    return;
  }

  // ----- lazy CDN load of tesseract.js (graceful null on failure) -----
  function loadTesseract(){
    if (typeof window.Tesseract !== "undefined") return Promise.resolve(window.Tesseract);
    if (tessLoading) return tessLoading;
    tessLoading = new Promise(function(res){
      var s = document.createElement("script");
      s.src = TESS_SRC; s.async = true;
      s.onload = function(){ res(typeof window.Tesseract !== "undefined" ? window.Tesseract : null); };
      s.onerror = function(){ res(null); };
      document.head.appendChild(s);
    });
    return tessLoading;
  }

  function blobToImage(blob){
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function(){ res({ img: img, url: url }); };
      img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error("could not decode image")); };
      img.src = url;
    });
  }

  // Grayscale + scale toward ~1500px wide on a canvas — improves OCR on book
  // photos (down-samples huge camera shots, up-samples small crops).
  async function preprocess(blob){
    var got = await blobToImage(blob);
    var img = got.img;
    var targetW = Math.min(1600, Math.max(img.naturalWidth || img.width, 1500));
    var scale = (img.naturalWidth || img.width) ? targetW / (img.naturalWidth || img.width) : 1;
    var w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    var h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(got.url);
    try {
      var id = ctx.getImageData(0, 0, w, h), d = id.data;
      for (var i = 0; i < d.length; i += 4){
        var g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        // light contrast stretch around mid-gray
        g = Math.max(0, Math.min(255, (g - 128) * 1.15 + 128));
        d[i] = d[i + 1] = d[i + 2] = g;
      }
      ctx.putImageData(id, 0, 0);
    } catch (e) { /* tainted/!ctx — fall back to the color canvas */ }
    return cv;
  }

  async function ocrImage(blob){
    var T = await loadTesseract();
    if (!T) throw new Error("ocr-unavailable");
    var canvas = await preprocess(blob);
    var worker = await T.createWorker("eng");      // default CDN worker/core/lang
    try {
      var out = await worker.recognize(canvas);
      return (out && out.data && out.data.text ? out.data.text : "").trim();
    } finally {
      try { await worker.terminate(); } catch (e) {}
    }
  }

  // ----- light text heuristics (all best-effort; the user can edit) -----
  // A line that's nothing but 1–4 digits is almost always a page number.
  function parsePage(text){
    var lines = String(text || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++){
      var m = lines[i].trim().match(/^(\d{1,4})$/);
      if (m) return m[1];
    }
    return "";
  }
  function stripPageLine(text, pg){
    return String(text || "").split(/\r?\n/).filter(function(l){ return l.trim() !== pg; }).join("\n").trim();
  }
  // Parse a cover's OCR text into {title, author}. Covers vary wildly, so this is
  // a rough guess: honor an explicit "by …", else take the longest line as the
  // title and a short Title-Case line as the author.
  function parseCover(text){
    var lines = String(text || "").split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean);
    var title = "", author = "";
    for (var i = 0; i < lines.length; i++){
      var m = lines[i].match(/^by\s+(.+)/i);
      if (m){ author = m[1].trim(); lines.splice(i, 1); break; }
    }
    if (lines.length){
      title = lines.slice().sort(function(a, b){ return b.length - a.length; })[0];
      if (!author){
        var cand = lines.filter(function(l){ return l !== title && /^[A-Z]/.test(l) && l.split(/\s+/).length <= 4; });
        if (cand.length) author = cand[cand.length - 1];
      }
    }
    return { title: title, author: author };
  }

  // Scan a book cover and fill title/author (editable). Doesn't touch the
  // highlight text or the preview.
  async function handleCover(blob){
    if (!blob) return;
    setStatus("Reading the cover…", "busy");
    if (coverBtn) coverBtn.disabled = true;
    try {
      var t = await ocrImage(blob);
      var pc = parseCover(t);
      if (pc.title) fTitle.value = pc.title;
      if (pc.author) fAuthor.value = pc.author;
      setStatus((pc.title || pc.author) ? "Filled title/author from the cover — check them." : "Couldn’t read the cover — type it in.", (pc.title || pc.author) ? "" : "err");
    } catch (e) {
      setStatus(e && e.message === "ocr-unavailable" ? "OCR unavailable — type title/author in." : "Couldn’t read the cover — type title/author in.", "err");
    } finally {
      if (coverBtn) coverBtn.disabled = false;
      try { coverInput.value = ""; } catch (e) {}
    }
  }

  // Run the capture pipeline on a File/Blob: preview, OCR, reveal the editable
  // form. Exposed for the headless test (which feeds a synthetic image instead
  // of a camera). Returns the recognized text.
  async function handleImage(blob){
    if (!blob) return "";
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    previewUrl = URL.createObjectURL(blob);
    preview.innerHTML = '<img alt="captured photo" src="' + previewUrl + '">';
    show(preview);
    setStatus("Reading the photo…", "busy");
    scanBtn.disabled = true;
    var text = "";
    try {
      text = await ocrImage(blob);
      var pg = parsePage(text);                       // auto page number from a lone-digit line
      if (pg) { fPage.value = pg; text = stripPageLine(text, pg); }
      fText.value = text;
      show(form);
      setStatus(text ? "Check the text below and fix any mistakes." : "No text found — type it in below.", text ? "" : "busy");
    } catch (e) {
      // Graceful path: still let the user type the highlight by hand.
      show(form);
      if (e && e.message === "ocr-unavailable")
        setStatus("OCR unavailable (couldn’t load the scanner). You can type the highlight below.", "err");
      else
        setStatus("Couldn’t read that image. You can type the highlight below.", "err");
    } finally {
      scanBtn.disabled = false;
    }
    return text;
  }

  function discardImage(){
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    preview.innerHTML = ""; hide(preview);
    try { imgInput.value = ""; } catch (e) {}
  }

  // ----- crop step: show the photo, let the user drag a box around the passage,
  // then send only that region to OCR. No box = whole photo. -----
  function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

  function showCrop(file){
    if (cropUrl) { URL.revokeObjectURL(cropUrl); cropUrl = null; }
    cropUrl = URL.createObjectURL(file);
    cropImg.src = cropUrl;
    sel = null; hide(cropBox);
    hide(form); hide(preview); show(crop);
    setStatus("Drag a box around the passage, then tap Read.", "busy");
  }

  function clearCrop(){
    if (cropUrl) { URL.revokeObjectURL(cropUrl); cropUrl = null; }
    cropImg.removeAttribute("src");
    sel = null; hide(cropBox); hide(crop);
  }

  function drawBox(l, t, w, h){ cropBox.style.left = l + "px"; cropBox.style.top = t + "px"; cropBox.style.width = w + "px"; cropBox.style.height = h + "px"; }

  var dragging = false, startX = 0, startY = 0;
  function stagePoint(e){
    var r = cropStage.getBoundingClientRect();
    return { x: clamp(e.clientX - r.left, 0, r.width), y: clamp(e.clientY - r.top, 0, r.height), w: r.width, h: r.height };
  }
  cropStage.addEventListener("pointerdown", function(e){
    if (crop.classList.contains("hidden")) return;
    dragging = true; try { cropStage.setPointerCapture(e.pointerId); } catch (er) {}
    var p = stagePoint(e); startX = p.x; startY = p.y;
    drawBox(startX, startY, 0, 0); show(cropBox); e.preventDefault();
  });
  cropStage.addEventListener("pointermove", function(e){
    if (!dragging) return;
    var p = stagePoint(e);
    var l = Math.min(startX, p.x), t = Math.min(startY, p.y), w = Math.abs(p.x - startX), h = Math.abs(p.y - startY);
    drawBox(l, t, w, h); sel = { l: l, t: t, w: w, h: h, cw: p.w, ch: p.h }; e.preventDefault();
  });
  function endDrag(e){ if (dragging) { dragging = false; e.preventDefault(); } }
  cropStage.addEventListener("pointerup", endDrag);
  cropStage.addEventListener("pointercancel", endDrag);

  // Crop the source image to the selection (mapped to natural pixels) and return
  // a PNG blob. No/too-small selection -> the whole image.
  function cropToBlob(){
    return new Promise(function(res){
      var natW = cropImg.naturalWidth, natH = cropImg.naturalHeight;
      var dispW = cropImg.clientWidth || natW, dispH = cropImg.clientHeight || natH;
      var sx = 0, sy = 0, sw = natW, sh = natH;
      if (sel && sel.w > 8 && sel.h > 8){
        var fx = natW / dispW, fy = natH / dispH;
        sx = sel.l * fx; sy = sel.t * fy; sw = sel.w * fx; sh = sel.h * fy;
      }
      var cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(sw)); cv.height = Math.max(1, Math.round(sh));
      cv.getContext("2d").drawImage(cropImg, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      if (cv.toBlob) cv.toBlob(function(b){ res(b); }, "image/png");
      else res(null);
    });
  }

  // ----- wire UI -----
  scanBtn.addEventListener("click", function(){ imgInput.click(); });
  imgInput.addEventListener("change", function(e){
    var f = e.target.files && e.target.files[0];
    if (f) showCrop(f);                              // crop first, then OCR the region
  });
  readBtn.addEventListener("click", async function(){
    readBtn.disabled = true;
    try {
      var blob = await cropToBlob();
      clearCrop();
      if (blob) await handleImage(blob);
      else setStatus("Couldn’t crop that image. Try a different photo.", "err");
    } finally { readBtn.disabled = false; }
  });
  cropCancel.addEventListener("click", function(){ clearCrop(); setStatus(""); imgInput.click(); });
  rescanBtn.addEventListener("click", function(){
    discardImage(); hide(form); setStatus(""); imgInput.click();
  });
  if (coverBtn) coverBtn.addEventListener("click", function(){ coverInput.click(); });
  if (coverInput) coverInput.addEventListener("change", function(e){
    var f = e.target.files && e.target.files[0];
    if (f) handleCover(f);
  });

  sendBtn.addEventListener("click", async function(){
    var text = fText.value.trim();
    if (!text){ setStatus("Nothing to send — add some text first.", "err"); return; }
    sendBtn.disabled = true;
    setStatus("Sending…", "busy");

    var page = fPage.value.trim();
    var note = fNote.value.trim();
    // Unique loc per highlight so two highlights from the SAME page don't collide
    // on the fingerprint (type|title|author|loc). The note shares this same loc so
    // it still pairs to its highlight; the page lives in its own field.
    var loc = "scan" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    var title = fTitle.value.trim() || "Scanned";
    var author = fAuthor.value.trim();

    // Corrected by the user -> edited:true. Same clip shape the desktop ingests.
    var highlight = {
      text: text, title: title, author: author, type: "highlight",
      page: page, loc: loc, cat: fTag.value, added: Date.now(), edited: true,
    };
    var payload = note
      ? [highlight, { text: note, title: title, author: author, type: "note",
                      page: page, loc: loc, added: Date.now() }]
      : highlight;

    try {
      var res = await fetch("/api/relay/" + encodeURIComponent(token), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok){
        discardImage();                              // image never persisted/sent
        hide(form);
        // Reset for successive highlights; keep book/author for the next one.
        fText.value = ""; fNote.value = ""; fPage.value = "";
        sendBtn.disabled = false;
        setStatus("✓ Sent! Scan another highlight, or you’re done.", "ok");
      } else {
        setStatus("Couldn’t send (server said " + res.status + "). The code may have expired — rescan.", "err");
        sendBtn.disabled = false;
      }
    } catch (e) {
      setStatus("Network error — couldn’t reach the relay. Try again.", "err");
      sendBtn.disabled = false;
    }
  });

  // Hook for the headless OCR→relay→ingest test (camera can't be driven headlessly).
  window.SCAN = { handleImage: handleImage, handleCover: handleCover, ocrImage: ocrImage, parseCover: parseCover, parsePage: parsePage };
})();
