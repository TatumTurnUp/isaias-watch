import sys, time, json
from playwright.sync_api import sync_playwright
BASE, OUT = sys.argv[1], sys.argv[2]
errs = []
INFO = """() => { const t = document.getElementById('aticker'), r = t.getBoundingClientRect(), m = document.getElementById('mini');
  const a = document.getAnimations().filter(x => x.effect && x.effect.target && x.effect.target.id === 'tkTrack');
  return { hidden: t.hidden, top: Math.round(r.top), h: Math.round(r.height), text: document.querySelector('.tk-copy') && document.querySelector('.tk-copy').innerText.replace(/\\s+/g,' '),
    count: document.getElementById('tkCount').textContent, anim: a.map(x => x.playState), copies: document.querySelectorAll('.tk-copy').length,
    mini: m.hidden ? null : Math.round(m.getBoundingClientRect().top), tkh: getComputedStyle(document.documentElement).getPropertyValue('--tk-h'),
    width: [document.documentElement.scrollWidth, innerWidth], label: t.getAttribute('aria-label') } }"""
with sync_playwright() as p:
    b = p.chromium.launch()
    devs = [('iphone13', p.devices['iPhone 13']), ('pixel7', p.devices['Pixel 7']), ('desktop', {'viewport': {'width': 1366, 'height': 860}})]
    for name, dev in devs:
        ctx = b.new_context(**dev); pg = ctx.new_page()
        pg.on('pageerror', lambda e, n=name: errs.append(f'[{n}] {e}'))
        pg.goto(BASE + '/', wait_until='domcontentloaded'); pg.wait_for_selector('#locSheet:not([hidden])'); time.sleep(1)
        pg.fill('#acIn', 'Hattiesburg'); pg.wait_for_selector('#acList .ac-item'); time.sleep(0.8); pg.click('#acList .ac-item >> nth=0')
        pg.wait_for_function("!document.getElementById('aticker').hidden", timeout=30000); time.sleep(1.5)
        pg.evaluate("toast.hidden = true; document.querySelectorAll('.help-tip').forEach(t => t.remove()); document.body.classList.remove('tip-open')")
        print(f'== {name}'); i = pg.evaluate(INFO); print('  at top:', i)
        pg.screenshot(path=f'{OUT}/{name}_top.png')
        pg.evaluate("window.scrollTo(0, 1800)"); time.sleep(0.8)
        print('  scrolled:', {k: v for k, v in pg.evaluate(INFO).items() if k in ('top', 'mini', 'anim', 'tkh')})
        pg.screenshot(path=f'{OUT}/{name}_scrolled.png')
        # tap the ticker -> alerts card
        pg.click('#aticker'); time.sleep(1.5)
        print('  after tap, alerts card top:', pg.evaluate("Math.round(document.getElementById('regionLoc').getBoundingClientRect().top)"), 'ticker bottom', pg.evaluate("Math.round(document.getElementById('aticker').getBoundingClientRect().bottom)"))
        pg.screenshot(path=f'{OUT}/{name}_tap.png')
        # second place in another state -> labels get state
        pg.evaluate("window.scrollTo(0,0)"); time.sleep(0.4)
        pg.evaluate("document.getElementById('locAdd').click()"); time.sleep(0.6)
        pg.fill('#acIn', 'New Orleans'); pg.wait_for_selector('#acList .ac-item'); time.sleep(0.8); pg.click('#acList .ac-item >> nth=0'); time.sleep(4)
        btn = pg.locator('.toast button', has_text='Add')
        if btn.count(): btn.first.click(); time.sleep(5)
        print('  two places:', pg.evaluate(INFO)['text'])
        pg.evaluate("toast.hidden = true"); pg.screenshot(path=f'{OUT}/{name}_two.png')
        ctx.close()
    # reduced motion
    ctx = b.new_context(**p.devices['iPhone 13'], reduced_motion='reduce'); pg = ctx.new_page()
    pg.goto(BASE + '/', wait_until='domcontentloaded'); pg.wait_for_selector('#locSheet:not([hidden])'); time.sleep(1)
    pg.fill('#acIn', 'Hattiesburg'); pg.wait_for_selector('#acList .ac-item'); time.sleep(0.8); pg.click('#acList .ac-item >> nth=0')
    pg.wait_for_function("!document.getElementById('aticker').hidden", timeout=30000); time.sleep(1)
    i = pg.evaluate(INFO); print('== reduced motion:', i['anim'], i['copies'], pg.evaluate("document.getElementById('aticker').className"))
    b.close()
print('errors:', errs or 'none')
