# Hillingdon Stags FC website

Sunday League website for Hillingdon Stags FC — Middlesex County Sunday League, Division Four (North).

## What's here

```
index.html        Homepage (next fixture, last result, league position, form, top scorers)
fixtures.html     All upcoming fixtures
results.html      All results this season
table.html        League table (Stags row highlighted in gold)
squad.html        Meet the squad (grouped by position)
scorers.html      Top scorers + MOTM leaderboards
reports.html      Match reports + photo gallery
contact.html      Get in touch / join us form

css/style.css     Brand stylesheet (black / gold / white)
js/main.js        Header, footer, data loaders, renderers
assets/badge.svg  Club badge (placeholder SVG until real PNG lands)

data/             All site data as JSON — replace via Mitoo scraper or by hand
  club.json       Club info (name, league, division, etc)
  fixtures.json   Upcoming fixtures
  results.json    Match results
  table.json      League table
  squad.json      Player roster
  scorers.json    Top scorers + MOTM
  reports.json    Match reports
```

## Running locally

Either open `index.html` directly in your browser, or run a quick local server so the JSON loads cleanly:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## How the site updates itself

Nothing here needs a deploy to stay current. Two things update on their own:

**1. Table, fixtures and results — every Sunday evening, automatically.**
The site runs as a Cloudflare Worker (`../wrangler.jsonc`, `../worker/`). A cron
trigger fires Sunday at 7pm and 8pm UTC (and again Monday) — so one run is always
8pm UK whatever the clocks are doing — scrapes Mitoo, and writes the fresh JSON
into KV. The Worker then serves `/data/table.json`, `/data/fixtures.json` and
`/data/results.json` from KV instead of the copies in this folder.

No GitHub Action, no deploy, no LLM. A run that comes back empty (Mitoo blocking,
site down) leaves the existing data alone rather than blanking the site.

Check freshness any time: `/data/_status.json`
Force an update now: `/data/_refresh?token=…` (token is in `../.refresh-token.local`)

**2. Match reports and player ratings — as soon as you save the sheet.**
The two published Google Sheets are read in the browser on every page load, so a
new row shows up on the next refresh. Note a report/ratings row only appears once
the match itself exists in the results — which the Sunday scrape handles.

### The `data/*.json` in this folder

These are the fallback copies baked into the deployment, used if KV is ever empty.
The scraper keeps them current:

```bash
node scraper/scrape-mitoo.mjs   # no dependencies needed
```

Everything else in `data/` (squad, sponsors, club, gallery, videos) is
hand-maintained and served straight from these files.

## Still to do

- Drop in real squad list (names, positions, shirt numbers)
- Replace placeholder badge SVG with the original PNG
- Hook up the contact form to a real backend
