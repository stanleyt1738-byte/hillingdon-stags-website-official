/* ============================================================
   Mitoo Football scraper
   Pulls fixtures, results and the league table from Mitoo and
   writes JSON files into ../data/

   Usage:
     node scraper/scrape-mitoo.mjs
   ============================================================ */

import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "..", "data");

const TEAM_NAME = "Hillingdon Stags";
const SEASON = "2026/27";
const DIVISION_LABEL = "Division Three";

const BASE = "https://www.mitoofootball.com";
const DIVISION_ID = "4";
const LEAGUE_CODE = "MDXS2026";

// Season runs August through May — sweep every month so the whole
// season's fixtures/results get picked up regardless of when this runs.
const SEASON_MONTHS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];

// Mitoo URLs we scrape
const PAGES = {
  // League table — confirmed structure: <table class="leagueTable"> with <tr class="bg_highlight0">
  table: `${BASE}/LeagueTab.cfm?TblName=Matches&DivisionID=${DIVISION_ID}&LeagueCode=${LEAGUE_CODE}`,
  // Whole-division fixtures/results for a given month. NOTE: the old TeamHist.cfm /
  // TeamHistAll.cfm "team history" endpoints throw a server-side error on Mitoo
  // (missing OrdinalID param) — confirmed broken as of 2026-09-13, and every past
  // scrape using them silently produced empty fixtures/results. This page works.
  monthFixtures: (m) => `${BASE}/FixtResMonth.cfm?TblName=Matches&DivisionID=${DIVISION_ID}&LeagueCode=${LEAGUE_CODE}&MonthNo=${m}`
};

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "HillingdonStagsBot/1.0 (+https://github.com/hillingdon-stags)" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.text();
}

function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }

function parseUKDate(str) {
  // "Sun 03 May" -> ISO with current/next year guess
  const m = clean(str).match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (!m) return null;
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const day = parseInt(m[1], 10);
  const month = months[m[2].toLowerCase()];
  // Guess year: anything July+ = current year start of season; Jan-Jun = following year
  const now = new Date();
  let year = now.getFullYear();
  const seasonStartYear = parseInt(SEASON.split("/")[0], 10);
  if (!isNaN(seasonStartYear)) {
    year = (month >= 7) ? seasonStartYear : seasonStartYear + 1;
  } else if (month < 7 && now.getMonth() > 6) {
    year = year + 1;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* --------- Scrape: league table ---------
   Mitoo HTML structure (confirmed from live page):
     <table class="leagueTable">
       <tr class="bg_highlight0">
         <td><a href="TeamHist.cfm?CI=..."><span class="pix13realblack">Team Name</span></a></td>
         <td><span class="pix13realblack">P</span></td>
         <td><span class="pix13realblack">W</span></td>
         <td><span class="pix13realblack">D</span></td>
         <td><span class="pix13realblack">L</span></td>
         <td><span class="pix13realblack">GF</span></td>
         <td><span class="pix13realblack">GA</span></td>
         <td><span class="pix13realblack">+10</span></td>
         <td><span class="pix13realblack">Pts</span></td>
       </tr>
   Position is implicit by row order.
*/
function parseTablePage(html) {
  const $ = cheerio.load(html);
  const rows = [];
  let pos = 0;

  $("table.leagueTable tr.bg_highlight0").each((_, tr) => {
    const cells = $(tr).find("td").map((_, td) => clean($(td).text())).get();
    if (cells.length < 9) return;

    pos += 1;
    const team = cells[0];
    const num = (s) => {
      const v = parseInt((s || "").replace(/[^-\d]/g, ""), 10);
      return Number.isFinite(v) ? v : 0;
    };

    const P  = num(cells[1]);
    const W  = num(cells[2]);
    const D  = num(cells[3]);
    const L  = num(cells[4]);
    const GF = num(cells[5]);
    const GA = num(cells[6]);
    const GD = num(cells[7]);
    const Pts = num(cells[8]);

    rows.push({
      pos,
      team,
      P, W, D, L, GF, GA,
      GD: Number.isFinite(GD) ? GD : (GF - GA),
      Pts,
      us: team.toLowerCase().includes(TEAM_NAME.toLowerCase())
    });
  });

  return rows;
}

/* --------- Scrape: one month of division fixtures/results ---------
   Mitoo HTML structure (confirmed from live page, 2026-09-13):
     <a href="MtchDay.cfm?...">Sunday, 13 September 2026</a>   <- date header row
     <tr class="bg_contrast">
       <td width="35"><span class="pix13bold">3</span></td>    <- home goals (blank if unplayed)
       <td width="35"><span class="pix13bold">7</span></td>    <- away goals (blank if unplayed)
       <td>
         <span class="pix13bold">Hillingdon Stags</span> <span class="pix13">v</span> <span class="pix13bold">Richmond Saints</span>
         <span class="pix10navy">Bedfont Football & Social Club</span>   <- venue
       </td>
       ...referee...
     </tr>
   We walk rows in document order, tracking the most recent date header, and
   only keep rows involving TEAM_NAME.
*/
function parseFixtResMonth(html) {
  const $ = cheerio.load(html);
  const fixtures = [];
  const results = [];
  let currentDate = null;

  $("tr").each((_, tr) => {
    const $tr = $(tr);

    const dateSpan = $tr.find('a[href*="MtchDay.cfm"] span.pix13bold').first();
    if (dateSpan.length) {
      currentDate = parseUKDate(clean(dateSpan.text()));
      return;
    }

    if (!$tr.hasClass("bg_contrast") || !currentDate) return;

    const scoreCells = $tr.find('td[width="35"] span.pix13bold');
    if (scoreCells.length < 2) return;
    const homeGoalsRaw = clean($(scoreCells[0]).text());
    const awayGoalsRaw = clean($(scoreCells[1]).text());

    const teamSpans = $tr.find("span.pix13bold").slice(2); // skip the two score spans
    const home = clean(teamSpans.eq(0).text());
    const away = clean(teamSpans.eq(1).text());
    if (!home || !away) return;
    if (home !== TEAM_NAME && away !== TEAM_NAME) return;

    const venue = clean($tr.find("span.pix10navy").first().text());

    if (homeGoalsRaw !== "" && awayGoalsRaw !== "") {
      results.push({
        date: currentDate,
        competition: DIVISION_LABEL,
        home,
        homeGoals: parseInt(homeGoalsRaw, 10),
        away,
        awayGoals: parseInt(awayGoalsRaw, 10),
        venue,
        scorers: [],
        motm: null
      });
    } else {
      const kickoffMatch = clean($tr.text()).match(/\b(\d{1,2}:\d{2}\s?[AP]M)\b/i);
      fixtures.push({
        date: currentDate,
        kickoff: kickoffMatch ? kickoffMatch[1] : "10:30 AM",
        home,
        away,
        venue,
        competition: DIVISION_LABEL
      });
    }
  });

  return { fixtures, results };
}

/* --------- Merge freshly scraped results with hand-added extras ---------
   scorers/motm/report/playerRatings get added by hand after the fact —
   don't let a re-scrape wipe them for a match we already have on file.
*/
function mergeResults(freshResults, previousResults) {
  const keyOf = (r) => `${r.date}|${r.home}|${r.away}`;
  const previousByKey = new Map((previousResults || []).map(r => [keyOf(r), r]));

  return freshResults.map(r => {
    const prev = previousByKey.get(keyOf(r));
    if (!prev) return r;
    return { ...r, scorers: prev.scorers?.length ? prev.scorers : r.scorers, motm: prev.motm ?? r.motm, ...(prev.report ? { report: prev.report } : {}), ...(prev.reportTitle ? { reportTitle: prev.reportTitle } : {}), ...(prev.playerRatings ? { playerRatings: prev.playerRatings } : {}) };
  });
}

async function readPreviousJson(filename) {
  try {
    const raw = await readFile(resolve(DATA_DIR, filename), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/* --------- Save helper --------- */
async function saveJson(filename, payload) {
  const path = resolve(DATA_DIR, filename);
  await writeFile(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${path}`);
}

/* --------- Main --------- */
async function main() {
  const now = new Date().toISOString();

  // 1. League table
  try {
    const html = await fetchHtml(PAGES.table);
    const table = parseTablePage(html);
    if (table.length) {
      await saveJson("table.json", {
        lastUpdated: now,
        source: PAGES.table,
        season: SEASON,
        division: "Middlesex County Sunday League · Division Three",
        table
      });
      console.log(`League table: ${table.length} teams`);
    } else {
      console.warn("League table: no rows parsed");
    }
  } catch (e) {
    console.warn("Table page failed:", e.message);
  }

  // 2. Fixtures and results — swept month by month across the whole season
  const allFixtures = [];
  const allResults = [];
  const monthUrls = SEASON_MONTHS.map(PAGES.monthFixtures);

  for (const url of monthUrls) {
    try {
      const html = await fetchHtml(url);
      const { fixtures, results } = parseFixtResMonth(html);
      allFixtures.push(...fixtures);
      allResults.push(...results);
    } catch (e) {
      console.warn(`Month page failed (${url}):`, e.message);
    }
  }
  console.log(`Fixtures/results sweep: ${allFixtures.length} fixtures, ${allResults.length} results`);

  const monthSource = `${BASE}/FixtResMonth.cfm?TblName=Matches&DivisionID=${DIVISION_ID}&LeagueCode=${LEAGUE_CODE}&MonthNo={8..12,1..5}`;

  const previousResults = await readPreviousJson("results.json");
  const mergedResults = mergeResults(allResults, previousResults?.results);

  await saveJson("fixtures.json", {
    lastUpdated: now,
    source: monthSource,
    fixtures: allFixtures.sort((a, b) => a.date.localeCompare(b.date))
  });

  await saveJson("results.json", {
    lastUpdated: now,
    source: monthSource,
    results: mergedResults.sort((a, b) => b.date.localeCompare(a.date))
  });

  console.log("Done.");
}

main().catch(err => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
