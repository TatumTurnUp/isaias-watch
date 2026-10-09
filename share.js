// Share button: draws a picture of the top banner and hands it to the phone's share sheet.
(function () {
'use strict';
const $ = (q) => document.querySelector(q);
const tz = () => (window.IW && IW.tz()) || 'America/Chicago';
const ab = () => (window.IW && IW.tzAbbr()) || 'CT';
const ctOnly = (d, opts = {}) => new Date(d).toLocaleTimeString('en-US', { timeZone: tz(), hour: 'numeric', minute: '2-digit', ...opts });
const utcOnly = (d, opts = {}) => new Date(d).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false, ...opts });
const TOUCH = window.matchMedia('(pointer: coarse)').matches;
// ---------- Share: picture of the top banner ----------
// Drawn straight onto a canvas (no screenshot library), so it is ready instantly. That matters on iPhone:
// Safari only opens the share sheet if it is asked right away inside the tap. From there, "Save Image"
// puts the picture in the Photos app instead of the Files app.
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const SHARE_URL = 'isaias-watch.vercel.app';
function snapCanvas() {
  const W = 420, P = 22, S = 3;
  const css = getComputedStyle(document.documentElement);
  const v = (k, d) => (css.getPropertyValue(k) || '').trim() || d;
  const C = { bg: v('--bg', '#0a0f14'), fg: v('--fg', '#e3ebf0'), muted: v('--muted', '#8797a6'), accent: v('--accent', '#4cc3d9'), line: v('--line', '#233140') };
  const F = { display: v('--font-display', 'sans-serif'), body: v('--font-body', 'sans-serif'), mono: v('--font-mono', 'monospace') };
  const txt = (id) => (($('#' + id) || {}).textContent || '--').trim();
  const now = new Date();
  const clsEl = $('#stormClass');
  const stats = [['Max winds', txt('sWind')], ['Pressure', txt('sPres')], ['Moving', txt('sMove')],
    ['Center', txt('sPos')], [txt('sDistLabel'), txt('sDist'), true], ['Closest pass', txt('sPass')]];
  const H = 330;
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const x = c.getContext('2d'); x.scale(S, S); x.textBaseline = 'alphabetic';
  // Text with letter spacing (canvas letterSpacing isn't in every Safari), shrunk to fit a max width.
  function put(t, px, py, { font, size, color, sp = 0, align = 'left', max = Infinity, upper = false }) {
    t = upper ? String(t).toUpperCase() : String(t);
    let sz = size, w;
    for (;;) {
      x.font = font.replace('{s}', sz + 'px');
      w = [...t].reduce((a, ch) => a + x.measureText(ch).width, 0) + sp * sz * Math.max(0, [...t].length - 1);
      if (w <= max || sz <= 8) break;
      sz -= 0.5;
    }
    x.fillStyle = color;
    let cx = align === 'right' ? px - w : px;
    if (!sp) { x.fillText(t, cx, py); return w; }
    for (const ch of t) { x.fillText(ch, cx, py); cx += x.measureText(ch).width + sp * sz; }
    return w;
  }
  x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
  x.fillStyle = C.accent; x.fillRect(0, 0, W, 3);
  // Name block (left) and clock (right)
  const ct = ctOnly(now, { second: '2-digit' }), utc = utcOnly(now, { second: '2-digit' });
  const clockW = put(`${ct} ${ab()}`, W - P, P + 26, { font: `600 {s} ${F.mono}`, size: 23, color: C.fg, align: 'right' });
  put(`${utc} UTC`, W - P, P + 46, { font: `500 {s} ${F.mono}`, size: 12.5, color: C.muted, align: 'right' });
  const day = now.toLocaleDateString('en-US', { timeZone: tz(), weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  put(day, W - P, P + 63, { font: `500 {s} ${F.body}`, size: 11, color: C.muted, align: 'right' });
  put(clsEl ? clsEl.textContent.trim() : '', P, P + 12, { font: `600 {s} ${F.body}`, size: 11, sp: .12, upper: true,
    color: clsEl && clsEl.classList.contains('is-hu') ? '#ff6b5b' : C.accent, max: W - 2 * P - clockW - 14 });
  put(txt('stormName'), P, P + 58, { font: `600 {s} ${F.display}`, size: 46, sp: .04, upper: true, color: C.fg, max: W - 2 * P - clockW - 14 });
  // Stats: 3 x 2 grid
  const top = P + 86, gap = 12, colW = (W - 2 * P - 2 * gap) / 3;
  stats.forEach(([k, val, home], i) => {
    const cx = P + (i % 3) * (colW + gap), cy = top + Math.floor(i / 3) * 50;
    put(k, cx, cy + 10, { font: `500 {s} ${F.body}`, size: 10, sp: .08, upper: true, color: C.muted, max: colW });
    put(val, cx, cy + 31, { font: `500 {s} ${F.mono}`, size: 15.5, color: home ? C.accent : C.fg, max: colW });
  });
  put(txt('sAdv'), P, top + 122, { font: `400 {s} ${F.body}`, size: 12, color: C.muted, max: W - 2 * P });
  // Footer: where to find the dashboard, and who made it. Both lines centered.
  x.fillStyle = C.line; x.fillRect(P, H - 72, W - 2 * P, 1);
  const lead = 'View the full dashboard at ';
  x.font = `500 12px ${F.body}`;
  const leadW = x.measureText(lead).width, urlW = x.measureText(SHARE_URL).width;
  const lx = (W - leadW - urlW) / 2;
  put(lead, lx, H - 44, { font: `500 {s} ${F.body}`, size: 12, color: C.muted });
  put(SHARE_URL, lx + leadW, H - 44, { font: `600 {s} ${F.body}`, size: 12, color: C.accent });
  // X (Twitter) handle; the icon is the \u{1D54F} character that X itself uses, so no logo image is needed.
  const icon = '\u{1D54F}', handle = '@tatumturnup';
  const iconFont = `600 14px "Apple Symbols", "Noto Sans Math", "STIX Two Math", "Cambria Math", "Segoe UI Symbol", ${F.body}`;
  x.font = iconFont; const iconW = x.measureText(icon).width;
  x.font = `600 12.5px ${F.body}`; const handleW = x.measureText(handle).width;
  const hx = (W - iconW - 6 - handleW) / 2;
  x.font = iconFont; x.fillStyle = C.fg; x.fillText(icon, hx, H - 20);
  put(handle, hx + iconW + 6, H - 20, { font: `600 {s} ${F.body}`, size: 12.5, color: C.fg });
  return c;
}
function snapFile() {
  const url = snapCanvas().toDataURL('image/png');
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const stamp = new Date().toLocaleString('en-US', { timeZone: tz(), month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/[^0-9APM]+/g, '-').replace(/-+$/, '').toLowerCase();
  const name = `isaias-${stamp}.png`;
  const blob = new Blob([u8], { type: 'image/png' });
  let file = null;
  try { file = new File([u8], name, { type: 'image/png', lastModified: Date.now() }); } catch (e) {}
  return { url, blob, file, name };
}
function canShareFile(f) { try { return !!(f && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; } }
let snapObjUrl = null;
function closeSnap() { $('#snap').hidden = true; if (snapObjUrl) { URL.revokeObjectURL(snapObjUrl); snapObjUrl = null; } }
function openSnap(s) {
  const img = $('#snapImg'), acts = $('#snapActions'), hint = $('#snapHint');
  if (snapObjUrl) URL.revokeObjectURL(snapObjUrl);
  snapObjUrl = URL.createObjectURL(s.blob);
  img.src = snapObjUrl;
  acts.innerHTML = '';
  const shareOk = canShareFile(s.file);
  const add = (el) => { acts.appendChild(el); return el; };
  if (IOS) {
    hint.textContent = shareOk ? 'Tap Save to Photos, then choose “Save Image.” You can also press and hold the picture.' : 'Press and hold the picture, then choose “Save to Photos.”';
    if (shareOk) {
      const b = add(document.createElement('button')); b.type = 'button'; b.className = 'btn btn-solid'; b.textContent = 'Save to Photos';
      b.onclick = () => navigator.share({ files: [s.file] }).then(closeSnap).catch(() => {});
    }
  } else {
    hint.textContent = '';
    const a = add(document.createElement('a')); a.className = 'btn btn-solid'; a.href = snapObjUrl; a.download = s.name;
    a.textContent = TOUCH ? 'Save to phone' : 'Download';
    if (!TOUCH && navigator.clipboard && window.ClipboardItem) {
      const b = add(document.createElement('button')); b.type = 'button'; b.className = 'btn'; b.textContent = 'Copy';
      b.onclick = () => navigator.clipboard.write([new ClipboardItem({ 'image/png': s.blob })])
        .then(() => { b.textContent = 'Copied'; }, () => { b.textContent = 'Copy failed'; });
    }
    if (shareOk) {
      const b = add(document.createElement('button')); b.type = 'button'; b.className = 'btn'; b.textContent = 'Share…';
      b.onclick = () => navigator.share({ files: [s.file] }).catch(() => {});
    }
  }
  $('#snap').hidden = false;
}
$('#shareBtn').addEventListener('click', () => {
  let s;
  try { s = snapFile(); } catch (e) { console.warn('snapshot failed', e); return; }
  // iPhone/iPad: straight to the share sheet ("Save Image" -> Photos). Only the picture is shared, no text,
  // because adding text makes iOS drop the Save Image option.
  if (IOS && canShareFile(s.file)) {
    navigator.share({ files: [s.file] }).catch((e) => { if (!e || e.name !== 'AbortError') openSnap(s); });
    return;
  }
  openSnap(s);
});
$('#snapX').addEventListener('click', closeSnap);
$('#snap').addEventListener('click', (e) => { if (e.target.id === 'snap') closeSnap(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#snap').hidden) closeSnap(); });
})();
