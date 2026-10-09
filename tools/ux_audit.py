import sys, time, json
from playwright.sync_api import sync_playwright
BASE, OUT = sys.argv[1], sys.argv[2]
STATE_JS = open('ux/state.js').read() if False else None
AUDIT = r"""() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]'); };
  const label = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : '')) + ' "' + (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 28) + '"';
  const small = [], tinyText = [], clipped = [], inputs = [];
  for (const el of document.querySelectorAll('a[href], button, input, select, summary, [role=button], .loc-chip, .city')) {
    if (!vis(el) || el.closest('.leaflet-tile-pane')) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 40 || r.width < 40) small.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const el of document.querySelectorAll('input[type=search], input[type=text], input:not([type]), select, textarea')) {
    if (!vis(el)) continue; inputs.push(`${label(el)} font ${getComputedStyle(el).fontSize}`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement; if (!el || seen.has(el) || !walker.currentNode.textContent.trim()) continue; seen.add(el);
    if (!vis(el) || el.closest('.leaflet-container, svg, .snap')) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11) tinyText.push(`${label(el)} ${fs}px`);
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && !el.closest('.loc-chips, .hr-strip, .table-wrap, .xfeed, .feed') && el.clientWidth > 0) clipped.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth}`);
  }
  return { small: [...new Set(small)], tinyText: [...new Set(tinyText)].slice(0, 40), clipped: [...new Set(clipped)].slice(0, 30), inputs, sw: document.documentElement.scrollWidth, iw: innerWidth };
}"""
CLS = """() => new Promise((ok) => { let cls = 0; const shifts = []; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput && e.value > 0.001) { cls += e.value; shifts.push([Math.round(e.startTime/1000), +e.value.toFixed(3), (e.sources||[]).map(s => s.node ? (s.node.id || s.node.className || s.node.nodeName) : '?').slice(0,3).join(',')]); } }); po.observe({ type: 'layout-shift', buffered: false }); setTimeout(() => { po.disconnect(); ok({ cls: +cls.toFixed(3), shifts: shifts.slice(0, 12) }); }, 75000); })"""
with sync_playwright() as p:
    b = p.chromium.launch()
    devs = [('iPhoneSE', p.devices['iPhone SE']), ('iPhone13', p.devices['iPhone 13']), ('iPhoneProMax', p.devices['iPhone 14 Pro Max']), ('Pixel7', p.devices['Pixel 7']), ('Galaxy360', p.devices['Galaxy S8']), ('Narrow320', p.devices['Galaxy S9+'])]
    res = {}
    for name, dev in devs:
        ctx = b.new_context(**dev); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE + '/', wait_until='domcontentloaded'); pg.wait_for_selector('#locSheet:not([hidden])'); time.sleep(1)
        inp_font = pg.evaluate("getComputedStyle(document.getElementById('acIn')).fontSize")
        for q in ['Savannah', 'Hattiesburg', 'Pensacola']:
            if q != 'Savannah': pg.evaluate("document.getElementById('locAdd').click()"); time.sleep(0.6)
            pg.fill('#acIn', q); pg.wait_for_selector('#acList .ac-item', timeout=20000); time.sleep(1); pg.evaluate("document.querySelector('#acList .ac-item').click()"); time.sleep(3)
        pg.evaluate("(() => { S.tips = {_v:2, alarm:1, watch:1, layers:1, install:1, xfeed:1}; save(); document.querySelectorAll('.help-tip,.install-tip').forEach(t => t.remove()); toast.hidden = true; })()")
        time.sleep(10)
        a = pg.evaluate(AUDIT); a['acIn_font'] = inp_font
        # fixed/floating elements and what they sit on
        a['floating'] = pg.evaluate("""() => ['#astat', '#toTop', '.update-pill', '#mini'].map(s => { const e = document.querySelector(s); if (!e || e.hidden) return s + ' hidden'; const r = e.getBoundingClientRect(); return `${s} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`; })""")
        # settings sheet scrollable and close reachable; alarm county input font
        pg.evaluate("document.getElementById('settingsBtn').click()"); time.sleep(0.8)
        a['ctyIn_font'] = pg.evaluate("getComputedStyle(document.getElementById('ctyIn')).fontSize")
        a['sheet'] = pg.evaluate("(() => { const b = document.querySelector('#alertSheet .sheet-box'); const r = b.getBoundingClientRect(); return `top ${Math.round(r.top)} bottom ${Math.round(r.bottom)}/${innerHeight} scroll ${b.scrollHeight}>${b.clientHeight} padBottom ${getComputedStyle(b).paddingBottom}`; })()")
        pg.screenshot(path=f'{OUT}/{name}_settings.png')
        pg.evaluate("document.querySelector('#alertSheet .sheet-x').click()"); time.sleep(0.4)
        # full page screenshot for visual review
        pg.screenshot(path=f'{OUT}/{name}_full.png', full_page=True)
        a['errors'] = errs
        res[name] = a
        print(f'== {name} {dev["viewport"]}: width {a["sw"]}/{a["iw"]}, search font {a["acIn_font"]}, county font {a["ctyIn_font"]}, errors {len(errs)}', flush=True)
        if name in ('iPhone13', 'Pixel7'):
            pg.evaluate("window.scrollTo(0, 0)"); time.sleep(1)
            a['cls'] = pg.evaluate(CLS)
            print('   layout shifts over 75s idle:', a['cls'], flush=True)
        ctx.close()
    json.dump(res, open(f'{OUT}/audit.json', 'w'), indent=1)
    b.close()
