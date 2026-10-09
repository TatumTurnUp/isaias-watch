/* Isaias Watch (public): one-time helper tips, and the Help link that brings them all back. */
'use strict';
(function helpTips() {
  const IS_PHONE = window.matchMedia('(max-width: 760px)').matches;
  const ANDROID = /Android/i.test(navigator.userAgent);
  const X = '<button class="layer-tip-x" type="button" aria-label="Dismiss tip">×</button>';

  // People who were already using the site before these tips existed don't get surprised by them after an update.
  if (S.tips._v !== 2) {
    if (S.locs.length) { S.tips.alarm = 1; S.tips.watch = 1; }
    S.tips._v = 2; save();
  }

  // Tips that point at the header take turns, so on a phone they never stack on top of each other.
  const queue = [];
  let showing = null;
  function next() {
    if (showing && showing.isConnected) return;
    showing = null;
    const job = queue.shift();
    if (job) showing = job();
  }
  function makeTip(key, anchor, cls, html, onClose) {
    if (!anchor) return null;
    $$(`.help-tip[data-tip="${key}"]`).forEach((t) => t.remove());
    const tip = document.createElement('div');
    tip.className = `layer-tip help-tip ${cls}`;
    tip.dataset.tip = key;
    tip.setAttribute('role', 'note');
    tip.innerHTML = X + html;
    anchor.appendChild(tip);
    tip.querySelector('.layer-tip-x').addEventListener('click', () => {
      tip.remove(); S.tips[key] = 1; save();
      if (onClose) onClose();
    });
    return tip;
  }

  function alarmTip() {
    return makeTip('alarm', $('.siren-ctl'), 'tip-below tip-right',
      '<b>Your tornado alarm</b>' +
      '<p>Tap <b>Turn on alarm</b> each time you open the page. Browsers block sound until you tap once.</p>' +
      '<p>When a tornado warning covers one of your alarm counties, the alarm sounds, a red banner flashes and a notification is sent. Tap <b>Silence alarm</b> on the banner to stop it.</p>' +
      '<p><b>Test</b> plays your alarm with a sample banner for 8 seconds. It only happens on this device.</p>' +
      '<p>Change the counties, the sound and notifications in <b>Alert settings</b>, next to your places.</p>', next);
  }
  function watchTip() {
    if (!S.locs.length) return null;
    return makeTip('watch', $('#locBar'), 'tip-below tip-left',
      '<b>Your places</b>' +
      '<p>Tap a place to switch the whole dashboard to it. <b>+ Add</b> adds another, like where family lives.</p>' +
      '<p>To remove the highlighted place, tap its <b>▾</b>. In <b>+ Add</b>, each saved place has an ✕.</p>' +
      '<p>Wrong city? A VPN can throw off your location. Tap <b>+ Add</b> and type your town or ZIP.</p>', next);
  }
  function layersTip() {
    const toggles = $('.card-map .layer-toggles');
    $$('.layer-tip:not(.help-tip)', toggles).forEach((t) => t.remove());
    const tip = makeTip('layers', toggles, '',
      '<b>Map layers</b>Use these switches to turn layers on and off. Everything starts on except Satellite.');
    if (tip) toggles.addEventListener('change', () => { if (tip.isConnected) { tip.remove(); S.tips.layers = 1; save(); } }, { once: true });
  }
  function installTip() {
    $$('.install-tip').forEach((t) => t.remove());
    if (STANDALONE) return;
    const share = '<svg class="it-ico" width="13" height="15" viewBox="0 0 14 15" aria-label="Share"><path d="M7 9.5V1.5M4 4.3 7 1.3l3 3M4.5 6.5H2.5v7h9v-7h-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const how = UA_IOS
      ? `In Safari, tap Share ${share} (on newer iPhones it’s under the <span class="it-k">•••</span> menu), then <span class="it-k">Add to Home Screen</span>.`
      : ANDROID
        ? 'In Chrome, tap the <span class="it-k">⋮</span> menu, then <span class="it-k">Add to Home screen</span> or <span class="it-k">Install app</span>.'
        : 'In Chrome or Edge, click the install icon at the right end of the address bar. In Safari on a Mac, choose <span class="it-k">File › Add to Dock</span>.';
    const tip = document.createElement('div');
    tip.className = 'install-tip'; tip.setAttribute('role', 'note');
    tip.innerHTML = `${X}<b>Use it like an app</b>${how}`;
    tip.querySelector('.layer-tip-x').addEventListener('click', () => { tip.remove(); S.tips.install = 1; save(); });
    const top = $('#topbar');
    top.parentNode.insertBefore(tip, top);
  }

  // First visit: once a place is picked, explain the place bar, then the alarm.
  function firstRun() {
    if (!S.tips.watch && S.locs.length) queue.push(watchTip);
    if (!S.tips.alarm) queue.push(alarmTip);
    // Let the "alarm set for..." message finish first so the two don't pile up on a phone screen.
    let waited = 0;
    (function go() {
      if (!$('#toast').hidden && waited < 20000) { waited += 500; setTimeout(go, 500); return; }
      next();
    })();
  }
  if (S.locs.length) setTimeout(firstRun, 800);
  else document.addEventListener('iw:firstplace', () => setTimeout(firstRun, 1200), { once: true });

  // Help: bring every tip back until each one is closed again.
  function showAll() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    queue.length = 0; showing = null;
    $$('.help-tip').forEach((t) => t.remove());
    layersTip();
    if (IS_PHONE || !STANDALONE) installTip();
    if (S.locs.length) queue.push(watchTip);
    queue.push(alarmTip);
    next();
    document.dispatchEvent(new Event('iw:help'));
  }
  document.addEventListener('click', (e) => { if (e.target.closest('#helpBtn, [data-help]')) { e.preventDefault(); showAll(); } });

  // On phones the place chips scroll sideways; keep the highlighted one in view.
  const chips = $('#locChips');
  function showActive() {
    const on = chips.querySelector('.is-on');
    if (!on || chips.scrollWidth <= chips.clientWidth) return;
    const r = on.getBoundingClientRect(), c = chips.getBoundingClientRect();
    if (r.right > c.right) chips.scrollLeft += r.right - c.right + 8;
    else if (r.left < c.left) chips.scrollLeft -= c.left - r.left + 8;
  }
  if (chips) {
    new MutationObserver(() => requestAnimationFrame(showActive)).observe(chips, { childList: true });
    requestAnimationFrame(showActive);
  }
})();
