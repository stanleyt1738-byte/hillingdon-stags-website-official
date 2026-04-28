/* ============================================================
   HILLINGDON STAGS FC — main.js
   Shared header/footer rendering + helpers
   ============================================================ */

const NAV_ITEMS = [
  { href: "index.html", label: "Home" },
  { href: "fixtures.html", label: "Fixtures" },
  { href: "results.html", label: "Results" },
  { href: "table.html", label: "Table" },
  { href: "squad.html", label: "Squad" },
  { href: "scorers.html", label: "Scorers" },
  { href: "reports.html", label: "Reports" },
  { href: "sponsors.html", label: "Sponsors" },
  { href: "contact.html", label: "Contact" }
];

function currentPage() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  return path;
}

function renderHeader() {
  const here = currentPage();
  const navHtml = NAV_ITEMS.map(item => {
    const cls = item.href === here ? "active" : "";
    return `<li><a href="${item.href}" class="${cls}">${item.label}</a></li>`;
  }).join("");

  const html = `
    <header class="site-header">
      <div class="container">
        <a class="brand" href="index.html">
          <img src="assets/badge.svg" alt="Hillingdon Stags FC badge" />
          <div class="brand-text">
            <span class="club-name">Hillingdon Stags FC</span>
            <span class="club-tag">Middlesex County · Div 4 (N)</span>
          </div>
        </a>
        <nav class="primary" aria-label="Primary">
          <ul>${navHtml}</ul>
        </nav>
        <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener" title="Follow us on Instagram"
           style="display:inline-flex; align-items:center; justify-content:center; width:38px; height:38px; border:1px solid var(--stag-gold); border-radius:50%; color: var(--stag-gold); margin-left: 0.5rem;">
          ${IG_ICON_SVG}
        </a>
      </div>
    </header>
  `;
  const slot = document.getElementById("site-header");
  if (slot) slot.outerHTML = html;
}

/* Instagram icon — inline SVG so no external icon library needed */
const IG_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;vertical-align:-4px;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`;

const INSTAGRAM_URL = "https://www.instagram.com/hillingdonstags/";
const INSTAGRAM_HANDLE = "@hillingdonstags";

function renderFooter() {
  const year = new Date().getFullYear();
  const html = `
    <footer class="site-footer">
      <div class="container">
        <div>
          <strong style="color: var(--stag-gold); font-family: var(--font-display); letter-spacing: 0.1em;">HILLINGDON STAGS FC</strong><br />
          &copy; ${year} · Middlesex County Sunday League · Div 4 (N)
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
          <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:8px; color: var(--stag-gold); font-family: var(--font-display); letter-spacing: 0.06em;">
            ${IG_ICON_SVG} ${INSTAGRAM_HANDLE}
          </a>
          <span style="font-size: 0.75rem; color: var(--stag-grey-300);">
            Live data from <a href="https://www.mitoofootball.com/LeagueTab.cfm?TblName=Matches&DivisionID=220&LeagueCode=MDXS2025" target="_blank" rel="noopener">Mitoo Football</a>
          </span>
        </div>
      </div>
    </footer>
  `;
  const slot = document.getElementById("site-footer");
  if (slot) slot.outerHTML = html;
}

/* ===== Data loading ===== */
async function loadJSON(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("Data load failed:", e);
    return null;
  }
}

/* ===== Date helpers ===== */
function fmtDate(iso, opts = {}) {
  if (!iso) return "";
  const d = new Date(iso + (iso.includes("T") ? "" : "T12:00:00"));
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    weekday: opts.weekday || "short",
    day: "numeric",
    month: opts.month || "short",
    year: opts.year ? "numeric" : undefined
  });
  return fmt.format(d);
}

function isStags(name) {
  return /hillingdon\s+stags/i.test(name || "");
}

/* ===== Render: next fixture ===== */
function renderNextFixture(slot, fixtures) {
  if (!slot || !fixtures || !fixtures.length) {
    if (slot) slot.innerHTML = `<p class="muted">No upcoming fixtures.</p>`;
    return;
  }
  const f = fixtures[0];
  slot.innerHTML = `
    <div class="meta">${fmtDate(f.date, { weekday: "long" })} · ${f.kickoff || "TBC"}</div>
    <div class="match-row">
      <span class="home ${isStags(f.home) ? "is-stags" : ""}">${f.home}</span>
      <span class="vs">vs</span>
      <span class="away ${isStags(f.away) ? "is-stags" : ""}">${f.away}</span>
    </div>
    <div class="meta">${f.venue || ""} ${f.competition ? "· " + f.competition : ""}</div>
  `;
}

/* ===== Render: last result ===== */
function renderLastResult(slot, results) {
  if (!slot || !results || !results.length) {
    if (slot) slot.innerHTML = `<p class="muted">No recent results.</p>`;
    return;
  }
  const r = results[0];
  slot.innerHTML = `
    <div class="meta">${fmtDate(r.date, { weekday: "long" })}</div>
    <div class="match-row">
      <span class="home ${isStags(r.home) ? "is-stags" : ""}">${r.home}</span>
      <span class="score">${r.homeGoals}&ndash;${r.awayGoals}</span>
      <span class="away ${isStags(r.away) ? "is-stags" : ""}">${r.away}</span>
    </div>
    <div class="meta">
      ${r.scorers && r.scorers.length ? "&#9917; " + r.scorers.join(", ") : ""}
      ${r.motm ? " &middot; MOTM: " + r.motm : ""}
    </div>
  `;
}

/* ===== Render: league position ===== */
function renderPosition(slot, table) {
  if (!slot || !table || !table.length) return;
  const us = table.find(row => row.us || isStags(row.team));
  if (!us) return;
  slot.innerHTML = `
    <div style="display:flex; align-items:baseline; gap:0.5rem;">
      <span class="pos-number">${us.pos}<span style="font-size:1.5rem">${ordinal(us.pos)}</span></span>
      <span class="pos-of">of ${table.length}</span>
    </div>
    <div class="pos-stats">
      <span><strong>P</strong> ${us.P}</span>
      <span><strong>W</strong> ${us.W}</span>
      <span><strong>D</strong> ${us.D}</span>
      <span><strong>L</strong> ${us.L}</span>
    </div>
    <div class="pos-stats">
      <span><strong>${us.Pts}</strong> pts</span>
      <span>GD <strong>${us.GD > 0 ? "+" + us.GD : us.GD}</strong></span>
    </div>
  `;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/* ===== Render: recent form ===== */
function renderForm(slot, results) {
  if (!slot || !results || !results.length) return;
  const last5 = results.slice(0, 5).map(r => {
    const stagsHome = isStags(r.home);
    const ours = stagsHome ? r.homeGoals : r.awayGoals;
    const theirs = stagsHome ? r.awayGoals : r.homeGoals;
    if (ours > theirs) return "W";
    if (ours < theirs) return "L";
    return "D";
  });
  slot.innerHTML = last5.map(c => `<span class="form-chip ${c}">${c}</span>`).join("") +
    `<span class="muted" style="margin-left: 12px; font-size: 0.85rem;">Last 5 results &mdash; auto-updates from Mitoo</span>`;
}

/* ===== Render: full fixtures list ===== */
function renderFixturesList(slot, fixtures) {
  if (!slot || !fixtures) return;
  if (!fixtures.length) {
    slot.innerHTML = `<p class="muted">No fixtures scheduled yet.</p>`;
    return;
  }
  slot.innerHTML = fixtures.map(f => `
    <div class="card">
      <div class="meta">${fmtDate(f.date, { weekday: "long", year: true })} &middot; ${f.kickoff || "TBC"}</div>
      <div class="match-row">
        <span class="home ${isStags(f.home) ? "is-stags" : ""}">${f.home}</span>
        <span class="vs">vs</span>
        <span class="away ${isStags(f.away) ? "is-stags" : ""}">${f.away}</span>
      </div>
      <div class="meta">${f.venue || ""}${f.competition ? " &middot; " + f.competition : ""}</div>
    </div>
  `).join("");
}

/* ===== Render: full results list ===== */
function renderResultsList(slot, results) {
  if (!slot || !results) return;
  if (!results.length) {
    slot.innerHTML = `<p class="muted">No results yet this season.</p>`;
    return;
  }
  slot.innerHTML = results.map(r => `
    <div class="card">
      <div class="meta">${fmtDate(r.date, { weekday: "long", year: true })}</div>
      <div class="match-row">
        <span class="home ${isStags(r.home) ? "is-stags" : ""}">${r.home}</span>
        <span class="score">${r.homeGoals}&ndash;${r.awayGoals}</span>
        <span class="away ${isStags(r.away) ? "is-stags" : ""}">${r.away}</span>
      </div>
      <div class="meta">
        ${r.scorers && r.scorers.length ? "&#9917; " + r.scorers.join(", ") : ""}
        ${r.motm ? " &middot; MOTM: " + r.motm : ""}
      </div>
    </div>
  `).join("");
}

/* ===== Render: league table ===== */
function renderLeagueTable(slot, table) {
  if (!slot || !table) return;
  slot.innerHTML = `
    <div class="table-wrap">
      <table class="league-table">
        <thead>
          <tr><th>#</th><th class="team">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>
        </thead>
        <tbody>
          ${table.map(r => `
            <tr class="${r.us || isStags(r.team) ? "us" : ""}">
              <td class="pos">${r.pos}</td>
              <td class="team">${r.team}</td>
              <td>${r.P}</td><td>${r.W}</td><td>${r.D}</td><td>${r.L}</td>
              <td>${r.GF}</td><td>${r.GA}</td>
              <td>${r.GD > 0 ? "+" + r.GD : r.GD}</td>
              <td><strong>${r.Pts}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* ===== Render: squad =====
   Always shows Management → Goalkeepers → Defenders → Midfielders → Forwards.
   No shirt numbers (squad rotates). Photo placeholders use initials.
*/
function renderSquad(slot, squad) {
  if (!slot || !squad) return;
  const ORDER = ["Manager", "Goalkeeper", "Defender", "Midfielder", "Forward"];
  const HEADINGS = {
    Manager: "Management",
    Goalkeeper: "Goalkeepers",
    Defender: "Defenders",
    Midfielder: "Midfielders",
    Forward: "Forwards",
    Other: "Other"
  };
  const groups = { Manager: [], Goalkeeper: [], Defender: [], Midfielder: [], Forward: [] };
  squad.forEach(p => {
    if (groups[p.position]) groups[p.position].push(p);
    else (groups.Other = groups.Other || []).push(p);
  });

  const sections = [...ORDER, "Other"]
    .filter(pos => groups[pos] && groups[pos].length)
    .map(pos => `
      <div class="section">
        <div class="section-title"><h2>${HEADINGS[pos] || pos}</h2></div>
        <div class="squad-grid">
          ${groups[pos].map(p => `
            <div class="player-card">
              <div class="photo">${initials(p.name)}</div>
              <div class="info">
                <div class="name">${p.name}</div>
                ${p.nickname ? `<div class="nick">"${p.nickname}"</div>` : ""}
                <div class="pos">${p.position}</div>
                ${p.role ? `<div class="role" style="margin-top:0.3rem; font-size:0.7rem; letter-spacing:0.15em; color: var(--stag-gold-dark); text-transform:uppercase; font-weight:600;">${p.role}</div>` : ""}
                ${(p.goals || p.apps) ? `<div class="meta" style="margin-top:0.4rem;">${p.apps ? p.apps + " apps" : ""}${p.goals ? " · " + p.goals + " goals" : ""}</div>` : ""}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");

  slot.innerHTML = sections;
}

function initials(name) {
  if (!name) return "?";
  return name.split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

/* ===== Render: sponsors ===== */
function renderSponsors(slot, sponsors, opts = {}) {
  if (!slot || !sponsors) return;
  const compact = !!opts.compact;
  if (compact) {
    slot.innerHTML = `
      <div style="display:flex; flex-wrap:wrap; gap:1rem 2rem; align-items:center; justify-content:center;">
        ${sponsors.map(s => `
          <div style="font-family: var(--font-display); font-size: 1.05rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--stag-gold); border: 1px solid var(--stag-gold); padding: 0.5rem 1rem; border-radius: 4px;">
            ${s.name}
          </div>
        `).join("")}
      </div>
    `;
    return;
  }
  slot.innerHTML = sponsors.map(s => `
    <div class="card" style="text-align:center;">
      ${s.tier ? `<div style="font-size:0.7rem; letter-spacing:0.2em; color: var(--stag-gold-dark); text-transform:uppercase; font-weight:600; margin-bottom:0.5rem;">${s.tier}</div>` : ""}
      <div style="background: var(--stag-black); height: 130px; display:flex; align-items:center; justify-content:center; color: var(--stag-gold); font-family: var(--font-display); font-size: 1.4rem; letter-spacing: 0.05em; border-radius: var(--radius); padding: 0 1rem;">
        ${s.logo ? `<img src="${s.logo}" alt="${s.name} logo" style="max-height: 110px; max-width: 100%;" />` : s.name}
      </div>
      <div style="margin-top: 0.85rem;">
        <div style="font-family: var(--font-display); font-size: 1.05rem; letter-spacing: 0.04em; color: var(--stag-black);">${s.name}</div>
        ${s.description ? `<div class="meta" style="margin-top:0.35rem;">${s.description}</div>` : ""}
        ${s.url ? `<a class="btn btn-primary" style="margin-top:0.75rem; padding: 0.45rem 0.85rem; font-size: 0.75rem;" href="${s.url}" target="_blank" rel="noopener">Visit</a>` : ""}
      </div>
    </div>
  `).join("");
}

/* ===== Render: scorers / motm ===== */
function renderScorers(slot, scorers, key, label) {
  if (!slot || !scorers || !scorers[key]) return;
  slot.innerHTML = `
    <div class="card-grid">
      ${scorers[key].map((p, i) => `
        <div class="card">
          <div style="display:flex; align-items:baseline; justify-content:space-between;">
            <span style="font-family: var(--font-display); font-size: 1.2rem; font-weight: 700;">${p.name}</span>
            <span style="font-family: var(--font-display); font-size: 2.25rem; color: var(--stag-gold); font-weight: 700;">${p.goals ?? p.awards}</span>
          </div>
          <div class="meta">${p.apps ? p.apps + " apps" : "MOTM awards"}</div>
        </div>
      `).join("")}
    </div>
  `;
}

/* ===== Render: reports ===== */
function renderReports(slot, reports) {
  if (!slot || !reports) return;
  if (!reports.length) {
    slot.innerHTML = `<p class="muted">No match reports yet. Check back after the next match!</p>`;
    return;
  }
  slot.innerHTML = reports.map(r => `
    <div class="report">
      <div class="report-meta">${fmtDate(r.date, { weekday: "long", year: true })}</div>
      <div class="report-title">${r.title}</div>
      <div style="font-family: var(--font-display); color: var(--stag-gold-dark); font-size: 0.95rem; margin-bottom: 0.5rem;">${r.result}</div>
      <p>${r.summary}</p>
      ${r.motm ? `<div class="meta">MOTM: <strong>${r.motm}</strong></div>` : ""}
    </div>
  `).join("");
}

/* ===== Page initialiser ===== */
document.addEventListener("DOMContentLoaded", async () => {
  renderHeader();
  renderFooter();
  // each page may add more init logic by listening for a custom 'stags:ready' event
  document.dispatchEvent(new Event("stags:ready"));
});
