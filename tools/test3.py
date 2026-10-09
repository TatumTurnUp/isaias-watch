import sys, time, json
from playwright.sync_api import sync_playwright
BASE, OUT = sys.argv[1], sys.argv[2]
errs = []
def W(pg, t):
    pg.on('pageerror', lambda e: errs.append(f'[{t}] {e}'))
    pg.on('console', lambda m: errs.append(f'[{t}] {m.text}') if m.type == 'error' else None)
st = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('iw.v1'))")
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 950}, geolocation={'latitude': 34.02, 'longitude': -84.62}, permissions=['geolocation'])
    pg = ctx.new_page(); W(pg, 'desk')
    pg.goto(BASE + '/'); pg.wait_for_selector('#locSheet:not([hidden])'); time.sleep(1)
    pg.click('#gpsBtn'); pg.wait_for_function("document.querySelectorAll('.loc-chip').length>=1", timeout=30000); time.sleep(5)
    print('toast1:', pg.text_content('#toast'))
    print('cty:', st(pg)['cty'])
    time.sleep(2)
    print('tips visible:', pg.eval_on_selector_all('.help-tip', 'e=>e.map(x=>x.dataset.tip)'))
    pg.screenshot(path=OUT + '/v3-1-gps.png')
    pg.click('#toast .toast-b')  # Wrong place?
    time.sleep(0.5); print('sheet title:', pg.text_content('#locTitle'))
    pg.fill('#acIn', 'Hattiesburg'); pg.wait_for_selector('#acList .ac-item'); time.sleep(1); pg.keyboard.press('Enter'); time.sleep(5)
    print('chips:', pg.eval_on_selector_all('.loc-chip', 'e=>e.map(x=>x.textContent+(x.classList.contains("is-on")?"*":""))'))
    print('toast2:', pg.text_content('#toast'))
    # switch to Kennesaw and remove it via chevron menu
    pg.click('.loc-chip:not(.is-on)'); time.sleep(4)
    pg.click('.loc-more'); time.sleep(0.3)
    pg.screenshot(path=OUT + '/v3-2-menu.png')
    print('menu:', pg.text_content('.loc-menu'))
    pg.click('.loc-menu button'); time.sleep(6)
    print('after remove chips:', pg.eval_on_selector_all('.loc-chip', 'e=>e.map(x=>x.textContent)'), 'cty:', st(pg)['cty'])
    print('toast3:', pg.text_content('#toast'))
    # tips: close watch tip -> alarm tip
    for k in range(3):
        t = pg.eval_on_selector_all('.help-tip', 'e=>e.map(x=>x.dataset.tip)'); print('tips now:', t)
        if not t: break
        pg.click('.help-tip .layer-tip-x'); time.sleep(0.4)
    print('tips state:', st(pg)['tips'])
    # Help
    pg.click('#helpBtn'); time.sleep(1)
    print('after help:', pg.eval_on_selector_all('.help-tip', 'e=>e.map(x=>x.dataset.tip)'))
    pg.screenshot(path=OUT + '/v3-3-help.png')
    pg.click('.help-tip[data-tip="watch"] .layer-tip-x'); time.sleep(0.5)
    pg.screenshot(path=OUT + '/v3-3b-help-alarm.png')
    # silence speed
    pg.click('#testBtn'); time.sleep(1.5)
    t0 = time.time(); pg.dispatch_event('#hbAck', 'pointerdown', {'button': 0, 'pointerType': 'mouse'})
    print('silence: banner hidden', pg.is_hidden('#homeBanner'), 'sirenStop null', pg.evaluate('sirenStop === null'), 'testMode', pg.evaluate('testMode'))
    # settings
    for x in pg.query_selector_all('.help-tip .layer-tip-x'): x.click()
    pg.click('#settingsBtn'); time.sleep(0.8)
    print('settings first h3:', pg.eval_on_selector('#alertSheet h3', 'e=>e.textContent'))
    print('notif help:', pg.text_content('#notifHelp')[:200])
    pg.locator('#alertSheet .sheet-box').screenshot(path=OUT + '/v3-4-settings.png')
    pg.click('#alertSheet .sheet-x')
    # reload: tips stay closed
    pg.reload(); time.sleep(4); print('reload tips:', pg.eval_on_selector_all('.help-tip', 'e=>e.map(x=>x.dataset.tip)'))
    ctx.close()
    # Existing user from before this update: no new tips
    ctx = b.new_context(viewport={'width': 1300, 'height': 900}); pg = ctx.new_page(); W(pg, 'old-user')
    pg.goto(BASE + '/'); pg.evaluate("""localStorage.setItem('iw.v1', JSON.stringify({locs:[{id:'a',short:'Hattiesburg',st:'MS',name:'Hattiesburg, MS',lat:31.327,lon:-89.29}],act:'a',cty:['028035'],ctyN:{},snd:'siren',vol:0.8,len:20,extra:{},armed:false,pins:[],tips:{layers:1}}))""")
    pg.reload(); time.sleep(4); print('existing user tips:', pg.eval_on_selector_all('.help-tip', 'e=>e.map(x=>x.dataset.tip)'))
    ctx.close()
    # iPhone
    ctx = b.new_context(**p.devices['iPhone 13']); pg = ctx.new_page(); W(pg, 'ios')
    pg.goto(BASE + '/'); pg.wait_for_selector('#locSheet:not([hidden])'); pg.fill('#acIn', 'Hattiesburg'); pg.wait_for_selector('#acList .ac-item'); time.sleep(0.8)
    pg.tap('#acList .ac-item >> nth=0'); time.sleep(6)
    pg.screenshot(path=OUT + '/v3-5-phone.png')
    pg.click('#settingsBtn'); time.sleep(0.8); pg.screenshot(path=OUT + '/v3-6-phone-settings.png')
    print('ios notif state:', pg.text_content('#notifState'))
    b.close()
print('\n'.join(errs) or 'no errors')
