// Posts from X for the public Isaias Watch page, through the free FxTwitter API.
// /api/x?u=NWSMobile   -> recent original posts from one vetted account (allowlist below)
// /api/x?tag=isaias    -> X's "Top" #Isaias posts, filtered hard (English, 50+ likes, no replies, no profanity)
// Every response is cached at Vercel's edge, so all visitors share one fetch per account every ~2 minutes.

const UA = 'IsaiasWatch/2.0 (public storm dashboard)';
const FX = 'https://api.fxtwitter.com/2';
const ACCOUNTS = new Set([
  'NHC_Atlantic', 'NWS', 'JimCantore', 'weatherchannel', 'NHC_Surge', 'MichaelRLowry', 'NWSWPC', '53rdWRS', 'hurricanetrack', 'fema',
  'NWSNewOrleans', 'NWSMobile', 'NWSTallahassee', 'NWSJacksonMS', 'NWSLakeCharles', 'NWSAtlanta', 'NWSColumbia', 'NWSTampaBay', 'NWSKeyWest',
  'MSEMA', 'AlabamaEMA', 'FLSERT',
  'WWLTV', 'WDSU', 'WAFB', 'WLOX', 'WXXV25', 'WJTV', 'WKRG', 'wtvynews4', 'weartv', 'WJHG_TV', 'WCTV',
  'ActionNewsJax', 'FCN2go', 'wjxt4', 'WCJB20', 'WFLA', 'BN9', 'FOX13News', 'WFTV', 'WESH', 'MyNews13',
  'wsbtv', '11AliveNews', 'FOX5Atlanta', '41NBC',
]);
const BY_LOWER = new Map([...ACCOUNTS].map((a) => [a.toLowerCase(), a]));
const PROFANITY = /\b(f+u+c+k\w*|sh[i1]t\w*|damn\w*|hell yeah|wtf|ass(hole)?|bitch\w*|crap|piss\w*|bastard|dick)\b/i;
const MAX_AGE_DAYS = 5;

function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Failures are never cached, so the edge keeps serving the last good copy while it retries.
  res.setHeader('Cache-Control', status === 200 ? `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=900` : 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}
async function getJSON(url, timeout = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, j };
  } finally { clearTimeout(t); }
}

// Keep only what the page draws.
function slim(p) {
  const a = p.author || {};
  const m = ((p.media && p.media.all) || [])[0];
  const media = m ? { type: m.type === 'photo' ? 'photo' : 'video', src: m.type === 'photo' ? (m.url || '') : (m.thumbnail_url || ''), w: m.width || 0, h: m.height || 0 } : null;
  const q = p.quote ? { user: (p.quote.author || {}).screen_name || '', name: (p.quote.author || {}).name || '', text: String(p.quote.text || '').slice(0, 280) } : null;
  return {
    id: String(p.id), url: p.url || `https://x.com/${a.screen_name}/status/${p.id}`,
    t: p.created_timestamp || Math.floor(Date.parse(p.created_at) / 1000) || 0,
    text: String(p.text || ''), lang: p.lang || '',
    user: a.screen_name || '', name: a.name || '', avatar: a.avatar_url || '', followers: a.followers || 0,
    rp: p.reposted_by ? { user: p.reposted_by.screen_name || '', name: p.reposted_by.name || '' } : null,
    reply: p.replying_to ? (typeof p.replying_to === 'string' ? p.replying_to : p.replying_to.screen_name || '?') : null, media, quote: q, likes: p.likes || 0, reposts: p.reposts || 0,
    sensitive: !!p.possibly_sensitive,
  };
}
const fresh = (x) => x.t > Date.now() / 1000 - MAX_AGE_DAYS * 86400;

// FxTwitter fails at random under load (the same account loads on one try and 404s on the next), so retry a few
// times, and keep the last good list per account for while this function instance stays warm.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const memo = new Map();
async function fxList(url, tries, timeout) {
  for (let i = 0; i < tries; i++) {
    try {
      const { ok, j } = await getJSON(url, timeout);
      if (ok && Array.isArray(j.results) && j.results.length) return j.results;
    } catch (e) { /* retry */ }
    if (i < tries - 1) await sleep(350 * (i + 1));
  }
  return null;
}
async function account(handle) {
  // The profile timeline includes reposts; when it won't load, fall back to searching the account's own posts.
  const list = (await fxList(`${FX}/profile/${handle}/statuses`, 3, 6000)) ||
    (await fxList(`${FX}/search?feed=latest&q=${encodeURIComponent(`from:${handle} -filter:replies`)}`, 1, 8000));
  if (!list) return null;
  const me = handle.toLowerCase();
  return list.map(slim).filter((x) => fresh(x) && !x.sensitive && (!x.reply || String(x.reply).toLowerCase() === me)).slice(0, 20);
}

async function hashtag() {
  const q = '#isaias lang:en -filter:replies -filter:retweets min_faves:50';
  const list = await fxList(`${FX}/search?feed=top&q=${encodeURIComponent(q)}`, 2, 9000);
  if (!list) return null;
  return list.map(slim).filter((x) => fresh(x) && !x.sensitive && !x.reply && !x.rp && x.lang === 'en' && x.likes >= 50 &&
    x.followers >= 5000 && /isaias/i.test(x.text) && !PROFANITY.test(x.text)).slice(0, 15);
}

function reply(res, key, items, extra, maxAge) {
  if (items) { memo.set(key, { at: Date.now(), items }); return send(res, 200, { ok: true, ...extra, items }, items.length ? maxAge : 60); }
  const m = memo.get(key);
  if (m && Date.now() - m.at < 6 * 3600e3) return send(res, 200, { ok: true, ...extra, items: m.items, stale: true }, 30);
  return send(res, 502, { ok: false, ...extra, items: [], error: 'X is not responding right now' }, 0);
}

module.exports = async (req, res) => {
  const q = req.query || {};
  try {
    if (q.tag) {
      if (String(q.tag).toLowerCase() !== 'isaias') return send(res, 400, { ok: false, error: 'unknown tag' }, 3600);
      return reply(res, 'tag', await hashtag(), {}, 180);
    }
    const handle = BY_LOWER.get(String(q.u || '').toLowerCase());
    if (!handle) return send(res, 400, { ok: false, error: 'account not on the list' }, 3600);
    return reply(res, 'u:' + handle, await account(handle), { user: handle }, 120);
  } catch (e) {
    return send(res, 502, { ok: false, items: [], error: String(e.message || e) }, 0);
  }
};
