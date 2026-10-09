/* Isaias Watch (public), part 2 of 3: map, storm track, wind. */
'use strict';
// ---------- Map ----------
const map = L.map('map', { zoomControl: true, minZoom: 3, maxZoom: 12, dragging: !TOUCH, doubleClickZoom: !TOUCH, touchZoom: true }).setView([27.6, -90.2], 6);
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
map.createPane('borders').style.zIndex = 440;
map.getPane('borders').style.pointerEvents = 'none';
map.createPane('labels').style.zIndex = 450;
map.getPane('labels').style.pointerEvents = 'none';
map.createPane('sirenC').style.zIndex = 455;
map.getPane('sirenC').style.pointerEvents = 'none';
map.createPane('cities').style.zIndex = 610;
map.createPane('top').style.zIndex = 620;
map.createPane('mine').style.zIndex = 640;
(async () => {
  try {
    const us = await loadAtlas();
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
$('#tSat').checked = false;

const OFFSETS = SMALL ? [50, 40, 30, 20, 10, 0] : [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];
const radarFrames = OFFSETS.map(() => L.tileLayer('', { pane: 'radar', opacity: 0, maxNativeZoom: 10, maxZoom: 12 }));
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
  const t = new Date(Math.floor((radarStamp - 5 * 60000) / 300000) * 300000 - OFFSETS[i] * 60000);
  // Same width on every frame (the "latest" tag keeps its space when hidden), so the bar never reflows mid-loop.
  $('#frameTime').innerHTML = `${dual(fmtTime(t), shortTime(t))}<span class="ft-tag"${i === OFFSETS.length - 1 ? '' : ' data-off'}>latest</span>`;
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

// Your place: dot with a permanent label and a 50-mile ring. Other saved places: hollow dots.
const R50 = RADIUS_MI * 1609.344;
const mineLayer = L.layerGroup().addTo(map);
const savedLayer = L.layerGroup().addTo(map);
function drawLocMarkers() {
  mineLayer.clearLayers();
  const loc = activeLoc();
  if (loc) {
    L.circle([loc.lat, loc.lon], { radius: R50, color: '#4cc3d9', weight: 1.2, dashArray: '5 6', fill: false, pane: 'top', interactive: false }).addTo(mineLayer);
    L.circleMarker([loc.lat, loc.lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#4cc3d9', fillOpacity: 1, pane: 'mine' })
      .bindTooltip(loc.short, { permanent: true, direction: 'right', className: 'town town-mine', offset: [7, 0] }).addTo(mineLayer);
  }
  drawSavedMarkers();
  drawWindMine();
  renderCities();
}
function drawSavedMarkers() {
  savedLayer.clearLayers();
  for (const l of S.locs) {
    if (l.id === S.act) continue;
    L.circleMarker([l.lat, l.lon], { radius: 5, color: '#4cc3d9', weight: 2, fillColor: '#0a0f14', fillOpacity: 1, pane: 'mine' })
      .bindTooltip(`${l.short} · tap to watch`, { direction: 'right', className: 'town', offset: [6, 0] })
      .on('click', () => { S.act = l.id; save(); applyLocation({ fly: false }); })
      .addTo(savedLayer);
  }
}

// Major-city dots: label on hover/tap, pin to keep the label, "Watch" to switch the dashboard there.
const cityLayer = L.layerGroup().addTo(map);
const pinIcon = '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 1.5 14.5 5.5 12 6.5 9 9.5 9.5 13 8 14.5 5.2 11.7 2 15 1 14l3.3-3.2L1.5 8 3 6.5l3.5.5 3-3Z" fill="currentColor"/></svg>';
const placeKey = (p) => `${p.name}|${p.st}`;
function renderCities() {
  cityLayer.clearLayers();
  if (!$('#tCity').checked) return;
  const loc = activeLoc();
  for (const p of PLACES) {
    if (loc && miles(loc, p) < 6) continue; // your own place already has a labeled dot
    const k = placeKey(p), pinned = S.pins.includes(k);
    const html = `<span class="city-dot"></span><span class="city-lab"><span class="city-name">${esc(p.name)}</span><button type="button" class="city-pin" data-act="pin" aria-label="${pinned ? 'Unpin' : 'Pin'} ${esc(p.name)} label" title="${pinned ? 'Pinned' : 'Pin this label'}">${pinIcon}</button><button type="button" class="city-unpin" data-act="unpin">Unpin</button><button type="button" class="city-go" data-act="watch">Watch</button></span>`;
    const m = L.marker([p.lat, p.lon], {
      pane: 'cities', interactive: false, keyboard: false, riseOnHover: true,
      icon: L.divIcon({ className: `city${pinned ? ' is-pinned' : ''}`, html, iconSize: [14, 14], iconAnchor: [7, 7] }),
    }).addTo(cityLayer);
    m.once('add', () => { const el = m.getElement(); if (el) { el.dataset.k = k; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', p.name); } });
    const el = m.getElement(); if (el) { el.dataset.k = k; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', p.name); }
  }
}
const cityPane = map.getPane('cities');
function closeCities(except) { $$('.city.is-open, .city.is-confirm', cityPane).forEach((el) => { if (el !== except) el.classList.remove('is-open', 'is-confirm'); }); }
function cityAct(el, act) {
  const k = el.dataset.k;
  const p = PLACES.find((x) => placeKey(x) === k);
  if (!p) return;
  if (act === 'pin') {
    if (S.pins.includes(k)) { el.classList.add('is-confirm', 'is-open'); return; } // pinned: tapping the pin offers "Unpin"
    S.pins.push(k); save(); el.classList.add('is-pinned'); el.classList.remove('is-open');
  } else if (act === 'unpin') {
    S.pins = S.pins.filter((x) => x !== k); save(); el.classList.remove('is-pinned', 'is-confirm', 'is-open');
  } else if (act === 'watch') {
    addPlace({ short: p.name, st: p.st, lat: p.lat, lon: p.lon });
  } else {
    const open = !el.classList.contains('is-open');
    closeCities(el);
    el.classList.toggle('is-open', open);
    el.classList.remove('is-confirm');
    if (open) el.style.zIndex = 2000;
  }
}
L.DomEvent.on(cityPane, 'click', (e) => {
  const el = e.target.closest('.city');
  if (!el) return;
  L.DomEvent.stop(e);
  const b = e.target.closest('[data-act]');
  cityAct(el, b ? b.dataset.act : 'toggle');
});
L.DomEvent.on(cityPane, 'keydown', (e) => {
  const el = e.target.closest('.city');
  if (el && (e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); cityAct(el, 'toggle'); }
});
L.DomEvent.disableClickPropagation(cityPane);
map.on('click', () => closeCities());
// Zoomed way out the dots pile up, so only pinned ones stay until you zoom in a little.
function cityZoomClass() { map.getContainer().classList.toggle('cities-far', map.getZoom() < 4); }
map.on('zoomend', cityZoomClass); cityZoomClass();
$('#tCity').addEventListener('change', renderCities);

// Alarm counties outlined on the map so you can see exactly what will set it off.
const sirenLayer = L.layerGroup().addTo(map);
function drawSirenCounties() {
  sirenLayer.clearLayers();
  for (const same of S.cty) {
    const c = CTY_BY_SAME.get(same);
    if (!c) { const st = stateBySame(same); if (st) loadState(st).then(drawSirenCounties).catch(() => {}); continue; }
    for (const r of c.rings) {
      const ll = []; for (let i = 0; i < r.length; i += 2) ll.push([r[i + 1], r[i]]);
      L.polygon(ll, { pane: 'sirenC', color: '#ffffff', weight: 2.2, dashArray: '2 5', fill: false, interactive: false }).addTo(sirenLayer);
    }
  }
}

// NHC layers
const nhcLayer = L.layerGroup().addTo(map);
const wwLayer = L.layerGroup().addTo(map);
const windLayer = L.layerGroup().addTo(map);
const warnLayer = L.layerGroup().addTo(map);
let stormMarker = null;
let coneBounds = null;
$('#tSat').addEventListener('change', (e) => e.target.checked ? satLayer.addTo(map) : map.removeLayer(satLayer));
$('#tRad').addEventListener('change', () => showFrame(frame));
$('#tNhc').addEventListener('change', (e) => e.target.checked ? nhcLayer.addTo(map) : map.removeLayer(nhcLayer));
$('#tWind').addEventListener('change', (e) => e.target.checked ? windLayer.addTo(map) : map.removeLayer(windLayer));
$('#tWarn').addEventListener('change', (e) => {
  [warnLayer, wwLayer, sirenLayer].forEach((l) => (e.target.checked ? l.addTo(map) : map.removeLayer(l)));
  renderAlertLegend();
});

// One-time helper bubble over the layer switches.
(function layerHelper() {
  if (S.tips.layers) return;
  const toggles = $('.card-map .layer-toggles');
  const tip = document.createElement('div');
  tip.className = 'layer-tip'; tip.setAttribute('role', 'note');
  tip.innerHTML = '<button class="layer-tip-x" type="button" aria-label="Dismiss tip">×</button><b>Map layers</b>Use these switches to turn layers on and off. Everything starts on except Satellite.';
  toggles.appendChild(tip);
  const close = () => { tip.remove(); S.tips.layers = 1; save(); };
  tip.querySelector('button').addEventListener('click', close);
  toggles.addEventListener('change', close, { once: true });
})();

$$('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
function setView(v) {
  const loc = activeLoc();
  if (v === 'loc' && loc) map.setView([loc.lat, loc.lon], 9);
  else {
    const pts = [];
    if (loc) pts.push([loc.lat, loc.lon]);
    if (storm) pts.push([storm.lat, storm.lon]);
    const b = pts.length ? L.latLngBounds(pts) : null;
    if (coneBounds) { if (b) b.extend(coneBounds); }
    const fb = b || coneBounds;
    if (fb && fb.isValid()) map.fitBounds(fb, { padding: [20, 20], maxZoom: 8 });
  }
}
function cycloneIcon(isHu) {
  const c = isHu ? '#ff4d4d' : '#ffd23f';
  const svg = `<svg width="34" height="34" viewBox="-17 -17 34 34" aria-hidden="true"><g fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><path d="M0 -6 A6 6 0 0 1 6 0 C 6 6 0 13 -8 14"/><path d="M0 6 A6 6 0 0 1 -6 0 C -6 -6 0 -13 8 -14"/></g><circle r="3.2" fill="${c}"/></svg>`;
  return L.divIcon({ html: svg, className: 'cyclone-icon', iconSize: [34, 34], iconAnchor: [17, 17] });
}

// ---------- Storm status ----------
let storm = null;
async function loadStorm() {
  try {
    const d = await getJSON('/api/watch?src=nhc');
    const s = (d.activeStorms || []).find((x) => (x.name || '').toLowerCase() === STORM_NAME.toLowerCase()) || null;
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
    updateDistances();
    setStat('sAdv', `NHC advisory ${String(s.publicAdvisory?.advNum || '').replace(/^0+/, '')} · ${fmtDayTime(s.publicAdvisory?.issuance || s.lastUpdate)}`);
    document.title = `${s.name} ${mph} mph · Isaias Watch`;
    if (!stormMarker) stormMarker = L.marker([storm.lat, storm.lon], { icon: cycloneIcon(mph >= 74), pane: 'top', zIndexOffset: 1000 }).addTo(map);
    else { stormMarker.setLatLng([storm.lat, storm.lon]); stormMarker.setIcon(cycloneIcon(mph >= 74)); }
    stormMarker.bindTooltip(`${esc(s.name)} · ${mph} mph · ${esc(s.pressure)} mb`, { direction: 'top', className: 'town' });
    placeWindStorm();
    mark('nhc', true, 'NHC');
  } catch (e) { mark('nhc', false, 'NHC'); throw e; }
}
function updateDistances() {
  const loc = activeLoc();
  if (!loc || !storm) { setStat('sDist', '--'); setStat('sDistMi', '--'); return; }
  const p = { lat: storm.lat, lon: storm.lon };
  const d = Math.round(miles(p, loc));
  setStat('sDist', `${d} mi ${compass(bearing(loc, p))}`);
  setStat('sDistMi', `${d} mi`);
}

// ---------- NHC GIS ----------
const GIS = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';
const WW_EVENT = { HWR: 'Hurricane Warning', HWA: 'Hurricane Watch', TWR: 'Tropical Storm Warning', TWA: 'Tropical Storm Watch', SSW: 'Storm Surge Warning', SSA: 'Storm Surge Watch' };
let wwEvents = [];
let mapEvents = new Map();
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
    const [pts, line, cone, ww, pastLine, windNow] = await Promise.all([q(base + 2), q(base + 3), q(base + 4), q(base + 5), q(base + 8), q(base + 13)]);
    nhcLayer.clearLayers(); windLayer.clearLayers(); wwLayer.clearLayers();
    const coneL = L.geoJSON(cone, { style: { color: '#ffffff', weight: 1.2, dashArray: '4 4', fillColor: '#ffffff', fillOpacity: 0.1 } }).addTo(nhcLayer);
    try { coneBounds = coneL.getBounds().isValid() ? coneL.getBounds() : null; } catch (e) { coneBounds = null; }
    L.geoJSON(pastLine, { style: { color: '#9aa7b3', weight: 2 } }).addTo(nhcLayer);
    L.geoJSON(line, { style: { color: '#ffffff', weight: 1.6, dashArray: '2 5' } }).addTo(nhcLayer);
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
  const loc = activeLoc();
  if (!loc) { $('#closest').innerHTML = 'Pick your place to see how close the forecast track comes to it.'; setStat('sPass', '--'); return; }
  let best = null;
  for (let i = 0; i < fcstPoints.length - 1; i++) {
    const a = fcstPoints[i], b = fcstPoints[i + 1];
    for (let k = 0; k <= 20; k++) {
      const f = k / 20;
      const pt = { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
      const d = miles(pt, loc);
      if (!best || d < best.d) best = { d, pt, a, b, f };
    }
  }
  if (best) {
    const side = compass(bearing(loc, best.pt));
    const tA = parseValid(best.a.validtime), tB = parseValid(best.b.validtime);
    const at = tA && tB ? new Date(tA.getTime() + (tB - tA) * best.f) : null;
    const when = at ? fmtDayTime(at) : best.a.datelbl;
    const whenS = at ? shortDayTime(at) : best.a.datelbl;
    const mph = nhcMph(best.a.maxwind + (best.b.maxwind - best.a.maxwind) * best.f);
    const n = esc(loc.short);
    $('#closest').innerHTML = `<span class="lg">Closest forecast pass to ${n}: <b>${Math.round(best.d)} mi ${side}</b> around <b>${esc(when)}</b>, center winds near ${mph} mph. Track errors at 2–3 days average 70–100 mi, so treat the whole cone as in play.</span><span class="sh">Closest pass to ${n}: <b>${Math.round(best.d)} mi ${side}</b>, <b>${esc(whenS)}</b>, ~${mph} mph winds. The whole cone is still in play.</span>`;
    setStat('sPass', at ? `${Math.round(best.d)} mi · ${weekday(at)} ${new Date(Math.round(at.getTime() / 3600e3) * 3600e3).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric' })}` : `${Math.round(best.d)} mi ${side}`);
  }
}
function parseValid(v) {
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
    const g = await getJSON(`/api/watch?src=gfx&bin=${bin}`);
    $('#gfxLink').href = g.page;
    const items = [['keyMessages', 'Key messages'], ['cone', '5-day cone'], ['surge', 'Peak surge'], ['windProbs', 'TS wind odds'], ['arrival', 'TS wind arrival']].filter(([k]) => g[k]);
    $('#gfx').innerHTML = items.map(([k, label]) => `<a href="${esc(full(g[k]))}" target="_blank" rel="noopener"><img src="${esc(full(g[k]))}" alt="NHC ${esc(label)} graphic" loading="lazy">${esc(label)}</a>`).join('');
    mark('gfx', true, 'NHC graphics');
  } catch (e) { mark('gfx', false, 'NHC graphics'); }
}

// ---------- Windy (desktop) ----------
let windyOv = 'wind';
let windyCenter = null;
function setWindy(force) {
  if (SMALL) return;
  const loc = activeLoc();
  const ref = loc || { lat: 30.4, lon: -89.1 };
  const lat = storm ? (storm.lat + ref.lat) / 2 : 28.5;
  const lon = storm ? (storm.lon + ref.lon) / 2 : -90;
  const key = `${windyOv}|${lat.toFixed(1)}|${lon.toFixed(1)}|${ref.lat}|${ref.lon}`;
  if (!force && key === windyCenter) return;
  windyCenter = key;
  $('#windy').src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=%C2%B0F&metricWind=mph&zoom=5&overlay=${windyOv}&product=ecmwf&level=surface&lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&detailLat=${ref.lat}&detailLon=${ref.lon}&marker=${loc ? 'true' : 'false'}&pressure=true&message=true`;
}
$$('[data-ov]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-ov]').forEach((x) => x.classList.toggle('is-on', x === b));
  windyOv = b.dataset.ov;
  if (SMALL) { wField = windyOv === 'gust' ? 'gust' : 'speed'; renderWind(); } else setWindy(true);
}));

