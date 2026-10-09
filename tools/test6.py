import sys, time, json
from playwright.sync_api import sync_playwright
BASE, OUT = sys.argv[1], sys.argv[2]
errs = []
FAKE_BIP = """(n) => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { (window.__prompted = window.__prompted || []).push(n); return Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); }"""
def tipinfo(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('.help-tip')].map(t => { const x = t.querySelector('.layer-tip-x').getBoundingClientRect(); const r = t.getBoundingClientRect();
      return t.dataset.tip + (t.classList.contains('tip-sheet') ? '[card]' : '[bubble]') + (x.top >= 0 && x.bottom <= innerHeight && x.left >= 0 && x.right <= innerWidth ? ' x-ok' : ' X-OFFSCREEN') + ` ${Math.round(r.top)}-${Math.round(r.bottom)}/${innerHeight}`; })""")
with sync_playwright() as p:
    b = p.chromium.launch()
    devs = [('pixel7', p.devices['Pixel 7']), ('galaxyS8-360', p.devices['Galaxy S8']), ('narrow-320', p.devices['Galaxy S9+'])]
    for name, dev in devs:
        ctx = b.new_context(**dev); pg = ctx.new_page()
        pg.on('pageerror', lambda e, n=name: errs.append(f'[{n}] {e}'))
        pg.goto(BASE + '/', wait_until='domcontentloaded'); pg.wait_for_selector('#locSheet:not([hidden])'); time.sleep(1)
        print(f'== {name} viewport {dev["viewport"]}  UA android: {"Android" in dev["user_agent"]}')
        # install offer arrives before any place is chosen; then a second one (Chrome refresh)
        pg.evaluate(FAKE_BIP, 'first')
        for q in ['Hattiesburg', 'New Orleans', 'Pensacola']:
            if q != 'Hattiesburg': pg.evaluate("document.getElementById('locAdd').click()"); time.sleep(0.6)
            pg.fill('#acIn', q); pg.wait_for_selector('#acList .ac-item'); time.sleep(0.8); pg.tap('#acList .ac-item >> nth=0'); time.sleep(3.5)
            pg.evaluate("toast.hidden = true")
        print('  manifest href:', pg.get_attribute('#manifestLink', 'href'))
        print('  page width:', pg.evaluate('[document.documentElement.scrollWidth, innerWidth]'), 'tips state', pg.evaluate("JSON.parse(localStorage.getItem('iw.v1')).tips"), 'tips now', tipinfo(pg))
        time.sleep(2.5)
        seq = []
        for i in range(4):
            ti = tipinfo(pg)
            if not ti: time.sleep(2); ti = tipinfo(pg)
            if not ti: break
            seq.append(ti); pg.locator('.help-tip .layer-tip-x').first.tap(); time.sleep(1.2)
        print('  first-visit tips:', seq)
        it = pg.locator('.install-tip')
        print('  install tip visible:', it.is_visible(), '| install button:', pg.locator('.install-tip .it-install').count())
        pg.evaluate(FAKE_BIP, 'second')
        pg.screenshot(path=f'{OUT}/{name}_top.png')
        if pg.locator('.install-tip .it-install').count():
            pg.locator('.install-tip .it-install').tap(); time.sleep(0.8)
            print('  prompt() called on:', pg.evaluate('window.__prompted'))
        # radar bar: height must not change across frames
        pg.evaluate("document.getElementById('cardMap').scrollIntoView()"); time.sleep(1)
        hs = set(); ws = set()
        mx = int(pg.get_attribute('#frameSlider', 'max'))
        for i in range(mx + 1):
            pg.evaluate(f"(() => {{ const s = document.getElementById('frameSlider'); s.value = {i}; s.dispatchEvent(new Event('input', {{ bubbles: true }})); }})()"); time.sleep(0.15)
            r = pg.evaluate("(() => { const b = document.querySelector('#cardMap .map-bar').getBoundingClientRect(), s = document.getElementById('frameSlider').getBoundingClientRect(), t = document.getElementById('frameTime').getBoundingClientRect(); return [Math.round(b.height), Math.round(s.width), Math.round(t.top - s.top), document.getElementById('frameTime').textContent]; })()")
            hs.add((r[0], r[2])); ws.add(r[1])
        print('  radar bar (height, time offset) across frames:', hs, 'slider widths:', ws, '| last label:', r[3])
        pg.locator('#cardMap .map-bar').screenshot(path=f'{OUT}/{name}_mapbar.png')
        print('  tornado:', pg.text_content('#torSubSh'), '|', pg.text_content('#torList')[:90])
        # Help flow
        pg.evaluate("window.scrollTo(0, 900)"); pg.evaluate("document.getElementById('helpBtn').click()"); time.sleep(2)
        hseq = []
        for i in range(6):
            ti = tipinfo(pg)
            if not ti: break
            hseq.append(ti[0]); pg.locator('.help-tip .layer-tip-x').first.tap(); time.sleep(1.4)
        print('  Help tips:', hseq, '| install tip + button after Help:', pg.is_visible('.install-tip'), pg.locator('.install-tip .it-install').count())
        # Alert settings sheet
        pg.evaluate("document.getElementById('settingsBtn').click()"); time.sleep(1)
        print('  settings: device help ->', pg.text_content('#notifHelp')[:80].replace('\n', ' '), '| close btn on screen:', pg.evaluate("(() => { const r = document.querySelector('#alertSheet .sheet-x').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()"))
        pg.screenshot(path=f'{OUT}/{name}_settings.png'); pg.evaluate("document.querySelector('#alertSheet .sheet-x').click()"); time.sleep(0.5)
        # X picker
        pg.evaluate("document.getElementById('xPickBtn').click()"); time.sleep(0.8)
        print('  X picker open:', pg.is_visible('#xSheet'), '| rows:', pg.locator('#xGroups .ex').count(), '| page width:', pg.evaluate('document.documentElement.scrollWidth'))
        pg.evaluate("document.querySelector('#xSheet .sheet-x').click()"); time.sleep(0.4)
        # test alarm + silence
        pg.evaluate("window.scrollTo(0,0)"); pg.evaluate("document.getElementById('testBtn').click()"); time.sleep(1)
        vis = pg.is_visible('#homeBanner'); pg.locator('#hbAck').tap(); time.sleep(0.3)
        print('  test banner shown:', vis, '| hidden right after Silence:', pg.is_hidden('#homeBanner'))
        print('  final page width:', pg.evaluate('document.documentElement.scrollWidth'), '/', pg.evaluate('innerWidth'))
        ctx.close()
    b.close()
print('\n'.join(errs) or 'no page errors')
