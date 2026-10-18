/* ============================================================
   Hillingdon Stags FC — Mitoo relay (Google Apps Script)

   Mitoo blocks requests from Cloudflare Workers and GitHub
   Actions, but not from Google. So this script, running on a
   timer in Google's cloud, fetches the raw Mitoo pages and hands
   them to the site Worker (/data/_ingest), which parses them and
   updates the site exactly as its own cron used to.

   It holds no parsing logic and no URLs: it asks the Worker which
   pages to fetch, so a new season only needs a Worker change.

   One-time setup:
     1. script.google.com → New project → paste this file in.
     2. Set TOKEN below (the Worker's INGEST_TOKEN secret).
     3. Run `install` once and accept the permissions prompt.
   After that it runs by itself every morning and evening. If a run
   fails, Google emails the account owner.
   ============================================================ */

const SITE = "https://hillingdonstags.uk";
const TOKEN = "PASTE_INGEST_TOKEN_HERE";

// Mitoo's robots.txt asks for a 10-second gap between requests.
const CRAWL_DELAY_MS = 10 * 1000;

function relay() {
  const endpoint = SITE + "/data/_ingest?token=" + encodeURIComponent(TOKEN);

  const urls = JSON.parse(UrlFetchApp.fetch(endpoint).getContentText()).urls;

  const pages = {};
  const failed = [];
  urls.forEach(function (url, i) {
    if (i > 0) Utilities.sleep(CRAWL_DELAY_MS);
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { "Accept-Language": "en-GB,en;q=0.9" }
    });
    if (res.getResponseCode() === 200) pages[url] = res.getContentText();
    else failed.push(res.getResponseCode() + " " + url);
  });

  const res = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ pages: pages }),
    muteHttpExceptions: true
  });
  const status = JSON.parse(res.getContentText());
  console.log(JSON.stringify(status, null, 2));

  // Throwing marks the run as failed, which is what triggers Google's
  // failure email — the only way anyone finds out the site has gone stale.
  if (!status.ok) {
    throw new Error("Refresh failed. Mitoo fetch errors: " + (failed.join("; ") || "none") +
                    " | Worker warnings: " + (status.warnings || []).join("; "));
  }
}

// Run once by hand. Safe to re-run: it replaces any existing timers.
function install() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "relay"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  // Sunday results land in the evening; the morning run catches late ones.
  [8, 21].forEach(function (hour) {
    ScriptApp.newTrigger("relay").timeBased().everyDays(1).atHour(hour)
      .inTimezone("Europe/London").create();
  });

  relay();
}
