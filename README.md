# Visor Leetcode

<img width="1920" height="912" alt="image" src="https://github.com/user-attachments/assets/6361f94d-f7a8-49fe-ab05-a1a9cf28012a" />
<img width="1920" height="912" alt="image" src="https://github.com/user-attachments/assets/ac24ad15-0686-40c2-b477-7b5e978e6ccc" />

<br/>

Company-wise LeetCode problems viewer. This is a fork of [hitarth-gg/visor-leetcode](https://github.com/hitarth-gg/visor-leetcode) — the original uses the same UI but is backed by a Supabase database (see `visor-leetcode (original)/` if you have the reference copy locally). This fork replaces Supabase entirely with three open CSV data sources, so it runs fully locally with no credentials needed.

---

## Data sources

Problem data is merged from three sources:

| Source | Role |
|---|---|
| [leetcode-company-wise-problems](https://github.com/liquidslr/leetcode-company-wise-problems) (30k ★) | Primary — timeframes, frequency, algorithm tags |
| [leetcode-companywise-interview-questions](https://github.com/snehasishroy/leetcode-companywise-interview-questions) (7.9k ★) | Secondary — numeric LeetCode IDs, acceptance rates, coverage fill |
| Original visor-leetcode Supabase DB | Tertiary — extra companies/problems not in either CSV repo |

---

## Local setup

Run once from the repo root — clones the data repos, builds `data.json`, installs dependencies, and starts the dev server:

```bash
bash scripts/setup.sh
```

Open [http://localhost:5173/visor-leetcode/](http://localhost:5173/visor-leetcode/)

---

## Refreshing data

When the CSV repos get new updates, pull and rebuild without restarting:

```bash
bash scripts/refresh.sh
```

---

## What works locally

- Browse companies and search by name
- View all problems per company with difficulty, frequency, timeframe badges (30d / 3m / 6m)
- Algorithm tags (Array, DP, etc.)
- Filter by difficulty and tags
- "Also Asked At" cross-company view

**Not available in local mode:** sign-in, completion tracking (requires Supabase auth).
