/* ============================================================
   Mitoo Football scraper
   Pulls fixtures, results and the league table from Mitoo and
   writes JSON files into ../data/

   Usage:
     node scraper/scrape-mitoo.mjs
   ============================================================ */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "..", "Hillingdon Stags Website", "data");

const TEAM_NAME = "Hillingdon Stags";
const TEAM_CI = "4870";  // Mitoo team ID for Hillingdon Stags
const SEASON = "2025/26";

const BASE = "https://www.mitoofootball.com";
const DIVISION_ID = "220";
const LEAGUE_CODE = "MDXS2025";

// Mitoo URLs we scrape
const PAGES = {
  // League table — confirmed structure: <table class="leagueTable"> with <tr class="bg_highlight0">
  table: `${BASE}/LeagueTab.cfm?TblName=Matches&DivisionID=${DIVISION_ID}&LeagueCode=${LEAGUE_CODE}`,
  // Team history — all fixtures and results for our team in one page
  teamHistory: `${BASE}/TeamHist.cfm?CI=${TEAM_CI}&DivisionID=${DIVISION_ID}&TblName=Matches&LeagueCode=${LEAGUE_CODE}`,
  // Per-month fixtures and results across the whole division (fallback)
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
  const seasonStartYear = parseInt(SEASON.split("/")[0], 10) + 2000;
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

/* --------- Scrape: team history (Stags fixtures + results) ---------
   On the TeamHist page, matches are listed with date, opponent, score (or "v" for upcoming),
   home/away indicator, and venue. We detect score-shaped text to split fixtures vs results.
*/
function parseTeamHistory(html) {
  const $ = cheerio.load(html);
  const fixtures = [];
  const results = [];

  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td").map((_, td) => clean($(td).text())).get();
    if (cells.length < 4) return;
    const text = cells.join(" | ");
    // Find an ISO-ish or DD MMM date
    const isoDate = parseUKDate(text);
    if (!isoDate) return;

    const scoreMatch = text.match(/(\d+)\s*[-–]\s*(\d+)/);
    // Find opponent — assume first cell with a recognisable team name (not Stags, not date, not score)
    const opponentCells = cells.filter(c =>
      c && !/^\d/.test(c) && !/^v$/i.test(c) && c.toLowerCase() !== TEAM_NAME.toLowerCase());

    if (scoreMatch) {
      const [_, hg, ag] = scoreMatch;
      // Detect home/away — usually the home team is listed first
      const stagsFirst = text.toLowerCase().indexOf(TEAM_NAME.toLowerCase()) < (opponentCells[0] ? text.toLowerCase().indexOf(opponentCells[0].toLowerCase()) : Infinity);
      const opponent = opponentCells.find(c => c.toLowerCase() !== TEAM_NAME.toLowerCase()) || "";
      results.push({
        date: isoDate,
        home: stagsFirst ? TEAM_NAME : opponent,
        homeGoals: parseInt(stagsFirst ? hg : ag, 10),
        away: stagsFirst ? opponent : TEAM_NAME,
        awayGoals: parseInt(stagsFirst ? ag : hg, 10),
        scorers: [],
        motm: null
      });
    } else if (/\sv\s/i.test(text)) {
      const opponent = opponentCells.find(c => c.toLowerCase() !== TEAM_NAME.toLowerCase()) || "";
      const stagsFirst = text.toLowerCase().indexOf(TEAM_NAME.toLowerCase()) < text.toLowerCase().indexOf(opponent.toLowerCase());
      const time = (text.match(/\b(\d{1,2}[:\.]\d{2})\b/) || [])[1] || "10:30";
      fixtures.push({
        date: isoDate,
        kickoff: time.replace(".", ":"),
        home: stagsFirst ? TEAM_NAME : opponent,
        away: stagsFirst ? opponent : TEAM_NAME,
        venue: "",
        competition: "League"
      });
    }
  });

  return { fixtures, results };
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
        division: "Middlesex County Sunday League · Division Four (North)",
        table
      });
      console.log(`League table: ${table.length} teams`);
    } else {
      console.warn("League table: no rows parsed");
    }
  } catch (e) {
    console.warn("Table page failed:", e.message);
  }

  // 2. Team history — Stags fixtures and results
  try {
    const html = await fetchHtml(PAGES.teamHistory);
    const { fixtures, results } = parseTeamHistory(html);
    console.log(`Team history: ${fixtures.length} fixtures, ${results.length} results`);

    if (fixtures.length) {
      await saveJson("fixtures.json", {
        lastUpdated: now,
        source: PAGES.teamHistory,
        fixtures: fixtures.sort((a, b) => a.date.localeCompare(b.date))
      });
    }

    if (results.length) {
      await saveJson("results.json", {
        lastUpdated: now,
        source: PAGES.teamHistory,
        results: results.sort((a, b) => b.date.localeCompare(a.date))
      });
    }
  } catch (e) {
    console.warn("Team history page failed:", e.message);
  }

  console.log("Done.");
}

main().catch(err => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
