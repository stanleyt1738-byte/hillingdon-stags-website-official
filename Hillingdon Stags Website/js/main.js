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
  { href: "gallery.html", label: "Gallery" },
  { href: "videos.html", label: "Videos" },
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
          <img src="assets/badge.png" alt="Hillingdon Stags FC badge" />
          <div class="brand-text">
            <span class="club-name">Hillingdon Stags FC</span>
            <span class="club-tag">Middlesex County · Div 4 (N)</span>
          </div>
        </a>
        <nav class="primary" aria-label="Primary">
          <ul>
            ${navHtml}
            <li>
              <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener" title="Follow us on Instagram"
                 style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border:1px solid var(--stag-gold); border-radius:50%; color: var(--stag-gold);">
                ${IG_ICON_SVG}
              </a>
            </li>
          </ul>
        </nav>
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
  slot.innerHTML = results.map(r => {
    const isCup = r.competition && r.competition !== "Division Four North";
    const compLabel = isCup ? `${r.competition}${r.round ? " &middot; " + r.round : ""}` : null;
    const scoreDisplay = r.homeGoals === null ? "Awarded" : `${r.homeGoals}&ndash;${r.awayGoals}`;
    return `
    <div class="card">
      <div class="meta">${fmtDate(r.date, { weekday: "long", year: true })}${compLabel ? ` &middot; <strong>${compLabel}</strong>` : ""}</div>
      <div class="match-row">
        <span class="home ${isStags(r.home) ? "is-stags" : ""}">${r.home}</span>
        <span class="score">${scoreDisplay}</span>
        <span class="away ${isStags(r.away) ? "is-stags" : ""}">${r.away}</span>
      </div>
      <div class="meta">
        ${r.note ? `<em>${r.note}</em>` : ""}
        ${r.scorers && r.scorers.length ? (r.note ? " &middot; " : "") + "&#9917; " + r.scorers.join(", ") : ""}
        ${r.motm ? " &middot; MOTM: " + r.motm : ""}
      </div>
    </div>`;
  }).join("");
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

/* ===== Render: videos ===== */
function renderVideos(slot, sections) {
  if (!slot || !sections || !sections.length) return;
  slot.innerHTML = sections.map(s => `
    ${s.title ? `<div class="section-title" style="margin-top: 2rem;"><h2>${s.title}</h2></div>` : ""}
    <div class="video-grid">
      ${s.videos.map(v => `
        <div class="video-card">
          <video controls preload="metadata" playsinline>
            <source src="${v.file}" type="video/mp4" />
          </video>
          <div class="video-card-title">${v.title}</div>
        </div>
      `).join("")}
    </div>
  `).join("");
}

/* ===== Gallery lightbox ===== */
let _lbPhotos = [];
let _lbIdx = 0;
let _lbEl = null;

function _createLightbox() {
  _lbEl = document.createElement("div");
  _lbEl.className = "gallery-lb";
  _lbEl.innerHTML = `
    <button class="gallery-lb-close" aria-label="Close">&times;</button>
    <button class="gallery-lb-btn" id="lb-prev" aria-label="Previous">&#8592;</button>
    <img class="gallery-lb-img" src="" alt="Match photo" />
    <button class="gallery-lb-btn" id="lb-next" aria-label="Next">&#8594;</button>
    <div class="gallery-lb-counter"></div>
  `;
  document.body.appendChild(_lbEl);
  _lbEl.querySelector(".gallery-lb-close").addEventListener("click", _closeLightbox);
  _lbEl.querySelector("#lb-prev").addEventListener("click", () => { _lbIdx = (_lbIdx - 1 + _lbPhotos.length) % _lbPhotos.length; _updateLightbox(); });
  _lbEl.querySelector("#lb-next").addEventListener("click", () => { _lbIdx = (_lbIdx + 1) % _lbPhotos.length; _updateLightbox(); });
  _lbEl.addEventListener("click", e => { if (e.target === _lbEl) _closeLightbox(); });
  document.addEventListener("keydown", e => {
    if (!_lbEl || !_lbEl.classList.contains("open")) return;
    if (e.key === "Escape") _closeLightbox();
    if (e.key === "ArrowLeft") { _lbIdx = (_lbIdx - 1 + _lbPhotos.length) % _lbPhotos.length; _updateLightbox(); }
    if (e.key === "ArrowRight") { _lbIdx = (_lbIdx + 1) % _lbPhotos.length; _updateLightbox(); }
  });
}

function _updateLightbox() {
  _lbEl.querySelector(".gallery-lb-img").src = _lbPhotos[_lbIdx];
  _lbEl.querySelector(".gallery-lb-counter").textContent = `${_lbIdx + 1} / ${_lbPhotos.length}`;
}

function _openLightbox(photos, startIdx) {
  _lbPhotos = photos;
  _lbIdx = startIdx;
  if (!_lbEl) _createLightbox();
  _updateLightbox();
  _lbEl.classList.add("open");
  document.body.style.overflow = "hidden";
}

function _closeLightbox() {
  if (_lbEl) _lbEl.classList.remove("open");
  document.body.style.overflow = "";
}

/* ===== Render: full gallery (reports page) ===== */
function renderGallery(slot, matches) {
  if (!slot || !matches || !matches.length) return;

  const matchPhotos = {};

  slot.innerHTML = matches.map((m, mi) => {
    const photos = m.photos.map(f => `${m.folder}/${f}`);
    matchPhotos[m.id] = photos;
    const thumbs = photos.map((src, i) => `
      <div class="gallery-thumb" data-mid="${m.id}" data-idx="${i}">
        <img src="${src}" alt="Match photo ${i + 1}" loading="lazy" />
      </div>
    `).join("");
    return `
      <details class="gallery-match"${mi === 0 ? " open" : ""}>
        <summary class="gallery-match-header">
          <div class="gallery-match-info">
            <span class="gallery-match-title">${m.title}</span>
            <span class="gallery-match-meta">${fmtDate(m.date, { weekday: "long", year: true })} &middot; ${m.competition}</span>
            <span class="gallery-match-result">${m.result}</span>
          </div>
          <span class="gallery-match-count">${m.photos.length} photos</span>
        </summary>
        <div class="gallery-grid">${thumbs}</div>
      </details>
    `;
  }).join("");

  slot.addEventListener("click", e => {
    const thumb = e.target.closest(".gallery-thumb");
    if (!thumb) return;
    const photos = matchPhotos[thumb.dataset.mid];
    if (photos) _openLightbox(photos, parseInt(thumb.dataset.idx, 10));
  });
}

/* ===== Render: gallery preview (home page) ===== */
function renderGalleryPreview(slot, matches) {
  if (!slot || !matches || !matches.length) return;
  const latest = matches[0];
  const allPhotos = latest.photos.map(f => `${latest.folder}/${f}`);
  const previewPhotos = allPhotos.slice(0, 8);

  slot.innerHTML = `
    <div class="gallery-preview-header">
      <div>
        <div class="gallery-preview-title">${latest.title}</div>
        <div class="gallery-preview-meta">${fmtDate(latest.date, { weekday: "long", year: true })} &middot; ${latest.result}</div>
      </div>
      <a href="gallery.html" class="btn btn-primary">All Photos</a>
    </div>
    <div class="gallery-preview-grid">
      ${previewPhotos.map((src, i) => `
        <div class="gallery-thumb" data-idx="${i}">
          <img src="${src}" alt="Match photo" loading="lazy" />
        </div>
      `).join("")}
    </div>
  `;

  slot.addEventListener("click", e => {
    const thumb = e.target.closest(".gallery-thumb");
    if (!thumb) return;
    _openLightbox(allPhotos, parseInt(thumb.dataset.idx, 10));
  });
}

/* ===== Page initialiser ===== */
document.addEventListener("DOMContentLoaded", async () => {
  renderHeader();
  renderFooter();
  // each page may add more init logic by listening for a custom 'stags:ready' event
  document.dispatchEvent(new Event("stags:ready"));
});
