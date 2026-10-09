import sys, time, json, shutil
from playwright.sync_api import sync_playwright
BASE, OUT, ROOT = sys.argv[1], sys.argv[2], sys.argv[3]
errs = []
def W(pg, t): pg.on('pageerror', lambda e: errs.append(f'[{t}] {e}'))
def tipinfo(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('.help-tip')].map(t => { const r = t.getBoundingClientRect(), x = t.querySelector('.layer-tip-x').getBoundingClientRect();
      return { key: t.dataset.tip, sheet: t.classList.contains('tip-sheet'), top: Math.round(r.top), bottom: Math.round(r.bottom), xIn: x.top >= 0 && x.bottom <= innerHeight && x.left >= 0 && x.right <= innerWidth, xSize: Math.round(x.width) }; })""")
def targets(pg): return pg.eval_on_selector_all('.tip-target', 'els => els.map(e => e.id || e.className.split(" ")[0])')
def closeTip(pg): pg.locator('.help-tip .layer-tip-x').first.tap(); time.sleep(1.0)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['iPhone 13']); pg = ctx.new_page(); W(pg, 'ios')
    pg.goto(BASE + '/', wait_until='domcontentloaded'); pg.wait_for_selector('#locSheet:not([hidden])'); time.sleep(1)
    pg.fill('#acIn', 'Hattiesburg'); pg.wait_for_selector('#acList .ac-item'); time.sleep(0.8); pg.tap('#acList .ac-item >> nth=0')
    # first-run tips wait for the toast; dismiss it
    time.sleep(4); pg.evaluate("toast.hidden = true"); time.sleep(3)
    print('first-run 1:', tipinfo(pg), targets(pg), 'tip-open', pg.evaluate("document.body.classList.contains('tip-open')"))
    pg.screenshot(path=f'{OUT}/ios_first1.png')
    closeTip(pg); time.sleep(1); print('first-run 2:', tipinfo(pg), targets(pg)); pg.screenshot(path=f'{OUT}/ios_first2.png')
    closeTip(pg); print('first-run done:', tipinfo(pg), targets(pg), 'tip-open', pg.evaluate("document.body.classList.contains('tip-open')"))
    # update pill: bump build.json on disk, then simulate coming back to the app
    bj = ROOT + '/build.json'; orig = open(bj).read()
    try:
        open(bj, 'w').write('{"v":"test-bump"}\n'); pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); time.sleep(1.5)
        print('pill shown:', pg.is_visible('.update-pill'), pg.evaluate("(() => { const r = document.querySelector('.update-pill').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })()"))
    finally:
        open(bj, 'w').write(orig)
    # Help flow from further down the page
    pg.evaluate("window.scrollTo(0, 1500)"); time.sleep(0.5)
    pg.evaluate("document.getElementById('helpBtn').click()"); time.sleep(2)
    seen = []
    for i in range(6):
        ti = tipinfo(pg)
        if not ti: break
        seen.append((ti[0]['key'], ti[0]['xIn'], len(ti), targets(pg), round(pg.evaluate('scrollY'))))
        if i == 0: pg.screenshot(path=f'{OUT}/ios_help1.png'); print('pill while tip open:', pg.evaluate("(() => { const r = document.querySelector('.update-pill').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })()"))
        if i == 2: pg.screenshot(path=f'{OUT}/ios_help3.png')
        closeTip(pg); time.sleep(0.8)
    print('help sequence (key, x on screen, tips at once, highlighted, scrollY):'); [print('  ', s) for s in seen]
    print('after help: tips', tipinfo(pg), 'targets', targets(pg), 'install tip', pg.is_visible('.install-tip'))
    st = pg.evaluate("JSON.parse(localStorage.getItem('iw.v1')).tips"); print('tips state', st)
    pg.reload(wait_until='domcontentloaded'); time.sleep(6); pg.evaluate("document.getElementById('cardX').scrollIntoView()"); time.sleep(2.5)
    print('after reload tips:', tipinfo(pg))
    ctx.close()
    # desktop: Help still uses speech bubbles
    ctx = b.new_context(viewport={'width': 1440, 'height': 950}); pg = ctx.new_page(); W(pg, 'desk')
    pg.goto(BASE + '/', wait_until='domcontentloaded'); pg.wait_for_selector('#locSheet:not([hidden])'); time.sleep(1)
    pg.fill('#acIn', 'Hattiesburg'); pg.wait_for_selector('#acList .ac-item'); time.sleep(0.8); pg.keyboard.press('Enter'); time.sleep(4)
    pg.evaluate("toast.hidden = true"); time.sleep(2)
    pg.click('#helpBtn'); time.sleep(1.5)
    print('desk help tips:', [(t['key'], t['sheet']) for t in tipinfo(pg)], 'targets', targets(pg))
    pg.screenshot(path=f'{OUT}/desk_help.png')
    b.close()
print('\n'.join(errs) or 'no page errors')
