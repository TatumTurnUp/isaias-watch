import sys, time, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]
PLACES = sys.argv[2].split('|') if len(sys.argv) > 2 else ['Savannah', 'Atlanta', 'Tallahassee', 'Jacksonville, FL', 'Hattiesburg']
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for dname, dev in [('desk', dict(viewport={'width': 1366, 'height': 900})), ('android', p.devices['Pixel 7'])]:
        for place in PLACES:
            ctx = b.new_context(**dev); pg = ctx.new_page()
            pg.on('pageerror', lambda e, t=f'{dname}/{place}': errs.append(f'[{t}] {e}'))
            pg.goto(BASE + '/', wait_until='domcontentloaded'); pg.wait_for_selector('#locSheet:not([hidden])'); time.sleep(1)
            pg.fill('#acIn', place); pg.wait_for_selector('#acList .ac-item', timeout=20000); time.sleep(1)
            first = pg.text_content('#acList .ac-item')
            pg.evaluate("document.querySelector('#acList .ac-item').click()"); time.sleep(16)
            pg.evaluate("toast.hidden = true")
            r = pg.evaluate("""() => ({
              place: document.querySelector('#locChips .loc-chip.is-on')?.textContent.trim(),
              cls: stormClass.textContent, dist: sDistLabel.textContent + ' ' + sDist.textContent, pass: sPass.textContent,
              tor: document.getElementById('torSubSh').textContent, torList: torList.textContent.trim().slice(0, 60),
              region: regionName.textContent + ' | ' + tallyLoc.textContent.trim() + ' | items ' + document.querySelectorAll('#listLoc > *').length,
              obs: obs.textContent.replace(/\\s+/g, ' ').trim().slice(0, 70), hourly: !hourly.hidden,
              x: document.querySelectorAll('#xFeed .xp').length, xEmpty: document.querySelector('#xFeed .empty')?.textContent || '',
              alarm: (S.cty || []).length + ' counties',
              failing: [...document.querySelectorAll('#sources > .err')].map(e => e.textContent.trim()), sourcesOk: document.querySelectorAll('#sources > .ok').length,
              width: document.documentElement.scrollWidth + '/' + innerWidth,
            })""")
            print(f"--- {dname} · {place} (picked: {first.strip()[:40]})")
            for k, v in r.items(): print(f"   {k}: {v}")
            if dname == 'android' and place == PLACES[0]:
                pg.evaluate("document.getElementById('xPickBtn').click()"); time.sleep(0.8)
                print('   X picker sections:', pg.eval_on_selector_all('#xGroups h3', 'els => els.map(e => e.textContent)'))
            ctx.close()
    b.close()
print('\n'.join(errs) or 'no page errors')
