// One-time "add to Home Screen" tip (phones), and the "New version is ready, tap to refresh" pill (everyone).
(function () {
'use strict';
const ua = navigator.userAgent;
const IOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ANDROID = /Android/i.test(ua);
const STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// Remembered with the rest of the saved state (see app.js), so it stays dismissed on the home-screen app too.
const store = {
  get() { try { return window.IW ? IW.tipSeen('install') : localStorage.getItem('iw.installTip'); } catch (e) { return true; } },
  set() { try { if (window.IW) IW.tipDone('install'); else localStorage.setItem('iw.installTip', '1'); } catch (e) {} },
};

// One-tap "Install app" button for Android Chrome (also used when Help brings the tip back).
// Chrome can replace its install offer at any time, so the button always uses the newest one at tap time.
window.iwOfferInstall = function (tip, onInstalled) {
  if (!window.__bip || !tip || tip.querySelector('.it-install')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'it-install'; b.textContent = 'Install app';
  b.addEventListener('click', async () => {
    const ev = window.__bip;
    if (!ev) { b.textContent = 'Use Chrome’s ⋮ menu › Install app'; b.disabled = true; return; }
    window.__bip = null;
    try { await ev.prompt(); const r = await ev.userChoice; if (r && r.outcome === 'accepted' && onInstalled) onInstalled(); } catch (e) {}
    b.remove();
  });
  tip.appendChild(b);
};

// ---------- Add to Home Screen tip (shows until closed; never inside the installed app) ----------
(function installTip() {
  if (STANDALONE || !(IOS || ANDROID) || store.get()) return;
  const shareIcon = '<svg class="it-ico" width="13" height="15" viewBox="0 0 14 15" aria-label="Share"><path d="M7 9.5V1.5M4 4.3 7 1.3l3 3M4.5 6.5H2.5v7h9v-7h-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const tip = document.createElement('div');
  tip.className = 'install-tip'; tip.setAttribute('role', 'note');
  tip.innerHTML = '<button class="layer-tip-x" type="button" aria-label="Dismiss tip">×</button><b>Use it like an app</b>' + (IOS
    ? `In Safari, tap Share ${shareIcon} (on newer iPhones it’s under the <span class="it-k">•••</span> menu), then <span class="it-k">Add to Home Screen</span>.`
    : 'In Chrome, tap the <span class="it-k">⋮</span> menu, then <span class="it-k">Add to Home screen</span> or <span class="it-k">Install app</span>.');
  const close = () => { store.set(); tip.remove(); };
  tip.querySelector('.layer-tip-x').addEventListener('click', close);
  const top = document.getElementById('topbar');
  top.parentNode.insertBefore(tip, top);
  // Android Chrome: offer a one-tap Install button when the browser allows it.
  function offerInstall() { if (tip.isConnected) window.iwOfferInstall(tip, close); }
  offerInstall();
  document.addEventListener('bip', offerInstall);
  window.addEventListener('appinstalled', close);
})();

// ---------- "New version is ready, tap to refresh" ----------
// Shown to everyone; nothing reloads on its own. Each deploy bumps /build.json.
(function updates() {
  let build = null, shown = false;
  async function check() {
    try {
      const r = await fetch('/build.json', { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()).v;
      if (build && v !== build) show(); else build = v;
    } catch (e) {}
  }
  function show() {
    if (shown) return;
    shown = true;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'update-pill'; b.textContent = 'New version is ready, tap to refresh';
    b.addEventListener('click', () => location.reload());
    document.body.appendChild(b);
  }
  check();
  setInterval(check, 5 * 60 * 1000);
  // Home-screen apps sit paused in the background, so check the moment one is opened again.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) check(); });
})();
})();
