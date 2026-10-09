/* Isaias Watch — live storm dashboard. Everything refreshes on its own. */
(() => {
'use strict';

// ---------- Config ----------
const STORM_NAME = 'Isaias';
const TZ = 'America/Chicago';
const HOME = { lat: 31.3271, lon: -89.2903 };
const NOLA = { lat: 29.9511, lon: -90.0715 };
const HOME_TOWNS = [
  { name: 'Hattiesburg', lat: 31.3271, lon: -89.2903 },
  { name: 'Petal', lat: 31.3466, lon: -89.2601 },
  { name: 'Sumrall', lat: 31.4174, lon: -89.5423 },
  { name: 'Purvis', lat: 31.1443, lon: -89.4070 },
  { name: 'Oak Grove', lat: 31.2860, lon: -89.4145 },
];
const HOME_COUNTIES = new Set(['028035', '028073']); // Forrest, Lamar

// SAME codes for counties/parishes (MS + LA only) with any part within 50 mi of each city.
const REGIONS = {
  hat: { label: 'Hattiesburg', home: new Set(['028035', '028073']), list: [["028035","Forrest","MS"],["028073","Lamar","MS"],["028067","Jones","MS"],["028111","Perry","MS"],["028031","Covington","MS"],["028065","Jefferson Davis","MS"],["028091","Marion","MS"],["028153","Wayne","MS"],["028109","Pearl River","MS"],["028041","Greene","MS"],["028131","Stone","MS"],["028061","Jasper","MS"],["028129","Smith","MS"],["022117","Washington","LA"],["028039","George","MS"],["028147","Walthall","MS"],["028127","Simpson","MS"],["028077","Lawrence","MS"],["028023","Clarke","MS"],["028047","Harrison","MS"],["028045","Hancock","MS"],["028059","Jackson","MS"]] },
  nola: { label: 'New Orleans', home: new Set(['022071', '022051']), list: [["022071","Orleans","LA"],["022051","Jefferson","LA"],["022087","St. Bernard","LA"],["022075","Plaquemines","LA"],["022089","St. Charles","LA"],["022103","St. Tammany","LA"],["022095","St. John the Baptist","LA"],["022057","Lafourche","LA"],["022105","Tangipahoa","LA"],["022063","Livingston","LA"],["028045","Hancock","MS"],["022093","St. James","LA"],["022005","Ascension","LA"],["022109","Terrebonne","LA"],["028109","Pearl River","MS"],["022007","Assumption","LA"],["022117","Washington","LA"]] },
};
for (const r of Object.values(REGIONS)) {
  r.same = new Set(r.list.map((x) => x[0]));
  r.name = Object.fromEntries(r.list.map((x) => [x[0], `${x[1]}${x[2] === 'LA' ? ' Par.' : ''}`]));
}
const ALL_NAMES = Object.assign({}, REGIONS.hat.name, REGIONS.nola.name);

// Ordering + alert colors. One color per alert type everywhere: map shading, map legend, alert cards.
// Families: hurricane = red/pink, tropical storm = blue, storm surge = purple, flooding = green, tornado = yellow/red.
const EVENT_ORDER = [
  'Tornado Warning', 'Extreme Wind Warning', 'Hurricane Warning', 'Storm Surge Warning', 'Flash Flood Warning',
  'Tropical Storm Warning', 'Severe Thunderstorm Warning', 'Hurricane Watch', 'Storm Surge Watch', 'Tornado Watch',
  'Tropical Storm Watch', 'Flood Warning', 'Coastal Flood Warning', 'Flash Flood Watch', 'Flood Watch',
  'Severe Thunderstorm Watch', 'High Wind Warning', 'Wind Advisory', 'Coastal Flood Advisory', 'Flood Advisory',
  'High Surf Advisory', 'Rip Current Statement', 'Special Weather Statement',
];
const EVENT_COLOR = {
  'Tornado Warning': '#ff2020', 'Extreme Wind Warning': '#ff8c00', 'Hurricane Warning': '#e8242c',
  'Storm Surge Warning': '#a93cf0', 'Flash Flood Warning': '#18c964', 'Tropical Storm Warning': '#2e7dff',
  'Severe Thunderstorm Warning': '#ffa500', 'Hurricane Watch': '#ff6fd8', 'Storm Surge Watch': '#d9a6ff',
  'Tornado Watch': '#ffe600', 'Tropical Storm Watch': '#86c5ff', 'Flood Warning': '#7cfc00',
  'Coastal Flood Warning': '#2fbf8f', 'Flash Flood Watch': '#20b2aa', 'Flood Watch': '#3cb371',
  'Coastal Flood Watch': '#66cdaa', 'Severe Thunderstorm Watch': '#db7093', 'High Wind Warning': '#daa520',
  'High Wind Watch': '#b8860b', 'Wind Advisory': '#d2b48c', 'Coastal Flood Advisory': '#7fdba6', 'Flood Advisory': '#00ff7f',
  'High Surf Advisory': '#ba55d3', 'Rip Current Statement': '#40e0d0', 'Special Weather Statement': '#ffe4b5',
};
const SKIP_EVENTS = new Set(['Tropical Cyclone Local Statement', 'Hurricane Local Statement', 'Test Message']);

// ---------- Helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ktToMph = (kt) => Math.round(kt * 1.15078);
const nhcMph = (kt) => Math.round(kt * 1.15078 / 5) * 5; // NHC rounds intensities to 5 mph
// Every time on the dashboard shows Central and UTC: "4:16 PM CT / 21:16 UTC".
const ctOnly = (d, opts = {}) => new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', ...opts });
const utcOnly = (d, opts = {}) => new Date(d).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false, ...opts });
const fmtTime = (d) => `${ctOnly(d)} CT / ${utcOnly(d)} UTC`;
const fmtDayTime = (d) => `${new Date(d).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })} ${fmtTime(d)}`;
// Phone-friendly short forms. Pages render both; CSS shows .lg on desktop and .sh on phones.
const shortTime = (d) => ctOnly(d);
const shortDayTime = (d) => `${new Date(d).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })} ${ctOnly(d)}`;
function relShort(d) {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
const dual = (long, short) => `<span class="lg">${esc(long)}</span><span class="sh">${esc(short)}</span>`;
function untilShort(d) {
  if (!d) return 'Ongoing';
  const ms = new Date(d).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  if (ms < 3600e3) return `${Math.max(1, Math.round(ms / 60000))}m left`;
  return `til ${shortDayTime(d)}`;
}
const untilHTML = (d) => dual(untilText(d), untilShort(d));
function cleanTitle(t) {
  return String(t || '')
    .replace(/^(Potential |Post-)?(Tropical Storm|Hurricane|Tropical Depression|Subtropical Storm|Tropical Cyclone|Remnants of)\s+Isaias\s*/i, '')
    .replace(/\bIntermediate\s+/i, '')
    .replace(/Local Statement Advisory Number\s+(\w+)/i, 'Local Statement #$1')
    .replace(/(Advisory|Discussion) Number\s+(\w+)/i, '$1 #$2')
    .replace(/^Tropical Cyclone Update$/i, 'Update')
    .trim() || t;
}
function rel(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ${Math.round((s % 3600) / 60)} min ago`;
  return fmtDayTime(d);
}
function untilText(d) {
  if (!d) return 'until further notice';
  const ms = new Date(d).getTime() - Date.now();
  const t = fmtDayTime(d);
  if (ms <= 0) return `expired ${t}`;
  if (ms < 3600e3) return `${Math.max(1, Math.round(ms / 60000))} min left · ${t}`;
  return `until ${t}`;
}
function miles(a, b) {
  const R = 3958.8, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const toR = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * toR) * Math.cos(b.lat * toR);
  const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lon - a.lon) * toR);
  return (Math.atan2(y, x) / toR + 360) % 360;
}
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
function saffir(mph) {
  if (mph >= 157) return 'Category 5 hurricane';
  if (mph >= 130) return 'Category 4 hurricane';
  if (mph >= 111) return 'Category 3 hurricane';
  if (mph >= 96) return 'Category 2 hurricane';
  if (mph >= 74) return 'Category 1 hurricane';
  if (mph >= 39) return 'Tropical storm';
  return 'Tropical depression';
}

async function getJSON(url, { timeout = 20000, headers } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
const NWS_HEADERS = { Accept: 'application/geo+json' };
// Write a storm stat to the main header and the phone mini-bar copies.
function setStat(key, val) {
  const main = document.getElementById(key);
  if (main) main.textContent = val;
  $$(`[data-s="${key}"]`).forEach((el) => { el.textContent = val; });
}

// Source health
const health = {};
function mark(key, ok, label) {
  health[key] = { ok, label, at: Date.now() };
  $('#sources').innerHTML = Object.entries(health).map(([k, v]) =>
    `<span class="${v.ok ? 'ok' : 'err'}" title="${esc(v.ok ? 'updated' : 'failed')} ${esc(fmtTime(v.at))}">${esc(v.label)} · ${esc(ctOnly(v.at))} CT</span>`).join('');
}
function every(ms, fn) {
  const run = async () => { try { await fn(); } catch (e) { console.warn(e); } setTimeout(run, ms); };
  run();
}

// ---------- Clock ----------
function tickClock() {
  const now = new Date();
  const ct = ctOnly(now, { second: '2-digit' }), utc = utcOnly(now, { second: '2-digit' });
  $('#clock').textContent = `${ct} CT`;
  $('#clockUtc').textContent = `${utc} UTC`;
  $$('[data-clock]').forEach((el) => { el.textContent = `${ct} CT`; });
  $$('[data-clock-utc]').forEach((el) => { el.textContent = `${utc} UTC`; });
  $$('[data-clock-mini]').forEach((el) => { el.textContent = ct; });
}
setInterval(tickClock, 1000); tickClock();

// ---------- Siren / notifications ----------
let audioCtx = null;
let armed = false;
let sirenStop = null;
try { armed = localStorage.getItem('isaias.armed') === '1'; } catch (e) {}
function setArmedUI() {
  const b = $('#armBtn');
  const live = armed && audioCtx && audioCtx.state === 'running';
  b.textContent = live ? 'Siren on' : 'Turn on siren';
  b.title = live ? 'Siren will sound for tornado warnings in Forrest or Lamar County. Click to turn it off.' : 'Lets this page play the siren. Browsers block sound until you click once each time the page opens.';
  b.classList.toggle('is-armed', !!live);
  $('#rearm').hidden = !(armed && !live);
}
async function arm() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    armed = true;
    try { localStorage.setItem('isaias.armed', '1'); } catch (e) {}
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
  } catch (e) { console.warn(e); }
  setArmedUI();
}
$('#armBtn').addEventListener('click', () => {
  if (armed && audioCtx && audioCtx.state === 'running') {
    armed = false; try { localStorage.setItem('isaias.armed', '0'); } catch (e) {}
    stopSiren(); setArmedUI();
  } else arm().then(() => playChime());
});
// One click anywhere re-arms after a reload (browsers block sound until the page is touched).
document.addEventListener('pointerdown', () => { if (armed && (!audioCtx || audioCtx.state !== 'running')) arm(); }, { capture: true });

function playSiren(seconds = 20) {
  if (!audioCtx || audioCtx.state !== 'running') return false;
  stopSiren();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(audioCtx.destination);
  const t0 = audioCtx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.2);
  for (let t = 0; t < seconds; t += 2) {
    osc.frequency.setValueAtTime(520, t0 + t);
    osc.frequency.linearRampToValueAtTime(1150, t0 + t + 1);
    osc.frequency.linearRampToValueAtTime(520, t0 + t + 2);
  }
  gain.gain.setValueAtTime(0.25, t0 + seconds - 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  osc.start(t0); osc.stop(t0 + seconds + 0.05);
  sirenStop = () => { try { osc.stop(); } catch (e) {} sirenStop = null; };
  osc.onended = () => { sirenStop = null; };
  return true;
}
function playChime() {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const t0 = audioCtx.currentTime;
  [880, 660].forEach((f, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = f; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
    g.gain.exponentialRampToValueAtTime(0.2, t0 + i * 0.35 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.33);
    o.connect(g).connect(audioCtx.destination); o.start(t0 + i * 0.35); o.stop(t0 + i * 0.35 + 0.35);
  });
}
function stopSiren() { if (sirenStop) sirenStop(); }
// Android Chrome only shows notifications through a service worker, so use it when we have one.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
async function notify(title, body, tag) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body, tag, requireInteraction: true, vibrate: [500, 250, 500, 250, 900], icon: '/icon-192.png', badge: '/icon-192.png' };
    const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch (e) {}
}
// Android phones also buzz (iPhones ignore this).
function buzz() { try { if (navigator.vibrate) navigator.vibrate([600, 300, 600, 300, 600, 300, 1200]); } catch (e) {} }
$('#hbAck').addEventListener('click', () => {
  stopSiren();
  acked = new Set(currentHomeIds);
  $('#homeBanner').classList.remove('is-flash');
});
let testTimer = null;
$('#testBtn').addEventListener('click', async () => {
  if (!audioCtx || audioCtx.state !== 'running') await arm();
  testMode = true; renderTornado(); playSiren(8); buzz();
  clearTimeout(testTimer);
  testTimer = setTimeout(() => { testMode = false; stopSiren(); renderTornado(); }, 8000);
});
setArmedUI();

// Keep the screen awake while the dashboard is open (where supported).
async function wake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', wake); wake();

// ---------- Map ----------
const TOUCH = window.matchMedia('(pointer: coarse)').matches;
const SMALL = window.matchMedia('(max-width: 760px)').matches;
// Touch screens: one finger always scrolls the page; the map only moves and zooms with two fingers.
// With one-finger dragging and double-tap zoom off, Leaflet's two-finger pinch handler does both panning and zooming.
const map = L.map('map', { zoomControl: true, preferCanvas: false, minZoom: 3, maxZoom: 12, dragging: !TOUCH, doubleClickZoom: !TOUCH, touchZoom: true }).setView([27.6, -90.2], 6);
function twoFingerHint(m) {
  if (!TOUCH) return;
  const hint = document.createElement('div');
  hint.className = 'map-hint';
  hint.textContent = 'Use two fingers to move or zoom the map';
  m.getContainer().parentElement.appendChild(hint);
  let hintTimer = null, startX = 0, startY = 0;
  const el = m.getContainer();
  el.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; } else hint.classList.remove('is-on'); }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    // Only nudge when the swipe looks like an attempt to pan the map sideways, not a page scroll.
    const dx = Math.abs(e.touches[0].clientX - startX), dy = Math.abs(e.touches[0].clientY - startY);
    if (dx > 24 && dx > dy) {
      hint.classList.add('is-on');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => hint.classList.remove('is-on'), 1400);
    }
  }, { passive: true });
}
twoFingerHint(map);
map.createPane('sat').style.zIndex = 240;
map.createPane('hazards').style.zIndex = 320;
map.createPane('radar').style.zIndex = 330;
map.getPane('sat').style.pointerEvents = 'none';
map.getPane('radar').style.pointerEvents = 'none';
map.createPane('wind').style.zIndex = 360;
map.createPane('labels').style.zIndex = 450;
map.getPane('labels').style.pointerEvents = 'none';
map.createPane('top').style.zIndex = 620;
map.createPane('borders').style.zIndex = 440;
map.getPane('borders').style.pointerEvents = 'none';
// Solid white state lines drawn above the satellite and radar so they never get buried.
(async () => {
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js');
    const us = await (await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json')).json();
    L.geoJSON(topojson.mesh(us, us.objects.states), { pane: 'borders', interactive: false, style: { color: '#ffffff', weight: 1.2, opacity: 0.85 } }).addTo(map);
  } catch (e) { console.warn('state lines', e); }
})();

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 16, attribution: 'Basemap &copy; Esri · Radar/GOES: IEM · Track: NHC',
}).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { pane: 'labels', maxZoom: 16 }).addTo(map);

const bust = (minutes) => Math.floor(Date.now() / (minutes * 60000));
const satLayer = L.tileLayer('', { pane: 'sat', opacity: 0.55, maxNativeZoom: 8, maxZoom: 12 });
function satUrl() { return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/goes_east_conus_ch13/{z}/{x}/{y}.png?_=${bust(5)}`; }
satLayer.setUrl(satUrl());
$('#tSat').checked = false; // starts off; the layer helper points people to it

// Radar loop from IEM's NEXRAD N0Q composite: 11 frames 5 minutes apart on desktop,
// 6 frames 10 minutes apart on phones so panning loads half as many tiles.
const OFFSETS = SMALL ? [50, 40, 30, 20, 10, 0] : [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];
const radarFrames = OFFSETS.map((m) => L.tileLayer('', { pane: 'radar', opacity: 0, maxNativeZoom: 10, maxZoom: 12 }));
function radarUrl(m) {
  const name = m === 0 ? 'nexrad-n0q-900913' : `nexrad-n0q-900913-m${String(m).padStart(2, '0')}m`;
  return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/${name}/{z}/{x}/{y}.png?_=${bust(5)}`;
}
let radarStamp = 0;
function refreshRadar() {
  radarStamp = Date.now();
  radarFrames.forEach((l, i) => l.setUrl(radarUrl(OFFSETS[i])));
  satLayer.setUrl(satUrl());
  mark('radar', true, 'Radar');
}
radarFrames.forEach((l, i) => { l.setUrl(radarUrl(OFFSETS[i])); l.addTo(map); });
radarStamp = Date.now();
let frame = OFFSETS.length - 1, playing = true;
const slider = $('#frameSlider');
slider.max = String(OFFSETS.length - 1); slider.value = slider.max;
function showFrame(i) {
  frame = i;
  const on = $('#tRad').checked;
  radarFrames.forEach((l, j) => l.setOpacity(on && j === i ? 0.78 : 0));
  slider.value = i;
  // IEM's "current" composite runs ~5 min behind real time.
  const t = new Date(Math.floor((radarStamp - 5 * 60000) / 300000) * 300000 - OFFSETS[i] * 60000);
  $('#frameTime').textContent = `${fmtTime(t)}${i === OFFSETS.length - 1 ? ' · latest' : ''}`;
}
showFrame(frame);
let loopTimer = null;
function loop() {
  clearTimeout(loopTimer);
  if (!playing) return;
  const next = (frame + 1) % OFFSETS.length;
  showFrame(next);
  loopTimer = setTimeout(loop, next === OFFSETS.length - 1 ? 1800 : 450);
}
loopTimer = setTimeout(loop, 1500);
$('#playBtn').addEventListener('click', () => {
  playing = !playing;
  $('#playBtn').textContent = playing ? '❚❚' : '▶';
  $('#playBtn').setAttribute('aria-label', playing ? 'Pause radar loop' : 'Play radar loop');
  if (playing) loop();
});
slider.addEventListener('input', () => { playing = false; $('#playBtn').textContent = '▶'; clearTimeout(loopTimer); showFrame(+slider.value); });
setInterval(refreshRadar, 5 * 60000);
mark('radar', true, 'Radar');

// Home references on the map
const R50 = 50 * 1609.344;
const ringLayer = L.layerGroup([
  L.circle([HOME.lat, HOME.lon], { radius: R50, color: '#4cc3d9', weight: 1.2, dashArray: '5 6', fill: false, pane: 'top', interactive: false }),
  L.circle([NOLA.lat, NOLA.lon], { radius: R50, color: '#4cc3d9', weight: 1.2, dashArray: '5 6', fill: false, pane: 'top', interactive: false }),
]).addTo(map);
// Hattiesburg and New Orleans, labels always on.
[[HOME, 'Hattiesburg'], [NOLA, 'New Orleans']].forEach(([p, name]) => L.circleMarker([p.lat, p.lon], { radius: 5, color: '#fff', weight: 1.5, fillColor: '#4cc3d9', fillOpacity: 1, pane: 'top' })
  .bindTooltip(name, { permanent: true, direction: 'right', className: 'town', offset: [6, 0] }).addTo(map));

// NHC layers
const nhcLayer = L.layerGroup().addTo(map);   // cone, forecast track, past track, forecast points
const wwLayer = L.layerGroup().addTo(map);    // NHC coastal hurricane / tropical storm watches and warnings
const windLayer = L.layerGroup().addTo(map);
const warnLayer = L.layerGroup().addTo(map);
let stormMarker = null;
let coneBounds = null;

$('#tSat').addEventListener('change', (e) => e.target.checked ? satLayer.addTo(map) : map.removeLayer(satLayer));
$('#tRad').addEventListener('change', () => showFrame(frame));
$('#tNhc').addEventListener('change', (e) => e.target.checked ? nhcLayer.addTo(map) : map.removeLayer(nhcLayer));
$('#tWind').addEventListener('change', (e) => e.target.checked ? windLayer.addTo(map) : map.removeLayer(windLayer));
$('#tWarn').addEventListener('change', (e) => {
  [warnLayer, wwLayer].forEach((l) => (e.target.checked ? l.addTo(map) : map.removeLayer(l)));
  renderAlertLegend();
});

// One-time helper bubble over the layer switches. Goes away for good after the first switch or the x.
(function layerHelper() {
  let seen = false;
  try { seen = localStorage.getItem('isaias.layersHelp') === '1'; } catch (e) {}
  if (seen) return;
  const toggles = $('.card-map .layer-toggles');
  const tip = document.createElement('div');
  tip.className = 'layer-tip'; tip.setAttribute('role', 'note');
  tip.innerHTML = '<button class="layer-tip-x" type="button" aria-label="Dismiss tip">×</button><b>Map layers</b>Use these switches to turn layers on and off. Everything starts on except Satellite.';
  toggles.appendChild(tip);
  const close = () => { tip.remove(); try { localStorage.setItem('isaias.layersHelp', '1'); } catch (e) {} };
  tip.querySelector('button').addEventListener('click', close);
  toggles.addEventListener('change', close, { once: true });
})();

$$('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
function setView(v) {
  if (v === 'hat') map.setView([HOME.lat, HOME.lon], 9);
  else if (v === 'nola') map.setView([NOLA.lat, NOLA.lon], 9);
  else {
    const b = L.latLngBounds([[HOME.lat, HOME.lon], [NOLA.lat, NOLA.lon]]);
    if (coneBounds) b.extend(coneBounds);
    if (storm) b.extend([storm.lat, storm.lon]);
    map.fitBounds(b, { padding: [20, 20] });
  }
}

function cycloneIcon(isHu) {
  const c = isHu ? '#ff4d4d' : '#ffd23f';
  const svg = `<svg width="34" height="34" viewBox="-17 -17 34 34" aria-hidden="true"><g fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><path d="M0 -6 A6 6 0 0 1 6 0 C 6 6 0 13 -8 14"/><path d="M0 6 A6 6 0 0 1 -6 0 C -6 -6 0 -13 8 -14"/></g><circle r="3.2" fill="${c}"/></svg>`;
  return L.divIcon({ html: svg, className: 'cyclone-icon', iconSize: [34, 34], iconAnchor: [17, 17] });
}

// ---------- Storm status (NHC CurrentStorms) ----------
let storm = null;     // {lat, lon, bin, ...}
async function loadStorm() {
  try {
    const d = await getJSON('/api/feed?src=nhc');
    const list = d.activeStorms || [];
    const s = list.find((x) => (x.name || '').toLowerCase() === STORM_NAME.toLowerCase()) || null;
    if (!s) { $('#stormClass').textContent = 'Not currently active in NHC data'; mark('nhc', true, 'NHC'); return; }
    const kt = +s.intensity;
    const mph = nhcMph(kt);
    const cls = saffir(mph);
    storm = { lat: s.latitudeNumeric, lon: s.longitudeNumeric, bin: s.binNumber, mph, kt, cls, adv: s.publicAdvisory, raw: s };
    $('#stormName').textContent = s.name;
    setStat('name', s.name);
    setStat('stormClass', cls);
    [$('#stormClass'), ...$$('[data-s="stormClass"]')].forEach((el) => el.classList.toggle('is-hu', mph >= 74));
    setStat('sWind', `${mph} mph`);
    setStat('sPres', `${s.pressure} mb`);
    setStat('sMove', `${compass(s.movementDir)} ${ktToMph(+s.movementSpeed)} mph`);
    setStat('sPos', `${s.latitude} ${s.longitude}`);
    const p = { lat: storm.lat, lon: storm.lon };
    setStat('sDistH', `${Math.round(miles(p, HOME))} mi ${compass(bearing(HOME, p))}`);
    setStat('sDistN', `${Math.round(miles(p, NOLA))} mi ${compass(bearing(NOLA, p))}`);
    setStat('sAdv', `NHC advisory ${String(s.publicAdvisory?.advNum || '').replace(/^0+/, '')} · ${fmtDayTime(s.publicAdvisory?.issuance || s.lastUpdate)}`);
    document.title = `${s.name} ${mph} mph · Isaias Watch`;
    if (!stormMarker) {
      stormMarker = L.marker([storm.lat, storm.lon], { icon: cycloneIcon(mph >= 74), pane: 'top', zIndexOffset: 1000 }).addTo(map);
    } else { stormMarker.setLatLng([storm.lat, storm.lon]); stormMarker.setIcon(cycloneIcon(mph >= 74)); }
    stormMarker.bindTooltip(`${esc(s.name)} · ${mph} mph · ${esc(s.pressure)} mb`, { direction: 'top', className: 'town' });
    placeWindStorm();
    mark('nhc', true, 'NHC');
  } catch (e) { mark('nhc', false, 'NHC'); throw e; }
}

// ---------- NHC GIS (cone, track, wind field) ----------
const GIS = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';
const WW_EVENT = { HWR: 'Hurricane Warning', HWA: 'Hurricane Watch', TWR: 'Tropical Storm Warning', TWA: 'Tropical Storm Watch', SSW: 'Storm Surge Warning', SSA: 'Storm Surge Watch' };
let wwEvents = [];        // events shown as NHC coastline lines
let mapEvents = new Map(); // event -> 'fill' | 'hatch' | 'outline', from drawWarnings()
// Map legend for every watch and warning on the map. Collapsed by default on phones; tap the title to open or close.
const alertLegend = document.createElement('div');
alertLegend.className = 'al-legend'; alertLegend.id = 'alertLegend'; alertLegend.hidden = true;
alertLegend.innerHTML = '<button class="al-head" type="button" aria-expanded="true"><span>Watches &amp; warnings</span><span class="al-n"></span><span class="al-chev" aria-hidden="true"></span></button><div class="al-rows"></div>';
$('.card-map .map-wrap').appendChild(alertLegend);
const alHead = $('.al-head', alertLegend);
function setLegendOpen(open) { alertLegend.classList.toggle('is-closed', !open); alHead.setAttribute('aria-expanded', String(open)); }
setLegendOpen(!SMALL);
alHead.addEventListener('click', () => setLegendOpen(alertLegend.classList.contains('is-closed')));
function renderAlertLegend() {
  const rows = new Map(mapEvents);
  for (const ev of wwEvents) if (!rows.has(ev)) rows.set(ev, 'fill');
  const list = [...rows].sort((a, b) => eventRank(a[0]) - eventRank(b[0]));
  $('.al-rows', alertLegend).innerHTML = list.map(([ev, style]) => `<div class="lg-row"><span class="al-sw al-${style}" style="--c:${eventColor(ev)}"></span>${esc(ev)}</div>`).join('');
  $('.al-n', alertLegend).textContent = list.length;
  alertLegend.hidden = !list.length || !$('#tWarn').checked;
}
let firstFit = true;
let fcstPoints = [];
async function loadGIS() {
  const bin = (storm && storm.bin) || 'AT4';
  const n = +bin.slice(2);
  const base = 4 + 26 * (n - 1);
  const q = (id) => getJSON(`${GIS}/${id}/query?where=1%3D1&outFields=*&f=geojson`);
  try {
    const [pts, line, cone, ww, pastLine, windNow] = await Promise.all([
      q(base + 2), q(base + 3), q(base + 4), q(base + 5), q(base + 8), q(base + 13),
    ]);
    nhcLayer.clearLayers(); windLayer.clearLayers(); wwLayer.clearLayers();
    const coneL = L.geoJSON(cone, { style: { color: '#ffffff', weight: 1.2, dashArray: '4 4', fillColor: '#ffffff', fillOpacity: 0.1 } }).addTo(nhcLayer);
    try { coneBounds = coneL.getBounds().isValid() ? coneL.getBounds() : null; } catch (e) { coneBounds = null; }
    L.geoJSON(pastLine, { style: { color: '#9aa7b3', weight: 2 } }).addTo(nhcLayer);
    L.geoJSON(line, { style: { color: '#ffffff', weight: 1.6, dashArray: '2 5' } }).addTo(nhcLayer);
    // Visible coastline segments, plus a wide invisible line on top so they're easy to hover or tap.
    L.geoJSON(ww, { interactive: false, style: (f) => ({ color: eventColor(WW_EVENT[f.properties.tcww] || ''), weight: 6, opacity: 0.95, lineCap: 'round' }) }).addTo(wwLayer);
    L.geoJSON(ww, {
      style: () => ({ color: '#000', weight: TOUCH ? 34 : 24, opacity: 0.001, lineCap: 'round' }),
      onEachFeature: (f, l) => l.bindTooltip(`${esc(WW_EVENT[f.properties.tcww] || f.properties.tcww)} (NHC coastline)`, { className: 'town', sticky: !TOUCH, direction: 'top' }),
    }).addTo(wwLayer);
    wwEvents = [...new Set((ww.features || []).map((f) => WW_EVENT[f.properties.tcww]).filter(Boolean))];
    renderAlertLegend();
    fcstPoints = (pts.features || []).map((f) => f.properties).sort((a, b) => a.tau - b.tau);
    L.geoJSON(pts, {
      pointToLayer: (f, ll) => {
        const mph = nhcMph(f.properties.maxwind);
        const c = mph >= 74 ? '#ff4d4d' : mph >= 39 ? '#ffd23f' : '#7fd7ff';
        return L.circleMarker(ll, { radius: 5, color: '#0a0f14', weight: 1.5, fillColor: c, fillOpacity: 1 });
      },
      onEachFeature: (f, l) => {
        const p = f.properties;
        const vt = parseValid(p.validtime);
        l.bindTooltip(`${esc(vt ? fmtDayTime(vt) : p.datelbl)} · ${esc(p.tcdvlp)} · ${nhcMph(p.maxwind)} mph`, { className: 'town', direction: 'top' });
      },
    }).addTo(nhcLayer);
    const windStyle = { 34: ['#f3d23b', 0.22], 50: ['#ff8a1f', 0.3], 64: ['#ff3b3b', 0.38] };
    const wf = (windNow.features || []).sort((a, b) => a.properties.radii - b.properties.radii);
    L.geoJSON({ type: 'FeatureCollection', features: wf }, {
      pane: 'wind',
      style: (f) => { const s = windStyle[f.properties.radii] || ['#fff', 0.1]; return { color: s[0], weight: 1, fillColor: s[0], fillOpacity: s[1] }; },
      onEachFeature: (f, l) => l.bindTooltip(`${f.properties.radii}-kt winds (${ktToMph(f.properties.radii)}+ mph)`, { className: 'town', sticky: true }),
    }).addTo(windLayer);
    renderTrack();
    if (firstFit) { firstFit = false; setView('storm'); }
    mark('gis', true, 'NHC map');
  } catch (e) { mark('gis', false, 'NHC map'); throw e; }
}

function renderTrack() {
  const tb = $('#trackTable tbody');
  if (!fcstPoints.length) { tb.innerHTML = '<tr><td colspan="4">No forecast points yet.</td></tr>'; return; }
  tb.innerHTML = fcstPoints.map((p) => {
    const mph = nhcMph(p.maxwind);
    const vt = parseValid(p.validtime);
    const when = vt ? fmtDayTime(vt) : p.datelbl;
    const label = p.tau === 0 ? `Now · ${when}` : when;
    const labelS = p.tau === 0 ? 'Now' : (vt ? shortDayTime(vt) : p.datelbl);
    const status = mph >= 74 ? saffir(mph).replace(' hurricane', '') : p.tcdvlp;
    const statusS = mph >= 74 ? status.replace('Category ', 'Cat ') : String(status).replace('Tropical ', 'Trop. ').replace('Subtropical ', 'Subtrop. ').replace('Depression', 'Dep.').replace('Post-Trop. Cyclone', 'Post-trop.');
    return `<tr class="${mph >= 74 ? 'is-hu' : ''}"><td>${dual(label, labelS)}</td><td>${dual(status, statusS)}</td><td>${mph} mph</td><td>${nhcMph(p.gust)} mph</td></tr>`;
  }).join('');
  // Closest forecast approach to Hattiesburg (interpolating along the track).
  let best = null;
  for (let i = 0; i < fcstPoints.length - 1; i++) {
    const a = fcstPoints[i], b = fcstPoints[i + 1];
    for (let k = 0; k <= 20; k++) {
      const f = k / 20;
      const pt = { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
      const d = miles(pt, HOME);
      if (!best || d < best.d) best = { d, pt, a, b, f };
    }
  }
  if (best) {
    const side = compass(bearing(HOME, best.pt));
    const tA = parseValid(best.a.validtime), tB = parseValid(best.b.validtime);
    const when = tA && tB ? fmtDayTime(new Date(tA.getTime() + (tB - tA) * best.f)) : best.a.datelbl;
    const mph = nhcMph(best.a.maxwind + (best.b.maxwind - best.a.maxwind) * best.f);
    const whenS = tA && tB ? shortDayTime(new Date(tA.getTime() + (tB - tA) * best.f)) : best.a.datelbl;
    $('#closest').innerHTML = `<span class="lg">Closest forecast pass to Hattiesburg: <b>${Math.round(best.d)} mi ${side}</b> around <b>${esc(when)}</b>, center winds near ${mph} mph. Track errors at 2–3 days average 70–100 mi, so treat the whole cone as in play.</span><span class="sh">Closest pass to Hattiesburg: <b>${Math.round(best.d)} mi ${side}</b>, <b>${esc(whenS)}</b>, ~${mph} mph winds. The whole cone is still in play.</span>`;
  }
}
function parseValid(v) {
  // "07/1500" = day/HHMM UTC within the current month (NHC convention)
  const m = /^(\d{2})\/(\d{2})(\d{2})$/.exec(v || '');
  if (!m) return null;
  const now = new Date();
  let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), +m[1], +m[2], +m[3]));
  if (+m[1] < now.getUTCDate() - 15) d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, +m[1], +m[2], +m[3]));
  return d;
}

const full = (u) => u.replace(/_sm\+png\//, '+png/').replace(/_sm\.png$/, '.png');
async function loadGfx() {
  const bin = (storm && storm.bin) || 'AT4';
  try {
    const g = await getJSON(`/api/feed?src=gfx&bin=${bin}`);
    $('#gfxLink').href = g.page;
    const items = [['keyMessages', 'Key messages'], ['cone', '5-day cone'], ['surge', 'Peak surge'], ['windProbs', 'TS wind odds'], ['arrival', 'TS wind arrival']]
      .filter(([k]) => g[k]);
    $('#gfx').innerHTML = items.map(([k, label]) =>
      `<a href="${esc(full(g[k]))}" target="_blank" rel="noopener"><img src="${esc(full(g[k]))}" alt="NHC ${esc(label)} graphic" loading="lazy">${esc(label)}</a>`).join('');
    mark('gfx', true, 'NHC graphics');
  } catch (e) { mark('gfx', false, 'NHC graphics'); }
}

// ---------- Windy ----------
let windyOv = 'wind';
let windyCenter = null;
function setWindy(force) {
  if (SMALL) return; // phones use the built-in wind map below
  const lat = storm ? (storm.lat + HOME.lat) / 2 : 28.5;
  const lon = storm ? (storm.lon + HOME.lon) / 2 : -90;
  const key = `${windyOv}|${lat.toFixed(1)}|${lon.toFixed(1)}`;
  if (!force && key === windyCenter) return;
  windyCenter = key;
  const src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=%C2%B0F&metricWind=mph&zoom=5&overlay=${windyOv}&product=ecmwf&level=surface&lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&detailLat=${HOME.lat}&detailLon=${HOME.lon}&marker=true&pressure=true&message=true`;
  $('#windy').src = src;
}
$$('[data-ov]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-ov]').forEach((x) => x.classList.toggle('is-on', x === b));
  windyOv = b.dataset.ov;
  if (SMALL) { wField = windyOv === 'gust' ? 'gust' : 'speed'; renderWind(); } else setWindy(true);
}));

// ---------- Alerts ----------
let alertsAll = [];          // active (deduped) features in MS/LA
let seenAlertIds = null;     // for "new" detection
let newIds = new Set();
const feedItems = new Map(); // id -> item

function dedupe(features) {
  const referenced = new Set();
  for (const f of features) for (const r of (f.properties.references || [])) referenced.add(r.identifier);
  const now = Date.now();
  return features.filter((f) => {
    const p = f.properties;
    if (referenced.has(p.id)) return false;
    if (p.messageType === 'Cancel') return false;
    const end = p.ends || p.expires;
    if (end && new Date(end).getTime() < now) return false;
    return true;
  });
}

async function loadAlerts() {
  try {
    const d = await getJSON('https://api.weather.gov/alerts/active?area=MS,LA', { headers: NWS_HEADERS });
    alertsAll = dedupe(d.features || []);
    const ids = new Set(alertsAll.map((f) => f.properties.id));
    if (seenAlertIds) {
      newIds = new Set([...ids].filter((x) => !seenAlertIds.has(x)));
      for (const f of alertsAll) if (newIds.has(f.properties.id)) maybeFeedAlert(f);
    }
    seenAlertIds = new Set([...(seenAlertIds || []), ...ids]);
    renderRegions();
    renderTornado();
    drawWarnings();
    mark('alerts', true, 'NWS alerts');
  } catch (e) { mark('alerts', false, 'NWS alerts'); throw e; }
}

function sameOf(f) { return f.properties.geocode?.SAME || []; }
function eventRank(ev) { const i = EVENT_ORDER.indexOf(ev); return i < 0 ? 100 : i; }
function eventColor(ev, sev) {
  return EVENT_COLOR[ev] || ({ Extreme: '#ff3b3b', Severe: '#ff8c00', Moderate: '#ffd700', Minor: '#8fbc8f' }[sev] || '#8797a6');
}
function kind(ev) { return /Warning|Emergency/.test(ev) ? 'warn' : /Watch/.test(ev) ? 'watch' : 'adv'; }

const floodCounts = {};
function renderRegions() {
  for (const [key, R] of Object.entries(REGIONS)) {
    const groups = new Map();
    for (const f of alertsAll) {
      const p = f.properties;
      if (SKIP_EVENTS.has(p.event)) continue;
      const hit = sameOf(f).filter((c) => R.same.has(c));
      if (!hit.length) continue;
      let g = groups.get(p.event);
      if (!g) { g = { event: p.event, sev: p.severity, counties: new Set(), alerts: [], ends: null, isNew: false }; groups.set(p.event, g); }
      hit.forEach((c) => g.counties.add(c));
      g.alerts.push(f);
      const end = p.ends || null;
      if (end && (!g.ends || end > g.ends)) g.ends = end;
      if (!end) g.open = true;
      if (newIds.has(p.id)) g.isNew = true;
    }
    const list = [...groups.values()].sort((a, b) => eventRank(a.event) - eventRank(b.event) || a.event.localeCompare(b.event));
    floodCounts[key] = { warn: 0, watch: 0 };
    list.forEach((g) => { const k = kind(g.event); if (isFlood(g.event) && k !== 'adv') floodCounts[key][k]++; });
    const el = $(key === 'hat' ? '#listHat' : '#listNola');
    const tally = { warn: 0, watch: 0, adv: 0 };
    list.forEach((g) => tally[kind(g.event)]++);
    $(key === 'hat' ? '#tallyHat' : '#tallyNola').innerHTML =
      `<span class="t-warn${tally.warn ? '' : ' zero'}">${tally.warn} warning${tally.warn === 1 ? '' : 's'}</span><span class="t-watch${tally.watch ? '' : ' zero'}">${tally.watch} watch${tally.watch === 1 ? '' : 'es'}</span><span class="t-adv${tally.adv ? '' : ' zero'}">${tally.adv} other</span>`;
    if (!list.length) {
      el.innerHTML = `<div class="empty calm">${dual(`No active NWS warnings, watches, or advisories for these ${R.list.length} counties and parishes.`, 'All clear. No active warnings or watches.')}</div>`;
      continue;
    }
    const openState = new Set($$('details[open]', el).map((d) => d.dataset.k));
    el.innerHTML = list.map((g) => {
      const counties = [...g.counties].sort((a, b) => (R.home.has(b) - R.home.has(a)) || R.name[a].localeCompare(R.name[b]));
      const rep = g.alerts.slice().sort((a, b) => (b.properties.sent > a.properties.sent ? 1 : -1))[0].properties;
      const zones = [...new Set(g.alerts.map((a) => a.properties.areaDesc))].join('; ');
      const k = `${key}|${g.event}`;
      const text = [rep.headline, rep.parameters?.NWSheadline?.[0], '', rep.description, rep.instruction ? '\nWHAT TO DO:\n' + rep.instruction : '', '\nZones: ' + zones]
        .filter((x) => x !== undefined && x !== null).join('\n');
      return `<article class="agroup${g.isNew ? ' is-new' : ''}"${isFlood(g.event) && kind(g.event) !== 'adv' ? ' data-flood' : ''} style="--c:${eventColor(g.event, g.sev)}">
        <div class="ag-top"><div class="ag-event">${esc(g.event)}</div><div class="ag-until">${g.open ? dual('until further notice', 'Ongoing') : untilHTML(g.ends)}</div></div>
        <div class="ag-counties">${counties.map((c) => `<span class="cty${R.home.has(c) ? ' is-home' : ''}">${esc(R.name[c])}</span>`).join('')}</div>
        <details data-k="${esc(k)}"${openState.has(k) ? ' open' : ''}><summary>Details<span class="lg"> · ${esc(rep.senderName || 'NWS')} · issued ${esc(rel(rep.sent))}</span><span class="sh"> · ${esc(relShort(rep.sent))}</span></summary><pre class="alert-text">${esc(text)}</pre></details>
      </article>`;
    }).join('');
  }
  renderFlood();
}
['hat', 'nola'].forEach((k) => {
  const R = REGIONS[k];
  $(k === 'hat' ? '#coverHat' : '#coverNola').textContent = R.list.map((x) => `${x[1]} ${x[2] === 'LA' ? 'Parish' : 'Co.'}, ${x[2]}`).join(' · ');
});

// ---------- Tornadoes ----------
let testMode = false;
let currentHomeIds = new Set();
let acked = new Set();
let sirenedIds = new Set();
let notifiedIds = new Set();

function pointInRing(pt, ring) { // ring: [[lon,lat],...]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > pt.lat) !== (yj > pt.lat)) && (pt.lon < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function distToSegMi(p, a, b) { // planar approx in miles, good at these scales
  const kx = 69.17 * Math.cos(p.lat * Math.PI / 180), ky = 69.0;
  const ax = (a[0] - p.lon) * kx, ay = (a[1] - p.lat) * ky, bx = (b[0] - p.lon) * kx, by = (b[1] - p.lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / ((dx * dx + dy * dy) || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function polyRings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p) => p[0]);
  return [];
}
function nearestTown(geom) {
  const rings = polyRings(geom);
  if (!rings.length) return null;
  let best = null;
  for (const t of HOME_TOWNS) {
    let d = Infinity;
    for (const r of rings) {
      if (pointInRing(t, r)) { d = 0; break; }
      for (let i = 0; i < r.length - 1; i++) d = Math.min(d, distToSegMi(t, r[i], r[i + 1]));
    }
    if (!best || d < best.d) best = { town: t.name, d };
  }
  return best;
}
function motion(p) {
  const s = p.parameters?.eventMotionDescription?.[0];
  const m = s && /\.\.\.(\d{1,3})DEG\.\.\.(\d{1,3})KT/.exec(s);
  if (!m) return null;
  const toward = (+m[1] + 180) % 360; // NWS gives direction the storm is moving FROM
  return `moving ${compass(toward)} at ${ktToMph(+m[2])} mph`;
}
// 'home' = the warning includes Forrest or Lamar County: siren + flashing banner.
// 'near' = another county within 50 mi of Hattiesburg: highlighted, no sound.
function tornadoTier(f) {
  const nt = nearestTown(f.geometry);
  const same = sameOf(f);
  if (same.some((c) => HOME_COUNTIES.has(c))) return { tier: 'home', nt };
  if (same.some((c) => REGIONS.hat.same.has(c))) return { tier: 'near', nt };
  return { tier: 'other', nt };
}
const TIER_RANK = { home: 0, near: 1, other: 2 };

function fakeTornado() {
  const now = Date.now();
  return {
    geometry: { type: 'Polygon', coordinates: [[[-89.45, 31.25], [-89.2, 31.3], [-89.22, 31.42], [-89.47, 31.38], [-89.45, 31.25]]] },
    properties: {
      id: 'test-tornado', event: 'Tornado Warning', areaDesc: 'Forrest, MS; Lamar, MS (TEST — not a real warning)',
      sent: new Date(now).toISOString(), ends: new Date(now + 30 * 60000).toISOString(), expires: new Date(now + 30 * 60000).toISOString(),
      geocode: { SAME: ['028035', '028073'] }, senderName: 'TEST', description: 'This is a test of the dashboard alert.',
      parameters: { tornadoDetection: ['RADAR INDICATED'], eventMotionDescription: ['...storm...225DEG...30KT...31.3,-89.4'] },
    },
  };
}

function renderTornado() {
  let tors = alertsAll.filter((f) => f.properties.event === 'Tornado Warning');
  if (testMode) tors = [fakeTornado(), ...tors];
  const rows = tors.map((f) => ({ f, ...tornadoTier(f) }))
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || (b.f.properties.sent > a.f.properties.sent ? 1 : -1));

  const realCount = tors.length - (testMode ? 1 : 0);
  const tc = $('#torCount');
  tc.textContent = `${realCount} active`;
  tc.classList.toggle('is-active', realCount > 0);

  // Tornado watches touching the Hattiesburg 50-mi area
  const watches = alertsAll.filter((f) => f.properties.event === 'Tornado Watch' && sameOf(f).some((c) => REGIONS.hat.same.has(c)));
  const tw = $('#torWatch');
  if (watches.length) {
    const cset = new Set(); let ends = null; const nums = new Set();
    for (const w of watches) {
      sameOf(w).filter((c) => REGIONS.hat.same.has(c)).forEach((c) => cset.add(c));
      const e = w.properties.ends || w.properties.expires; if (e && (!ends || e > ends)) ends = e;
      const v = (w.properties.parameters?.VTEC || [])[0] || ''; const m = /\.TO\.A\.(\d{4})\./.exec(v); if (m) nums.add(+m[1]);
    }
    const homeIn = [...cset].some((c) => HOME_COUNTIES.has(c));
    tw.classList.add('is-active');
    tw.innerHTML = `<strong>Tornado Watch${nums.size ? ' #' + [...nums].join(', #') : ''}</strong> ${homeIn ? '<b>includes Forrest/Lamar</b>' : 'near Hattiesburg'} · ${untilHTML(ends)}<div class="ag-counties">${[...cset].sort().map((c) => `<span class="cty${HOME_COUNTIES.has(c) ? ' is-home' : ''}">${esc(ALL_NAMES[c] || c)}</span>`).join('')}</div>`;
  } else {
    tw.classList.remove('is-active');
    tw.innerHTML = dual('No tornado watch in effect within 50 miles of Hattiesburg.', 'No tornado watch near Hattiesburg.');
  }

  const list = $('#torList');
  if (!rows.length) {
    list.innerHTML = `<div class="empty calm">${dual('No tornado warnings in Mississippi or Louisiana right now.', 'No tornado warnings in MS or LA.')}</div>`;
  } else {
    list.innerHTML = rows.map(({ f, tier, nt }) => {
      const p = f.properties;
      const txt = `${p.description || ''}`;
      const emergency = /TORNADO EMERGENCY/i.test(txt) || /CATASTROPHIC/i.test((p.parameters?.tornadoDamageThreat || [])[0] || '');
      const pds = /CONSIDERABLE/i.test((p.parameters?.tornadoDamageThreat || [])[0] || '') || /PARTICULARLY DANGEROUS/i.test(txt);
      const detection = (p.parameters?.tornadoDetection || [])[0];
      const flag = emergency ? '<span class="tw-flag emergency">Tornado emergency</span>'
        : tier === 'home' ? '<span class="tw-flag">Forrest / Lamar County</span>'
        : tier === 'near' ? '<span class="tw-flag flag-near">Near Hattiesburg</span>'
        : pds ? '<span class="tw-flag">Considerable damage threat</span>' : '';
      const mv = motion(p);
      return `<article class="tw tier-${tier}">
        ${flag}
        <div class="tw-area">${esc(p.areaDesc)}</div>
        <div class="tw-meta">
          <span><b>${esc(detection ? detection.toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : 'Radar indicated')}</b></span>
          ${mv ? `<span>${esc(mv)}</span>` : ''}
          <span>${untilHTML(p.ends || p.expires)}</span>
          ${nt ? `<span>${nt.d === 0 ? `covers <b>${esc(nt.town)}</b>` : `${Math.round(nt.d)} mi from ${esc(nt.town)}`}</span>` : ''}
          <span>${dual(`issued ${rel(p.sent)}`, relShort(p.sent) + ' ago')}</span>
        </div>
        <details><summary>Warning text</summary><pre class="alert-text">${esc(p.description || '')}${p.instruction ? '\n\n' + esc(p.instruction) : ''}</pre></details>
      </article>`;
    }).join('');
  }

  // Home banner + siren
  const homeRows = rows.filter((r) => r.tier === 'home');
  currentHomeIds = new Set(homeRows.map((r) => r.f.properties.id));
  const banner = $('#homeBanner');
  if (homeRows.length) {
    const p = homeRows[0].f.properties;
    const mv = motion(p);
    banner.hidden = false;
    banner.classList.remove('is-county');
    const nt0 = homeRows[0].nt;
    $('#hbKicker').textContent = `Tornado warning · Forrest / Lamar County${nt0 ? (nt0.d === 0 ? ` · covers ${nt0.town}` : ` · ${Math.round(nt0.d)} mi from ${nt0.town}`) : ''}${testMode ? ' · TEST' : ''}`;
    $('#hbTitle').textContent = 'Take shelter now';
    $('#hbDetail').textContent = `${p.areaDesc} · ${mv || ''} · ${untilText(p.ends || p.expires)}`;
    const unacked = homeRows.filter((r) => !acked.has(r.f.properties.id));
    banner.classList.toggle('is-flash', unacked.length > 0);
    $('#hbAck').hidden = false;
    for (const r of homeRows) {
      const id = r.f.properties.id;
      if (id === 'test-tornado') continue;
      if (!sirenedIds.has(id)) { sirenedIds.add(id); playSiren(20); buzz(); }
      if (!notifiedIds.has(id)) { notifiedIds.add(id); notify('TORNADO WARNING — Forrest/Lamar County', `${r.f.properties.areaDesc}. ${mv || ''}`, id); }
    }
  } else {
    banner.hidden = true;
  }
}

// ---------- Watches & warnings on the map ----------
// Zone-based alerts (hurricane, tropical storm, surge, flood and tornado watches...) shade their forecast zones,
// one color per zone by priority, like a TV station's map. Flood watches and warnings are drawn as green
// stripes on top so they still show where a tropical warning colors the same zone. Storm-based warnings
// (tornado, severe thunderstorm, flash flood) are outlined with their own polygon.
const STORM_BASED = new Set(['Tornado Warning', 'Severe Thunderstorm Warning', 'Flash Flood Warning', 'Extreme Wind Warning', 'Flood Warning', 'Snow Squall Warning']);
const isWatchWarning = (ev) => /Warning|Watch|Emergency/.test(ev) && !SKIP_EVENTS.has(ev);
const isFlood = (ev) => /Flood/.test(ev);
const zoneShapes = new Map();   // zone URL -> { geometry, name } | 'loading' | 'failed'
let zoneQueue = [], zoneBusy = 0, redrawTimer = null;
function queueZone(url) {
  if (zoneShapes.has(url)) return;
  zoneShapes.set(url, 'loading');
  zoneQueue.push(url);
  pumpZones();
}
function pumpZones() {
  while (zoneBusy < 6 && zoneQueue.length) {
    const url = zoneQueue.shift();
    zoneBusy++;
    getJSON(url, { headers: NWS_HEADERS })
      .then((z) => zoneShapes.set(url, z.geometry ? { geometry: z.geometry, name: z.properties?.name || '' } : 'failed'))
      .catch(() => zoneShapes.set(url, 'failed'))
      .finally(() => { zoneBusy--; pumpZones(); clearTimeout(redrawTimer); redrawTimer = setTimeout(drawWarnings, 400); });
  }
}
// Diagonal stripes for flood shading (SVG patterns shared by the whole page).
const hatchDefs = (() => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'defs'));
  document.body.appendChild(svg);
  return svg.firstChild;
})();
function hatchFill(color) {
  const id = 'hatch-' + color.replace('#', '');
  if (!document.getElementById(id)) {
    const ns = 'http://www.w3.org/2000/svg';
    const pat = document.createElementNS(ns, 'pattern');
    pat.setAttribute('id', id); pat.setAttribute('width', '9'); pat.setAttribute('height', '9');
    pat.setAttribute('patternUnits', 'userSpaceOnUse'); pat.setAttribute('patternTransform', 'rotate(45)');
    const line = document.createElementNS(ns, 'rect');
    line.setAttribute('width', '3.5'); line.setAttribute('height', '9'); line.setAttribute('fill', color); line.setAttribute('fill-opacity', '0.75');
    pat.appendChild(line);
    hatchDefs.appendChild(pat);
  }
  return `url(#${id})`;
}
function zoneLabel(name, events) {
  return `<b>${esc(name)}</b><br>${events.map((ev) => `<span class="al-sw al-${isFlood(ev) ? 'hatch' : 'fill'}" style="--c:${eventColor(ev)}"></span> ${esc(ev)}`).join('<br>')}`;
}
function bindInfo(layer, html) {
  if (TOUCH) layer.bindPopup(html, { className: 'zone-pop' });
  else layer.bindTooltip(html, { className: 'town zone-tip', sticky: true });
}
function drawWarnings() {
  warnLayer.clearLayers();
  mapEvents = new Map();
  const zones = new Map(); // zone URL -> { name, events: Set, geometry }
  const outlines = [];
  for (const f of alertsAll) {
    const p = f.properties;
    if (!isWatchWarning(p.event)) continue;
    if (f.geometry && STORM_BASED.has(p.event)) { outlines.push(f); continue; }
    const urls = (p.affectedZones || []).filter((u) => /\/(LA|MS)[ZC]\d{3}$/.test(u));
    for (const u of urls) {
      // A one-zone alert carries that zone's outline, so it never needs a separate lookup.
      if (f.geometry && urls.length === 1 && !(zoneShapes.get(u) || {}).geometry) zoneShapes.set(u, { geometry: f.geometry, name: p.areaDesc });
      if (!zones.has(u)) zones.set(u, { events: new Set() });
      zones.get(u).events.add(p.event);
      queueZone(u);
    }
  }
  for (const [u, z] of zones) {
    const shape = zoneShapes.get(u);
    if (!shape || !shape.geometry) continue;
    const events = [...z.events].sort((a, b) => eventRank(a) - eventRank(b));
    const base = events.find((ev) => !isFlood(ev));
    const flood = events.find(isFlood);
    const info = zoneLabel(shape.name, events);
    if (base) {
      mapEvents.set(base, 'fill');
      const l = L.geoJSON(shape.geometry, { pane: 'hazards', style: { color: eventColor(base), weight: 1, opacity: 0.9, fillColor: eventColor(base), fillOpacity: 0.34 } });
      bindInfo(l, info); l.addTo(warnLayer);
    }
    if (flood) {
      if (!mapEvents.has(flood)) mapEvents.set(flood, 'hatch');
      const l = L.geoJSON(shape.geometry, { pane: 'hazards', interactive: !base, style: { color: eventColor(flood), weight: base ? 0 : 1.2, opacity: 0.9, fillColor: hatchFill(eventColor(flood)), fillOpacity: 1 } });
      if (!base) bindInfo(l, info);
      l.addTo(warnLayer);
    }
  }
  for (const f of outlines) {
    const p = f.properties, c = eventColor(p.event);
    mapEvents.set(p.event, 'outline');
    L.geoJSON(f, { pane: 'top', style: { color: c, weight: p.event === 'Tornado Warning' ? 3 : 2.2, fillColor: c, fillOpacity: 0.12 } })
      .bindPopup(`<b>${esc(p.event)}</b><br>${esc(p.areaDesc)}<br>${esc(untilText(p.ends || p.expires))}`)
      .addTo(warnLayer);
  }
  renderAlertLegend();
}

function maybeFeedAlert(f) {
  const p = f.properties;
  if (SKIP_EVENTS.has(p.event)) return;
  const same = sameOf(f);
  const inHat = same.filter((c) => REGIONS.hat.same.has(c));
  const inNola = same.filter((c) => REGIONS.nola.same.has(c));
  const isTor = p.event === 'Tornado Warning';
  if (!isTor && !inHat.length && !inNola.length) return;
  const names = [...new Set([...inHat, ...inNola].map((c) => ALL_NAMES[c]))];
  feedItems.set('alert:' + p.id, {
    id: 'alert:' + p.id, cat: 'alert', src: 'New alert', time: p.sent,
    title: `${p.messageType === 'Update' ? 'Updated' : 'New'}: ${p.event}`,
    lines: [names.length ? names.join(', ') : p.areaDesc],
    text: [p.headline, p.description, p.instruction].filter(Boolean).join('\n\n'),
  });
  renderFeed();
}

// ---------- Products: NHC + local hurricane statements ----------
const productCache = new Map();
async function productText(id) {
  if (productCache.has(id)) return productCache.get(id);
  const d = await getJSON(`https://api.weather.gov/products/${id}`);
  productCache.set(id, d.productText || '');
  return d.productText || '';
}
function headlines(text) {
  const lines = text.split('\n');
  const out = []; let buf = null;
  for (const raw of lines) {
    const l = raw.trim();
    if (/^(SUMMARY OF|NEW INFORMATION|DISCUSSION AND OUTLOOK|SITUATION OVERVIEW)/.test(l)) break;
    if (buf !== null) { buf += ' ' + l; if (/(\.\.\.|\*\*)$/.test(l)) { out.push(buf); buf = null; } continue; }
    if (/^(\.\.\.|\*\*)/.test(l)) { buf = l; if (l.length > 3 && /(\.\.\.|\*\*)$/.test(l.slice(3))) { out.push(buf); buf = null; } }
  }
  return out.map((h) => h.replace(/^(\.\.\.|\*\*)|(\.\.\.|\*\*)$/g, '').replace(/\.\.\./g, ', ').trim())
    .map((h) => properCase(h.charAt(0) + h.slice(1).toLowerCase())).slice(0, 4);
}
// NWS headlines arrive in ALL CAPS; after sentence-casing them, restore the proper nouns.
const PROPER = ['Isaias', 'Mississippi', 'Louisiana', 'Alabama', 'Florida', 'Texas', 'Gulf', 'Gulf Coast', 'New Orleans', 'Hattiesburg', 'Gulfport', 'Biloxi', 'Mobile Bay',
  'Pascagoula', 'Bay St. Louis', 'Pensacola', 'Panama City', 'Mexico', 'Yucatan', 'Lake Pontchartrain', 'Air Force', 'NOAA', 'NHC', 'NWS', 'U.S.',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Category'];
function properCase(h) {
  let out = h;
  for (const w of PROPER) out = out.replace(new RegExp(`\\b${w.replace(/[.]/g, '\\.')}(?![A-Za-z])`, 'gi'), w);
  return out;
}
function tcpSummary(text) {
  const g = (re) => (re.exec(text) || [])[1];
  const loc = g(/LOCATION\.\.\.(.+)/); const w = g(/MAXIMUM SUSTAINED WINDS\.\.\.(\d+) MPH/);
  const mv = g(/PRESENT MOVEMENT\.\.\.(.+?)\.\.\./); const pr = g(/MINIMUM CENTRAL PRESSURE\.\.\.(\d+) MB/);
  const parts = [];
  if (w) parts.push(`${w} mph`); if (pr) parts.push(`${pr} mb`); if (mv) parts.push(`moving ${mv.toLowerCase()}`); if (loc) parts.push(loc.trim());
  return parts.join(' · ');
}
async function loadProductList(type, loc, take) {
  const d = await getJSON(`https://api.weather.gov/products/types/${type}/locations/${loc}`);
  return (d['@graph'] || []).slice(0, take);
}
async function loadProducts() {
  const bin = (storm && storm.bin) || 'AT4';
  const jobs = [
    ['TCP', bin, 4, 'nhc', 'NHC advisory'],
    ['TCU', bin, 3, 'nhc', 'NHC update'],
    ['TCD', bin, 2, 'nhc', 'NHC discussion'],
    ['HLS', 'LIX', 2, 'nws', 'NWS New Orleans'],
    ['HLS', 'JAN', 2, 'nws', 'NWS Jackson'],
    ['HLS', 'MOB', 2, 'nws', 'NWS Mobile'],
  ];
  let ok = true;
  await Promise.all(jobs.map(async ([type, loc, take, cat, src]) => {
    try {
      const list = await loadProductList(type, loc, take);
      for (const p of list) {
        const id = `prod:${p.id}`;
        if (feedItems.has(id)) continue;
        const text = await productText(p.id);
        if (!new RegExp(STORM_NAME, 'i').test(text)) continue;
        const titleLine = (text.split('\n').find((l) => new RegExp(STORM_NAME, 'i').test(l)) || p.productName).trim().replace(/\s{2,}/g, ' ');
        let lines = headlines(text);
        if (type === 'TCP') { const s = tcpSummary(text); if (s) lines = [...lines, s]; }
        if (type === 'TCU' && !lines.length) {
          const body = text.split(/\n\s*\n/).map((x) => x.replace(/\s+/g, ' ').trim()).find((x) => x.length > 80 && !/^(\d{3}|BULLETIN|WTNT)/.test(x));
          if (body) lines = [body];
        }
        feedItems.set(id, { id, cat, src, time: p.issuanceTime, title: titleLine, lines, text });
      }
    } catch (e) { ok = false; console.warn(type, loc, e); }
  }));
  renderFeed();
  mark('products', ok, 'NHC/NWS statements');
}

// ---------- News ----------
async function loadNews() {
  try {
    const d = await getJSON('/api/feed?src=news');
    for (const n of d.items || []) {
      const id = 'news:' + n.title;
      if (!feedItems.has(id)) feedItems.set(id, { id, cat: 'news', src: n.source || 'News', time: n.time, title: n.title, link: n.link });
    }
    renderFeed();
    mark('news', true, 'News');
  } catch (e) { mark('news', false, 'News'); }
}

// ---------- Feed render ----------
let feedFilter = 'all';
$$('[data-f]').forEach((b) => b.addEventListener('click', () => {
  feedFilter = b.dataset.f;
  $$('[data-f]').forEach((x) => x.classList.toggle('is-on', x === b));
  renderFeed();
}));
function renderFeed() {
  const el = $('#feed');
  const openIds = new Set($$('details[open]', el).map((d) => d.dataset.id));
  // keep news to the latest 20 so it doesn't drown official products
  const all = [...feedItems.values()].sort((a, b) => (a.time < b.time ? 1 : -1));
  let newsCount = 0;
  const items = all.filter((it) => (it.cat !== 'news' || ++newsCount <= 20) && (feedFilter === 'all' || it.cat === feedFilter)).slice(0, 80);
  if (!items.length) { el.innerHTML = '<li class="empty">Nothing here yet.</li>'; return; }
  let newsShown = 0;
  el.innerHTML = items.map((it) => {
    const extra = it.cat === 'news' && feedFilter === 'all' && ++newsShown > 8; // phones show fewer headlines
    const fresh = Date.now() - new Date(it.time).getTime() < 30 * 60000;
    const cls = it.cat === 'news' ? 's-news' : it.cat === 'alert' ? 's-alert' : it.cat === 'nws' ? 's-nws' : '';
    return `<li class="fi${extra ? ' news-extra' : ''}">
      <div class="fi-meta"><span class="src ${cls}">${esc(it.src)}</span><span class="mono lg">${esc(fmtDayTime(it.time))}</span>${fresh ? '<span class="fresh lg">NEW</span>' : `<span class="lg">${esc(rel(it.time))}</span>`}<span class="mono sh fi-when">${esc(shortTime(it.time))} · ${esc(relShort(it.time))}</span>${fresh ? '<span class="fresh sh">NEW</span>' : ''}</div>
      <div class="fi-title">${it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">${dual(it.title, it.title)}</a>` : dual(it.title, it.cat === 'news' ? it.title : cleanTitle(it.title))}</div>
      ${it.lines && it.lines.length ? `<ul class="fi-lines">${it.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      ${it.text ? `<details data-id="${esc(it.id)}"${openIds.has(it.id) ? ' open' : ''}><summary>Full text</summary><pre class="alert-text">${esc(it.text)}</pre></details>` : ''}
    </li>`;
  }).join('');
}

// ---------- Observations ----------
const STATIONS = [
  { name: 'Hattiesburg', ids: ['KHBG', 'KPIB'], region: 'hat' },
  { name: 'New Orleans', ids: ['KMSY', 'KNEW'], region: 'nola' },
];
async function loadObs() {
  const cards = await Promise.all(STATIONS.map(async (s) => {
    for (const id of s.ids) {
      try {
        const d = await getJSON(`https://api.weather.gov/stations/${id}/observations/latest`, { headers: NWS_HEADERS });
        const p = d.properties;
        if (!p || p.windSpeed?.value == null) continue;
        const kmh = (v) => (v == null ? null : Math.round(v * 0.621371));
        const ws = kmh(p.windSpeed.value), wg = kmh(p.windGust?.value);
        const dir = p.windDirection?.value;
        const t = p.temperature?.value; const f = t == null ? null : Math.round(t * 9 / 5 + 32);
        const mb = p.barometricPressure?.value ? (p.barometricPressure.value / 100).toFixed(1) : null;
        return `<div class="ob"><div class="ob-name">${esc(s.name)}</div><div class="ob-sid">${esc(id)} · ${dual(fmtTime(p.timestamp), shortTime(p.timestamp))}</div>
          <div class="ob-wind">${dir == null || ws === 0 ? '' : esc(compass(dir)) + ' '}${ws} mph${wg ? ` <small>gust ${wg}</small>` : ''}</div>
          <div class="ob-rest">${esc(p.textDescription || '')}${f != null ? ` · ${f}°F` : ''}${mb ? ` · ${mb} mb` : ''}</div>
          <div class="ob-flood" data-r="${s.region}"></div></div>`;
      } catch (e) { /* try next station */ }
    }
    return `<div class="ob"><div class="ob-name">${esc(s.name)}</div><div class="ob-rest">No recent observation.</div><div class="ob-flood" data-r="${s.region}"></div></div>`;
  }));
  $('#obs').innerHTML = cards.join('');
  renderFlood();
  mark('obs', true, 'Observations');
}

function renderFlood() {
  $$('.ob-flood').forEach((el) => {
    const c = floodCounts[el.dataset.r];
    if (!c) { el.innerHTML = '<span class="fl-k">Flooding</span> <span class="fl-none">checking…</span>'; return; }
    const parts = [];
    if (c.warn) parts.push(`<span class="fl-n fl-warn">${c.warn} warning${c.warn === 1 ? '' : 's'}</span>`);
    if (c.watch) parts.push(`<span class="fl-n fl-watch">${c.watch} watch${c.watch === 1 ? '' : 'es'}</span>`);
    el.innerHTML = `<span class="fl-k">Flooding</span> ${parts.length ? parts.join(' ') + ` <a class="fl-more" href="#${el.dataset.r === 'hat' ? 'regionHat' : 'regionNola'}">See more</a>` : '<span class="fl-none">None active</span>'}`;
  });
}
// "See more": scroll to that city's alerts and flash its flood watches and warnings.
$('#obs').addEventListener('click', (e) => {
  const a = e.target.closest('.fl-more');
  if (!a) return;
  e.preventDefault();
  const sec = $(a.getAttribute('href'));
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const groups = $$('.agroup[data-flood]', sec);
  groups.forEach((g) => g.classList.remove('is-flashing'));
  setTimeout(() => {
    groups.forEach((g) => { void g.offsetWidth; g.classList.add('is-flashing'); });
    setTimeout(() => groups.forEach((g) => g.classList.remove('is-flashing')), 2800);
  }, 450);
});

// ---------- Re-render timers (countdowns) ----------
setInterval(() => { renderRegions(); renderTornado(); renderFeed(); }, 60000);

// ---------- Phone: sticky mini bar + back-to-top ----------
const PHONE = window.matchMedia('(max-width: 760px)');
const mini = $('#mini'), miniRow = $('#miniRow'), miniFull = $('#miniFull'), toTop = $('#toTop');
let headerGone = false, expandedAt = null;
function setExpanded(on) {
  miniFull.hidden = !on;
  miniRow.setAttribute('aria-expanded', String(on));
  mini.classList.toggle('is-open', on);
  expandedAt = on ? window.scrollY : null;
}
function syncMini() {
  const show = PHONE.matches && headerGone;
  mini.hidden = !show;
  if (!show) setExpanded(false);
  toTop.hidden = !(PHONE.matches && window.scrollY > 700);
}
// Keep the mini bar just under the tornado banner when one is showing.
function syncBannerOffset() {
  const b = $('#homeBanner');
  const h = b.hidden ? 0 : Math.max(0, b.getBoundingClientRect().bottom);
  document.documentElement.style.setProperty('--hb-h', `${h}px`);
  document.documentElement.style.setProperty('--mini-pad', h ? '0px' : 'calc(env(safe-area-inset-top, 0px) + var(--pwa-top, 0px))');
}
new IntersectionObserver(([e]) => { headerGone = !e.isIntersecting; syncMini(); syncBannerOffset(); }, { threshold: 0 }).observe($('#topbar'));
miniRow.addEventListener('click', () => setExpanded(miniFull.hidden));
miniFull.addEventListener('click', () => setExpanded(false));
toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
let scrollTick = false;
window.addEventListener('scroll', () => {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    scrollTick = false;
    if (expandedAt !== null && Math.abs(window.scrollY - expandedAt) > 24) setExpanded(false);
    toTop.hidden = !(PHONE.matches && window.scrollY > 700);
    syncBannerOffset();
  });
}, { passive: true });
PHONE.addEventListener?.('change', syncMini);
window.addEventListener('resize', syncBannerOffset);
new MutationObserver(syncBannerOffset).observe($('#homeBanner'), { attributes: true, attributeFilter: ['hidden'] });

// ---------- Phone wind map ----------
// Windy's embed is another website inside the page, so it can't be told to ignore one-finger drags.
// On phones we draw the wind ourselves from an hourly forecast grid, on a Leaflet map that uses the
// same two-finger rule as the radar map. Desktop keeps the Windy embed.
const WIND_STOPS = [[0, [36, 50, 79]], [10, [32, 102, 160]], [20, [31, 161, 135]], [30, [143, 209, 79]], [40, [242, 227, 58]],
  [50, [248, 149, 64]], [60, [228, 71, 43]], [75, [194, 24, 127]], [100, [122, 12, 168]]];
function windRGB(v) {
  if (v <= WIND_STOPS[0][0]) return WIND_STOPS[0][1];
  for (let i = 1; i < WIND_STOPS.length; i++) {
    const [b, cb] = WIND_STOPS[i], [a, ca] = WIND_STOPS[i - 1];
    if (v <= b) { const f = (v - a) / (b - a); return ca.map((c, k) => Math.round(c + (cb[k] - c) * f)); }
  }
  return WIND_STOPS[WIND_STOPS.length - 1][1];
}
let wFitted = false;
let wmap = null, wdata = null, wIdx = 0, wField = 'speed', wOverlay = null, wVel = null, wStorm = null, wTimer = null;
const wCache = new Map();
function loadScript(src) {
  return new Promise((ok, fail) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = fail; document.head.appendChild(el); });
}
function gridValue(arr, lat, lon) {
  const g = wdata.grid;
  const fy = (g.latN - lat) / g.step, fx = (lon - g.lonW) / g.step;
  const y0 = Math.max(0, Math.min(g.ny - 2, Math.floor(fy))), x0 = Math.max(0, Math.min(g.nx - 2, Math.floor(fx)));
  const ty = Math.max(0, Math.min(1, fy - y0)), tx = Math.max(0, Math.min(1, fx - x0));
  const v = (y, x) => arr[y * g.nx + x];
  return (v(y0, x0) * (1 - tx) + v(y0, x0 + 1) * tx) * (1 - ty) + (v(y0 + 1, x0) * (1 - tx) + v(y0 + 1, x0 + 1) * tx) * ty;
}
function fieldImage(field, idx) {
  const key = `${field}|${idx}`;
  if (wCache.has(key)) return wCache.get(key);
  const g = wdata.grid, arr = (field === 'gust' ? wdata.gust : wdata.speed)[idx];
  const W = 200, H = 220, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const mN = merc(g.latN), mS = merc(g.latS);
  for (let y = 0; y < H; y++) {
    const m = mN - (y + 0.5) / H * (mN - mS);
    const lat = (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180 / Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = g.lonW + (x + 0.5) / W * (g.lonE - g.lonW);
      const [r, gg, b] = windRGB(gridValue(arr, lat, lon));
      const o = (y * W + x) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL('image/png');
  wCache.set(key, url);
  return url;
}
function velocityData(idx) {
  const g = wdata.grid, sp = wdata.speed[idx], dr = wdata.dir[idx];
  const u = sp.map((v, k) => -v * Math.sin(dr[k] * Math.PI / 180));
  const vv = sp.map((v, k) => -v * Math.cos(dr[k] * Math.PI / 180));
  const header = (n) => ({ parameterCategory: 2, parameterNumber: n, lo1: g.lonW, la1: g.latN, lo2: g.lonE, la2: g.latS, dx: g.step, dy: g.step, nx: g.nx, ny: g.ny, refTime: wdata.times[idx], forecastTime: 0 });
  return [{ header: header(2), data: u }, { header: header(3), data: vv }];
}
function renderWind() {
  if (!wmap || !wdata) return;
  const g = wdata.grid, bounds = [[g.latS, g.lonW], [g.latN, g.lonE]];
  const url = fieldImage(wField, wIdx);
  if (wOverlay) wOverlay.setUrl(url); else wOverlay = L.imageOverlay(url, bounds, { pane: 'field', opacity: 0.62, interactive: false }).addTo(wmap);
  if (window.L && L.velocityLayer) {
    const data = velocityData(wIdx);
    if (wVel) wVel.setData(data);
    else wVel = L.velocityLayer({ displayValues: false, data, maxVelocity: 60, velocityScale: 0.0028, particleMultiplier: 1 / 220, lineWidth: 1.3, particleAge: 70, colorScale: ['rgba(255,255,255,0.8)'], paneName: 'velocity' }).addTo(wmap);
  }
  const t = wdata.times[wIdx];
  const hrs = Math.round((new Date(t).getTime() - Date.now()) / 3600e3);
  $('#windTime').textContent = `${shortDayTime(t)}${hrs <= 0 ? ' · now' : ` · +${hrs}h`}`;
  $('#windSlider').value = wIdx;
  clipVelocity();
  $('#windLegendTitle').textContent = wField === 'gust' ? 'Gusts (mph)' : 'Sustained wind (mph)';
}
// Keep the wind streaks inside the forecast grid (outside it there is no data).
function clipVelocity() {
  if (!wmap || !wdata) return;
  const g = wdata.grid, a = wmap.latLngToLayerPoint([g.latN, g.lonW]), b = wmap.latLngToLayerPoint([g.latS, g.lonE]);
  wmap.getPane('velocity').style.clipPath = `polygon(${a.x}px ${a.y}px, ${b.x}px ${a.y}px, ${b.x}px ${b.y}px, ${a.x}px ${b.y}px)`;
}
function placeWindStorm() {
  if (!wmap || !storm) return;
  if (!wStorm) wStorm = L.marker([storm.lat, storm.lon], { icon: cycloneIcon(storm.mph >= 74), pane: 'top' }).addTo(wmap);
  else { wStorm.setLatLng([storm.lat, storm.lon]); wStorm.setIcon(cycloneIcon(storm.mph >= 74)); }
}
async function loadWind() {
  try {
    wdata = await getJSON('/api/feed?src=wind', { timeout: 30000 });
    wCache.clear();
    const now = Date.now() - 30 * 60000;
    wIdx = Math.max(0, wdata.times.findIndex((t) => new Date(t).getTime() >= now));
    $('#windSlider').max = String(wdata.times.length - 1);
    if (!wFitted) { wFitted = true; const g = wdata.grid; wmap.fitBounds([[g.latS, g.lonW], [g.latN, g.lonE]], { padding: [4, 4] }); }
    renderWind();
    mark('wind', true, 'Wind grid');
  } catch (e) { mark('wind', false, 'Wind grid'); }
}
async function initPhoneWind() {
  const wrap = $('.wind-wrap');
  $('#windy').hidden = true;
  const rainChip = $('[data-ov="rain"]'); if (rainChip) rainChip.hidden = true;
  const box = document.createElement('div'); box.id = 'windMap'; wrap.appendChild(box);
  const legend = document.createElement('div'); legend.className = 'wind-legend';
  legend.innerHTML = `<div id="windLegendTitle">Sustained wind (mph)</div><div class="wl-bar"></div><div class="wl-ticks"><span style="left:0">0</span><span style="left:20%">20</span><span style="left:40%">40</span><span style="left:60%">60</span><span style="left:100%">100</span></div>`;
  wrap.appendChild(legend);
  const bar = document.createElement('div'); bar.className = 'map-bar wind-bar';
  bar.innerHTML = `<button class="btn btn-icon" id="windPlay" type="button" aria-label="Play wind forecast">▶</button><input type="range" id="windSlider" min="0" max="23" value="0" aria-label="Forecast hour"><span class="frame-time mono" id="windTime">Loading wind…</span>`;
  wrap.after(bar);
  $('.card-wind .fine').textContent = 'Wind forecast for the next 24 hours from the HRRR and GFS models (via Open-Meteo), on a 50-mile grid. Colors show sustained wind or gusts; the streaks show direction. Tap anywhere for the numbers.';
  wmap = L.map('windMap', { zoomControl: true, minZoom: 4, maxZoom: 9, dragging: !TOUCH, doubleClickZoom: !TOUCH, touchZoom: true, attributionControl: true }).setView([29.4, -89.2], 5);
  twoFingerHint(wmap);
  wmap.createPane('field').style.zIndex = 300;
  wmap.createPane('velocity').style.zIndex = 420;
  wmap.createPane('labels').style.zIndex = 450;
  wmap.getPane('labels').style.pointerEvents = 'none';
  wmap.createPane('top').style.zIndex = 620;
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Basemap &copy; Esri · Wind: Open-Meteo' }).addTo(wmap);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { pane: 'labels', maxZoom: 16 }).addTo(wmap);
  [[HOME, 'Hattiesburg'], [NOLA, 'New Orleans']].forEach(([p, name]) => L.circleMarker([p.lat, p.lon], { radius: 5, color: '#fff', weight: 1.5, fillColor: '#4cc3d9', fillOpacity: 1, pane: 'top' })
    .bindTooltip(name, { permanent: true, direction: 'right', className: 'town', offset: [6, 0] }).addTo(wmap));
  placeWindStorm();
  wmap.on('zoomend moveend viewreset', clipVelocity);
  wmap.on('click', (e) => {
    if (!wdata) return;
    const { lat, lng } = e.latlng, g = wdata.grid;
    if (lat < g.latS || lat > g.latN || lng < g.lonW || lng > g.lonE) return;
    const sp = Math.round(gridValue(wdata.speed[wIdx], lat, lng)), gu = Math.round(gridValue(wdata.gust[wIdx], lat, lng));
    const k = Math.round((g.latN - lat) / g.step) * g.nx + Math.round((lng - g.lonW) / g.step);
    L.popup({ className: 'wind-pop' }).setLatLng(e.latlng).setContent(`<b>${sp} mph</b> wind from the ${compass(wdata.dir[wIdx][k])}<br>gusts <b>${gu} mph</b><br>${esc(shortDayTime(wdata.times[wIdx]))}`).openOn(wmap);
  });
  $('#windSlider').addEventListener('input', (e) => { stopWindPlay(); wIdx = +e.target.value; renderWind(); });
  $('#windPlay').addEventListener('click', () => (wTimer ? stopWindPlay() : startWindPlay()));
  try { await loadScript('https://cdn.jsdelivr.net/npm/leaflet-velocity@2.1.4/dist/leaflet-velocity.min.js'); } catch (e) { /* colors still work without the streaks */ }
  every(60 * 60 * 1000, loadWind);
}
function startWindPlay() {
  $('#windPlay').textContent = '❚❚'; $('#windPlay').setAttribute('aria-label', 'Pause wind forecast');
  wTimer = setInterval(() => { if (!wdata) return; wIdx = (wIdx + 1) % wdata.times.length; renderWind(); }, 900);
}
function stopWindPlay() {
  clearInterval(wTimer); wTimer = null;
  $('#windPlay').textContent = '▶'; $('#windPlay').setAttribute('aria-label', 'Play wind forecast');
}
if (SMALL) initPhoneWind();

// ---------- Schedule ----------
(async () => {
  try { await loadStorm(); } catch (e) {}
  setWindy();
  every(60 * 1000, loadAlerts);
  every(5 * 60 * 1000, loadObs);
  every(3 * 60 * 1000, loadNews);
  setTimeout(() => every(2 * 60 * 1000, loadProducts), 500);
  every(10 * 60 * 1000, async () => { await loadGIS(); });
  every(15 * 60 * 1000, loadGfx);
  setInterval(async () => { try { await loadStorm(); setWindy(); } catch (e) {} }, 2 * 60 * 1000);
})();

})();
