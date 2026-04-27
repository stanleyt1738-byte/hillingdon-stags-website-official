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

## Updating content

**The site reads everything from `data/*.json`.** Tell me what to update and I'll edit the right file — you don't need to touch any code.

Once we wire up the Mitoo scraper, fixtures / results / table will update themselves.

## Still to do

- Wire up the Mitoo scraper (needs `mitoofootball.com` allowlisted)
- Drop in real squad list (names, positions, shirt numbers)
- Replace placeholder badge SVG with the original PNG
- Deploy to Netlify with auto-update schedule
- Hook up the contact form to a real backend (Formspree or Netlify Forms)
