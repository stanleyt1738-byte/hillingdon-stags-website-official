/* ============================================================
   Mitoo HTML parsing — shared by the Cloudflare Worker cron and
   the local Node scraper.

   Deliberately dependency-free (no cheerio) so the exact same
   code runs in both the Workers runtime and Node. Mitoo's markup
   is old-school ColdFusion-generated XHTML: well-formed, every
   tag explicitly closed, so a small tokeniser is enough.
   ============================================================ */

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img",
  "input", "link", "meta", "param", "source", "track", "wbr"]);

const TOKEN_RE = new RegExp(
  "<!--[\\s\\S]*?-->" +                                   // comment
  "|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>" +                     // cdata
  "|<![^>]*>" +                                           // doctype
  "|<\\/\\s*([a-zA-Z][\\w:.-]*)[^>]*>" +                  // close tag -> $1
  "|<\\s*([a-zA-Z][\\w:.-]*)((?:'[^']*'|\"[^\"]*\"|[^'\">])*)(\\/?)>", // open -> $2 name, $3 attrs, $4 self-closing
  "g"
);

const ATTR_RE = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function parseAttrs(raw) {
  const attrs = {};
  if (!raw) return attrs;
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw))) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    const named = ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

export function clean(s) {
  return decodeEntities(s || "").replace(/\s+/g, " ").trim();
}

/* Yields {type:"open"|"close"|"text", ...} in document order.
   <script>/<style> bodies are stripped first so stray `<` in
   JavaScript can't be mistaken for markup. */
function* tokenize(html) {
  const src = String(html)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "");

  let last = 0, m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(src))) {
    if (m.index > last) yield { type: "text", text: src.slice(last, m.index) };
    last = TOKEN_RE.lastIndex;
    if (m[1]) {
      yield { type: "close", name: m[1].toLowerCase() };
    } else if (m[2]) {
      const name = m[2].toLowerCase();
      const self = m[4] === "/" || VOID_TAGS.has(name);
      yield { type: "open", name, attrs: parseAttrs(m[3]), self };
    }
    // comments / doctype produce nothing
  }
  if (last < src.length) yield { type: "text", text: src.slice(last) };
}

function hasClass(attrs, cls) {
  return (attrs.class || "").split(/\s+/).includes(cls);
}

/* --------- League table ---------
   <table class="leagueTable">
     <tr class="bg_highlight0">
       <td>Team</td><td>P</td><td>W</td><td>D</td><td>L</td>
       <td>GF</td><td>GA</td><td>GD</td><td>Pts</td>
   Position is implicit by row order.
*/
export function parseTablePage(html, teamName) {
  const rows = [];
  const stack = [];
  let leagueTableDepth = -1;   // stack depth of the enclosing table.leagueTable
  let rowDepth = -1;           // stack depth of the <tr> being captured
  let cells = null;
  let cellDepth = -1;
  let cellText = "";

  for (const t of tokenize(html)) {
    if (t.type === "text") {
      if (cellDepth >= 0) cellText += t.text;
      continue;
    }

    if (t.type === "open") {
      if (!t.self) stack.push(t.name);
      const depth = stack.length - 1;

      if (t.name === "table" && leagueTableDepth < 0 && hasClass(t.attrs, "leagueTable")) {
        leagueTableDepth = depth;
      } else if (t.name === "tr" && leagueTableDepth >= 0 && rowDepth < 0 && hasClass(t.attrs, "bg_highlight0")) {
        rowDepth = depth;
        cells = [];
      } else if (t.name === "td" && rowDepth >= 0 && cellDepth < 0) {
        cellDepth = depth;
        cellText = "";
      }
      continue;
    }

    // close tag — unwind to the matching open, tolerating stray closes
    const idx = stack.lastIndexOf(t.name);
    if (idx < 0) continue;

    if (cellDepth >= 0 && idx <= cellDepth) {
      cells.push(clean(cellText));
      cellDepth = -1;
    }
    if (rowDepth >= 0 && idx <= rowDepth) {
      if (cells.length >= 9) rows.push(cells.slice(0, 9));
      cells = null;
      rowDepth = -1;
    }
    if (leagueTableDepth >= 0 && idx <= leagueTableDepth) leagueTableDepth = -1;

    stack.length = idx;
  }

  const num = (s) => {
    const v = parseInt((s || "").replace(/[^-\d]/g, ""), 10);
    return Number.isFinite(v) ? v : 0;
  };

  return rows.map((c, i) => {
    const GF = num(c[5]);
    const GA = num(c[6]);
    const GD = num(c[7]);
    return {
      pos: i + 1,
      team: c[0],
      P: num(c[1]), W: num(c[2]), D: num(c[3]), L: num(c[4]),
      GF, GA,
      GD: Number.isFinite(GD) ? GD : GF - GA,
      Pts: num(c[8]),
      us: c[0].toLowerCase().includes(String(teamName).toLowerCase())
    };
  });
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
                 jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/* Mitoo's date-header link carries the exact date in its href,
   e.g. MtchDay.cfm?...&MDate={ts '2026-09-13 00:00:00'}&...
   That's authoritative, so prefer it over reading the visible
   text and guessing which calendar year the season month is in. */
export function dateFromHref(href) {
  if (!href) return null;
  let decoded = href;
  try { decoded = decodeURIComponent(href); } catch { /* keep raw */ }
  const m = decoded.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/* Fallback for the visible "Sunday, 13 September 2026" text. */
export function parseUKDate(str, seasonStartYear) {
  const text = clean(str);
  const withYear = text.match(/(\d{1,2})\s+([A-Za-z]{3,})\w*\s+(\d{4})/);
  if (withYear) {
    const month = MONTHS[withYear[2].slice(0, 3).toLowerCase()];
    if (month) {
      return `${withYear[3]}-${String(month).padStart(2, "0")}-${String(+withYear[1]).padStart(2, "0")}`;
    }
  }
  const m = text.match(/(\d{1,2})\s+([A-Za-z]{3,})/);
  if (!m) return null;
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  // Season spans two calendar years: Aug–Dec sit in the start year, Jan–Jul the next.
  const year = month >= 7 ? seasonStartYear : seasonStartYear + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}

/* --------- One month of division fixtures/results ---------
   Date header rows carry <a href="MtchDay.cfm?...">, then each
   match is a <tr class="bg_contrast"> with two width="35" score
   cells (blank when unplayed) followed by home/away team names
   in <span class="pix13bold"> and the venue in <span class="pix10navy">.

   Rows are walked in document order, tracking the most recent
   date header; only rows involving `teamName` are kept.

   Awarded games (walkovers) show "-" and "H"/"A" in the score cells
   plus a <span class="pix13boldnavy">[ Away Win was awarded ]</span>.
   They're results, not fixtures. The secretary's note sometimes
   records the actual score ("... score 1-7"); otherwise goals are null,
   which the front end shows as "Awarded".
*/
export function parseFixtResMonth(html, { teamName, seasonStartYear, competition }) {
  const fixtures = [];
  const results = [];

  const stack = [];
  let currentDate = null;

  // date-header capture
  let headerDepth = -1;
  let headerHref = null;
  let headerText = "";

  // match-row capture
  let rowDepth = -1;
  let row = null;
  let spanDepth = -1;
  let spanClass = "";
  let spanIsScoreCell = false;
  let spanText = "";
  let tdDepth = -1;
  let tdIsScore = false;
  let rowText = "";

  for (const t of tokenize(html)) {
    if (t.type === "text") {
      if (headerDepth >= 0) headerText += t.text;
      if (spanDepth >= 0) spanText += t.text;
      if (rowDepth >= 0) rowText += t.text;
      continue;
    }

    if (t.type === "open") {
      if (!t.self) stack.push(t.name);
      const depth = stack.length - 1;

      if (t.name === "a" && headerDepth < 0 && rowDepth < 0 &&
          /MtchDay\.cfm/i.test(t.attrs.href || "")) {
        headerDepth = depth;
        headerHref = t.attrs.href || "";
        headerText = "";
      } else if (t.name === "tr" && rowDepth < 0 && hasClass(t.attrs, "bg_contrast")) {
        rowDepth = depth;
        rowText = "";
        row = { scores: [], teams: [], venue: null, award: null };
      } else if (t.name === "td" && rowDepth >= 0 && tdDepth < 0) {
        tdDepth = depth;
        tdIsScore = String(t.attrs.width || "").trim() === "35";
      } else if (t.name === "span" && rowDepth >= 0 && spanDepth < 0) {
        spanDepth = depth;
        spanClass = t.attrs.class || "";
        spanIsScoreCell = tdIsScore;
        spanText = "";
      }
      continue;
    }

    const idx = stack.lastIndexOf(t.name);
    if (idx < 0) continue;

    if (spanDepth >= 0 && idx <= spanDepth) {
      const value = clean(spanText);
      if (hasClass({ class: spanClass }, "pix13bold")) {
        if (spanIsScoreCell) row?.scores.push(value);
        else if (row && row.teams.length < 2) row.teams.push(value);
      } else if (hasClass({ class: spanClass }, "pix13boldnavy")) {
        const award = value.match(/(home|away)\s+win\s+was\s+awarded/i);
        if (row && award) row.award = award[1].toLowerCase();
      } else if (hasClass({ class: spanClass }, "pix10navy")) {
        if (row && row.venue === null) row.venue = value;
      }
      spanDepth = -1;
    }
    if (tdDepth >= 0 && idx <= tdDepth) {
      tdDepth = -1;
      tdIsScore = false;
    }
    if (headerDepth >= 0 && idx <= headerDepth) {
      currentDate = dateFromHref(headerHref) || parseUKDate(headerText, seasonStartYear);
      headerDepth = -1;
    }
    if (rowDepth >= 0 && idx <= rowDepth) {
      const captured = row;
      const text = rowText;
      row = null;
      rowDepth = -1;

      const home = captured?.teams[0] || "";
      const away = captured?.teams[1] || "";
      if (currentDate && home && away && (home === teamName || away === teamName)) {
        const homeGoals = captured.scores[0] ?? "";
        const awayGoals = captured.scores[1] ?? "";
        const venue = captured.venue || "";

        if (captured.award) {
          const noted = clean(text).match(/\bscore\s+(\d+)\s*-\s*(\d+)/i);
          results.push({
            date: currentDate,
            competition,
            home,
            homeGoals: noted ? parseInt(noted[1], 10) : null,
            away,
            awayGoals: noted ? parseInt(noted[2], 10) : null,
            venue,
            note: `${captured.award === "home" ? "Home" : "Away"} win awarded`,
            scorers: [],
            motm: null
          });
        } else if (homeGoals !== "" && awayGoals !== "" &&
            Number.isFinite(parseInt(homeGoals, 10)) && Number.isFinite(parseInt(awayGoals, 10))) {
          results.push({
            date: currentDate,
            competition,
            home,
            homeGoals: parseInt(homeGoals, 10),
            away,
            awayGoals: parseInt(awayGoals, 10),
            venue,
            scorers: [],
            motm: null
          });
        } else {
          const kickoff = clean(text).match(/\b(\d{1,2}:\d{2}\s?[AP]M)\b/i);
          fixtures.push({
            date: currentDate,
            kickoff: kickoff ? kickoff[1] : "10:30 AM",
            home,
            away,
            venue,
            competition
          });
        }
      }
    }

    stack.length = idx;
  }

  return { fixtures, results };
}
