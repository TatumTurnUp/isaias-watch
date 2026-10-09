import sys, time
from playwright.sync_api import sync_playwright
BASE, OUT = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, dev in [('iPhoneSE', p.devices['iPhone SE']), ('Pixel7', p.devices['Pixel 7'])]:
        ctx = b.new_context(**dev); pg = ctx.new_page()
        pg.goto(BASE + '/', wait_until='domcontentloaded'); pg.wait_for_selector('#locSheet:not([hidden])'); time.sleep(1)
        pg.screenshot(path=f'{OUT}/{name}_00_welcome.png')
        pg.fill('#acIn', 'Sav'); pg.wait_for_selector('#acList .ac-item', timeout=20000); time.sleep(1)
        pg.screenshot(path=f'{OUT}/{name}_01_search.png')
        for q in ['Savannah', 'Hattiesburg', 'Pensacola']:
            if q != 'Savannah': pg.evaluate("document.getElementById('locAdd').click()"); time.sleep(0.6)
            pg.fill('#acIn', q); pg.wait_for_selector('#acList .ac-item', timeout=20000); time.sleep(1); pg.evaluate("document.querySelector('#acList .ac-item').click()"); time.sleep(3)
        pg.evaluate("(() => { S.tips = {_v:2, alarm:1, watch:1, layers:1, install:1, xfeed:1}; save(); document.querySelectorAll('.help-tip,.install-tip').forEach(t => t.remove()); toast.hidden = true; })()")
        time.sleep(9)
        pg.evaluate("window.scrollTo(0,0)"); time.sleep(0.5); pg.screenshot(path=f'{OUT}/{name}_02_top.png')
        for i, sel in enumerate(['.card-obs', '#cardX', '#cardTor', '#cardMap', '.card-wind', '#regionLoc', '.card-track', '.card-feed']):
            pg.evaluate(f"(() => {{ const e = document.querySelector('{sel}'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 8); }})()"); time.sleep(1.2)
            pg.screenshot(path=f'{OUT}/{name}_{i+3:02d}_{sel.strip(".#")}.png')
        pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(1); pg.screenshot(path=f'{OUT}/{name}_11_footer.png')
        pg.evaluate("document.getElementById('settingsBtn').click()"); time.sleep(1); pg.screenshot(path=f'{OUT}/{name}_12_settings.png')
        pg.evaluate("document.querySelector('#alertSheet .sheet-x').click()"); time.sleep(0.4)
        pg.evaluate("document.getElementById('astatPill').click()"); time.sleep(0.6); pg.screenshot(path=f'{OUT}/{name}_13_status.png')
        print(name, 'width', pg.evaluate('document.documentElement.scrollWidth'), '/', pg.evaluate('innerWidth'))
        ctx.close()
    b.close()
