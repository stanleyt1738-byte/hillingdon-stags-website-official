import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "..", "Hillingdon Stags Website", "data");

const TEAM_NAME = "Hillingdon Stags";
const TEAM_CI = "4870";
const SEASON = "2025/26";
const BASE = "https://www.mitoofootball.com";
const DIVISION_ID = "220";
const LEAGUE_CODE = "MDXS2025";

const PAGES = {
  table: `${BASE}/LeagueTab.cfm?TblName=Matches&DivisionID=${DIVISION_ID}&LeagueCode=${LEAGUE_CODE}`,
  teamHistory: `${BASE}/TeamHist.cfm?CI=${TEAM_CI}&DivisionID=${DIVISION_ID}&TblName=Matches&LeagueCode=${LEAGUE_CODE}`
};

// Mitoo gives names as "I.Surname" — map them to full names
const NAME_MAP = {
  "J.Garnham":     "Jack Garnham",
  "S.O'Toole":     "Stan O'Toole",
  "T.Richards":    "Tyler Richards",
  "R.Bourke":      "Reggie Bourke",
  "M.Chahal":      "Mason Chahal",
  "L.Jones":       "Lewis Jones",
  "K.Pusey":       "Kieran Pusey",
  "T.McDonald":    "Logan McDonald",
  "J.Norman":      "Jack Norman",
  "Z.Rogers":      "Zak Rogers",
  "S.Thompson":    "Stanley Thompson",
  "B.Watkins":     "Billy Watkins",
  "J.Carmody":     "Jack Carmody",
  "C.Henry":       "Chris Henry",
  "J.Murphy":      "Joe Murphy",
  "M.Wood":        "Max Wood",
  "G.Blood":       "George Blood",
  "J.Burlikowski": "Jack Burlikowski",
  "R.Carmody":     "Ryan Carmody",
  "F.Evans":       "Finley Evans",
  "J.Gunn":        "Jamie Gunn",
  "J.Harper":      "Jack Harper",
  "C.Hibbs":       "Cameron Hibbs",
  "J.Nicholson":   "Jake Nicholson",
  "C.Rogers":      "Cody Rogers"
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": "HillingdonStagsBot/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.text();
}

const clean = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const mapName = (n) => NAME_MAP[clean(n)] || clean(n);

function parseUKDate(str) {
  const m = clean(str).match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})?/i);
  if (!m) return null;
  const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const day = parseInt(m[1], 10);
  const month = months[m[2].toLowerCase()];
  let year = m[3] ? parseInt(m[3], 10) : null;
  if (!year) {
    const seasonStart = parseInt(SEASON.split("/")[0], 10) + 2000;
    year = (month >= 7) ? seasonStart : seasonStart + 1;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTablePage(html) {
  const $ = cheerio.load(html);
  const rows = [];
  let pos = 0;
  $("table.leagueTable tr.bg_highlight0").each((_, tr) => {
    const cells = $(tr).find("td").map((_, td) => clean($(td).text())).get();
    if (cells.length < 9) return;
    pos += 1;
    const num = (s) => {
      const v = parseInt((s || "").replace(/[^-\d]/g, ""), 10);
      return Number.isFinite(v) ? v : 0;
    };
    rows.push({
      pos, team: cells[0],
      P: num(cells[1]), W: num(cells[2]), D: num(cells[3]), L: num(cells[4]),
      GF: num(cells[5]), GA: num(cells[6]), GD: num(cells[7]), Pts: num(cells[8]),
      us: cells[0].toLowerCase().includes(TEAM_NAME.toLowerCase())
    });
  });
  return rows;
}

function parseTeamHistory(html) {
  const $ = cheerio.load(html);
  const fixtures = [];
  const results = [];
  const trs = $("tr").toArray();

  for (let i = 0; i < trs.length; i++) {
    const $tr = $(trs[i]);
    const cells = $tr.children("td").map((_, td) => clean($(td).text())).get();
    if (cells.length !== 6) continue;

    const [marker, homeTeam, hgStr, agStr, awayTeam, dateStr] = cells;
    const m = (marker || "").trim();
    if (m && !/^[WDL]$/.test(m)) continue;

    const isoDate = parseUKDate(dateStr);
    if (!isoDate) continue;

    const homeIsStags = homeTeam.toLowerCase().includes("hillingdon stags");
    const awayIsStags = awayTeam.toLowerCase().includes("hillingdon stags");
    if (!homeIsStags && !awayIsStags) continue;

    let scorers = [];
    let motm = null;
    if (i + 1 < trs.length) {
      const $next = $(trs[i + 1]);
      $next.find("span.pix10, span.pix10red").each((_, el) => {
        const $el = $(el);
        if ($el.hasClass("pix10navy")) return;
        const text = clean($el.text());
        const match = text.match(/^([A-Z]\.[A-Za-z'\-]+)\s*(?:\((\d+)\))?$/);
        if (!match) return;
        const fullName = mapName(match[1]);
        scorers.push(match[2] ? `${fullName} (${match[2]})` : fullName);
      });
      const motmEl = $next.find("span.pix10navy em").first();
      if (motmEl.length) motm = mapName(motmEl.text());
    }

    const hg = parseInt(hgStr.replace(/[^\d]/g, ""), 10);
    const ag = parseInt(agStr.replace(/[^\d]/g, ""), 10);

    if (/^[WDL]$/.test(m) && Number.isFinite(hg) && Number.isFinite(ag) && hg <= 30 && ag <= 30) {
      results.push({ date: isoDate, home: homeTeam, homeGoals: hg, away: awayTeam, awayGoals: ag, scorers, motm });
    } else if (!m && !/\d/.test(hgStr) && !/\d/.test(agStr)) {
      fixtures.push({ date: isoDate, kickoff: "10:30", home: homeTeam, away: awayTeam, venue: "", competition: "League" });
    }
  }
  return { fixtures, results };
}

function parseGoalscorers(html) {
  const $ = cheerio.load(html);
  const scorers = [];
  $("table").each((_, table) => {
    const $table = $(table);
    if (!$table.text().toLowerCase().includes("goalscorers")) return;
    $table.find("tr").each((_, tr) => {
      const cells = $(tr).children("td").map((_, td) => clean($(td).text())).get();
      if (cells.length < 7) return;
      const nameMatch = cells[1].match(/^([A-Z][A-Za-z'\-]+)\s+([A-Z])$/);
      if (!nameMatch) return;
      const key = `${nameMatch[2]}.${nameMatch[1]}`;
      const apps = parseInt(cells[2].replace(/[^\d]/g, ""), 10);
      const goals = parseInt(cells[6].replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(goals) && goals > 0) {
        scorers.push({ name: mapName(key), goals, apps: Number.isFinite(apps) ? apps : 0 });
      }
    });
  });
  return scorers.sort((a, b) => b.goals - a.goals);
}

function deriveMotm(results) {
  const counts = {};
  for (const r of results) if (r.motm) counts[r.motm] = (counts[r.motm] || 0) + 1;
  return Object.entries(counts).map(([name, awards]) => ({ name, awards })).sort((a, b) => b.awards - a.awards);
}

async function saveJson(filename, payload) {
  const path = resolve(DATA_DIR, filename);
  await writeFile(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${path}`);
}

async function main() {
  const now = new Date().toISOString();

  // 1. League table
  try {
    const html = await fetchHtml(PAGES.table);
    const table = parseTablePage(html);
    if (table.length >= 8) {
      await saveJson("table.json", {
        lastUpdated: now, source: PAGES.table, season: SEASON,
        division: "Middlesex County Sunday League · Division Four (North)", table
      });
      console.log(`✓ League table: ${table.length} teams`);
    } else {
      console.warn(`! Suspiciously few teams (${table.length}), skipping table save`);
    }
  } catch (e) { console.warn("Table page failed:", e.message); }

  // 2. Team history → fixtures, results, scorers, MOTM
  try {
    const html = await fetchHtml(PAGES.teamHistory);
    const { fixtures, results } = parseTeamHistory(html);
    const scorers = parseGoalscorers(html);
    const motm = deriveMotm(results);
    console.log(`✓ Team history: ${fixtures.length} fixtures, ${results.length} results, ${scorers.length} scorers, ${motm.length} MOTM`);

    // Always overwrite fixtures (legitimately can be 0 at end of season)
    await saveJson("fixtures.json", {
      lastUpdated: now, source: PAGES.teamHistory,
      fixtures: fixtures.sort((a, b) => a.date.localeCompare(b.date))
    });

    // Safety: only overwrite results if we got a sensible number
    if (results.length >= 5) {
      await saveJson("results.json", {
        lastUpdated: now, source: PAGES.teamHistory,
        results: results.sort((a, b) => b.date.localeCompare(a.date))
      });
    } else {
      console.warn(`! Only ${results.length} results parsed — keeping existing file as a safety`);
    }

    // Scorers: only overwrite if we got at least 1
    if (scorers.length >= 1) {
      await saveJson("scorers.json", {
        lastUpdated: now, source: PAGES.teamHistory, season: SEASON, scorers, motm
      });
    } else {
      console.warn(`! No scorers parsed — keeping existing file as a safety`);
    }
  } catch (e) { console.warn("Team history page failed:", e.message); }

  console.log("Done.");
}

main().catch(err => { console.error("Scraper failed:", err); process.exit(1); });
