#!/usr/bin/env node
/**
 * Exports companies + problems from the original Supabase project
 * and merges them into web/public/data.json (union of both sources).
 *
 * Usage (from repo root):
 *   node scripts/export-supabase.mjs
 *
 * No external dependencies — uses native fetch (Node 18+).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "web/public/data.json");

const SUPABASE_URL = "https://otnygskksrekalrjtwqj.supabase.co";
const ANON_KEY = "sb_publishable_u2_Zj4oEiuJmzRKL9n4CAg_eIsJaTvO";

const HEADERS = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  "Content-Type": "application/json",
};

// ─── PostgREST helpers ───────────────────────────────────────────────────────

async function pgFetch(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

async function fetchAllPages(path, select, pageSize = 1000) {
  const rows = [];
  let offset = 0;
  while (true) {
    const batch = await pgFetch(path, {
      select,
      limit: pageSize,
      offset,
      order: "id",
    });
    rows.push(...batch);
    process.stdout.write(`  ${rows.length} rows fetched...\r`);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  process.stdout.write("\n");
  return rows;
}

// ─── Fetch from Supabase ─────────────────────────────────────────────────────

console.log("Fetching companies...");
const sbCompanies = await fetchAllPages("companies", "id,name");
console.log(`  ${sbCompanies.length} companies`);

console.log("Fetching problems (this may take a while)...");
const sbProblems = await fetchAllPages(
  "problems",
  "id,title,url,difficulty,acceptance,frequency,problem_tags(tag),company_problems(timeframe_tag,company:companies(id,name))",
  500
);
console.log(`  ${sbProblems.length} problems`);

// ─── Load existing local data.json ───────────────────────────────────────────

if (!fs.existsSync(DATA_FILE)) {
  console.error(`data.json not found at ${DATA_FILE}`);
  console.error("Run `node scripts/build-data.mjs` first.");
  process.exit(1);
}

const local = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
console.log(
  `Local data: ${local.companies.length} companies, ${local.problems.length} problems`
);

// ─── Merge companies ──────────────────────────────────────────────────────────

const localCompanyByName = new Map(
  local.companies.map((c) => [c.name.toLowerCase(), c])
);

let nextId = Math.max(...local.companies.map((c) => c.id)) + 1;
const sbIdToLocalId = new Map();

for (const sbCo of sbCompanies) {
  const key = sbCo.name.toLowerCase();
  if (localCompanyByName.has(key)) {
    sbIdToLocalId.set(sbCo.id, localCompanyByName.get(key).id);
  } else {
    const newId = nextId++;
    sbIdToLocalId.set(sbCo.id, newId);
    const newCo = { id: newId, name: sbCo.name, problem_count: 0 };
    local.companies.push(newCo);
    localCompanyByName.set(key, newCo);
    console.log(`  + new company: ${sbCo.name} (id ${newId})`);
  }
}

// ─── Merge problems ───────────────────────────────────────────────────────────
// The 30k repo (primary) is the source of truth for timeframes and frequency.
// Supabase only contributes: new company associations, algorithm tags, and
// entirely new problems not covered by either CSV repo.

const localProblemById = new Map(local.problems.map((p) => [p.id, p]));
let newProblemsAdded = 0;

for (const sbP of sbProblems) {
  if (localProblemById.has(sbP.id)) {
    const lp = localProblemById.get(sbP.id);

    // Merge tags (Supabase may have tags for problems the 30k repo missed)
    const existingTags = new Set(lp.problem_tags.map((t) => t.tag));
    for (const t of sbP.problem_tags ?? []) {
      if (!existingTags.has(t.tag)) {
        lp.problem_tags.push({ tag: t.tag });
        existingTags.add(t.tag);
      }
    }

    // Merge company_problems — add new company associations only;
    // keep local (30k) timeframe for existing pairs.
    const existingCompanyIds = new Set(
      lp.company_problems.map((cp) => cp.company.id)
    );
    for (const cp of sbP.company_problems ?? []) {
      const localId = sbIdToLocalId.get(cp.company?.id);
      if (localId == null) continue;
      if (!existingCompanyIds.has(localId)) {
        const localCo = local.companies.find((c) => c.id === localId);
        lp.company_problems.push({
          company: { id: localId, name: localCo?.name ?? cp.company.name },
          timeframe_tag: cp.timeframe_tag ?? null,
        });
        existingCompanyIds.add(localId);
      }
    }

    // Fill missing metadata
    if (!lp.url && sbP.url) lp.url = sbP.url;
    if (!lp.title && sbP.title) lp.title = sbP.title;
    if (!lp.difficulty && sbP.difficulty) lp.difficulty = sbP.difficulty;
    if (lp.acceptance == null && sbP.acceptance != null)
      lp.acceptance = sbP.acceptance;
    if (lp.frequency == null && sbP.frequency != null)
      lp.frequency = sbP.frequency;
  } else {
    // Problem only in Supabase
    const newProblem = {
      id: sbP.id,
      title: sbP.title ?? "",
      url: sbP.url ?? "",
      difficulty: sbP.difficulty ?? null,
      acceptance: sbP.acceptance ?? null,
      frequency: sbP.frequency ?? null,
      problem_tags: (sbP.problem_tags ?? []).map((t) => ({ tag: t.tag })),
      company_problems: (sbP.company_problems ?? [])
        .map((cp) => {
          const localId = sbIdToLocalId.get(cp.company?.id);
          if (localId == null) return null;
          const localCo = local.companies.find((c) => c.id === localId);
          return {
            company: {
              id: localId,
              name: localCo?.name ?? cp.company?.name ?? "",
            },
            timeframe_tag: cp.timeframe_tag ?? null,
          };
        })
        .filter(Boolean),
    };
    local.problems.push(newProblem);
    localProblemById.set(sbP.id, newProblem);
    newProblemsAdded++;
  }
}

console.log(`  ${newProblemsAdded} new problems added from Supabase`);

// ─── Recompute problem_count ──────────────────────────────────────────────────

const countById = new Map();
for (const p of local.problems) {
  for (const cp of p.company_problems) {
    countById.set(cp.company.id, (countById.get(cp.company.id) ?? 0) + 1);
  }
}
for (const c of local.companies) {
  c.problem_count = countById.get(c.id) ?? 0;
}

local.problems.sort((a, b) => a.id - b.id);
local.companies.sort((a, b) => a.name.localeCompare(b.name));

// ─── Write ────────────────────────────────────────────────────────────────────

fs.writeFileSync(DATA_FILE, JSON.stringify(local));
console.log(
  `\nDone: ${local.companies.length} companies, ${local.problems.length} problems → ${DATA_FILE}`
);
