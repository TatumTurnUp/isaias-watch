import sys, time
from playwright.sync_api import sync_playwright
BASE, OUT = sys.argv[1], sys.argv[2]
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, dev in [('iphone13', p.devices['iPhone 13']), ('desktop', {'viewport': {'width': 1366, 'height': 860}})]:
        pg = b.new_context(**dev).new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and 'windy' not in m.text and errs.append('console: ' + m.text[:160]))
        pg.goto(BASE + '/', wait_until='domcontentloaded'); pg.wait_for_selector('#locSheet:not([hidden])'); time.sleep(1)
        pg.fill('#acIn', 'Hattiesburg'); pg.wait_for_selector('#acList .ac-item'); time.sleep(0.8); pg.click('#acList .ac-item >> nth=0')
        pg.wait_for_function("document.querySelectorAll('#trackTable tbody tr td').length > 1", timeout=60000); time.sleep(2)
        print(name, pg.evaluate("[...document.querySelectorAll('#trackTable tbody tr')].map(r => r.innerText.replace(/\\s+/g,' '))"))
        print('  closest:', pg.evaluate("document.getElementById('closest').innerText"), '| pass stat:', pg.evaluate("document.getElementById('sPass').innerText"))
        print('  map layers:', pg.evaluate("(() => { let n = 0; nhcLayer.eachLayer(() => n++); let w = 0; wwLayer.eachLayer(() => w++); let r = 0; windLayer.eachLayer(() => r++); return {nhc: n, ww: w, wind: r, cone: !!coneBounds}; })()"))
        pg.evaluate("toast.hidden = true; document.querySelectorAll('.help-tip').forEach(t => t.remove())")
        pg.locator('.card-track').screenshot(path=f'{OUT}/{name}_track.png')
        pg.evaluate("setView('storm')"); time.sleep(2.5)
        pg.locator('.card-map .map-wrap').screenshot(path=f'{OUT}/{name}_map.png')
    b.close()
print('errors:', errs or 'none')
