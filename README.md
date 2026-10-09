# Isaias Watch

Live Hurricane Isaias dashboards, hosted on Vercel (project `isaias-watch`, team `tatum-turn-up`). One project serves two sites:

| Domain | What it is | Files |
| --- | --- | --- |
| isaias-watch.vercel.app | Public dashboard: pick your own places, tornado alarm for the counties you choose, X feed | everything at the repo root |
| isaias-tatumturnup.vercel.app | The original Hattiesburg / New Orleans dashboard | `tt/` (routed by host in `vercel.json`) |

No build step and no framework: plain HTML, CSS and JavaScript, plus three Node serverless functions in `api/`.

## Layout

- `index.html`, `base.js`, `core.js`, `alerts.js`, `help.js`, `x.js`, `places.js`, `share.js`, `pwa.js`, `sw.js`: the public page. The scripts are classic scripts that share top-level names, so check for clashes when adding one.
- `style.css`, `mobile.css`, `watch.css`, `help.css`, `x.css`: styles (the first two are shared with `tt/`).
- `api/watch.js`: data proxy for the public page (NHC, NHC graphics, Google News, wind grid, home-screen manifest).
- `api/feed.js`: data proxy for the original dashboard. `api/watch.js` borrows its wind grid, so `feed.js` must never call `watch.js`.
- `api/x.js`: posts from X through the free FxTwitter API, for an allowlist of vetted accounts, cached at Vercel's edge.
- `icons/`: app icons; `/icon-192.png`, `/icon-512.png` and `/apple-touch-icon.png` are routed here.
- `build.json`: bump `v` to show open pages a "new version" pill (`tt/build.json` does the same for the original dashboard).
- `tools/`: local test server (`node tools/serve.js "$PWD" 8787` emulates the Vercel routing) and Playwright checks. Not deployed (see `.vercelignore`).

## Analytics

Vercel Web Analytics is on for the project; both pages load `/_vercel/insights/script.js`. Filter by domain in the Analytics tab to tell the two sites apart.
