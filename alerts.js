/* Isaias Watch (public), part 3 of 3: alerts, tornadoes, updates, conditions, alert status, settings, schedule. */
'use strict';
// ---------- Alerts ----------
let alertsAll = [];
let seenAlertIds = null;
let newIds = new Set();
let alertsOkAt = 0;
let alertsArea = '';
const feedItems = new Map();
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
function areaStates() {
  const set = new Set();
  const loc = activeLoc();
  if (loc && loc.st && /^[A-Z]{2}$/.test(loc.st)) set.add(loc.st);
  for (const c of REG.list) set.add(c.st);
  for (const same of S.cty) { const st = stateBySame(same); if (st) set.add(st); }
  return set.size ? [...set].sort() : DEFAULT_AREA;
}
// Tornado warnings are listed for every state the storm threatens (any hurricane, tropical storm or storm surge
// watch or warning), not only the states around your places. Those extra states get their own small query so the
// map doesn't have to draw every zone in them.
const US_ST = new Set(Object.values(ABBR));
const TROPICAL = ['Hurricane Warning', 'Hurricane Watch', 'Tropical Storm Warning', 'Tropical Storm Watch', 'Storm Surge Warning', 'Storm Surge Watch'];
let stormStates = [...DEFAULT_AREA];
let torExtra = [];
async function loadStormStates() {
  const d = await getJSON(`https://api.weather.gov/alerts/active?event=${TROPICAL.map(encodeURIComponent).join(',')}`, { headers: NWS_HEADERS });
  const set = new Set();
  for (const f of d.features || []) for (const u of f.properties.geocode?.UGC || []) { const st = u.slice(0, 2); if (US_ST.has(st)) set.add(st); }
  if (set.size) stormStates = [...set].sort();
}
const orList = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} or ${a[a.length - 1]}`);
const torStates = () => [...new Set([...areaStates(), ...stormStates])].sort();
async function loadTornadoExtra() {
  const have = new Set(areaStates());
  const extra = stormStates.filter((st) => !have.has(st));
  if (!extra.length) { torExtra = []; return; }
  const d = await getJSON(`https://api.weather.gov/alerts/active?event=${encodeURIComponent('Tornado Warning')}&area=${extra.join(',')}`, { headers: NWS_HEADERS });
  torExtra = dedupe(d.features || []);
}
async function loadAlerts() {
  const area = areaStates().join(',');
  try {
    const d = await getJSON(`https://api.weather.gov/alerts/active?area=${area}`, { headers: NWS_HEADERS });
    if (area !== alertsArea) { seenAlertIds = null; alertsArea = area; } // new area: don't flood the feed with "new" alerts
    alertsAll = dedupe(d.features || []);
    const ids = new Set(alertsAll.map((f) => f.properties.id));
    if (seenAlertIds) {
      newIds = new Set([...ids].filter((x) => !seenAlertIds.has(x)));
      for (const f of alertsAll) if (newIds.has(f.properties.id)) maybeFeedAlert(f);
    }
    seenAlertIds = new Set([...(seenAlertIds || []), ...ids]);
    alertsOkAt = Date.now();
    try { await loadTornadoExtra(); } catch (e) { /* keep the last list */ }
    renderRegions(); renderTornado(); drawWarnings(); checkExtras();
    mark('alerts', true, 'NWS alerts');
  } catch (e) { mark('alerts', false, 'NWS alerts'); throw e; } finally { renderStatus(); }
}
function sameOf(f) { return f.properties.geocode?.SAME || []; }
function eventRank(ev) { const i = EVENT_ORDER.indexOf(ev); return i < 0 ? 100 : i; }
function eventColor(ev, sev) { return EVENT_COLOR[ev] || ({ Extreme: '#ff3b3b', Severe: '#ff8c00', Moderate: '#ffd700', Minor: '#8fbc8f' }[sev] || '#8797a6'); }
function kind(ev) { return /Warning|Emergency/.test(ev) ? 'warn' : /Watch/.test(ev) ? 'watch' : 'adv'; }
const isHomeCty = (c) => REG.home.has(c) || S.cty.includes(c);

let floodCount = null;
function renderRegions() {
  const el = $('#listLoc');
  const loc = activeLoc();
  if (!loc) {
    $('#tallyLoc').innerHTML = '';
    el.innerHTML = '<div class="empty"><button class="btn btn-accent" type="button" data-pick>Pick your place</button> to see every warning, watch and advisory within 50 miles of it.</div>';
    floodCount = null; renderFlood();
    return;
  }
  if (!REG.list.length) { el.innerHTML = '<div class="empty">Finding the counties and parishes around ' + esc(loc.short) + '…</div>'; return; }
  const groups = new Map();
  for (const f of alertsAll) {
    const p = f.properties;
    if (SKIP_EVENTS.has(p.event)) continue;
    const hit = sameOf(f).filter((c) => REG.same.has(c));
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
  floodCount = { warn: 0, watch: 0 };
  list.forEach((g) => { const k = kind(g.event); if (isFlood(g.event) && k !== 'adv') floodCount[k]++; });
  const tally = { warn: 0, watch: 0, adv: 0 };
  list.forEach((g) => tally[kind(g.event)]++);
  $('#tallyLoc').innerHTML = `<span class="t-warn${tally.warn ? '' : ' zero'}">${tally.warn} warning${tally.warn === 1 ? '' : 's'}</span><span class="t-watch${tally.watch ? '' : ' zero'}">${tally.watch} watch${tally.watch === 1 ? '' : 'es'}</span><span class="t-adv${tally.adv ? '' : ' zero'}">${tally.adv} other</span>`;
  if (!list.length) {
    el.innerHTML = `<div class="empty calm">${dual(`No active NWS warnings, watches, or advisories for these ${REG.list.length} counties and parishes.`, 'All clear. No active warnings or watches.')}</div>`;
    renderFlood();
    return;
  }
  const openState = new Set($$('details[open]', el).map((d) => d.dataset.k));
  el.innerHTML = list.map((g) => {
    const counties = [...g.counties].sort((a, b) => (isHomeCty(b) - isHomeCty(a)) || ctyName(a).localeCompare(ctyName(b)));
    const rep = g.alerts.slice().sort((a, b) => (b.properties.sent > a.properties.sent ? 1 : -1))[0].properties;
    const zones = [...new Set(g.alerts.map((a) => a.properties.areaDesc))].join('; ');
    const k = `loc|${g.event}`;
    const text = [rep.headline, rep.parameters?.NWSheadline?.[0], '', rep.description, rep.instruction ? '\nWHAT TO DO:\n' + rep.instruction : '', '\nZones: ' + zones]
      .filter((x) => x !== undefined && x !== null).join('\n');
    return `<article class="agroup${g.isNew ? ' is-new' : ''}"${isFlood(g.event) && kind(g.event) !== 'adv' ? ' data-flood' : ''} style="--c:${eventColor(g.event, g.sev)}">
      <div class="ag-top"><div class="ag-event">${esc(g.event)}</div><div class="ag-until">${g.open ? dual('until further notice', 'Ongoing') : untilHTML(g.ends)}</div></div>
      <div class="ag-counties">${counties.map((c) => `<span class="cty${isHomeCty(c) ? ' is-home' : ''}">${esc(ctyLabel(c, { state: REG.list.some((x) => x.st !== loc.st) }))}</span>`).join('')}</div>
      <details data-k="${esc(k)}"${openState.has(k) ? ' open' : ''}><summary>Details<span class="lg"> · ${esc(rep.senderName || 'NWS')} · issued ${esc(rel(rep.sent))}</span><span class="sh"> · ${esc(relShort(rep.sent))}</span></summary><pre class="alert-text">${esc(text)}</pre></details>
    </article>`;
  }).join('');
  renderFlood();
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-pick]')) openLocSheet(!S.locs.length); });

// ---------- Tornadoes ----------
let testMode = false;
let currentHomeIds = new Set();
let acked = new Set();
const sirenedIds = new Set();
const notifiedIds = new Set();
function polyRings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p) => p[0]);
  return [];
}
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > pt.lat) !== (yj > pt.lat)) && (pt.lon < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
// Reference towns for "covers X" / "12 mi from X": your place, your other saved places, and big cities nearby.
function refTowns() {
  const loc = activeLoc();
  const out = S.locs.map((l) => ({ name: l.short, lat: l.lat, lon: l.lon, w: l.id === S.act ? 0 : 2 }));
  if (loc) for (const p of PLACES) if (miles(loc, p) < 90) out.push({ name: p.name, lat: p.lat, lon: p.lon, w: 5 });
  return out;
}
function nearestTown(geom) {
  const rings = polyRings(geom);
  if (!rings.length) return null;
  let best = null;
  for (const t of refTowns()) {
    let d = Infinity;
    for (const r of rings) {
      if (pointInRing(t, r)) { d = 0; break; }
      for (let i = 0; i < r.length - 1; i++) d = Math.min(d, distToSegMi(t, r[i], r[i + 1]));
    }
    // Prefer your own place unless another town is clearly closer.
    if (!best || d + t.w < best.d + best.w) best = { town: t.name, d, w: t.w };
  }
  return best;
}
function motion(p) {
  const s = p.parameters?.eventMotionDescription?.[0];
  const m = s && /\.\.\.(\d{1,3})DEG\.\.\.(\d{1,3})KT/.exec(s);
  if (!m) return null;
  const toward = (+m[1] + 180) % 360;
  return `moving ${compass(toward)} at ${ktToMph(+m[2])} mph`;
}
function tornadoTier(f) {
  const nt = nearestTown(f.geometry);
  const same = sameOf(f);
  if (same.some((c) => S.cty.includes(c))) return { tier: 'home', nt };
  if (same.some((c) => REG.same.has(c))) return { tier: 'near', nt };
  return { tier: 'other', nt };
}
const TIER_RANK = { home: 0, near: 1, other: 2 };
function fakeTornado() {
  const now = Date.now();
  const loc = activeLoc() || { lat: 31.33, lon: -89.29, short: 'your area' };
  const same = S.cty[0] || (REG.list[0] && REG.list[0].same) || '000000';
  const d = 0.12;
  return {
    geometry: { type: 'Polygon', coordinates: [[[loc.lon - d * 1.4, loc.lat - d], [loc.lon + d, loc.lat - d * 0.6], [loc.lon + d * 0.8, loc.lat + d], [loc.lon - d * 1.4, loc.lat + d * 0.5], [loc.lon - d * 1.4, loc.lat - d]]] },
    properties: {
      id: 'test-tornado', event: 'Tornado Warning', areaDesc: `${S.cty.length ? S.cty.map((c) => ctyLabel(c)).join('; ') : loc.short} (TEST — not a real warning)`,
      sent: new Date(now).toISOString(), ends: new Date(now + 30 * 60000).toISOString(), expires: new Date(now + 30 * 60000).toISOString(),
      geocode: { SAME: [same] }, senderName: 'TEST', description: 'This is a test of the dashboard alert.',
      parameters: { tornadoDetection: ['RADAR INDICATED'], eventMotionDescription: [`...storm...225DEG...30KT...${loc.lat},${loc.lon}`] },
    },
  };
}
const sirenNames = () => S.cty.map((c) => ctyLabel(c, { state: false })).join(' / ');
function renderTornado() {
  const ids = new Set();
  let tors = [...alertsAll, ...torExtra].filter((f) => f.properties.event === 'Tornado Warning' && !ids.has(f.properties.id) && ids.add(f.properties.id));
  const ext = S.extra['Extreme Wind Warning'] ? alertsAll.filter((f) => f.properties.event === 'Extreme Wind Warning' && sameOf(f).some((c) => S.cty.includes(c))) : [];
  if (testMode) tors = [fakeTornado(), ...tors];
  const rows = tors.map((f) => ({ f, ...tornadoTier(f) }))
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || (b.f.properties.sent > a.f.properties.sent ? 1 : -1));
  const area = torStates();
  const loc = activeLoc();
  $('#torSubLg').textContent = `${area.join(', ')} warnings · ${S.cty.length ? 'alarm for ' + sirenNames() : 'no alarm counties yet'}`;
  $('#torSubSh').textContent = area.join(', ');
  const realCount = tors.length - (testMode ? 1 : 0);
  const tc = $('#torCount');
  tc.textContent = `${realCount} active`;
  tc.classList.toggle('is-active', realCount > 0);

  const near = loc ? loc.short : 'you';
  const watches = alertsAll.filter((f) => f.properties.event === 'Tornado Watch' && sameOf(f).some((c) => REG.same.has(c) || S.cty.includes(c)));
  const tw = $('#torWatch');
  if (watches.length) {
    const cset = new Set(); let ends = null; const nums = new Set();
    for (const w of watches) {
      sameOf(w).filter((c) => REG.same.has(c) || S.cty.includes(c)).forEach((c) => cset.add(c));
      const e = w.properties.ends || w.properties.expires; if (e && (!ends || e > ends)) ends = e;
      const v = (w.properties.parameters?.VTEC || [])[0] || ''; const m = /\.TO\.A\.(\d{4})\./.exec(v); if (m) nums.add(+m[1]);
    }
    const homeIn = [...cset].some((c) => S.cty.includes(c));
    tw.classList.add('is-active');
    tw.innerHTML = `<strong>Tornado Watch${nums.size ? ' #' + [...nums].join(', #') : ''}</strong> ${homeIn ? `<b>includes ${esc(sirenNames())}</b>` : `near ${esc(near)}`} · ${untilHTML(ends)}<div class="ag-counties">${[...cset].sort((a, b) => ctyName(a).localeCompare(ctyName(b))).map((c) => `<span class="cty${S.cty.includes(c) ? ' is-home' : ''}">${esc(ctyLabel(c, { state: false }))}</span>`).join('')}</div>`;
  } else {
    tw.classList.remove('is-active');
    tw.innerHTML = loc ? dual(`No tornado watch in effect within 50 miles of ${near}.`, `No tornado watch near ${near}.`) : 'Pick your place to check for tornado watches near it.';
  }

  const list = $('#torList');
  if (!rows.length) {
    list.innerHTML = `<div class="empty calm">${dual(`No tornado warnings in ${orList(area)} right now.`, `No tornado warnings in ${orList(area)}.`)}</div>`;
  } else {
    list.innerHTML = rows.map(({ f, tier, nt }) => {
      const p = f.properties;
      const txt = `${p.description || ''}`;
      const emergency = /TORNADO EMERGENCY/i.test(txt) || /CATASTROPHIC/i.test((p.parameters?.tornadoDamageThreat || [])[0] || '');
      const pds = /CONSIDERABLE/i.test((p.parameters?.tornadoDamageThreat || [])[0] || '') || /PARTICULARLY DANGEROUS/i.test(txt);
      const detection = (p.parameters?.tornadoDetection || [])[0];
      const hitNames = sameOf(f).filter((c) => S.cty.includes(c)).map((c) => ctyLabel(c, { state: false })).join(' / ');
      const flag = emergency ? '<span class="tw-flag emergency">Tornado emergency</span>'
        : tier === 'home' ? `<span class="tw-flag">${esc(hitNames)}</span>`
        : tier === 'near' ? `<span class="tw-flag flag-near">Near ${esc(near)}</span>`
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

  // Banner + alarm for your counties (tornado warnings, plus extreme wind warnings if that's on)
  const homeRows = [...rows.filter((r) => r.tier === 'home'), ...ext.map((f) => ({ f, tier: 'home', nt: nearestTown(f.geometry), ext: true }))];
  currentHomeIds = new Set(homeRows.map((r) => r.f.properties.id));
  const banner = $('#homeBanner');
  if (homeRows.length) {
    const r0 = homeRows[0], p = r0.f.properties;
    const mv = motion(p);
    banner.hidden = false;
    banner.classList.toggle('is-ext', !!r0.ext);
    const hit = sameOf(r0.f).filter((c) => S.cty.includes(c)).map((c) => ctyLabel(c, { state: false })).join(' / ');
    const nt0 = r0.nt;
    $('#hbKicker').textContent = `${r0.ext ? 'Extreme wind warning' : 'Tornado warning'} · ${hit}${nt0 ? (nt0.d === 0 ? ` · covers ${nt0.town}` : ` · ${Math.round(nt0.d)} mi from ${nt0.town}`) : ''}${testMode && p.id === 'test-tornado' ? ' · TEST' : ''}`;
    $('#hbTitle').textContent = 'Take shelter now';
    $('#hbDetail').textContent = [p.areaDesc, mv, untilText(p.ends || p.expires)].filter(Boolean).join(' · ');
    banner.classList.toggle('is-flash', homeRows.some((r) => !acked.has(r.f.properties.id)));
    for (const r of homeRows) {
      const id = r.f.properties.id;
      if (id === 'test-tornado') continue;
      if (!sirenedIds.has(id)) { sirenedIds.add(id); if (S.armed) playAlarm(); buzz(); }
      if (!notifiedIds.has(id)) { notifiedIds.add(id); notify(`${r.ext ? 'EXTREME WIND WARNING' : 'TORNADO WARNING'} — ${hit}`, `${r.f.properties.areaDesc}. ${mv || ''}`, id); }
    }
  } else {
    banner.hidden = true;
  }
}
// Optional alert types (chime + notification) for your counties.
const extraSeen = new Set();
let extrasPrimed = false;
function checkExtras() {
  for (const f of alertsAll) {
    const p = f.properties, ev = p.event;
    const conf = EXTRAS.find((x) => x[0] === ev);
    if (!conf || conf[1] !== 'chime' || !S.extra[ev]) continue;
    if (!sameOf(f).some((c) => S.cty.includes(c))) continue;
    if (extraSeen.has(p.id)) continue;
    extraSeen.add(p.id);
    if (!extrasPrimed) continue; // don't chime for alerts that were already out when the page opened
    if (S.armed) playChime();
    notify(`${ev} — ${sameOf(f).filter((c) => S.cty.includes(c)).map((c) => ctyLabel(c, { state: false })).join(' / ')}`, p.headline || p.areaDesc, p.id);
  }
  extrasPrimed = true;
}

// ---------- Watches & warnings on the map ----------
const STORM_BASED = new Set(['Tornado Warning', 'Severe Thunderstorm Warning', 'Flash Flood Warning', 'Extreme Wind Warning', 'Flood Warning', 'Snow Squall Warning']);
const isWatchWarning = (ev) => /Warning|Watch|Emergency/.test(ev) && !SKIP_EVENTS.has(ev);
const isFlood = (ev) => /Flood/.test(ev);
const zoneShapes = new Map();
const zoneQueue = [];
let zoneBusy = 0, redrawTimer = null;
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
  const zoneRe = new RegExp(`/(${areaStates().join('|')})[ZC]\\d{3}$`);
  const zones = new Map();
  const outlines = [];
  for (const f of alertsAll) {
    const p = f.properties;
    if (!isWatchWarning(p.event)) continue;
    if (f.geometry && STORM_BASED.has(p.event)) { outlines.push(f); continue; }
    const urls = (p.affectedZones || []).filter((u) => zoneRe.test(u));
    for (const u of urls) {
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
  const hits = sameOf(f).filter((c) => REG.same.has(c) || S.cty.includes(c));
  const isTor = p.event === 'Tornado Warning';
  if (!isTor && !hits.length) return;
  const names = [...new Set(hits.map((c) => ctyLabel(c)))];
  feedItems.set('alert:' + p.id, {
    id: 'alert:' + p.id, cat: 'alert', src: 'New alert', time: p.sent,
    title: `${p.messageType === 'Update' ? 'Updated' : 'New'}: ${p.event}`,
    lines: [names.length ? names.join(', ') : p.areaDesc],
    text: [p.headline, p.description, p.instruction].filter(Boolean).join('\n\n'),
  });
  renderFeed();
}

// ---------- Products: NHC + your local NWS office's hurricane statement ----------
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
const PROPER_BASE = ['Isaias', 'Mississippi', 'Louisiana', 'Alabama', 'Florida', 'Texas', 'Georgia', 'Tennessee', 'Arkansas', 'Gulf', 'Gulf Coast', 'New Orleans', 'Hattiesburg', 'Gulfport', 'Biloxi', 'Mobile Bay', 'Mobile',
  'Pascagoula', 'Bay St. Louis', 'Pensacola', 'Panama City', 'Tallahassee', 'Baton Rouge', 'Lafayette', 'Lake Charles', 'Houston', 'Mexico', 'Yucatan', 'Lake Pontchartrain', 'Florida Panhandle', 'Big Bend', 'Air Force', 'NOAA', 'NHC', 'NWS', 'U.S.',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Category'];
function properCase(h) {
  let out = h;
  const words = [...PROPER_BASE, ...S.locs.map((l) => l.short)];
  for (const w of words) out = out.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![A-Za-z])`, 'gi'), w);
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
const OFFICE_NAME = { LIX: 'New Orleans', JAN: 'Jackson', MOB: 'Mobile', TAE: 'Tallahassee', LCH: 'Lake Charles', HGX: 'Houston', BMX: 'Birmingham', MEG: 'Memphis', SHV: 'Shreveport', TBW: 'Tampa Bay', JAX: 'Jacksonville', FFC: 'Atlanta', CRP: 'Corpus Christi', BRO: 'Brownsville', MLB: 'Melbourne', MFL: 'Miami', KEY: 'Key West', CHS: 'Charleston', ILM: 'Wilmington', MHX: 'Newport/Morehead City', HUN: 'Huntsville', OHX: 'Nashville', LZK: 'Little Rock', EWX: 'Austin/San Antonio', FWD: 'Fort Worth', CAE: 'Columbia', GSP: 'Greenville-Spartanburg', RAH: 'Raleigh' };
function offices() {
  const loc = activeLoc();
  const cwa = loc && loc.nws && loc.nws.cwa;
  return cwa ? [cwa] : DEFAULT_OFFICES;
}
async function loadProducts() {
  const bin = (storm && storm.bin) || 'AT4';
  const jobs = [['TCP', bin, 4, 'nhc', 'NHC advisory'], ['TCU', bin, 3, 'nhc', 'NHC update'], ['TCD', bin, 2, 'nhc', 'NHC discussion'],
    ...offices().map((o) => ['HLS', o, 2, 'nws', `NWS ${OFFICE_NAME[o] || o}`])];
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
  const loc = activeLoc();
  try {
    const d = await getJSON(`/api/watch?src=news${loc && /^[A-Z]{2}$/.test(loc.st) ? '&st=' + loc.st : ''}`);
    for (const n of d.items || []) {
      const id = 'news:' + n.title;
      if (!feedItems.has(id)) feedItems.set(id, { id, cat: 'news', src: n.source || 'News', time: n.time, title: n.title, link: n.link });
    }
    renderFeed();
    mark('news', true, 'News');
  } catch (e) { mark('news', false, 'News'); }
}

// ---------- Feed ----------
let feedFilter = 'all';
$$('[data-f]').forEach((b) => b.addEventListener('click', () => {
  feedFilter = b.dataset.f;
  $$('[data-f]').forEach((x) => x.classList.toggle('is-on', x === b));
  renderFeed();
}));
function renderFeed() {
  const el = $('#feed');
  const openIds = new Set($$('details[open]', el).map((d) => d.dataset.id));
  const all = [...feedItems.values()].sort((a, b) => (a.time < b.time ? 1 : -1));
  let newsCount = 0;
  const items = all.filter((it) => (it.cat !== 'news' || ++newsCount <= 20) && (feedFilter === 'all' || it.cat === feedFilter)).slice(0, 80);
  if (!items.length) { el.innerHTML = '<li class="empty">Nothing here yet.</li>'; return; }
  let newsShown = 0;
  el.innerHTML = items.map((it) => {
    const extra = it.cat === 'news' && feedFilter === 'all' && ++newsShown > 8;
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

// ---------- Conditions now: nearest stations + the next few hours ----------
function renderObsEmpty() {
  $('#obs').innerHTML = '<div class="ob ob-empty"><div class="ob-rest"><button class="btn btn-accent" type="button" data-pick>Pick your place</button> to see the latest wind, gusts and pressure there.</div></div>';
  $('#hourly').hidden = true;
}
async function stationsFor(loc) {
  const nws = await ensureNws(loc);
  if (nws.stations && nws.stations.length) return nws.stations;
  if (!nws.stationsUrl) return [];
  const d = await getJSON(nws.stationsUrl, { headers: NWS_HEADERS });
  nws.stations = (d.features || []).slice(0, 5).map((f) => ({ id: f.properties.stationIdentifier, name: f.properties.name, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
  save();
  return nws.stations;
}
function stationLabel(name) {
  return String(name || '').split(',')[0].replace(/\b(Regional|Municipal|International|Intl|County|Airport|Arpt|Field|Fld)\b/gi, '').replace(/\s{2,}/g, ' ').replace(/[-\s]+$/, '').trim();
}
let obsRetry = null;
async function loadObs() {
  const loc = activeLoc();
  if (!loc) { renderObsEmpty(); return; }
  clearTimeout(obsRetry);
  // Never leave "Pick your place" up while a place's conditions are on their way.
  if (!$('#obs .ob:not(.ob-empty)') || $('#obs').dataset.loc !== loc.id) {
    $('#obs').innerHTML = `<div class="ob"><div class="ob-name">${esc(loc.short)}</div><div class="ob-rest">Loading the latest observations…</div><div class="ob-flood"></div></div>`;
    $('#obs').classList.add('is-one');
  }
  $('#obs').dataset.loc = loc.id;
  try {
    const stations = await stationsFor(loc);
    // Ask the nearest stations at once (the weather service can be slow during a storm), then keep the first two with a fresh reading.
    const got = await Promise.all(stations.slice(0, 4).map((st) => getJSON(`https://api.weather.gov/stations/${st.id}/observations/latest`, { headers: NWS_HEADERS }).then((d) => ({ st, p: d.properties })).catch(() => null)));
    if (activeLoc() !== loc) return; // switched places meanwhile
    const cards = [];
    for (const g of got) {
      if (!g || cards.length >= 2) continue;
      const { st, p } = g;
      if (!p || p.windSpeed?.value == null) continue;
      if (Date.now() - new Date(p.timestamp).getTime() > 3 * 3600e3) continue;
      const kmh = (v) => (v == null ? null : Math.round(v * 0.621371));
      const ws = kmh(p.windSpeed.value), wg = kmh(p.windGust?.value);
      const dir = p.windDirection?.value;
      const t = p.temperature?.value; const f = t == null ? null : Math.round(t * 9 / 5 + 32);
      const mb = p.barometricPressure?.value ? (p.barometricPressure.value / 100).toFixed(1) : null;
      const dist = Math.round(miles(loc, st));
      const title = cards.length === 0 ? loc.short : stationLabel(st.name) || st.id;
      cards.push(`<div class="ob"><div class="ob-name">${esc(title)}</div><div class="ob-sid">${esc(st.id)}${dist >= 2 ? ` · ${dist} mi away` : ''} · ${dual(fmtTime(p.timestamp), shortTime(p.timestamp))}</div>
        <div class="ob-wind">${dir == null || ws === 0 ? '' : esc(compass(dir)) + ' '}${ws} mph${wg ? ` <small>gust ${wg}</small>` : ''}</div>
        <div class="ob-rest">${esc(p.textDescription || '')}${f != null ? ` · ${f}°F` : ''}${mb ? ` · ${mb} mb` : ''}</div>
        ${cards.length === 0 ? '<div class="ob-flood"></div>' : ''}</div>`);
    }
    if (!cards.length) {
      cards.push(`<div class="ob"><div class="ob-name">${esc(loc.short)}</div><div class="ob-rest">No recent reading from nearby stations yet. Trying again shortly.</div><div class="ob-flood"></div></div>`);
      obsRetry = setTimeout(() => kickObs(), 45000);
    }
    $('#obs').innerHTML = cards.join('');
    $('#obs').classList.toggle('is-one', cards.length === 1);
    renderFlood();
    mark('obs', true, 'Observations');
  } catch (e) {
    mark('obs', false, 'Observations');
    obsRetry = setTimeout(() => kickObs(), 30000); // don't wait the full 5 minutes after a hiccup
    throw e;
  }
}
async function loadHourly() {
  const loc = activeLoc();
  if (!loc) { $('#hourly').hidden = true; return; }
  try {
    const nws = await ensureNws(loc);
    if (!nws.hourly) return;
    const d = await getJSON(nws.hourly, { headers: NWS_HEADERS, timeout: 20000 });
    const per = ((d.properties || {}).periods || []).filter((p) => new Date(p.endTime).getTime() > Date.now()).slice(0, 18);
    if (!per.length) return;
    $('#hrStrip').innerHTML = per.map((p) => {
      const nums = String(p.windSpeed || '').match(/\d+/g) || [];
      const w = nums.length ? Math.max(...nums.map(Number)) : null;
      const pop = p.probabilityOfPrecipitation?.value;
      const strong = w != null && w >= 39 ? ' is-ts' : w != null && w >= 25 ? ' is-breezy' : '';
      return `<div class="hr${strong}" title="${esc(p.shortForecast || '')}"><div class="hr-t">${esc(new Date(p.startTime).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric' }).replace(' ', ''))}</div><div class="hr-w">${w != null ? `${esc(p.windDirection || '')} ${w}` : '--'}</div><div class="hr-p">${pop != null ? pop + '%' : ''}</div></div>`;
    }).join('');
    $('#hrSrc').textContent = '· wind mph · rain chance';
    $('#hourly').hidden = false;
    mark('hourly', true, 'Forecast');
  } catch (e) { mark('hourly', false, 'Forecast'); }
}
function renderFlood() {
  $$('.ob-flood').forEach((el) => {
    const c = floodCount;
    if (!c) { el.innerHTML = '<span class="fl-k">Flooding</span> <span class="fl-none">checking…</span>'; return; }
    const parts = [];
    if (c.warn) parts.push(`<span class="fl-n fl-warn">${c.warn} warning${c.warn === 1 ? '' : 's'}</span>`);
    if (c.watch) parts.push(`<span class="fl-n fl-watch">${c.watch} watch${c.watch === 1 ? '' : 'es'}</span>`);
    el.innerHTML = `<span class="fl-k">Flooding</span> ${parts.length ? parts.join(' ') + ' <a class="fl-more" href="#regionLoc">See more</a>' : '<span class="fl-none">None active</span>'}`;
  });
}
$('#obs').addEventListener('click', (e) => {
  const a = e.target.closest('.fl-more');
  if (!a) return;
  e.preventDefault();
  const sec = $('#regionLoc');
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const groups = $$('.agroup[data-flood]', sec);
  groups.forEach((g) => g.classList.remove('is-flashing'));
  setTimeout(() => {
    groups.forEach((g) => { void g.offsetWidth; g.classList.add('is-flashing'); });
    setTimeout(() => groups.forEach((g) => g.classList.remove('is-flashing')), 2800);
  }, 450);
});
setInterval(() => { renderRegions(); renderTornado(); renderFeed(); }, 60000);

// ---------- Alert status floater ----------
const astat = $('#astat'), astatPanel = $('#astatPanel'), astatPill = $('#astatPill');
function notifState() {
  if (!('Notification' in window)) return UA_IOS && !STANDALONE ? 'ios-tab' : 'none';
  return Notification.permission;
}
function renderStatus() {
  const loc = activeLoc();
  const items = [];
  let level = 'ok';
  const bump = (l) => { const r = { ok: 0, info: 1, warn: 2, bad: 3 }; if (r[l] > r[level]) level = l; };
  // Counties
  if (!S.cty.length) { items.push(['bad', 'No alarm counties chosen', loc ? `<button type="button" class="astat-a" data-add-here>Use ${esc(loc.short)}</button>` : '']); bump('bad'); }
  else items.push(['ok', `Alarm counties: <b>${esc(S.cty.map((c) => ctyLabel(c)).join(' · '))}</b>`]);
  // Watching a place outside the alarm counties
  if (loc && REG.home.size && S.cty.length && ![...REG.home].some((c) => S.cty.includes(c))) {
    const add = [...REG.home];
    items.push(['info', `You're viewing <b>${esc(loc.short)}</b>, which isn't one of your alarm counties.`, `<button type="button" class="astat-a" data-add="${add.join(',')}">Add ${esc(add.map((c) => ctyLabel(c, { state: false })).join(' & '))}</button>`]);
  }
  // Sound
  if (S.snd === 'none') items.push(['info', 'Sound is off (banner, vibration and notification only)']);
  else if (!S.armed) { items.push(['warn', 'Alarm sound is off', '<button type="button" class="astat-a" data-arm>Turn on</button>']); bump('warn'); }
  else if (!audioLive()) { items.push(['warn', 'Sound paused by the browser. Tap anywhere on the page to turn it back on.']); bump('warn'); }
  else items.push(['ok', `Alarm sound ready (${esc((SOUNDS.find((s) => s[0] === S.snd) || SOUNDS[0])[1].toLowerCase())})`]);
  // Notifications
  const ns = notifState();
  if (ns === 'granted') items.push(['ok', 'Notifications allowed']);
  else if (ns === 'denied') { items.push(['warn', 'Notifications are blocked in browser settings']); bump('warn'); }
  else if (ns === 'ios-tab') items.push(['info', 'iPhone: notifications need the home-screen app']);
  else if (ns === 'default') items.push(['info', 'Notifications not allowed yet', '<button type="button" class="astat-a" data-notif>Allow</button>']);
  // Freshness
  const age = alertsOkAt ? Math.round((Date.now() - alertsOkAt) / 1000) : null;
  if (age == null) { items.push(['info', 'Checking NWS alerts…']); }
  else if (age > 180) { items.push(['bad', `Alerts last checked ${Math.round(age / 60)} min ago. Check your connection.`]); bump('bad'); }
  else items.push(['ok', `NWS alerts checked ${age < 10 ? 'just now' : age + 's ago'} (every minute)`]);
  if (document.visibilityState === 'hidden') bump('warn');
  $('#astatList').innerHTML = items.map(([l, t, a]) => `<li class="as-${l}"><span class="as-ico" aria-hidden="true"></span><span>${t}${a ? ' ' + a : ''}</span></li>`).join('');
  const armedLive = S.cty.length && (S.snd === 'none' || (S.armed && audioLive()));
  astat.dataset.level = level;
  const names = S.cty.map((c) => ctyName(c));
  const short = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
  $('#astatTxt').innerHTML = !S.cty.length ? 'Alarm: pick counties'
    : `${armedLive ? 'Alarm on' : 'Alarm off'} <span class="astat-c">· ${esc(short)}</span>${age != null && age <= 180 ? `<span class="astat-age"> · ${age < 60 ? age + 's' : Math.round(age / 60) + 'm'}</span>` : ''}`;
  astatPill.setAttribute('aria-label', `Alert status: ${$('#astatTxt').textContent}`);
}
setInterval(renderStatus, 5000);
function setAstatOpen(open) { astatPanel.hidden = !open; astatPill.setAttribute('aria-expanded', String(open)); astat.classList.toggle('is-open', open); }
astatPill.addEventListener('click', () => setAstatOpen(astatPanel.hidden));
$('#astatX').addEventListener('click', () => setAstatOpen(false));
$('#astatTest').addEventListener('click', runTest);
$('#astatSettings').addEventListener('click', () => { setAstatOpen(false); openAlertSheet(); });
$('#astatList').addEventListener('click', (e) => {
  const a = e.target.closest('button');
  if (!a) return;
  if (a.hasAttribute('data-arm')) arm().then(() => playChime());
  else if (a.hasAttribute('data-notif')) askNotif();
  else if (a.hasAttribute('data-add')) addCounties(a.dataset.add.split(','));
  else if (a.hasAttribute('data-add-here')) addCounties([...REG.home]);
  renderStatus();
});
document.addEventListener('click', (e) => { if (!astatPanel.hidden && !e.target.closest('#astat')) setAstatOpen(false); });

// ---------- Alert settings sheet ----------
$('#settingsBtn').addEventListener('click', () => openAlertSheet());
function openAlertSheet() {
  renderCountyPicker(); renderSoundUI(); renderExtras(); renderNotifUI();
  $('#iosSnd').hidden = !UA_IOS;
  openSheet('alertSheet');
  // Make every saved place's state searchable.
  loadStatesIndex().then(() => Promise.all(S.locs.map((l) => (STATES[l.st] ? loadState(l.st) : null)))).catch(() => {});
}
function renderCountyPicker() {
  $('#ctyPicked').innerHTML = S.cty.length
    ? S.cty.map((c) => `<span class="cty-chip">${esc(ctyLabel(c))}<button type="button" data-rm="${c}" aria-label="Remove ${esc(ctyLabel(c))}">×</button></span>`).join('')
    : '<span class="set-fine">None yet. Pick from the list below or search.</span>';
  const loc = activeLoc();
  $('#ctyNearLabel').innerHTML = loc
    ? `Near ${esc(loc.name)} (tap to add or remove) <button type="button" class="help-link" data-chgplace>Not your place?</button>`
    : 'Pick a place to see nearby counties <button type="button" class="help-link" data-chgplace>Pick a place</button>';
  $('#ctyNear').innerHTML = REG.list.slice(0, 30).map((c) => `<button type="button" class="cty-opt${S.cty.includes(c.same) ? ' is-on' : ''}" data-tog="${c.same}" aria-pressed="${S.cty.includes(c.same)}">${esc(c.name)} <small>${c.d < 1 ? 'here' : Math.round(c.d) + ' mi'}${c.st !== (loc && loc.st) ? ' · ' + c.st : ''}</small></button>`).join('');
}
$('#ctyPicked').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) removeCounty(b.dataset.rm); });
$('#ctyNearLabel').addEventListener('click', (e) => { if (e.target.closest('[data-chgplace]')) openLocSheet(!S.locs.length, true); /* swaps panels in place */ });
$('#ctyNear').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tog]');
  if (!b) return;
  if (S.cty.includes(b.dataset.tog)) removeCounty(b.dataset.tog); else addCounties([b.dataset.tog]);
});
const ctyIn = $('#ctyIn'), ctyList = $('#ctyList');
let ctyItems = [], ctySel = 0;
ctyIn.addEventListener('input', async () => {
  const q = ctyIn.value.trim().toLowerCase().replace(/\s+(county|parish|co\.?|par\.?)\b/g, '');
  if (q.length < 2) { ctyList.hidden = true; return; }
  const m = /,\s*([a-z]{2})$/.exec(q);
  if (m && STATES && STATES[m[1].toUpperCase()]) await loadState(m[1].toUpperCase()).catch(() => {});
  const name = q.replace(/,.*$/, '').trim();
  ctyItems = [];
  for (const [st, list] of CTY) for (const c of list) {
    if (m && st.toLowerCase() !== m[1]) continue;
    if (c.name.toLowerCase().startsWith(name)) ctyItems.push(c);
  }
  ctyItems = ctyItems.slice(0, 10); ctySel = 0;
  ctyList.innerHTML = ctyItems.length ? ctyItems.map((c, i) => `<li role="option" class="ac-item${i === 0 ? ' is-sel' : ''}" data-i="${i}"><b>${esc(c.name)} ${ctySuffix(c.st)}</b>, ${esc(c.st)}${S.cty.includes(c.same) ? '<small>already on</small>' : ''}</li>`).join('')
    : '<li class="ac-none">No match in loaded states. Try “Name, ST”, like “Escambia, FL”.</li>';
  ctyList.hidden = false;
});
ctyIn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && ctyItems[ctySel]) { e.preventDefault(); pickCty(ctyItems[ctySel]); }
  else if (e.key === 'Escape' && !ctyList.hidden) { e.stopPropagation(); ctyList.hidden = true; }
});
ctyList.addEventListener('pointerdown', (e) => e.preventDefault());
ctyList.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) pickCty(ctyItems[+li.dataset.i]); });
function pickCty(c) { addCounties([c.same]); ctyIn.value = ''; ctyList.hidden = true; }

function renderSoundUI() {
  $('#sndList').innerHTML = SOUNDS.map(([k, n, d]) => `<button type="button" role="radio" class="snd-opt${S.snd === k ? ' is-on' : ''}" aria-checked="${S.snd === k}" data-snd="${k}"><b>${n}</b><small>${d}</small></button>`).join('');
  $('#volIn').value = S.vol;
  $$('#lenSeg [data-len]').forEach((b) => { const on = +b.dataset.len === S.len; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); b.setAttribute('role', 'radio'); });
}
$('#sndList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-snd]');
  if (!b) return;
  S.snd = b.dataset.snd; save(); renderSoundUI(); setArmedUI();
  if (S.snd !== 'none') { await unlockAudio(); playAlarm(S.snd, 3); }
});
$('#volIn').addEventListener('input', (e) => { S.vol = +e.target.value; save(); });
$('#volIn').addEventListener('change', async () => { await unlockAudio(); playAlarm(S.snd === 'none' ? 'chime' : S.snd, 2); });
$('#sndTry').addEventListener('click', async () => { await unlockAudio(); playAlarm(S.snd === 'none' ? 'chime' : S.snd, 4); });
$('#lenSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-len]'); if (b) { S.len = +b.dataset.len; save(); renderSoundUI(); } });
function renderExtras() {
  $('#extraList').innerHTML = EXTRAS.map(([ev, how, , label]) => `<label class="ex"><input type="checkbox" data-ex="${esc(ev)}"${S.extra[ev] ? ' checked' : ''}><span>${esc(label)}${how === 'alarm' ? ' <small>full alarm</small>' : ''}</span></label>`).join('');
}
$('#extraList').addEventListener('change', (e) => { const i = e.target.closest('[data-ex]'); if (i) { S.extra[i.dataset.ex] = i.checked; save(); renderTornado(); } });
// Which device this is, in plain words, for the notification explainer.
function deviceKind() {
  const ua = navigator.userAgent;
  if (UA_IOS) return STANDALONE ? 'ios-app' : 'ios-safari';
  if (/Android/i.test(ua)) return 'android';
  const mac = /Macintosh|Mac OS X/.test(ua);
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'your browser';
  return { kind: 'desktop', mac, browser };
}
const NOTIF_HELP = {
  'ios-safari': ['iPhone or iPad, in Safari', [
    'Safari can’t send notifications from a website tab, so this takes one extra step:',
    '1. Tap <b>Share</b> (on newer iPhones it’s under the <b>•••</b> menu), then <b>Add to Home Screen</b>.',
    '2. Open <b>Isaias Watch</b> from your Home Screen. Your places and settings come with it.',
    '3. Open <b>Alert settings</b> there and tap <b>Turn on notifications</b>. Needs iOS 16.4 or newer.',
  ]],
  'ios-app': ['iPhone or iPad, Home Screen app', [
    'This app checks for warnings itself, so notifications come through while it’s open. iPhone pauses web apps soon after you switch away or lock the screen.',
    'During the storm, leave it open and plugged in. The screen stays on while it’s open.',
    'To change notifications later: iPhone <b>Settings › Notifications › Isaias Watch</b>.',
  ]],
  android: ['Android', [
    'Notifications come through while the page or installed app is open, including for a while in the background. Android can pause it once the screen has been off for a long time.',
    'During the storm, leave it open and plugged in. The screen stays on while it’s open.',
    'To change them later, long-press one of its notifications, or go to <b>Settings › Apps › Chrome</b> (or <b>Isaias Watch</b>) <b>› Notifications</b>.',
  ]],
};
function notifHelpHTML() {
  const d = deviceKind();
  let title, lines;
  if (typeof d === 'string') [title, lines] = NOTIF_HELP[d];
  else {
    title = `${d.mac ? 'Mac' : 'Computer'}, ${d.browser}`;
    lines = [
      'Notifications come through while this tab is open, even in the background or minimized. Closing the tab stops them.',
      `They show up as ${d.mac ? 'macOS' : 'system'} pop-ups. If nothing appears, check ${d.mac ? 'Focus' : 'Do Not Disturb / Focus'} and that ${esc(d.browser)} is allowed in your ${d.mac ? 'Mac’s System Settings › Notifications' : 'system notification settings'}.`,
      'To change it for this site later, click the icon at the left end of the address bar, then <b>Notifications</b>.',
    ];
  }
  return `<div class="nh-k">On this device: ${esc(title)}</div><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><p class="nh-wea">Nothing from a website can reach you once it’s closed. Keep your phone’s <b>Wireless Emergency Alerts</b> on too; they’re the backup that always works.</p>`;
}
function renderNotifUI() {
  const ns = notifState();
  $('#notifState').innerHTML = { granted: '<b class="ok-t">On</b> for this device', denied: '<b class="bad-t">Blocked</b> for this site. Turn it back on in your browser’s site settings (below).', default: 'Off. Tap the button and choose <b>Allow</b>.', 'ios-tab': '<b>Not available in a Safari tab.</b> See the steps below.', none: 'This browser can’t show notifications.' }[ns];
  $('#notifBtn').hidden = ns !== 'default';
  $('#notifTest').hidden = ns !== 'granted';
  $('#notifHelp').innerHTML = notifHelpHTML();
}
async function askNotif() { try { await Notification.requestPermission(); } catch (e) {} renderNotifUI(); renderStatus(); if (notifState() === 'granted') notify('Isaias Watch notifications are on', 'You’ll get one like this for tornado warnings in your alarm counties.', 'iw-test'); }
$('#notifBtn').addEventListener('click', askNotif);
$('#notifTest').addEventListener('click', () => { notify('Test from Isaias Watch', 'Notifications are working on this device.', 'iw-test'); $('#notifTest').textContent = 'Sent'; setTimeout(() => { $('#notifTest').textContent = 'Send a test'; }, 2500); });

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

// ---------- Phone wind map (Windy's embed can't do two-finger panning, so phones draw their own) ----------
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
let wmap = null, wdata = null, wIdx = 0, wField = 'speed', wOverlay = null, wVel = null, wStorm = null, wTimer = null, wMine = null;
const wCache = new Map();
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
function drawWindMine() {
  if (!wmap) return;
  if (wMine) { wmap.removeLayer(wMine); wMine = null; }
  const loc = activeLoc();
  if (!loc) return;
  wMine = L.circleMarker([loc.lat, loc.lon], { radius: 5, color: '#fff', weight: 1.5, fillColor: '#4cc3d9', fillOpacity: 1, pane: 'top' })
    .bindTooltip(loc.short, { permanent: true, direction: 'right', className: 'town', offset: [6, 0] }).addTo(wmap);
}
async function loadWind() {
  try {
    wdata = await getJSON('/api/watch?src=wind', { timeout: 30000 });
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
  legend.innerHTML = '<div id="windLegendTitle">Sustained wind (mph)</div><div class="wl-bar"></div><div class="wl-ticks"><span style="left:0">0</span><span style="left:20%">20</span><span style="left:40%">40</span><span style="left:60%">60</span><span style="left:100%">100</span></div>';
  wrap.appendChild(legend);
  const bar = document.createElement('div'); bar.className = 'map-bar wind-bar';
  bar.innerHTML = '<button class="btn btn-icon" id="windPlay" type="button" aria-label="Play wind forecast">▶</button><input type="range" id="windSlider" min="0" max="23" value="0" aria-label="Forecast hour"><span class="frame-time mono" id="windTime">Loading wind…</span>';
  wrap.after(bar);
  $('#windNote').textContent = 'Wind forecast for the next 24 hours from the HRRR and GFS models (via Open-Meteo), on a 50-mile grid. Colors show sustained wind or gusts; the streaks show direction. Tap anywhere for the numbers.';
  wmap = L.map('windMap', { zoomControl: true, minZoom: 4, maxZoom: 9, dragging: !TOUCH, doubleClickZoom: !TOUCH, touchZoom: true, attributionControl: true }).setView([29.4, -89.2], 5);
  twoFingerHint(wmap);
  wmap.createPane('field').style.zIndex = 300;
  wmap.createPane('velocity').style.zIndex = 420;
  wmap.createPane('labels').style.zIndex = 450;
  wmap.getPane('labels').style.pointerEvents = 'none';
  wmap.createPane('top').style.zIndex = 620;
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Basemap &copy; Esri · Wind: Open-Meteo' }).addTo(wmap);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { pane: 'labels', maxZoom: 16 }).addTo(wmap);
  drawWindMine();
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
let kickAlerts = () => {}, kickObs = () => {}, kickProducts = () => {}, kickNews = () => {}, kickHourly = () => {}, kickStorm = () => {};
let lastBack = Date.now();
(async () => {
  renderLocChips(); labelLocation(); setArmedUI(); renderStatus();
  loadStatesIndex().then(() => { drawSirenCounties(); renderTornado(); renderStatus(); }).catch(() => {});
  renderCities();
  try { await loadStorm(); } catch (e) {}
  kickStorm = every(2 * 60 * 1000, async () => { await loadStorm(); setWindy(); renderSaved(); });
  setWindy();
  try { await loadStormStates(); } catch (e) {}
  every(10 * 60 * 1000, () => loadStormStates().catch(() => {}));
  kickAlerts = every(60 * 1000, loadAlerts);
  kickObs = every(5 * 60 * 1000, loadObs);
  kickHourly = every(30 * 60 * 1000, loadHourly);
  kickNews = every(3 * 60 * 1000, loadNews);
  setTimeout(() => { kickProducts = every(2 * 60 * 1000, loadProducts); }, 500);
  every(10 * 60 * 1000, loadGIS);
  every(15 * 60 * 1000, loadGfx);
  await applyLocation({ fly: false });
  refreshGpsQuietly();
  if (!S.locs.length) setTimeout(() => openLocSheet(true), 600);
  else if (seededFromLink) toast(`Loaded your places: <b>${esc(S.locs.map((l) => l.short).join(', '))}</b>.`, { ms: 7000 });
  save();
})();
// Phones pause pages in the background; the moment the app comes back, refresh everything instead of waiting.
function comeBack() {
  if (document.visibilityState !== 'visible') return;
  if (Date.now() - lastBack < 20000) return;
  lastBack = Date.now();
  kickAlerts(); kickStorm(); kickObs(); refreshRadar(); refreshGpsQuietly();
  if (S.armed && !audioLive()) setArmedUI();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') lastBack = 0; comeBack(); renderStatus(); });
window.addEventListener('pageshow', (e) => { if (e.persisted) { lastBack = 0; comeBack(); } });
window.addEventListener('online', () => { lastBack = 0; comeBack(); });

// For share.js and pwa.js
window.IW = {
  tz: () => TZ, tzAbbr: () => tzAbbr(), loc: () => activeLoc(),
  tipSeen: (k) => !!S.tips[k], tipDone: (k) => { S.tips[k] = 1; save(); },
};
