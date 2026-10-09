/* Isaias Watch (public), part 1 of 3: helpers, saved state, places, search, alarm sounds. Shares top-level names with core.js. */
'use strict';

// ---------- Config ----------
const STORM_NAME = 'Isaias';
const RADIUS_MI = 50;          // "near you" alert radius
const SAME_TOWN_MI = 5;        // counties this close to the point join the alarm list by default
const DEFAULT_AREA = ['LA', 'MS', 'AL', 'FL'];
const DEFAULT_OFFICES = ['LIX', 'MOB', 'TAE'];
const UA_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

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
// Optional extra alert types. 'alarm' ones get the full banner + alarm; the rest a chime + notification.
const EXTRAS = [
  ['Extreme Wind Warning', 'alarm', true, 'Extreme Wind Warning (hurricane eyewall winds, take shelter)'],
  ['Tornado Watch', 'chime', false, 'Tornado Watch'],
  ['Hurricane Warning', 'chime', false, 'Hurricane Warning'],
  ['Storm Surge Warning', 'chime', false, 'Storm Surge Warning'],
  ['Flash Flood Warning', 'chime', false, 'Flash Flood Warning'],
  ['Severe Thunderstorm Warning', 'chime', false, 'Severe Thunderstorm Warning'],
];
const SOUNDS = [
  ['siren', 'Siren', 'Rising and falling wail'],
  ['alarm', 'Alarm beeps', 'Fast triple beeps'],
  ['eas', 'Emergency tones', 'Two-tone broadcast alert'],
  ['chime', 'Chime', 'Gentle repeating chime'],
  ['none', 'No sound', 'Banner, vibration and notification only'],
];

// ---------- Helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ktToMph = (kt) => Math.round(kt * 1.15078);
const nhcMph = (kt) => Math.round(kt * 1.15078 / 5) * 5;
const TOUCH = window.matchMedia('(pointer: coarse)').matches;
const SMALL = window.matchMedia('(max-width: 760px)').matches;

// Times show in the watched place's time zone (CT for most of the storm path) plus UTC.
let TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'; } catch (e) { return 'America/Chicago'; } })();
function tzAbbr(d = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName');
    const a = p ? p.value : '';
    const m = /^(E|C|M|P|AK|H)[SD]T$/.exec(a);
    return m ? m[1] + 'T' : a;
  } catch (e) { return ''; }
}
const ctOnly = (d, opts = {}) => new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', ...opts });
const utcOnly = (d, opts = {}) => new Date(d).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false, ...opts });
const fmtTime = (d) => `${ctOnly(d)} ${tzAbbr(new Date(d))} / ${utcOnly(d)} UTC`;
const weekday = (d) => new Date(d).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' });
const fmtDayTime = (d) => `${weekday(d)} ${fmtTime(d)}`;
const shortTime = (d) => ctOnly(d);
const shortDayTime = (d) => `${weekday(d)} ${ctOnly(d)}`;
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
function setStat(key, val) {
  const main = document.getElementById(key);
  if (main) main.textContent = val;
  $$(`[data-s="${key}"]`).forEach((el) => { el.textContent = val; });
}
const health = {};
function mark(key, ok, label) {
  health[key] = { ok, label, at: Date.now() };
  $('#sources').innerHTML = Object.entries(health).map(([k, v]) =>
    `<span class="${v.ok ? 'ok' : 'err'}" title="${esc(v.ok ? 'updated' : 'failed')} ${esc(fmtTime(v.at))}">${esc(v.label)} · ${esc(ctOnly(v.at))} ${esc(tzAbbr())}</span>`).join('');
}
// Repeating loader. The returned function runs it again right away (used when the page comes back to the front).
function every(ms, fn) {
  let timer = null, busy = false, again = false;
  const run = async () => {
    clearTimeout(timer);
    if (busy) { again = true; return; }
    busy = true;
    do { again = false; try { await fn(); } catch (e) { console.warn(e); } } while (again);
    busy = false;
    timer = setTimeout(run, ms);
  };
  run();
  return run;
}
let toastTimer = null;
function toast(html, { ms = 6000, actions = [] } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span class="toast-t">${html}</span>`;
  for (const [label, fn] of actions) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-b'; b.textContent = label;
    b.addEventListener('click', () => { t.hidden = true; fn(); });
    t.appendChild(b);
  }
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'toast-x'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
  x.addEventListener('click', () => { t.hidden = true; });
  t.appendChild(x);
  t.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- Saved state ----------
// Everything lives in localStorage. iPhone home-screen apps get their own empty storage, so on iPhone Safari the
// same state is also mirrored into the address (#s=...) and into the manifest's start URL. Whichever way the
// app gets opened later, it finds its places and settings without starting over.
const KEY = 'iw.v1';
const DEFAULT_STATE = () => ({
  locs: [], act: null, cty: [], ctyN: {}, snd: 'siren', vol: 0.8, len: 20,
  extra: Object.fromEntries(EXTRAS.map(([ev, , on]) => [ev, on])),
  armed: false, pins: [], tips: {}, astatOpen: false,
});
let S = DEFAULT_STATE();
let seededFromLink = false;
function b64e(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64d(str) { return JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))))); }
function packState() {
  return {
    l: S.locs.map((l) => [l.short, l.st, +l.lat.toFixed(3), +l.lon.toFixed(3), l.gps ? 1 : 0]),
    a: Math.max(0, S.locs.findIndex((l) => l.id === S.act)),
    c: S.cty, cn: S.cty.map((c) => S.ctyN[c] || ''),
    s: S.snd, v: S.vol, n: S.len,
    x: EXTRAS.map(([ev]) => (S.extra[ev] ? 1 : 0)).join(''),
    p: S.pins, t: Object.keys(S.tips).filter((k) => S.tips[k]), r: S.armed ? 1 : 0,
  };
}
function unpackState(o) {
  const st = DEFAULT_STATE();
  st.locs = (o.l || []).map((x, i) => ({ id: 'L' + Date.now().toString(36) + i, short: x[0], st: x[1], name: `${x[0]}, ${x[1]}`, lat: x[2], lon: x[3], gps: !!x[4] }));
  st.act = st.locs[o.a || 0] ? st.locs[o.a || 0].id : null;
  st.cty = Array.isArray(o.c) ? o.c : [];
  (o.cn || []).forEach((n, i) => { if (st.cty[i] && n) st.ctyN[st.cty[i]] = n; });
  if (o.s) st.snd = o.s; if (o.v) st.vol = o.v; if (o.n != null) st.len = o.n;
  if (typeof o.x === 'string') EXTRAS.forEach(([ev], i) => { st.extra[ev] = o.x[i] === '1'; });
  st.pins = o.p || []; (o.t || []).forEach((k) => { st.tips[k] = 1; }); st.armed = !!o.r;
  return st;
}
function linkState() {
  const q = new URLSearchParams(location.search).get('s');
  const h = /[#&]s=([A-Za-z0-9_-]+)/.exec(location.hash || '');
  return q || (h && h[1]) || null;
}
(function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  if (raw) { try { S = Object.assign(DEFAULT_STATE(), JSON.parse(raw)); } catch (e) {} }
  const link = linkState();
  if (!S.locs.length && link) {
    try { S = unpackState(b64d(link)); seededFromLink = true; } catch (e) { console.warn('bad link state', e); }
  }
  if (!S.locs.find((l) => l.id === S.act)) S.act = S.locs[0] ? S.locs[0].id : null;
})();
const manifestLink = $('#manifestLink');
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  const packed = S.locs.length ? b64e(packState()) : null;
  // Start URL for "Add to Home Screen" / "Install app".
  // iPhone only: Safari has no install prompt and keeps no storage for Home Screen apps, so the places ride along
  // in the manifest's start URL. Android installs share Chrome's storage, and swapping the manifest there makes
  // Chrome's pending install offer go stale, so Android (and everything else) keeps the one static manifest.
  const want = packed && UA_IOS ? `/api/watch?src=manifest&s=${packed}` : '/manifest.webmanifest';
  if (manifestLink.getAttribute('href') !== want) manifestLink.href = want;
  // iPhone Safari copies the current address when adding to the Home Screen.
  try {
    const clean = location.pathname + (location.search.replace(/[?&]s=[^&]*/, '').replace(/^&/, '?') || '');
    if (UA_IOS && !STANDALONE && packed) history.replaceState(null, '', `${clean}#s=${packed}`);
    else if (location.hash || /[?&]s=/.test(location.search)) history.replaceState(null, '', clean);
  } catch (e) {}
}
const activeLoc = () => S.locs.find((l) => l.id === S.act) || null;

// ---------- Geography: states and county outlines (built from the Census map, ~1 km precision) ----------
let STATES = null;                 // { MS: { f:'28', n:'Mississippi', b:[w,s,e,n] }, ... }
const CTY = new Map();             // 'MS' -> [{ same, name, st, bbox, rings }]
const CTY_BY_SAME = new Map();
const ABBR = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR' };
function loadScript(src) {
  return new Promise((ok, fail) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = fail; document.head.appendChild(el); });
}
// Census county + state outlines (us-atlas). One download, cached by the browser; also draws the state lines.
let atlasP = null;
function loadAtlas() {
  if (!atlasP) atlasP = (async () => {
    if (!window.topojson) await loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js');
    const us = await getJSON('https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json', { timeout: 40000 });
    const ringsOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((x) => x[0]) : []);
    const st = {};
    for (const f of topojson.feature(us, us.objects.states).features) {
      const fips = String(f.id).padStart(2, '0'), ab = ABBR[fips];
      if (!ab) continue;
      let w = 180, so = 90, e = -180, n = -90;
      for (const r of ringsOf(f.geometry)) for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); n = Math.max(n, y); }
      st[ab] = { f: fips, n: f.properties.name, b: [w, so, e, n] };
    }
    for (const f of topojson.feature(us, us.objects.counties).features) {
      const id = String(f.id).padStart(5, '0'), ab = ABBR[id.slice(0, 2)];
      if (!ab) continue;
      let w = 180, so = 90, e = -180, n = -90;
      const rings = ringsOf(f.geometry).map((r) => { const flat = []; for (const [x, y] of r) { flat.push(x, y); w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); n = Math.max(n, y); } return flat; });
      const c = { same: '0' + id, name: f.properties.name, st: ab, bbox: [w, so, e, n], rings };
      if (!CTY.has(ab)) CTY.set(ab, []);
      CTY.get(ab).push(c);
      CTY_BY_SAME.set(c.same, c);
    }
    STATES = st;
    return us;
  })().catch((e) => { atlasP = null; throw e; });
  return atlasP;
}
async function loadStatesIndex() { await loadAtlas(); return STATES; }
function loadState(st) { return loadAtlas().then(() => CTY.get(st) || []); }
function stateBySame(same) { if (!STATES) return null; const f = same.slice(1, 3); return Object.keys(STATES).find((k) => STATES[k].f === f) || null; }
function stateByName(name) { if (!STATES || !name) return null; const n = name.toLowerCase(); return Object.keys(STATES).find((k) => STATES[k].n.toLowerCase() === n) || null; }
function statesNear(pt, mi) {
  if (!STATES) return [];
  const dLat = mi / 69, dLon = mi / (69 * Math.cos(pt.lat * Math.PI / 180));
  return Object.keys(STATES).filter((k) => { const [w, s, e, n] = STATES[k].b; return pt.lon >= w - dLon && pt.lon <= e + dLon && pt.lat >= s - dLat && pt.lat <= n + dLat; });
}
function pointInFlat(pt, r) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if (((yi > pt.lat) !== (yj > pt.lat)) && (pt.lon < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function distToSegMi(p, a, b) {
  const kx = 69.17 * Math.cos(p.lat * Math.PI / 180), ky = 69.0;
  const ax = (a[0] - p.lon) * kx, ay = (a[1] - p.lat) * ky, bx = (b[0] - p.lon) * kx, by = (b[1] - p.lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / ((dx * dx + dy * dy) || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function countyDist(pt, c) {
  let d = Infinity;
  for (const r of c.rings) {
    if (pointInFlat(pt, r)) return 0;
    for (let i = 0; i < r.length - 2; i += 2) d = Math.min(d, distToSegMi(pt, [r[i], r[i + 1]], [r[i + 2], r[i + 3]]));
  }
  return d;
}
async function countiesNear(pt, mi) {
  await loadStatesIndex();
  const sts = statesNear(pt, mi + 10);
  await Promise.all(sts.map((s) => loadState(s).catch(() => null)));
  const dLat = mi / 69 + 0.1, dLon = mi / (69 * Math.cos(pt.lat * Math.PI / 180)) + 0.1;
  const out = [];
  for (const s of sts) for (const c of CTY.get(s) || []) {
    const [w, so, e, n] = c.bbox;
    if (pt.lon < w - dLon || pt.lon > e + dLon || pt.lat < so - dLat || pt.lat > n + dLat) continue;
    const d = countyDist(pt, c);
    if (d <= mi) out.push({ ...c, d });
  }
  return out.sort((a, b) => a.d - b.d);
}
const ctySuffix = (st) => (st === 'LA' ? 'Parish' : st === 'AK' ? 'Borough' : 'County');
const ctyShort = (st) => (st === 'LA' ? 'Par.' : 'Co.');
function ctyLabel(same, { long = false, state = true } = {}) {
  const c = CTY_BY_SAME.get(same);
  if (c) return `${c.name} ${long ? ctySuffix(c.st) : ctyShort(c.st)}${state ? ', ' + c.st : ''}`;
  return S.ctyN[same] || same;
}
const andList = (arr) => (arr.length < 2 ? arr.join('') : `${arr.slice(0, -1).join(', ')} & ${arr[arr.length - 1]}`);
const countyList = (list) => { const n = list.map((c) => ctyLabel(c, { state: false })); const same = n.every((x) => / Co\.$/.test(x)) ? ' Co.' : n.every((x) => / Par\.$/.test(x)) ? ' Par.' : ''; return same && n.length > 1 ? andList(n.map((x) => x.replace(/ (Co|Par)\.$/, ''))) + (same === ' Co.' ? ' counties' : ' parishes') : andList(n); };
const ctyName = (same) => (CTY_BY_SAME.get(same) || {}).name || (S.ctyN[same] || same).replace(/ (Co\.|Par\.).*$/, '');

// ---------- Location: NWS point lookup ----------
async function nwsPoint(lat, lon) {
  const d = await getJSON(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers: NWS_HEADERS, timeout: 15000 });
  const p = d.properties || {};
  const rl = (p.relativeLocation && p.relativeLocation.properties) || {};
  let county = null;
  const m = /\/([A-Z]{2})C(\d{3})$/.exec(p.county || '');
  await loadStatesIndex();
  if (m && STATES[m[1]]) county = '0' + STATES[m[1]].f + m[2];
  return { cwa: p.cwa || p.gridId, county, tz: p.timeZone, hourly: p.forecastHourly, stationsUrl: p.observationStations, city: rl.city, state: rl.state, at: Date.now() };
}
async function ensureNws(loc) {
  if (loc.nws && Date.now() - (loc.nws.at || 0) < 24 * 3600e3) return loc.nws;
  try { loc.nws = Object.assign(loc.nws || {}, await nwsPoint(loc.lat, loc.lon)); save(); } catch (e) { console.warn('points', e); }
  return loc.nws || {};
}
function newId() { return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// Add (or re-use) a saved place and switch to it.
async function addPlace({ short, st, lat, lon, gps = false, quiet = false }) {
  lat = +lat.toFixed(3); lon = +lon.toFixed(3);
  if (quiet) {
    const g = S.locs.find((l) => l.gps);
    if (g) {
      Object.assign(g, { short, st, lat, lon, name: `${short}, ${st}`, nws: null });
      save(); renderLocChips(); renderSaved(); drawSavedMarkers();
      if (g.id === S.act) await applyLocation({ fly: false });
      return;
    }
  }
  let loc = gps ? S.locs.find((l) => l.gps) : S.locs.find((l) => miles(l, { lat, lon }) < 3 && l.short === short);
  if (loc) Object.assign(loc, { short, st, lat, lon, name: `${short}, ${st}`, nws: miles(loc, { lat, lon }) < 1 ? loc.nws : null });
  else {
    loc = { id: newId(), short, st, lat, lon, gps, name: `${short}, ${st}` };
    if (gps) S.locs.unshift(loc); else S.locs.push(loc);
    if (S.locs.length > 12) S.locs.splice(S.locs.findIndex((l) => l.id !== S.act && l.id !== loc.id), 1);
  }
  const first = !S.cty.length;
  S.act = loc.id;
  save();
  closeSheet();
  await applyLocation({ fly: true });
  // Alarm counties: the first place picks them automatically; later places ask.
  const near = REG.list.filter((c) => c.d <= SAME_TOWN_MI);
  if (first && near.length) {
    S.cty = near.map((c) => c.same);
    near.forEach((c) => { S.ctyN[c.same] = ctyLabel(c.same); });
    save(); renderTornado(); renderStatus(); drawSirenCounties();
    const names = esc(countyList(near.map((c) => c.same)));
    if (gps) {
      toast(`Found you near <b>${esc(loc.name)}</b>. Tornado alarm set for <b>${names}</b>${/\.$/.test(names) ? '' : '.'} Not right? A VPN can put you in the wrong city.`, { ms: 15000, actions: [['Wrong place?', () => openLocSheet(false, true)]] });
    } else {
      toast(`Tornado alarm set for <b>${names}</b>, the area around ${esc(loc.short)}. You can change it in Alert settings.`, { ms: 9000, actions: [['Settings', openAlertSheet]] });
    }
    document.dispatchEvent(new Event('iw:firstplace'));
  } else if (!first) {
    const missing = near.filter((c) => !S.cty.includes(c.same));
    if (missing.length) {
      toast(`Sound the alarm for <b>${esc(countyList(missing.map((c) => c.same)))}</b> too?`, { ms: 12000, actions: [['Add', () => { addCounties(missing.map((c) => c.same)); }]] });
    }
  }
}
async function removePlace(id) {
  const i = S.locs.findIndex((l) => l.id === id);
  if (i < 0) return;
  const gone = S.locs[i];
  const before = { locs: S.locs.slice(), act: S.act, cty: S.cty.slice() };
  // Alarm counties that sit on this place and on none of your other places go with it.
  let dropped = [];
  try {
    const mine = (await countiesNear(gone, SAME_TOWN_MI)).map((c) => c.same);
    const others = S.locs.filter((l) => l.id !== id);
    const keep = new Set();
    for (const l of others) (await countiesNear(l, SAME_TOWN_MI)).forEach((c) => keep.add(c.same));
    dropped = mine.filter((c) => S.cty.includes(c) && !keep.has(c));
  } catch (e) {}
  S.locs.splice(S.locs.indexOf(gone), 1);
  S.cty = S.cty.filter((c) => !dropped.includes(c));
  const wasActive = S.act === id;
  if (wasActive) S.act = S.locs[0] ? S.locs[0].id : null;
  save(); renderLocChips(); renderSaved(); drawSavedMarkers();
  if (wasActive) await applyLocation({ fly: true });
  // Nothing left to sound for? Use the place you're now watching, same as a first visit.
  let added = [];
  const now = activeLoc();
  if (!S.cty.length && now && REG.home.size) {
    added = [...REG.home];
    added.forEach((c) => { S.cty.push(c); S.ctyN[c] = ctyLabel(c); });
    save();
  }
  renderTornado(); renderStatus(); drawSirenCounties(); renderCountyPicker(); setArmedUI();
  const parts = [`Removed <b>${esc(gone.name)}</b>`];
  if (dropped.length) parts.push(`and its alarm ${dropped.length === 1 ? 'county' : 'counties'} (${esc(countyList(dropped))})`);
  const dot = (t) => (/\.(<\/b>)?$/.test(t) ? t : t + '.');
  let msg = dot(parts.join(' '));
  if (added.length) { const l = countyList(added); msg += ` Tornado alarm now set for <b>${esc(l)}</b>${/\.$/.test(l) ? '' : '.'}`; }
  toast(msg, { ms: 10000, actions: [['Undo', () => {
    S.locs = before.locs; S.act = before.act; S.cty = before.cty; save();
    applyLocation({ fly: true }); drawSirenCounties(); renderTornado(); renderStatus();
  }]] });
  if (!S.locs.length) setTimeout(() => openLocSheet(true), 400);
}
function addCounties(list) {
  for (const same of list) if (!S.cty.includes(same)) { S.cty.push(same); S.ctyN[same] = ctyLabel(same); }
  save(); renderTornado(); renderStatus(); drawSirenCounties(); renderCountyPicker(); kickAlerts();
}
function removeCounty(same) {
  S.cty = S.cty.filter((c) => c !== same);
  save(); renderTornado(); renderStatus(); drawSirenCounties(); renderCountyPicker();
}

// Region around the active place: every county or parish with any part within 50 miles.
let REG = { list: [], same: new Set(), home: new Set() };
let locToken = 0;
async function applyLocation({ fly = false } = {}) {
  const tok = ++locToken;
  const loc = activeLoc();
  renderLocChips(); renderSaved();
  if (!loc) {
    REG = { list: [], same: new Set(), home: new Set() };
    TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return 'America/Chicago'; } })();
    labelLocation(); drawLocMarkers(); renderRegions(); renderTornado(); renderObsEmpty(); renderStatus(); updateDistances();
    return;
  }
  labelLocation();
  drawLocMarkers();
  if (fly) map.setView([loc.lat, loc.lon], 8);
  updateDistances(); renderTrack(); setWindy(true);
  const [nws] = await Promise.all([ensureNws(loc), (async () => {
    try {
      const list = await countiesNear(loc, RADIUS_MI);
      if (tok !== locToken) return;
      REG = { list, same: new Set(list.map((c) => c.same)), home: new Set(list.filter((c) => c.d <= SAME_TOWN_MI).map((c) => c.same)) };
      $('#coverLoc').textContent = list.map((c) => `${c.name} ${ctySuffix(c.st) === 'County' ? 'Co.' : ctySuffix(c.st)}, ${c.st}`).join(' · ');
    } catch (e) { console.warn('counties', e); }
  })()]);
  if (tok !== locToken) return;
  if (nws && nws.tz) TZ = nws.tz;
  if (nws && nws.county && !REG.home.size) REG.home.add(nws.county);
  tickClock(); labelLocation(); renderTrack();
  renderRegions(); renderTornado(); renderStatus(); drawSirenCounties();
  // Reload everything that depends on the place.
  for (const k of [...feedItems.keys()]) if (k.startsWith('prod:') && feedItems.get(k).cat === 'nws') feedItems.delete(k);
  kickAlerts(); kickObs(); kickProducts(); kickNews(); kickHourly();
}
function labelLocation() {
  const loc = activeLoc();
  const short = loc ? loc.short : null;
  setStat('sDistLabel', short ? `To ${short}` : 'To you');
  setStat('sDistShort', 'To');
  const vb = $('#viewLocBtn'); vb.hidden = !loc; vb.textContent = short || 'Your area';
  $('#regionName').textContent = short || 'Your area';
  $('#obsPlace').textContent = loc ? loc.name : '';
  if (!SMALL) $('#windNote').textContent = `Animated surface wind from the ECMWF model via Windy, centered between Isaias and ${short || 'the coast'}${short ? ', with a marker on ' + short : ''}. Model output, not observations; the observed 34/50/64-kt wind field from NHC is on the radar map above.`;
  $('#locAddText').textContent = S.locs.length ? 'Add' : 'Pick your place';
}

// ---------- Location bar (header chips) ----------
const GPS_ICON = '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M15 1 1 7.5l6 1.5 1.5 6Z" fill="currentColor"/></svg>';
function renderLocChips() {
  const el = $('#locChips');
  el.innerHTML = S.locs.map((l) => {
    const label = `${l.gps ? GPS_ICON : ''}${esc(l.short)}<span class="loc-st">${esc(l.st)}</span>`;
    if (l.id !== S.act) return `<button type="button" class="loc-chip" data-loc="${esc(l.id)}" aria-pressed="false" title="Watch ${esc(l.name)}">${label}</button>`;
    return `<span class="loc-chip is-on"><span class="loc-name" aria-current="true">${label}</span><button type="button" class="loc-more" data-more="${esc(l.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Options for ${esc(l.name)}"><span class="loc-chev" aria-hidden="true"></span></button></span>`;
  }).join('');
  $('#locBar').classList.toggle('is-empty', !S.locs.length);
}
let locMenu = null;
function closeLocMenu() {
  if (!locMenu) return;
  const b = $(`[data-more]`, $('#locChips')); if (b) b.setAttribute('aria-expanded', 'false');
  locMenu.remove(); locMenu = null;
}
function openLocMenu(btn) {
  closeLocMenu();
  const l = S.locs.find((x) => x.id === btn.dataset.more);
  if (!l) return;
  locMenu = document.createElement('div');
  locMenu.className = 'loc-menu'; locMenu.setAttribute('role', 'menu');
  locMenu.innerHTML = `<button type="button" role="menuitem" class="loc-menu-rm">Remove ${esc(l.name)}</button>`;
  document.body.appendChild(locMenu);
  const r = btn.getBoundingClientRect();
  const w = locMenu.offsetWidth;
  locMenu.style.top = `${r.bottom + 6}px`;
  locMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w + 10))}px`;
  btn.setAttribute('aria-expanded', 'true');
  const item = $('button', locMenu);
  item.addEventListener('click', () => { closeLocMenu(); removePlace(l.id); });
  if (!TOUCH) item.focus();
}
$('#locChips').addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (more) { e.stopPropagation(); if (locMenu) closeLocMenu(); else openLocMenu(more); return; }
  const b = e.target.closest('[data-loc]');
  if (!b) return;
  S.act = b.dataset.loc; save(); applyLocation({ fly: true });
});
document.addEventListener('click', (e) => { if (locMenu && !e.target.closest('.loc-menu')) closeLocMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLocMenu(); });
window.addEventListener('scroll', closeLocMenu, { passive: true });
window.addEventListener('resize', closeLocMenu);
$('#locAdd').addEventListener('click', () => openLocSheet());

// ---------- Sheets ----------
let openSheetEl = null, lastFocus = null;
// An open panel gets its own history entry, so Android's back gesture (and the browser Back button) closes the
// panel instead of leaving the page.
let sheetHist = false, backPending = false;
function openSheet(id) {
  closeSheet(true);
  const el = $('#' + id);
  lastFocus = document.activeElement;
  el.hidden = false; openSheetEl = el;
  document.body.classList.add('sheet-open');
  const f = el.querySelector('[data-autofocus]') || el.querySelector('.sheet-x');
  setTimeout(() => { if (!TOUCH && f) f.focus(); }, 30);
  if (!sheetHist) { try { history.pushState({ iwSheet: 1 }, '', location.href); sheetHist = true; } catch (e) {} }
}
function closeSheet(keepHistory) {
  if (!openSheetEl) return;
  openSheetEl.hidden = true; openSheetEl = null;
  document.body.classList.remove('sheet-open');
  if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  if (sheetHist && keepHistory !== true) { sheetHist = false; backPending = true; try { history.back(); } catch (e) { backPending = false; } }
}
window.addEventListener('popstate', () => {
  if (backPending) backPending = false;               // our own step back after closing a panel
  else if (sheetHist) { sheetHist = false; closeSheet(true); } // the back gesture: close the panel
  setTimeout(save, 0); // re-stamp the saved places into the address (iPhone Home Screen) after the history step
});
$$('.sheet').forEach((sh) => sh.addEventListener('click', (e) => { if (e.target === sh || e.target.closest('[data-close]')) closeSheet(); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSheetEl) closeSheet(); });

function openLocSheet(welcome = false, wrong = false) {
  $('#locTitle').textContent = welcome ? 'Where should we watch?' : wrong ? 'Fix your location' : 'Watch a place';
  $('#locLead').textContent = welcome
    ? 'Pick your town to get its alerts, conditions, distance to the storm, and a tornado alarm for your county. You can add other places, like where your kids or parents live, and switch with one tap.'
    : wrong
      ? 'Type your town or ZIP below. Then remove the wrong place with the ✕ next to it under Your places; its alarm county goes with it.'
      : 'Pick where you are, or where your people are. Saved places stay on this device and switch with one tap. Remove one with its ✕.';
  $('#acIn').value = ''; acClose();
  $('#gpsMsg').hidden = true;
  $('#acIn').setAttribute('data-autofocus', '');
  renderSaved();
  openSheet('locSheet');
}
function renderSaved() {
  const wrap = $('#savedWrap');
  wrap.hidden = !S.locs.length;
  $('#savedList').innerHTML = S.locs.map((l) => {
    const d = storm ? `${Math.round(miles(l, storm))} mi from Isaias` : '';
    return `<li class="saved-row${l.id === S.act ? ' is-on' : ''}"><button type="button" class="saved-go" data-go="${esc(l.id)}"><b>${esc(l.short)}, ${esc(l.st)}</b><small>${l.gps ? 'My location · ' : ''}${esc(d)}${l.id === S.act ? ' · watching now' : ''}</small></button><button type="button" class="saved-x" data-del="${esc(l.id)}" aria-label="Remove ${esc(l.short)}">×</button></li>`;
  }).join('');
}
$('#savedList').addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]'), del = e.target.closest('[data-del]');
  if (del) { removePlace(del.dataset.del); return; }
  if (go) { S.act = go.dataset.go; save(); closeSheet(); applyLocation({ fly: true }); }
});

// GPS: approximate only (rounded to about a mile), and never asked for on its own.
$('#gpsBtn').addEventListener('click', () => locate(true));
function gpsMsg(t) { const m = $('#gpsMsg'); m.textContent = t; m.hidden = !t; }
function locate(interactive) {
  if (!('geolocation' in navigator)) { if (interactive) gpsMsg('This browser can’t share location. Type your city or ZIP instead.'); return; }
  if (interactive) { $('#gpsText').textContent = 'Finding you…'; $('#gpsBtn').disabled = true; }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = +pos.coords.latitude.toFixed(2), lon = +pos.coords.longitude.toFixed(2);
    try {
      const old = S.locs.find((l) => l.gps);
      if (!interactive && old && miles(old, { lat, lon }) < 3) return;
      const p = await nwsPoint(lat, lon);
      await loadStatesIndex();
      const st = p.state || 'US';
      await addPlace({ short: p.city || 'My location', st, lat, lon, gps: true, quiet: !interactive });
      if (!interactive) toast(`Updated your location to <b>${esc(p.city)}, ${esc(st)}</b>.`);
    } catch (e) {
      if (interactive) gpsMsg('Couldn’t look up that spot with the National Weather Service. Type your city or ZIP instead.');
    } finally { $('#gpsText').textContent = 'Use my location'; $('#gpsBtn').disabled = false; }
  }, (err) => {
    $('#gpsText').textContent = 'Use my location'; $('#gpsBtn').disabled = false;
    if (!interactive) return;
    gpsMsg(err.code === 1
      ? (UA_IOS ? 'Location is blocked. On iPhone: Settings › Privacy & Security › Location Services › Safari Websites › While Using. Or just type your city.' : 'Location is blocked for this site. Allow it in your browser’s site settings, or type your city instead.')
      : 'Couldn’t get a location fix. Type your city or ZIP instead.');
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 });
}
// If location was already allowed, quietly refresh "My location" when the app opens (no prompt ever).
async function refreshGpsQuietly() {
  if (!S.locs.some((l) => l.gps) || !navigator.permissions) return;
  try { const p = await navigator.permissions.query({ name: 'geolocation' }); if (p.state === 'granted') locate(false); } catch (e) {}
}

// ---------- Search with autocomplete ----------
const PLACES = (window.IW_PLACES || []).map(([name, st, lat, lon]) => ({ name, st, lat, lon }));
let acItems = [], acSel = -1, acTimer = null, acSeq = 0;
const acIn = $('#acIn'), acList = $('#acList');
function acClose() { acList.hidden = true; acIn.setAttribute('aria-expanded', 'false'); acSel = -1; }
function acRender() {
  if (!acItems.length) { acList.innerHTML = acIn.value.trim().length >= 2 ? '<li class="ac-none">No matches yet…</li>' : ''; acList.hidden = acIn.value.trim().length < 2; return; }
  acList.innerHTML = acItems.map((it, i) => `<li role="option" id="ac-${i}" class="ac-item${i === acSel ? ' is-sel' : ''}" aria-selected="${i === acSel}" data-i="${i}"><b>${esc(it.short)}</b>, ${esc(it.st)}<small>${esc(it.sub || '')}</small></li>`).join('');
  acList.hidden = false; acIn.setAttribute('aria-expanded', 'true');
  if (acSel >= 0) acIn.setAttribute('aria-activedescendant', 'ac-' + acSel); else acIn.removeAttribute('aria-activedescendant');
}
function localMatches(q) {
  const t = q.toLowerCase().split(',')[0].trim();
  if (!t) return [];
  return PLACES.filter((p) => p.name.toLowerCase().split(/ \/ /).some((n) => n.startsWith(t)))
    .slice(0, 4).map((p) => ({ short: p.name, st: p.st, lat: p.lat, lon: p.lon, sub: 'Major city', pop: 1e9 }));
}
async function remoteMatches(q) {
  await loadStatesIndex().catch(() => null);
  const parts = q.split(',').map((x) => x.trim());
  const name = parts[0];
  const stWant = (parts[1] || '').toUpperCase();
  const stFilter = stWant.length === 2 ? stWant : stateByName(parts[1]) || null;
  const out = [];
  try {
    const d = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=12&language=en&format=json&countryCode=US`, { timeout: 8000 });
    for (const r of d.results || []) {
      if (r.feature_code && !/^PPL/.test(r.feature_code)) continue; // towns and cities only, not dams or parks
      const st = stateByName(r.admin1);
      if (!st || (stFilter && st !== stFilter)) continue;
      out.push({ short: r.name, st, lat: r.latitude, lon: r.longitude, sub: [r.admin2, r.postcodes && /^\d{5}$/.test(name) ? 'ZIP ' + name : ''].filter(Boolean).join(' · '), pop: r.population || 0 });
    }
  } catch (e) { /* fall back below */ }
  if (!out.length) {
    try {
      const d = await getJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=en&bbox=-125,17,-64,50`, { timeout: 8000 });
      for (const f of d.features || []) {
        const p = f.properties || {};
        if (p.countrycode && p.countrycode !== 'US') continue;
        const st = stateByName(p.state);
        if (!st || (stFilter && st !== stFilter)) continue;
        const [lon, lat] = f.geometry.coordinates;
        out.push({ short: p.name || p.city, st, lat, lon, sub: [p.county, p.postcode].filter(Boolean).join(' · '), pop: 0 });
      }
    } catch (e) {}
  }
  return out;
}
acIn.addEventListener('input', () => {
  clearTimeout(acTimer);
  const q = acIn.value.trim();
  acItems = localMatches(q); acSel = acItems.length ? 0 : -1; acRender();
  if (q.length < 2) return;
  const seq = ++acSeq;
  acTimer = setTimeout(async () => {
    const remote = await remoteMatches(q);
    if (seq !== acSeq) return;
    const seen = new Set();
    acItems = [...localMatches(q), ...remote.sort((a, b) => b.pop - a.pop)].filter((it) => {
      const k = `${it.short}|${it.st}|${Math.round(it.lat * 10)}|${Math.round(it.lon * 10)}`;
      if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, 8);
    acSel = acItems.length ? 0 : -1;
    acRender();
  }, 220);
});
acIn.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); acSel = Math.min(acItems.length - 1, acSel + 1); acRender(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); acSel = Math.max(0, acSel - 1); acRender(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (acItems[acSel]) pickAc(acItems[acSel]); }
  else if (e.key === 'Escape' && !acList.hidden) { e.stopPropagation(); acClose(); }
});
acList.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the keyboard open on phones
acList.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) pickAc(acItems[+li.dataset.i]); });
async function pickAc(it) {
  acClose();
  acIn.value = `${it.short}, ${it.st}`;
  acIn.blur();
  await addPlace({ short: it.short, st: it.st, lat: it.lat, lon: it.lon });
}
// Browse by state (major cities)
(function browse() {
  const sts = [...new Set(PLACES.map((p) => p.st))];
  const names = { MS: 'Mississippi', LA: 'Louisiana', AL: 'Alabama', FL: 'Florida', TX: 'Texas', GA: 'Georgia', TN: 'Tennessee', AR: 'Arkansas', SC: 'South Carolina', NC: 'North Carolina' };
  $('#brState').innerHTML = sts.map((s) => `<option value="${s}">${names[s] || s}</option>`).join('');
  const fill = () => { const s = $('#brState').value; $('#brCity').innerHTML = PLACES.filter((p) => p.st === s).map((p, i) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join(''); };
  $('#brState').addEventListener('change', fill);
  fill();
  $('#brGo').addEventListener('click', () => {
    const p = PLACES.find((x) => x.st === $('#brState').value && x.name === $('#brCity').value);
    if (p) addPlace({ short: p.name, st: p.st, lat: p.lat, lon: p.lon });
  });
})();

// ---------- Clock ----------
function tickClock() {
  const now = new Date();
  const ab = tzAbbr(now);
  const ct = ctOnly(now, { second: '2-digit' }), utc = utcOnly(now, { second: '2-digit' });
  $('#clock').textContent = `${ct} ${ab}`;
  $('#clockUtc').textContent = `${utc} UTC`;
  $$('[data-clock]').forEach((el) => { el.textContent = `${ct} ${ab}`; });
  $$('[data-clock-utc]').forEach((el) => { el.textContent = `${utc} UTC`; });
  $$('[data-clock-mini]').forEach((el) => { el.textContent = ct; });
}
setInterval(tickClock, 1000); tickClock();

// ---------- Alarm sounds & notifications ----------
let audioCtx = null;
let sirenStop = null;
const audioLive = () => !!(audioCtx && audioCtx.state === 'running');
async function unlockAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iPhone: play even with the silent switch on, where supported
  } catch (e) {}
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
  } catch (e) { console.warn(e); }
  return audioLive();
}
function setArmedUI() {
  const b = $('#armBtn');
  const live = S.armed && (audioLive() || S.snd === 'none');
  b.textContent = live ? 'Alarm on' : 'Turn on alarm';
  b.title = live ? `Alarm sounds for tornado warnings in ${S.cty.map((c) => ctyLabel(c, { state: false })).join(', ') || 'your counties'}. Click to turn it off.` : 'Lets this page play the alarm. Browsers block sound until you tap once each time the page opens.';
  b.classList.toggle('is-armed', !!live);
  $('#rearm').hidden = !(S.armed && S.snd !== 'none' && !audioLive());
  renderStatus();
}
async function arm() {
  await unlockAudio();
  S.armed = true; save();
  if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
  setArmedUI();
}
$('#armBtn').addEventListener('click', () => {
  if (S.armed && (audioLive() || S.snd === 'none')) { S.armed = false; save(); stopSiren(); setArmedUI(); }
  else arm().then(() => playChime());
});
// One tap anywhere re-enables sound after a reload (browsers block sound until the page is touched).
document.addEventListener('pointerdown', () => { if (S.armed && !audioLive()) unlockAudio().then(setArmedUI); }, { capture: true });

function playAlarm(kind = S.snd, seconds = S.len, vol = S.vol) {
  if (kind === 'none') return true;
  if (!audioLive()) return false;
  stopSiren();
  const dur = seconds || 600; // "until I silence it" = up to 10 minutes
  const ctx = audioCtx, t0 = ctx.currentTime + 0.03, oscs = [];
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.15);
  master.gain.setValueAtTime(Math.max(0.001, vol), t0 + dur - 0.3);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  master.connect(ctx.destination);
  const mk = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; oscs.push(o); return o; };
  if (kind === 'siren') {
    const o = mk('sawtooth', 520), g = ctx.createGain(); g.gain.value = 0.28;
    o.connect(g).connect(master);
    for (let t = 0; t < dur; t += 2) {
      o.frequency.setValueAtTime(520, t0 + t);
      o.frequency.linearRampToValueAtTime(1150, t0 + t + 1);
      o.frequency.linearRampToValueAtTime(520, t0 + t + 2);
    }
  } else if (kind === 'alarm') {
    const o = mk('square', 1000), g = ctx.createGain(); g.gain.value = 0;
    o.connect(g).connect(master);
    for (let t = 0; t < dur; t += 1.2) for (let k = 0; k < 3; k++) {
      const s = t0 + t + k * 0.26;
      g.gain.setValueAtTime(0.16, s); g.gain.setValueAtTime(0, s + 0.17);
    }
  } else if (kind === 'eas') {
    const g = ctx.createGain(); g.gain.value = 0;
    [853, 960].forEach((f) => mk('sine', f).connect(g));
    g.connect(master);
    for (let t = 0; t < dur; t += 9) { g.gain.setValueAtTime(0.22, t0 + t); g.gain.setValueAtTime(0, t0 + t + 8); }
  } else { // chime
    for (let t = 0; t < dur; t += 2.4) [988, 784, 659].forEach((f, i) => {
      const o = mk('sine', f), g = ctx.createGain(), s = t0 + t + i * 0.32;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.3, s + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.6);
      o.connect(g).connect(master); o.start(s); o.stop(s + 0.65);
    });
  }
  oscs.forEach((o) => { if (kind !== 'chime') { o.start(t0); o.stop(t0 + dur + 0.05); } });
  const stop = () => {
    try { const n = ctx.currentTime; master.gain.cancelScheduledValues(n); master.gain.setValueAtTime(0, n); } catch (e) {}
    try { master.disconnect(); } catch (e) {}
    oscs.forEach((o) => { try { o.stop(); } catch (e) {} });
    if (sirenStop === stop) sirenStop = null;
  };
  sirenStop = stop;
  setTimeout(() => { if (sirenStop === stop) sirenStop = null; }, (dur + 1) * 1000);
  return true;
}
function playChime() {
  if (!audioLive()) return;
  const t0 = audioCtx.currentTime, v = Math.max(0.05, S.vol) * 0.25;
  [880, 660].forEach((f, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = f; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
    g.gain.exponentialRampToValueAtTime(v, t0 + i * 0.35 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.33);
    o.connect(g).connect(audioCtx.destination); o.start(t0 + i * 0.35); o.stop(t0 + i * 0.35 + 0.35);
  });
}
function stopSiren() {
  if (sirenStop) sirenStop();
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
async function notify(title, body, tag) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body, tag, requireInteraction: true, vibrate: [500, 250, 500, 250, 900], icon: '/icon-192.png', badge: '/icons/badge-96.png' };
    const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch (e) {}
}
function buzz() { try { if (navigator.vibrate) navigator.vibrate([600, 300, 600, 300, 600, 300, 1200]); } catch (e) {} }
// Silence on the first touch of the button (not on release), and end a test right away.
function silence(e) {
  if (e && e.type === 'pointerdown' && e.button > 0) return;
  stopSiren();
  acked = new Set(currentHomeIds);
  $('#homeBanner').classList.remove('is-flash');
  if (testMode) { clearTimeout(testTimer); testMode = false; renderTornado(); }
}
$('#hbAck').addEventListener('pointerdown', silence);
$('#hbAck').addEventListener('click', silence);
let testTimer = null;
async function runTest() {
  if (!audioLive()) await unlockAudio();
  testMode = true; renderTornado(); playAlarm(S.snd, 8); buzz();
  clearTimeout(testTimer);
  testTimer = setTimeout(() => { testMode = false; stopSiren(); renderTornado(); }, 8000);
}
$('#testBtn').addEventListener('click', runTest);
async function wake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', wake); wake();

