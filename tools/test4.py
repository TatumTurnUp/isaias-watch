import sys, time, json
from playwright.sync_api import sync_playwright
BASE, OUT = sys.argv[1], sys.argv[2]
errs = []
st = json.load(open('video/cap/info.json'))['state']
st['act'] = [l for l in st['locs'] if 'Hattiesburg' in json.dumps(l)][0]['id']
st['tips'] = {'_v': 2, 'alarm': 1, 'watch': 1, 'layers': 1, 'install': 1}
def W(pg, t):
    pg.on('pageerror', lambda e: errs.append(f'[{t}] {e}'))
    pg.on('console', lambda m: errs.append(f'[{t}] {m.text}') if m.type == 'error' else None)
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, ctxargs in [('desk', dict(viewport={'width': 1440, 'height': 950})), ('ios', dict(**p.devices['iPhone 13']))]:
        ctx = b.new_context(**ctxargs)
        ctx.add_init_script("try{ if(!localStorage.getItem('iw.v1')) localStorage.setItem('iw.v1', %s) }catch(e){}" % json.dumps(json.dumps(st)))
        pg = ctx.new_page(); W(pg, name)
        pg.goto(BASE + '/', wait_until='domcontentloaded'); time.sleep(8)
        pg.evaluate("document.querySelectorAll('.install-tip').forEach(t=>t.remove()); toast.hidden = true")
        pg.evaluate("document.getElementById('cardX').scrollIntoView({block:'center'})"); time.sleep(2.5)
        print(name, 'sel:', pg.text_content('#xSel'))
        print(name, 'items:', pg.eval_on_selector_all('#xFeed .xp', 'els => els.length'), pg.eval_on_selector_all('#xFeed .xp .xp-h', 'els => els.slice(0,5).map(e => e.textContent.replace(/\\s+/g," ").trim())'))
        print(name, 'tip shown:', pg.is_visible('.help-tip[data-tip="xfeed"]'))
        pg.locator('#cardX').screenshot(path=f'{OUT}/{name}_card.png')
        pg.screenshot(path=f'{OUT}/{name}_view.png')
        pg.click('#xPickBtn'); time.sleep(0.8)
        print(name, 'tip after open:', pg.is_visible('.help-tip[data-tip="xfeed"]'), 'tips state', pg.evaluate("JSON.parse(localStorage.getItem('iw.v1')).tips.xfeed"))
        print(name, 'groups:', pg.eval_on_selector_all('#xGroups h3', 'els => els.map(e => e.textContent)'), 'near:', pg.eval_on_selector_all('#xGroups .x-near', 'els => els.length'))
        pg.screenshot(path=f'{OUT}/{name}_sheet.png')
        if name == 'desk':
            pg.check('[data-xa="NWSMobile"]'); pg.check('[data-xa="WDAM"]'); time.sleep(4)
            pg.check('#xTag'); time.sleep(5)
            pg.evaluate("document.querySelector('#xSheet .sheet-x').click()"); time.sleep(0.5)
            print(name, 'sel2:', pg.text_content('#xSel'))
            print(name, 'users:', sorted(set(pg.eval_on_selector_all('#xFeed .xp .xp-u', 'els => els.map(e => e.textContent)'))), 'top badges:', pg.eval_on_selector_all('#xFeed .xp-top', 'els => els.length'), 'areas:', sorted(set(pg.eval_on_selector_all('#xFeed .xp-area', 'els => els.map(e => e.textContent)'))))
            pg.click('#xMore') if pg.is_visible('#xMore') else None; time.sleep(0.5)
            print(name, 'after more:', pg.eval_on_selector_all('#xFeed .xp', 'els => els.length'))
            pg.locator('#cardX').screenshot(path=f'{OUT}/{name}_card2.png')
            pg.reload(wait_until='domcontentloaded'); time.sleep(6)
            print(name, 'persist:', pg.evaluate("JSON.parse(localStorage.getItem('iw.v1')).x"))
            pg.click('#helpBtn'); time.sleep(1.5)
            print(name, 'help shows x tip:', pg.eval_on_selector_all('.help-tip[data-tip="xfeed"]', 'els => els.length'))
        ctx.close()
    # old dashboard
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_cookies([{'name': 'iw_old', 'value': '1', 'url': BASE}])
    pg = ctx.new_page(); W(pg, 'old'); pg.goto(BASE + '/', wait_until='domcontentloaded'); time.sleep(5)
    print('old banner:', pg.text_content('.new-site').strip()[:120], '| title', pg.text_content('.stat-home dt'))
    pg.screenshot(path=f'{OUT}/old_top.png'); ctx.close()
    ctx = b.new_context(**p.devices['iPhone 13']); ctx.add_cookies([{'name': 'iw_old', 'value': '1', 'url': BASE}])
    pg = ctx.new_page(); W(pg, 'old-ios'); pg.goto(BASE + '/', wait_until='domcontentloaded'); time.sleep(5)
    pg.screenshot(path=f'{OUT}/old_ios.png'); print('old ios sw', pg.evaluate('document.documentElement.scrollWidth'))
    b.close()
print('\n'.join(errs[:30]) or 'no errors')
