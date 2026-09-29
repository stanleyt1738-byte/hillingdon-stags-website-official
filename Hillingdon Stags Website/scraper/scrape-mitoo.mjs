/* ============================================================
   Mitoo Football scraper — local/manual runs.

   The live site no longer depends on this: the Worker's Sunday cron
   (see ../../worker/index.js) scrapes Mitoo and serves the result
   from KV. This script writes the same JSON into ../data/, which is
   the fallback copy baked into the deployment — worth refreshing
   before a deploy so a brand-new KV or a blocked scrape still has
   something recent to fall back on.

   All the fetching and parsing lives in ../../worker/scrape.js so
   this and the Worker can never drift apart. No dependencies.

   Usage:
     node scraper/scrape-mitoo.mjs
   ============================================================ */

import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scrapeAll } from "../../worker/scrape.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

async function readPreviousJson(filename) {
  try {
    return JSON.parse(await readFile(resolve(DATA_DIR, filename), "utf8"));
  } catch {
    return null;
  }
}

async function saveJson(filename, payload) {
  const path = resolve(DATA_DIR, filename);
  await writeFile(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${path}`);
}

async function main() {
  const previous = await readPreviousJson("results.json");

  const { table, fixtures, results, blocked, warnings } = await scrapeAll({
    previousResults: previous?.results || [],
    log: console.log
  });

  warnings.forEach(w => console.warn(w));

  if (table) await saveJson("table.json", table);
  if (fixtures) await saveJson("fixtures.json", fixtures);
  if (results) await saveJson("results.json", results);

  console.log("Done.");

  if (blocked) {
    // Exit non-zero so a blocked run is obvious instead of quietly no-op'ing
    // (incident 2026-09-15 to 2026-09-21: six days of "successful" runs masked
    // a frozen site). Data files are left untouched either way.
    throw new Error("Scrape returned nothing for the table or fixtures/results — likely blocked by Mitoo. Data files left untouched.");
  }
}

main().catch(err => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
