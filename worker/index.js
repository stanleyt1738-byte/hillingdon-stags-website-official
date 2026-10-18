/* ============================================================
   Hillingdon Stags FC — site Worker

   Two jobs:
   1. fetch()     — serves the site. /data/*.json comes from KV
                    (refreshed automatically) when present, and
                    falls back to the copy baked into the repo.
   2. scheduled() — Sunday evening cron: scrapes Mitoo and writes
                    the fresh JSON into KV. No deploy, no GitHub
                    Action, no LLM involved.
   3. /data/_ingest — the same refresh, but with the Mitoo pages
                    handed in by a Google Apps Script relay. Mitoo
                    started 403ing Cloudflare Workers in Oct 2026
                    (GitHub Actions since Sep), while Google's
                    servers still get through. See relay/.

   Why KV rather than committing to the repo: the site is a Workers
   static-assets deployment, so anything baked in only reaches the
   live site on a `wrangler deploy`. Reading /data/* from KV means
   the cron alone is enough to update the site.
   ============================================================ */

import { scrapeAll, ALL_URLS } from "./scrape.js";
import { syncToGithub } from "./github-sync.js";

// The three files the scraper owns. Everything else under /data/
// (squad, sponsors, club, gallery, videos…) is hand-maintained and
// served straight from the deployed assets.
const LIVE_DATA = new Set(["table.json", "fixtures.json", "results.json"]);

const KV_PREFIX = "data:";
const STATUS_KEY = "status";

const json = (body, { status = 200, maxAge = 300 } = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`
    }
  });

async function readStatus(env) {
  try {
    return JSON.parse((await env.STAGS_DATA.get(KV_PREFIX + STATUS_KEY)) || "null");
  } catch {
    return null;
  }
}

/* The copy of a data file baked into the deployment — the fallback
   whenever KV is empty (first run after a deploy) and the baseline
   of hand-added scorers/MOTM that a re-scrape must not wipe.

   The assets binding routes on pathname alone, so this uses a fixed
   internal origin rather than the incoming request's. That keeps the
   cron path (which has no incoming request) byte-identical to the
   manual one, so testing either tests both. */
async function readAsset(env, name) {
  try {
    const res = await env.ASSETS.fetch(new Request(`https://assets.local/data/${name}`));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function refresh(env, { fetchHtml, via = "cron" } = {}) {
  const assetResults = await readAsset(env, "results.json");

  let kvResults = null;
  try {
    kvResults = JSON.parse((await env.STAGS_DATA.get(KV_PREFIX + "results.json")) || "null");
  } catch { /* treat unreadable KV as absent */ }

  // Hand-added extras are preserved from both sources. Later entries win when
  // keys collide, so KV (the fresher of the two) takes precedence over the
  // baked-in copy.
  const previousResults = [
    ...(assetResults?.results || []),
    ...(kvResults?.results || [])
  ];

  const logs = [];
  const out = await scrapeAll({ previousResults, log: (m) => logs.push(m), fetchHtml });

  const written = [];
  const writes = [];
  if (out.table) writes.push(["table.json", out.table]);
  if (out.fixtures) writes.push(["fixtures.json", out.fixtures]);
  if (out.results) writes.push(["results.json", out.results]);

  for (const [name, payload] of writes) {
    await env.STAGS_DATA.put(KV_PREFIX + name, JSON.stringify(payload, null, 2));
    written.push(name);
  }

  // Keep the repo's data/*.json in sync with what the live site is serving,
  // so `git log` and GitHub always show current results — not just KV.
  const github = await syncToGithub(
    env,
    writes.map(([name, payload]) => ({ name, payload })),
    (m) => logs.push(m)
  );

  const status = {
    lastRun: new Date().toISOString(),
    via,
    ok: !out.blocked && written.length > 0,
    blocked: out.blocked,
    written,
    counts: {
      table: out.table?.table?.length ?? null,
      fixtures: out.fixtures?.fixtures?.length ?? null,
      results: out.results?.results?.length ?? null
    },
    github,
    logs,
    warnings: out.warnings
  };

  // Keep the timestamp of the last run that actually produced data, so a later
  // blocked run can't make the site look freshly updated when it isn't.
  const previousStatus = await readStatus(env);
  status.lastSuccess = status.ok ? status.lastRun : (previousStatus?.lastSuccess ?? null);

  await env.STAGS_DATA.put(KV_PREFIX + STATUS_KEY, JSON.stringify(status, null, 2));
  return status;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/data/")) {
      const name = url.pathname.slice("/data/".length);

      // Freshness check — handy when the site looks stale.
      if (name === "_status.json") {
        const status = await readStatus(env);
        return json(status || { lastRun: null, note: "No scheduled refresh has run yet." }, { maxAge: 0 });
      }

      // Manual "update now", for when Mitoo posts late and waiting for the
      // next cron isn't good enough. Disabled unless a REFRESH_TOKEN secret
      // is set, so it can't be triggered by anyone who finds the URL.
      if (name === "_refresh") {
        const expected = env.REFRESH_TOKEN;
        if (!expected) return json({ error: "Manual refresh is not enabled." }, { status: 404, maxAge: 0 });
        if (url.searchParams.get("token") !== expected) {
          return json({ error: "Bad or missing token." }, { status: 403, maxAge: 0 });
        }
        return json(await refresh(env), { maxAge: 0 });
      }

      // Relay endpoint. GET returns the pages to fetch; POST takes
      // { pages: { url: html } } and runs a normal refresh over them.
      // Separate secret from REFRESH_TOKEN because this one can feed the
      // site arbitrary HTML, not just ask for a re-scrape.
      if (name === "_ingest") {
        const expected = env.INGEST_TOKEN;
        if (!expected) return json({ error: "Ingest is not enabled." }, { status: 404, maxAge: 0 });
        if (url.searchParams.get("token") !== expected) {
          return json({ error: "Bad or missing token." }, { status: 403, maxAge: 0 });
        }
        if (request.method === "GET") return json({ urls: ALL_URLS }, { maxAge: 0 });
        if (request.method !== "POST") return json({ error: "Use GET or POST." }, { status: 405, maxAge: 0 });

        let pages;
        try {
          ({ pages } = await request.json());
        } catch {
          return json({ error: "Body must be JSON: { pages: { url: html } }" }, { status: 400, maxAge: 0 });
        }
        if (!pages || typeof pages !== "object") {
          return json({ error: "Body must be JSON: { pages: { url: html } }" }, { status: 400, maxAge: 0 });
        }

        // A page the relay couldn't get counts as a failed fetch, so the usual
        // blocked/empty guards in scrapeAll still apply.
        const fetchHtml = async (u) => {
          if (typeof pages[u] !== "string") throw new Error(`relay did not supply ${u}`);
          return pages[u];
        };
        return json(await refresh(env, { fetchHtml, via: "relay" }), { maxAge: 0 });
      }

      if (LIVE_DATA.has(name)) {
        const cached = await env.STAGS_DATA.get(KV_PREFIX + name);
        // No KV entry yet (fresh deploy, or a first run that got blocked) —
        // fall through to the copy shipped with the site rather than 404.
        if (cached) return json(cached);
      }
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(refresh(env));
  }
};
