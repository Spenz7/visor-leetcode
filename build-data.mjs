#!/usr/bin/env node
/**
 * Builds web/public/data.json from two CSV repos:
 *
 *  PRIMARY   leetcode-company-wise-problems/       (30k stars, Aug 2026)
 *            → timeframes, frequency, algorithm tags
 *
 *  SECONDARY leetcode-companywise-interview-questions/ (7.9k stars, July 2026)
 *            → numeric LeetCode IDs, acceptance %, fill-in coverage
 *
 * Then run: node scripts/export-supabase.mjs
 * to add Supabase-only companies/problems on top.
 *
 * Usage (from repo root): node scripts/build-data.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIMARY_DIR   = path.resolve(__dirname, "../leetcode-company-wise-problems");
const SECONDARY_DIR = path.resolve(__dirname, "../leetcode-companywise-interview-questions");
const OUT_FILE      = path.resolve(__dirname, "../web/public/data.json");

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSVRow(line) {
  const result = [];
  let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

function parseCSV(content) {
  const lines = content.replace(/\r/g, "").trim().split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]).map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCSVRow(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").trim(); });
    return obj;
  });
}

function parseFloat_(s) {
  if (!s) return null;
  const f = parseFloat(s.replace("%", "").trim());
  return isNaN(f) ? null : f;
}

function getField(row, ...keys) {
  for (const k of keys) if (k in row) return row[k];
  return undefined;
}

// ─── Name / slug helpers ──────────────────────────────────────────────────────

function slugFromUrl(url) {
  return url ? url.replace(/\/?$/, "").split("/").pop().toLowerCase() : null;
}

function normCompany(name) { return name.toLowerCase().trim(); }

function normTitle(t) { return t.toLowerCase().replace(/[^a-z0-9]/g, ""); }

function normDifficulty(d) {
  const m = { easy: "Easy", medium: "Medium", hard: "Hard" };
  return m[d?.toLowerCase()] ?? null;
}

// ─── Timeframe helpers ────────────────────────────────────────────────────────

const TF_ORDER = { "thirty-days": 0, "three-months": 1, "six-months": 2 };
const TF_NULL  = new Set(["more-than-six", "all"]);

function shorterTf(a, b) {
  return (TF_ORDER[a] ?? 99) <= (TF_ORDER[b] ?? 99) ? a : b;
}

// ─── Phase 1: Build ID + acceptance lookup from 7.9k repo ────────────────────

console.log("Phase 1: Building slug → ID lookup from 7.9k repo...");

// slug → { id, acceptance }  (acceptance is standard LeetCode %)
const slugToMeta = new Map();
const titleToId  = new Map();   // fallback: normalised title → id

if (fs.existsSync(SECONDARY_DIR)) {
  const dirs = fs.readdirSync(SECONDARY_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith("."))
    .map(e => e.name);

  for (const dir of dirs) {
    const allCsv = path.join(SECONDARY_DIR, dir, "all.csv");
    if (!fs.existsSync(allCsv)) continue;
    for (const row of parseCSV(fs.readFileSync(allCsv, "utf-8"))) {
      const id  = parseInt(getField(row, "ID", "Id", "id"), 10);
      if (isNaN(id)) continue;
      const url  = (getField(row, "URL", "Url", "url") ?? "").trim();
      const slug = slugFromUrl(url);
      const acceptance = parseFloat_(getField(row, "Acceptance %", "Acceptance%", "Acceptance"));
      const title = (getField(row, "Title", "title") ?? "").trim();
      if (slug && !slugToMeta.has(slug)) slugToMeta.set(slug, { id, acceptance });
      if (title && !titleToId.has(normTitle(title))) titleToId.set(normTitle(title), id);
    }
  }
}
console.log(`  ${slugToMeta.size} unique slugs indexed`);

// ─── Phase 2: Read 30k repo as primary source ─────────────────────────────────

console.log("Phase 2: Reading 30k repo (primary)...");

if (!fs.existsSync(PRIMARY_DIR)) {
  console.error(`ERROR: Primary repo not found:\n  ${PRIMARY_DIR}`);
  process.exit(1);
}

// File order matters: All first (metadata + frequency), then timeframe files
const PRIMARY_FILES = [
  { file: "5. All.csv",                    timeframe: null          },
  { file: "4. More Than Six Months.csv",   timeframe: null          },
  { file: "3. Six Months.csv",             timeframe: "six-months"  },
  { file: "2. Three Months.csv",           timeframe: "three-months"},
  { file: "1. Thirty Days.csv",            timeframe: "thirty-days" },
];

// companyName → Map< slug, { id, title, url, difficulty, acceptance, frequency, tags, timeframe } >
const primaryData = new Map();

let synthetic = 100000;
let unresolved = 0;

const primaryDirs = fs.readdirSync(PRIMARY_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith("."))
  .map(e => e.name).sort();

for (const dir of primaryDirs) {
  const companyName = normCompany(dir);
  const companyPath = path.join(PRIMARY_DIR, dir);
  const problems    = new Map(); // slug → entry

  for (const { file, timeframe } of PRIMARY_FILES) {
    const filePath = path.join(companyPath, file);
    if (!fs.existsSync(filePath)) continue;

    for (const row of parseCSV(fs.readFileSync(filePath, "utf-8"))) {
      const link  = (row["Link"] ?? row["URL"] ?? row["url"] ?? "").trim();
      const slug  = slugFromUrl(link);
      if (!slug) continue;

      const title      = (row["Title"] ?? row["title"] ?? "").trim();
      const difficulty = normDifficulty(row["Difficulty"] ?? row["difficulty"] ?? "");
      const frequency  = parseFloat_(row["Frequency"] ?? row["frequency"]);
      const tagsRaw    = (row["Topics"] ?? row["topics"] ?? "").trim();
      const tags       = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];
      // NOTE: "Acceptance Rate" in the 30k repo is NOT standard LeetCode acceptance %.
      // We deliberately ignore it and use the 7.9k repo's value instead.

      if (problems.has(slug)) {
        const p = problems.get(slug);
        // Timeframe: keep the shorter (more recent) one
        if (timeframe) p.timeframe = p.timeframe ? shorterTf(p.timeframe, timeframe) : timeframe;
        // Frequency: use the first (All.csv) value; only override if missing
        if (p.frequency == null) p.frequency = frequency;
        // Tags: merge any new ones from this file
        const tagSet = new Set(p.tags);
        tags.forEach(t => { if (!tagSet.has(t)) { p.tags.push(t); tagSet.add(t); } });
      } else {
        // Resolve ID: slug lookup → title fallback → synthetic
        const meta       = slugToMeta.get(slug);
        const id         = meta?.id ?? titleToId.get(normTitle(title)) ?? (unresolved++, synthetic++);
        const acceptance = meta?.acceptance ?? null;

        problems.set(slug, {
          id,
          title:      title || "",
          url:        link,
          difficulty: difficulty,
          acceptance,
          frequency,
          tags,
          timeframe:  timeframe ?? null,
        });
      }
    }
  }

  primaryData.set(companyName, problems);
  process.stdout.write(`  [30k] ${companyName}: ${problems.size} problems\n`);
}

console.log(`  ${unresolved} problems could not be matched to a LeetCode ID (synthetic IDs assigned)`);

// ─── Phase 3: Fill in from 7.9k repo (coverage gaps) ─────────────────────────

console.log("Phase 3: Filling in from 7.9k repo...");

// Build a fast lookup set: "companyName|id"
const primaryPairs = new Set();
for (const [company, problems] of primaryData) {
  for (const p of problems.values()) primaryPairs.add(`${company}|${p.id}`);
}

const SECONDARY_FILES = [
  { file: "all.csv",                  timeframe: "all"           },
  { file: "more-than-six-months.csv", timeframe: "more-than-six" },
  { file: "six-months.csv",           timeframe: "six-months"    },
  { file: "three-months.csv",         timeframe: "three-months"  },
  { file: "thirty-days.csv",          timeframe: "thirty-days"   },
];

let filled = 0;

if (fs.existsSync(SECONDARY_DIR)) {
  const dirs = fs.readdirSync(SECONDARY_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith("."))
    .map(e => e.name);

  for (const dir of dirs) {
    const companyName = normCompany(dir);
    if (!primaryData.has(companyName)) primaryData.set(companyName, new Map());
    const companyProblems = primaryData.get(companyName);

    // Merge all secondary files for this company
    const merged = new Map(); // id → { meta, timeframe }
    for (const { file, timeframe } of SECONDARY_FILES) {
      const fp = path.join(SECONDARY_DIR, dir, file);
      if (!fs.existsSync(fp)) continue;
      for (const row of parseCSV(fs.readFileSync(fp, "utf-8"))) {
        const id = parseInt(getField(row, "ID", "Id", "id"), 10);
        if (isNaN(id)) continue;
        const url        = (getField(row, "URL", "Url", "url") ?? "").trim();
        const title      = (getField(row, "Title", "title") ?? "").trim();
        const difficulty = normDifficulty(getField(row, "Difficulty", "difficulty") ?? "");
        const acceptance = parseFloat_(getField(row, "Acceptance %", "Acceptance%", "Acceptance"));
        const frequency  = parseFloat_(getField(row, "Frequency %", "Frequency%", "Frequency"));
        const ex = merged.get(id);
        // prefer "all.csv" metadata; shorter timeframe wins
        merged.set(id, {
          meta:      (!ex || timeframe === "all") ? { id, url, title, difficulty, acceptance, frequency } : ex.meta,
          timeframe: (!ex) ? timeframe : (TF_NULL.has(ex.timeframe) ? timeframe : shorterTf(ex.timeframe, timeframe)),
        });
      }
    }

    // Add only pairs not already covered by the primary (30k) data
    for (const [id, { meta, timeframe }] of merged) {
      const pairKey = `${companyName}|${id}`;
      if (primaryPairs.has(pairKey)) continue;

      const finalTf = TF_NULL.has(timeframe) ? null : timeframe;
      const slug    = slugFromUrl(meta.url) ?? `id-${id}`;
      companyProblems.set(slug, {
        id:         meta.id,
        title:      meta.title,
        url:        meta.url,
        difficulty: meta.difficulty,
        acceptance: meta.acceptance,
        frequency:  meta.frequency,
        tags:       [],
        timeframe:  finalTf,
      });
      primaryPairs.add(pairKey);
      filled++;
    }
  }
}
console.log(`  ${filled} additional problem+company pairs filled from 7.9k repo`);

// ─── Phase 4: Assemble final JSON ─────────────────────────────────────────────

console.log("Phase 4: Assembling output...");

const allCompanyNames = [...primaryData.keys()].sort();
const companies       = allCompanyNames.map((name, i) => ({ id: i + 1, name, problem_count: 0 }));
const companyIdByName = new Map(companies.map(c => [c.name, c.id]));

const problemMap = new Map(); // id → final problem object

for (const [companyName, companyProblems] of primaryData) {
  const companyId = companyIdByName.get(companyName);
  if (!companyId) continue;

  for (const p of companyProblems.values()) {
    if (!problemMap.has(p.id)) {
      problemMap.set(p.id, {
        id:           p.id,
        title:        p.title,
        url:          p.url,
        difficulty:   p.difficulty,
        acceptance:   p.acceptance,
        frequency:    p.frequency,
        problem_tags: p.tags.map(t => ({ tag: t })),
        company_problems: [],
      });
    } else {
      // Fill in any missing fields from later occurrences
      const existing = problemMap.get(p.id);
      if (!existing.title      && p.title)      existing.title      = p.title;
      if (!existing.url        && p.url)        existing.url        = p.url;
      if (!existing.difficulty && p.difficulty) existing.difficulty = p.difficulty;
      if (existing.acceptance == null && p.acceptance != null) existing.acceptance = p.acceptance;
      if (existing.frequency  == null && p.frequency  != null) existing.frequency  = p.frequency;
      // Merge tags
      const tagSet = new Set(existing.problem_tags.map(t => t.tag));
      p.tags.forEach(t => { if (!tagSet.has(t)) { existing.problem_tags.push({ tag: t }); tagSet.add(t); } });
    }

    problemMap.get(p.id).company_problems.push({
      company:       { id: companyId, name: companyName },
      timeframe_tag: p.timeframe,
    });
  }
}

// Recompute problem_count
const countById = new Map();
for (const p of problemMap.values())
  for (const cp of p.company_problems)
    countById.set(cp.company.id, (countById.get(cp.company.id) ?? 0) + 1);

for (const c of companies) c.problem_count = countById.get(c.id) ?? 0;

const problemsArray = [...problemMap.values()].sort((a, b) => a.id - b.id);
fs.writeFileSync(OUT_FILE, JSON.stringify({ companies, problems: problemsArray }));

console.log(`\nWrote ${companies.length} companies, ${problemsArray.length} problems → ${OUT_FILE}`);
