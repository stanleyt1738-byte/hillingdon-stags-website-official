/* ============================================================
   Writes the freshly scraped table/fixtures/results back to the
   GitHub repo, so `data/*.json` in git never drifts from what the
   live site is actually serving out of KV.

   Uses the Contents API (one file per request) rather than the Git
   Data API — three small commits a week is plenty readable in
   history, and it avoids the extra blob/tree/commit/ref plumbing.

   Requires a GITHUB_TOKEN secret: a fine-grained PAT scoped to just
   this repo with Contents: Read and write.
   ============================================================ */

const OWNER = "stanleyt1738-byte";
const REPO = "hillingdon-stags-website-official";
const BRANCH = "main";
const DATA_PATH_PREFIX = "Hillingdon Stags Website/data/";

async function gh(env, path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "hillingdon-stags-site-worker",
      ...(init.headers || {})
    }
  });
}

function b64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// Ignore `lastUpdated` when deciding whether a file actually changed —
// otherwise the 7pm and 8pm Sunday runs (a deliberate belt-and-braces
// pair, see wrangler.jsonc) would each produce a commit even when Mitoo
// hadn't posted anything new between them.
function withoutTimestamp(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const { lastUpdated, ...rest } = obj;
  return rest;
}

async function getExisting(env, path) {
  const res = await gh(env, `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return await res.json(); // { sha, content (base64), ... }
}

async function putFile(env, path, contentStr, sha, message) {
  const body = {
    message,
    content: utf8ToB64(contentStr),
    branch: BRANCH,
    committer: { name: "stags-site-worker", email: "stags-bot@users.noreply.github.com" },
    author: { name: "stags-site-worker", email: "stags-bot@users.noreply.github.com" }
  };
  if (sha) body.sha = sha;
  const res = await gh(env, `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

/**
 * @param {object} env
 * @param {Array<{name: string, payload: object}>} files
 * @returns {Promise<{committed: string[], unchanged: string[], errors: string[]}>}
 */
export async function syncToGithub(env, files, log = () => {}) {
  if (!env.GITHUB_TOKEN) {
    log("GITHUB_TOKEN not set — skipping GitHub sync");
    return { committed: [], unchanged: [], errors: [], skipped: true };
  }

  const committed = [];
  const unchanged = [];
  const errors = [];

  for (const { name, payload } of files) {
    const path = `${DATA_PATH_PREFIX}${name}`;
    try {
      const existing = await getExisting(env, path);
      const existingObj = existing ? JSON.parse(b64ToUtf8(existing.content)) : null;

      if (existingObj && JSON.stringify(withoutTimestamp(existingObj)) === JSON.stringify(withoutTimestamp(payload))) {
        unchanged.push(name);
        continue;
      }

      const contentStr = JSON.stringify(payload, null, 2) + "\n";
      const label = name.replace(/\.json$/, "");
      await putFile(env, path, contentStr, existing?.sha,
        `chore(data): refresh ${label} from Mitoo ${new Date().toISOString()}`);
      committed.push(name);
      log(`GitHub: committed ${name}`);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
      log(`GitHub sync failed for ${name}: ${e.message}`);
    }
  }

  return { committed, unchanged, errors, skipped: false };
}
