/* Isaias Watch (public): live feed of posts from X, from accounts the visitor picks. */
'use strict';
(function xFeed() {
  // [handle, name, group, area it mainly covers (local only), states, on by default]
  // Re-vetted Oct 9 (storm moving east): every account here had at least two recent posts about Isaias, the latest
  // within the past 18 hours. Accounts that had gone quiet on the storm were dropped.
  const ACC = [
    ['NHC_Atlantic', 'National Hurricane Center', 'nat', '', [], true],
    ['NWS', 'National Weather Service', 'nat', '', [], true],
    ['JimCantore', 'Jim Cantore', 'nat', '', [], true],
    ['weatherchannel', 'The Weather Channel', 'nat', '', [], true],
    ['NHC_Surge', 'NHC Storm Surge', 'nat', '', [], false],
    ['MichaelRLowry', 'Michael Lowry, hurricane specialist', 'nat', '', [], false],
    ['NWSWPC', 'NWS Weather Prediction Center', 'nat', '', [], false],
    ['53rdWRS', 'Hurricane Hunters', 'nat', '', [], false],
    ['hurricanetrack', 'Mark Sudduth, HurricaneTrack', 'nat', '', [], false],
    ['fema', 'FEMA', 'nat', '', [], false],
    ['NWSNewOrleans', 'NWS New Orleans', 'nws', 'New Orleans, Baton Rouge & the MS Coast', ['LA', 'MS'], false],
    ['NWSMobile', 'NWS Mobile', 'nws', 'Mobile & Pensacola', ['AL', 'FL'], false],
    ['NWSTallahassee', 'NWS Tallahassee', 'nws', 'Tallahassee, Big Bend & SW Georgia', ['FL', 'GA'], false],
    ['NWSJacksonMS', 'NWS Jackson', 'nws', 'Central & South MS, incl. Hattiesburg', ['MS'], false],
    ['NWSLakeCharles', 'NWS Lake Charles', 'nws', 'SW Louisiana', ['LA'], false],
    ['NWSAtlanta', 'NWS Atlanta', 'nws', 'North & Central Georgia', ['GA'], false],
    ['NWSColumbia', 'NWS Columbia', 'nws', 'Central SC & Augusta, GA', ['SC', 'GA'], false],
    ['NWSTampaBay', 'NWS Tampa Bay', 'nws', 'Tampa Bay & SW Florida', ['FL'], false],
    ['NWSKeyWest', 'NWS Key West', 'nws', 'Florida Keys', ['FL'], false],
    ['MSEMA', 'Mississippi Emergency Management', 'ema', 'Mississippi', ['MS'], false],
    ['AlabamaEMA', 'Alabama EMA', 'ema', 'Alabama', ['AL'], false],
    ['FLSERT', 'Florida Division of Emergency Management', 'ema', 'Florida', ['FL'], false],
    ['WWLTV', 'WWL-TV', 'tv', 'New Orleans', ['LA'], false],
    ['WDSU', 'WDSU', 'tv', 'New Orleans', ['LA'], false],
    ['WAFB', 'WAFB 9', 'tv', 'Baton Rouge', ['LA'], false],
    ['WLOX', 'WLOX', 'tv', 'Biloxi & Gulfport', ['MS'], false],
    ['WXXV25', 'WXXV 25', 'tv', 'Gulfport & the MS Coast', ['MS'], false],
    ['WJTV', 'WJTV 12', 'tv', 'Jackson, MS', ['MS'], false],
    ['WKRG', 'WKRG', 'tv', 'Mobile & Pensacola', ['AL', 'FL'], false],
    ['wtvynews4', 'WTVY News 4', 'tv', 'Dothan & the Wiregrass', ['AL', 'GA'], false],
    ['weartv', 'WEAR ABC 3', 'tv', 'Pensacola & NW Florida', ['FL'], false],
    ['WJHG_TV', 'WJHG 7', 'tv', 'Panama City', ['FL'], false],
    ['WCTV', 'WCTV', 'tv', 'Tallahassee & South Georgia', ['FL', 'GA'], false],
    ['ActionNewsJax', 'Action News Jax', 'tv', 'Jacksonville & SE Georgia', ['FL', 'GA'], false],
    ['FCN2go', 'First Coast News', 'tv', 'Jacksonville & SE Georgia', ['FL', 'GA'], false],
    ['wjxt4', 'News4JAX', 'tv', 'Jacksonville', ['FL', 'GA'], false],
    ['WCJB20', 'WCJB TV20', 'tv', 'Gainesville & North Central Florida', ['FL'], false],
    ['WFLA', 'WFLA News Channel 8', 'tv', 'Tampa Bay', ['FL'], false],
    ['BN9', 'Spectrum Bay News 9', 'tv', 'Tampa Bay', ['FL'], false],
    ['FOX13News', 'FOX 13', 'tv', 'Tampa Bay', ['FL'], false],
    ['WFTV', 'WFTV Channel 9', 'tv', 'Orlando', ['FL'], false],
    ['WESH', 'WESH 2', 'tv', 'Orlando', ['FL'], false],
    ['MyNews13', 'Spectrum News 13', 'tv', 'Orlando & Central Florida', ['FL'], false],
    ['wsbtv', 'WSB-TV', 'tv', 'Atlanta', ['GA'], false],
    ['11AliveNews', '11Alive', 'tv', 'Atlanta', ['GA'], false],
    ['FOX5Atlanta', 'FOX 5 Atlanta', 'tv', 'Atlanta', ['GA'], false],
    ['41NBC', '41NBC', 'tv', 'Macon & Middle Georgia', ['GA'], false],
  ];
  const GROUPS = [['nat', 'National'], ['nws', 'Local NWS offices'], ['ema', 'State emergency management'], ['tv', 'Local TV news']];
  const TV_STATES = [['LA', 'Louisiana'], ['MS', 'Mississippi'], ['AL', 'Alabama'], ['FL', 'Florida'], ['GA', 'Georgia']];
  const DEF = ACC.filter((a) => a[5]).map((a) => a[0]);
  const META = new Map(ACC.map((a) => [a[0].toLowerCase(), a]));
  // National accounts cover every storm in the country, so for them a post has to mention Isaias or the area it is hitting.
  const ISAIAS_AREA = /isaias|gulf coast|panhandle|florida|alabama|mississippi|louisiana|georgia|pensacola|mobile bay|tallahassee|new orleans|big bend/i;
  const STORM = /isaias|hurricane|tropical|\bstorms?\b|surge|tornado|flood|\brain(fall|s)?\b|\bwinds?\b|\bgusts?\b|evacuat|shelter|landfall|advisory|outage|sandbag|emergency|\bEOC\b|curfew|prepar|\bNHC\b|#\w*wx\b/i;
  const PAGE = window.matchMedia('(max-width: 760px)').matches ? 3 : 8; // phones: keep the tornado card and radar close

  if (!S.x || !Array.isArray(S.x.acc)) { S.x = { acc: DEF.slice(), storm: true, tag: false }; save(); }
  S.x.acc = S.x.acc.filter((h) => META.has(h.toLowerCase()));

  const feed = $('#xFeed'), more = $('#xMore');
  const cache = new Map();      // 'u:NWS' or 'tag' -> items
  const failed = new Set();
  let shown = PAGE, loadedOnce = false;

  async function pull(key, url) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
      const j = await r.json();
      if (j.ok) { cache.set(key, j.items || []); failed.delete(key); } else failed.add(key);
    } catch (e) { failed.add(key); }
  }
  const keysNow = () => [...S.x.acc.map((h) => [`u:${h}`, `/api/x?u=${encodeURIComponent(h)}`]), ...(S.x.tag ? [['tag', '/api/x?tag=isaias']] : [])];
  let retryTimer = null;
  async function refresh(onlyMissing = false) {
    const ks = keysNow().filter(([k]) => !onlyMissing || !cache.has(k));
    if (ks.length) await Promise.all(ks.map(([k, u]) => pull(k, u)));
    loadedOnce = true;
    render();
    // X's free relay fails now and then; accounts that haven't loaded yet get another try soon.
    clearTimeout(retryTimer);
    if (keysNow().some(([k]) => !cache.has(k))) retryTimer = setTimeout(() => refresh(true), 30000);
  }

  const areaOf = (h) => { const m = META.get(String(h).toLowerCase()); return m && m[3] ? m[3] : ''; };
  function text(s) {
    return esc(s).replace(/(^|\s)([#@][\w]+)/g, '$1<span class="xp-tag">$2</span>').replace(/\n/g, '<br>');
  }
  function item(p) {
    const area = areaOf(p.user);
    const media = p.media && p.media.src ? `<div class="xp-m${p.media.type === 'video' ? ' is-vid' : ''}"><img src="${esc(p.media.src)}" alt="" loading="lazy" decoding="async"></div>` : '';
    const quote = p.quote && p.quote.text ? `<div class="xp-q"><b>${esc(p.quote.name || '@' + p.quote.user)}</b> ${text(p.quote.text)}</div>` : '';
    const rp = p.rps && p.rps.length ? `<div class="xp-rp">↻ ${esc(andList(p.rps))} reposted</div>` : '';
    const top = p.top ? '<span class="xp-top">Top #Isaias</span>' : '';
    return `<li class="xp"><a class="xp-a" href="${esc(p.url)}" target="_blank" rel="noopener">
      <img class="xp-av" src="${esc(p.avatar)}" alt="" width="36" height="36" loading="lazy" decoding="async">
      <div class="xp-b">${rp}
        <div class="xp-h"><b>${esc(p.name)}</b> <span class="xp-u">@${esc(p.user)}</span>${area ? ` <span class="xp-area">(${esc(area)})</span>` : ''}
          <time title="${esc(fmtDayTime(p.t * 1000))}">${relShort(p.t * 1000)}</time>${top}</div>
        <div class="xp-t">${text(p.text)}</div>${quote}${media}
      </div></a></li>`;
  }
  function render() {
    const byId = new Map();
    const add = (p, fromTag, via) => {
      const txt = `${p.text} ${p.quote ? p.quote.text : ''}`;
      const national = via && (META.get(via.toLowerCase()) || [])[2] === 'nat';
      if (!fromTag && S.x.storm && !(national ? ISAIAS_AREA : STORM).test(txt)) return;
      const cur = byId.get(p.id) || { ...p, rp: null, rps: [], top: false };
      if (p.rp) { const n = (META.get(p.rp.user.toLowerCase()) || [])[1] || p.rp.name; if (!cur.rps.includes(n) && p.rp.user.toLowerCase() !== p.user.toLowerCase()) cur.rps.push(n); }
      if (fromTag) cur.top = true;
      byId.set(p.id, cur);
    };
    for (const h of S.x.acc) for (const p of cache.get(`u:${h}`) || []) add(p, false, h);
    // A post from one of your accounts that also reposted it shouldn't say "reposted".
    for (const p of byId.values()) p.rps = p.rps.filter((n) => n !== (META.get(p.user.toLowerCase()) || [])[1]);
    if (S.x.tag) for (const p of cache.get('tag') || []) add(p, true);
    const list = [...byId.values()].sort((a, b) => b.t - a.t);
    const names = S.x.acc.map((h) => (META.get(h.toLowerCase()) || [])[1]).filter(Boolean);
    $('#xSel').textContent = `${names.length ? (names.length > 3 ? `${names.slice(0, 3).join(', ')} + ${names.length - 3} more` : andList(names)) : 'No accounts'}${S.x.tag ? (failed.has('tag') && !cache.has('tag') ? ' · top #Isaias unavailable right now' : ' · top #Isaias') : ''}${S.x.storm ? ' · storm posts only' : ''}`;
    if (!list.length) {
      const allFailed = keysNow().length && keysNow().every(([k]) => failed.has(k));
      feed.innerHTML = `<li class="empty">${!loadedOnce ? 'Loading posts…' : !keysNow().length ? 'No accounts picked. Tap <b>Choose accounts</b> to add some.' : allFailed ? 'Couldn’t reach X right now. Trying again in 2 minutes.' : 'No storm posts from these accounts in the last few days. Add more accounts, or turn off “Only posts about the storm.”'}</li>`;
      more.hidden = true; return;
    }
    feed.innerHTML = list.slice(0, shown).map(item).join('');
    more.hidden = list.length <= shown;
    more.textContent = `Show more (${list.length - shown})`;
  }
  more.addEventListener('click', () => { shown += PAGE; render(); });

  // ---------- account picker ----------
  function renderPicker() {
    $('#xStorm').checked = !!S.x.storm; $('#xTag').checked = !!S.x.tag;
    const st = new Set(S.locs.map((l) => l.st));
    const on = new Set(S.x.acc.map((h) => h.toLowerCase()));
    const row = ([h, n, , area, sts], g) => {
      const near = g !== 'nat' && sts.some((x) => st.has(x));
      return `<label class="ex"><input type="checkbox" data-xa="${esc(h)}"${on.has(h.toLowerCase()) ? ' checked' : ''}><span><b>${esc(n)}</b> <span class="x-h">@${esc(h)}</span>${area ? ` <span class="x-area">(${esc(area)})</span>` : ''}${near ? ' <em class="x-near">near your places</em>' : ''}</span></label>`;
    };
    const nearFirst = (rows) => rows.slice().sort((a, b) => (b[4].some((x) => st.has(x)) - a[4].some((x) => st.has(x))));
    const sections = [];
    for (const [g, title] of GROUPS) {
      if (g !== 'tv') {
        let rows = ACC.filter((a) => a[2] === g);
        if (g !== 'nat') rows = nearFirst(rows);
        sections.push([title, rows, g]);
        continue;
      }
      // Local TV, one list per state, the states of your places first.
      const tv = TV_STATES.map(([code, name]) => [`Local TV · ${name}`, ACC.filter((a) => a[2] === 'tv' && a[4][0] === code), code]);
      tv.sort((a, b) => st.has(b[2]) - st.has(a[2]));
      sections.push(...tv.map(([t, rows]) => [t, rows, 'tv']));
    }
    $('#xGroups').innerHTML = sections.filter(([, rows]) => rows.length).map(([title, rows, g]) => `<section class="set"><h3>${esc(title)}</h3><div class="extra">${rows.map((r) => row(r, g)).join('')}</div></section>`).join('');
  }
  $('#xPickBtn').addEventListener('click', () => { renderPicker(); openSheet('xSheet'); dropTip(); });
  $('#xGroups').addEventListener('change', (e) => {
    const i = e.target.closest('[data-xa]'); if (!i) return;
    const h = i.dataset.xa;
    S.x.acc = i.checked ? [...S.x.acc.filter((x) => x !== h), h] : S.x.acc.filter((x) => x !== h);
    save(); shown = PAGE; render(); refresh(true);
  });
  $('#xStorm').addEventListener('change', (e) => { S.x.storm = e.target.checked; save(); render(); });
  $('#xTag').addEventListener('change', (e) => { S.x.tag = e.target.checked; save(); render(); refresh(true); });
  $('#xReset').addEventListener('click', () => { S.x = { acc: DEF.slice(), storm: true, tag: false }; save(); renderPicker(); shown = PAGE; refresh(true); });

  // ---------- one-time helper tip (same look as the other tips; on phones a card pinned to the bottom) ----------
  let tip = null, tipDone = null;
  const finishTip = () => { tip = null; const cb = tipDone; tipDone = null; if (cb) cb(); };
  function dropTip() {
    if (tip && tip.isConnected) { tip.remove(); tip.dispatchEvent(new Event('iw:gone')); }
    if (!S.tips.xfeed) { S.tips.xfeed = 1; save(); }
    if (tip) finishTip();
  }
  function showTip(onClose, focus) {
    if (tip && tip.isConnected) return tip;
    tipDone = onClose || null;
    tip = window.iwTips.make('xfeed', $('#xPickWrap'), 'tip-below tip-right', '<b>Pick your accounts</b>' +
      '<p>This starts with the National Hurricane Center, the National Weather Service, Jim Cantore and The Weather Channel.</p>' +
      '<p>Tap <b>Choose accounts</b> to add your local NWS office, emergency managers and TV stations from a checklist, or top <b>#Isaias</b> posts.</p>',
      finishTip, focus === true);
    return tip;
  }
  window.iwXTip = showTip;
  function autoTip() {
    if (S.tips.xfeed) return;
    // Wait for the first-visit tips (places, alarm) and for any other tip card on screen.
    if (window.iwTips.busy() || !S.locs.length || !S.tips.alarm || !$('#locSheet').hidden) { setTimeout(autoTip, 1500); return; }
    showTip();
  }
  if (!S.tips.xfeed && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); setTimeout(autoTip, 600); } }, { threshold: 0.5 });
    io.observe($('#cardX'));
  }

  // Posts refresh every 2 minutes (the server caches each account for about that long anyway).
  setTimeout(() => every(120000, () => refresh(false)), 1500);
  setInterval(() => { if (loadedOnce) render(); }, 60000); // keep the "5m" times current
})();
