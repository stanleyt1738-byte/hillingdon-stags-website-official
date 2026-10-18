/* ============================================================
   Hillingdon Stags FC — Mitoo relay (Mac, via launchd)

   Same job as mitoo-relay.gs, but run from Stanley's Mac: Mitoo
   blocks Cloudflare, GitHub Actions and Google Apps Script (all
   tested Oct 2026), but not a home broadband connection.

   install-mac.sh copies this to ~/scripts/stags-relay/ (outside
   ~/Documents, which macOS privacy rules hide from launchd jobs),
   with the INGEST_TOKEN in a `token` file beside it, and schedules
   it daily at 08:00 and 21:00. If the Mac is asleep at run time it
   runs on wake; if it was off, at login.
   ============================================================ */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SITE = "https://hillingdonstags.uk";
const TOKEN = readFileSync(new URL("./token", import.meta.url), "utf8").trim();

// Mitoo's robots.txt asks for a 10-second gap between requests.
const CRAWL_DELAY_MS = 10 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function notify(message) {
  try {
    execFileSync("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "Stags site refresh failed"`]);
  } catch { /* a missed notification shouldn't mask the real error */ }
}

async function main() {
  const endpoint = `${SITE}/data/_ingest?token=${encodeURIComponent(TOKEN)}`;
  const { urls } = await (await fetch(endpoint)).json();

  const pages = {};
  const failed = [];
  for (const [i, url] of urls.entries()) {
    if (i > 0) await sleep(CRAWL_DELAY_MS);
    try {
      const res = await fetch(url, { headers: { "Accept-Language": "en-GB,en;q=0.9" } });
      if (res.ok) pages[url] = await res.text();
      else failed.push(`${res.status} ${url}`);
    } catch (e) {
      failed.push(`${e.message} ${url}`);
    }
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages })
  });
  const status = await res.json();
  console.log(new Date().toISOString(), JSON.stringify({
    ok: status.ok, counts: status.counts, written: status.written, warnings: status.warnings, failed
  }));

  if (!status.ok) throw new Error(`Mitoo errors: ${failed.join("; ") || "none"}`);
}

main().catch((e) => {
  console.error(new Date().toISOString(), e.message);
  notify(e.message.slice(0, 200));
  process.exit(1);
});
