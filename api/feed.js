// Whitelisted proxy for the original Hattiesburg / New Orleans dashboard (tt/), for sources that don't send CORS headers.
// /api/feed?src=nhc          -> NHC CurrentStorms.json (pass-through)
// /api/feed?src=news         -> Google News RSS for Isaias (Mississippi / Louisiana), parsed to JSON
// /api/feed?src=gfx&bin=AT4  -> latest NHC graphic URLs scraped from the storm's graphics page
// /api/feed?src=wind         -> hourly wind grid over the northern Gulf (Open-Meteo); /api/watch reuses this one
// Rebuilt Oct 8 to match the deployed original's output; it must not call /api/watch (that would loop on wind).

const UA = 'IsaiasWatch/1.0 (personal storm dashboard)';

function send(res, status, body, maxAge, swr) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? `public, s-maxage=${maxAge}, stale-while-revalidate=${swr || maxAge * 2}` : 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}
async function get(url, type = 'json', timeout = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return type === 'json' ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}
function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();
}
function tag(block, name) {
  const m = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'));
  return m ? decode(m[1]) : '';
}

async function news() {
  const queries = ['Isaias hurricane when:2d', 'Isaias Mississippi OR Louisiana when:2d'];
  const seen = new Set();
  const items = [];
  for (const q of queries) {
    let xml;
    try { xml = await get('https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=' + encodeURIComponent(q), 'text'); } catch (e) { continue; }
    for (const b of xml.split('<item>').slice(1)) {
      let title = tag(b, 'title');
      const source = tag(b, 'source');
      if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
      if (!/isaias/i.test(title)) continue;
      const key = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      const pub = tag(b, 'pubDate');
      items.push({ title, link: tag(b, 'link'), source, time: pub ? new Date(pub).toISOString() : new Date().toISOString() });
    }
  }
  items.sort((a, b) => (a.time < b.time ? 1 : -1));
  return { items: items.slice(0, 25) };
}

async function gfx(bin) {
  const b = /^(AT|EP|CP)\d$/i.test(bin || '') ? bin.toLowerCase() : 'at4';
  const page = `https://www.nhc.noaa.gov/graphics_${b}.shtml`;
  const html = await get(page, 'text');
  const find = (re) => { const m = html.match(re); return m ? 'https://www.nhc.noaa.gov' + m[1] : null; };
  return {
    page,
    cone: find(/src="(\/storm_graphics\/[^"]*_5day_cone_sm\.png)"/),
    keyMessages: find(/src="(\/storm_graphics\/[^"]*\/\d+_key_messages_sm\.png)"/),
    surge: find(/src="(\/storm_graphics\/[^"]*_peak_surge_sm\.png)"/),
    windProbs: find(/src="(\/storm_graphics\/[^"]*_wind_probs_34_F120_sm\.png)"/),
    arrival: find(/src="(\/storm_graphics\/[^"]*_earliest_reasonable_toa_no_wsp_34_sm\.png)"/),
    rain: find(/src="(\/storm_graphics\/[^"]*_(?:rainqpf|wpc_qpf)[^"]*_sm\.png)"/),
  };
}

// 0.75° grid over the northern Gulf, next 24 hours.
// Oct 9: moved east with the storm (Lake Charles to the Atlantic coast of Georgia, the Keys to north Georgia).
const GRID = { latN: 35.25, latS: 24, lonW: -93.75, lonE: -78.75, step: 0.75 };
async function wind() {
  const nx = Math.round((GRID.lonE - GRID.lonW) / GRID.step) + 1;
  const ny = Math.round((GRID.latN - GRID.latS) / GRID.step) + 1;
  const pts = [];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) pts.push([+(GRID.latN - y * GRID.step).toFixed(2), +(GRID.lonW + x * GRID.step).toFixed(2)]);
  const chunks = [];
  for (let i = 0; i < pts.length; i += 81) chunks.push(pts.slice(i, i + 81));
  const res = await Promise.all(chunks.map((c) => get(`https://api.open-meteo.com/v1/forecast?latitude=${c.map((p) => p[0]).join(',')}&longitude=${c.map((p) => p[1]).join(',')}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=mph&models=gfs_seamless&timezone=GMT&forecast_hours=24`, 'json', 25000)));
  const locs = res.flatMap((r) => (Array.isArray(r) ? r : [r]));
  const times = locs[0].hourly.time.map((t) => t + ':00Z');
  const pick = (k) => times.map((_, ti) => locs.map((l) => Math.round(l.hourly[k][ti] ?? 0)));
  return { grid: { ...GRID, nx, ny }, times, speed: pick('wind_speed_10m'), gust: pick('wind_gusts_10m'), dir: pick('wind_direction_10m'), source: 'Open-Meteo (HRRR/GFS)' };
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const src = u.searchParams.get('src');
  try {
    if (src === 'nhc') return send(res, 200, await get('https://www.nhc.noaa.gov/CurrentStorms.json'), 60, 120);
    if (src === 'gfx') return send(res, 200, await gfx(u.searchParams.get('bin')), 300, 600);
    if (src === 'news') return send(res, 200, await news(), 180, 600);
    if (src === 'wind') return send(res, 200, await wind(), 1800, 3600);
    return send(res, 400, { error: 'unknown src' });
  } catch (e) {
    return send(res, 502, { error: String(e && e.message || e) });
  }
};
