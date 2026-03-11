# ContextVocab

ContextVocab is a Next.js vocabulary learning app for practicing words through sentence writing, AI feedback, and spaced repetition.

## What It Does

- Shows one word at a time for active sentence practice
- Evaluates user sentences with an OpenAI-compatible model
- Streams live feedback before showing the final structured score card
- Tracks review progress with SRS
- Stores sentence history in Supabase
- Stores favorites in Supabase for cross-device sync
- Supports favorites and a favorites-only study mode
- Provides sentence-help prompts when the user cannot start writing

## Stack

- Next.js App Router
- React 19
- Supabase
- Vercel
- OpenAI-compatible chat API
- Framer Motion

## Core Pages

- `/study`: main learning flow
- `/dashboard`: summary stats and recent activity
- `/history`: sentence history and search

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy [.env.local.example](e:/codework/words/.env.local.example) to `.env.local`.

Required values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `OPENAI_MODEL`

Example with OpenAI:

```env
OPENAI_API_KEY=...
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

Example with DeepSeek:

```env
OPENAI_API_KEY=...
OPENAI_API_BASE=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

### 3. Create the database schema

Run [schema.sql](e:/codework/words/supabase/schema.sql) in the Supabase SQL editor.

This creates:

- `words`
- `user_words`
- `sentences`
- `pick_unstudied_word` RPC

### 4. Import vocabulary data

The repo already includes CET word data in [data](e:/codework/words/data).

Run:

```bash
npm run import:words
npm run import:cet6
```

If you update `schema.sql` later, rerun the latest schema before using the enrichment pipeline below.

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For password reset links, add these redirect URLs in Supabase Auth:

- `http://localhost:3000/auth/callback`
- your production domain `/auth/callback`

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run enrich:words
npm run import:enriched
npm run import:words
npm run import:cet6
```

## Enrichment Pipeline

The project now includes a free-source enrichment pipeline for turning a thin word entry into a richer learner profile.

What it does:

- reads seed words from `public.words`
- fetches extra evidence from `dictionaryapi.dev` and Datamuse
- supports a staged learner-profile pipeline:
  - `base`: fast coverage for `coreMeaning`, `sceneTags`, `collocations`, `usageRegister`
  - `refine`: deeper semantic feel, usage notes, contrast words, and better examples
- writes a reviewable JSON file before any database import
- imports the profile tables and syncs the best example sentence back to `words.example`

New tables added in [schema.sql](e:/codework/words/supabase/schema.sql):

- `word_profiles`
- `word_profile_examples`
- `word_profile_sources`

### Typical Workflow

1. Regenerate the latest database schema in Supabase.
2. Create a fast base-layer pilot:

```bash
npm run enrich:words -- --stage base --tag CET-4 --limit 50 --output data/enriched/cet4-base.json
```

Useful flags:

- `--stage base|refine`: choose which layer to generate. Default is `base`
- `--concurrency N`: worker count for enrichment. Default is `4` for `base`, `2` for `refine`
- `--dry-run`: show a preview without writing the JSON file
- `--no-ai`: force pure free-source + rule-based mode
- `--with-ai`: use the stage-specific AI env vars if available
- `--words abandon,commit,issue`: enrich specific words instead of a tag slice

3. Review the generated JSON in `data/enriched/`.
4. Import it into Supabase:

```bash
npm run import:enriched -- --input data/enriched/cet4-base.json
```

5. Refine only the words that matter now:

```bash
npm run enrich:words -- --stage refine --words hazard,issue,account --output data/enriched/refine-focus.json
npm run import:enriched -- --input data/enriched/refine-focus.json
```

Useful flags:

- `--dry-run`: validate the import plan without writing to Supabase
- `--skip-sync-example`: keep the original `words.example` unchanged
- `--min-examples 1`: only import items that have at least this many examples
- `--min-collocations 1`: only import items that have at least this many collocations

### Notes

- Base imports merge into existing profiles and keep refined fields intact.
- Refine imports replace profile examples and sources for the selected words, so you can safely refresh a bad card.
- The free pipeline works without AI, but the fallback profile is intentionally conservative.
- If AI env vars are set, the script will use stage-specific models when available.
- For Zhipu GLM ordinary API, a practical split is:
  - `OPENAI_ENRICH_BASE_MODEL=glm-4.5-air`
  - `OPENAI_ENRICH_REFINE_MODEL=glm-4.7`
- `OPENAI_*_API_BASE` can be either a base URL like `.../paas/v4` or the full `.../chat/completions` endpoint.
- Even without any frontend changes, importing enriched data improves the current sentence-help flow because the primary example is copied back into `words.example`.

## AI Configuration

AI provider credentials are server-side only.

- Do not store model API keys in the browser
- Do not expose `OPENAI_API_KEY` to the client
- For local development, change `.env.local`
- For production, change Vercel environment variables and redeploy

The frontend no longer accepts API keys from users. The server reads:

- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `OPENAI_MODEL`
- `OPENAI_HINT_API_KEY` / `OPENAI_HINT_API_BASE` / `OPENAI_HINT_MODEL`
- `OPENAI_ENRICH_API_KEY` / `OPENAI_ENRICH_API_BASE` / `OPENAI_ENRICH_MODEL`
- `OPENAI_ENRICH_BASE_API_KEY` / `OPENAI_ENRICH_BASE_API_BASE` / `OPENAI_ENRICH_BASE_MODEL`
- `OPENAI_ENRICH_REFINE_API_KEY` / `OPENAI_ENRICH_REFINE_API_BASE` / `OPENAI_ENRICH_REFINE_MODEL`
- `OPENAI_ENRICH_EXAMPLE_API_KEY` / `OPENAI_ENRICH_EXAMPLE_API_BASE` / `OPENAI_ENRICH_EXAMPLE_MODEL`

## Recommended Model Setup

For this project:

- Fast base layer: `glm-4.5-air`
- Focus-word refine layer: `glm-4.7`
- Sentence help: `glm-4.5-air` or `OPENAI_HINT_*`

If OpenAI billing or availability is inconvenient, use any OpenAI-compatible provider through the same server-side variables.

## Project Structure

```text
src/app/
  api/evaluate/       AI streaming endpoint
  dashboard/          stats page
  history/            history page
  study/              study flow
src/lib/
  evaluation-format.ts
  srs.ts
  supabase/
scripts/
  import-words.ts
  import-cet6.ts
supabase/
  schema.sql
data/
  CET source files
```

## Deployment

For full deployment steps, see [DEPLOY.md](e:/codework/words/DEPLOY.md).

Short version:

1. Push code to GitHub
2. Import the repository into Vercel
3. Set all required environment variables
4. Run the Supabase schema
5. Import vocabulary data
6. Redeploy if environment variables change

## Updating the Project

Normal update flow:

```bash
npm run lint
npm run build
git add .
git commit -m "your change"
git push
```

Vercel will auto-deploy after `git push`.

If you change environment variables:

- update them in Vercel
- trigger a new deployment

If you change database structure:

- update Supabase first
- then push the matching code

## Troubleshooting

### Vercel says “No Next.js version detected”

Make sure:

- the repo root contains [package.json](e:/codework/words/package.json)
- Vercel imports the repository root, not a subdirectory

### Deployed app has no AI response

Check Vercel environment variables:

- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `OPENAI_MODEL`

### App opens but no words appear

Usually one of these is missing:

- Supabase schema was not executed
- word import scripts were not run
- wrong Supabase environment variables

## Notes

- Favorites are stored in Supabase and sync with the signed-in user
- AI model config is server-side only
- TTS settings are browser-side only
