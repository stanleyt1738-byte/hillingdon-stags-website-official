/* ============================================================
   Mitoo scrape orchestration — runtime-agnostic.

   Used by both the Cloudflare Worker cron (worker/index.js) and
   the local Node scraper (Hillingdon Stags Website/scraper/scrape-mitoo.mjs)
   so the two can never drift apart.
   ============================================================ */

import { parseTablePage, parseFixtResMonth } from "./mitoo-parse.js";

export const TEAM_NAME = "Hillingdon Stags";
export const SEASON = "2026/27";
export const DIVISION_LABEL = "Division Three";
export const DIVISION_FULL = "Middlesex County Sunday League · Division Three";

const BASE = "https://www.mitoofootball.com";
const DIVISION_ID = "4";
const LEAGUE_CODE = "MDXS2026";

// Season runs August through May — sweep every month so the whole season's
// fixtures/results get picked up regardless of when this runs.
const SEASON_MONTHS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];

const SEASON_START_YEAR = parseInt(SEASON.split("/")[0], 10);

export const TABLE_URL =
  `${BASE}/LeagueTab.cfm?TblName=Matches&DivisionID=${DIVISION_ID}&LeagueCode=${LEAGUE_CODE}`;

// The TeamHist.cfm / TeamHistAll.cfm "team history" endpoints throw a
// server-side error on Mitoo (missing OrdinalID) — confirmed 2026-09-13.
// The month view is the one that works.
const monthUrl = (m) =>
  `${BASE}/FixtResMonth.cfm?TblName=Matches&DivisionID=${DIVISION_ID}&LeagueCode=${LEAGUE_CODE}&MonthNo=${m}`;

export const MONTH_SOURCE =
  `${BASE}/FixtResMonth.cfm?TblName=Matches&DivisionID=${DIVISION_ID}&LeagueCode=${LEAGUE_CODE}&MonthNo={8..12,1..5}`;

// Every Mitoo page a full refresh reads. The Apps Script relay asks the Worker
// for this list, so a new season only means editing the constants above.
export const ALL_URLS = [TABLE_URL, ...SEASON_MONTHS.map(monthUrl)];

async function defaultFetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      // Mitoo rejects obvious bot traffic from datacenter IPs — GitHub Actions
      // runners have been blocked outright since 2026-09-15. A browser-like UA
      // is cheap insurance.
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.text();
}

/* Hand-added extras (scorers / motm / report / playerRatings) are layered onto
   freshly scraped rows so a re-scrape never wipes them. */
export function mergeResults(freshResults, previousResults) {
  const keyOf = (r) => `${r.date}|${r.home}|${r.away}`;
  const previousByKey = new Map((previousResults || []).map(r => [keyOf(r), r]));

  return freshResults.map(r => {
    const prev = previousByKey.get(keyOf(r));
    if (!prev) return r;
    return {
      ...r,
      scorers: prev.scorers?.length ? prev.scorers : r.scorers,
      motm: prev.motm ?? r.motm,
      ...(prev.report ? { report: prev.report } : {}),
      ...(prev.reportTitle ? { reportTitle: prev.reportTitle } : {}),
      ...(prev.playerRatings ? { playerRatings: prev.playerRatings } : {})
    };
  });
}

/**
 * Scrapes the league table plus the whole season's fixtures/results.
 *
 * @param {object} opts
 * @param {Array}  opts.previousResults  results array from the last known-good
 *                                       data, so manual extras survive.
 * @param {(msg: string) => void} [opts.log]
 * @param {(url: string) => Promise<string>} [opts.fetchHtml]  defaults to a
 *                                       live fetch; the relay passes pages in.
 * @returns {Promise<{table, fixtures, results, blocked, warnings}>}
 *   `blocked` is true when Mitoo returned nothing usable — the caller must then
 *   leave existing data untouched rather than publishing empties.
 */
export async function scrapeAll({ previousResults = [], log = () => {}, fetchHtml = defaultFetchHtml } = {}) {
  const warnings = [];
  const now = new Date().toISOString();
  let tableBlocked = false;

  let table = null;
  try {
    const html = await fetchHtml(TABLE_URL);
    const rows = parseTablePage(html, TEAM_NAME);
    if (rows.length) {
      table = {
        lastUpdated: now,
        source: TABLE_URL,
        season: SEASON,
        division: DIVISION_FULL,
        table: rows
      };
      log(`League table: ${rows.length} teams`);
    } else {
      warnings.push("League table: no rows parsed");
      tableBlocked = true;
    }
  } catch (e) {
    warnings.push(`Table page failed: ${e.message}`);
    tableBlocked = true;
  }

  const allFixtures = [];
  const allResults = [];
  for (const m of SEASON_MONTHS) {
    const url = monthUrl(m);
    try {
      const html = await fetchHtml(url);
      const { fixtures, results } = parseFixtResMonth(html, {
        teamName: TEAM_NAME,
        seasonStartYear: SEASON_START_YEAR,
        competition: DIVISION_LABEL
      });
      allFixtures.push(...fixtures);
      allResults.push(...results);
    } catch (e) {
      warnings.push(`Month page failed (MonthNo=${m}): ${e.message}`);
    }
  }
  log(`Fixtures/results sweep: ${allFixtures.length} fixtures, ${allResults.length} results`);

  // A whole-season sweep returning nothing at all almost always means the fetch
  // was blocked or challenged, not that the club genuinely has zero fixtures and
  // zero results all season. Never let that overwrite good data (incident
  // 2026-09-15: six days of "successful" runs silently blanked the site).
  const sweepEmpty = allFixtures.length === 0 && allResults.length === 0;
  const hadPrevious = (previousResults || []).length > 0;

  let fixtures = null;
  let results = null;
  if (sweepEmpty && hadPrevious) {
    warnings.push("Fixtures/results sweep returned nothing but previous data exists — leaving data untouched.");
  } else {
    fixtures = {
      lastUpdated: now,
      source: MONTH_SOURCE,
      fixtures: allFixtures.sort((a, b) => a.date.localeCompare(b.date))
    };
    results = {
      lastUpdated: now,
      source: MONTH_SOURCE,
      results: mergeResults(allResults, previousResults).sort((a, b) => b.date.localeCompare(a.date))
    };
  }

  const blocked = tableBlocked || (sweepEmpty && hadPrevious);
  return { table, fixtures, results, blocked, warnings, lastUpdated: now };
}
