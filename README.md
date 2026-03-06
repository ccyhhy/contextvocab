# ContextVocab

ContextVocab is a Next.js vocabulary learning app for practicing words through sentence writing, AI feedback, and spaced repetition.

## What It Does

- Shows one word at a time for active sentence practice
- Evaluates user sentences with an OpenAI-compatible model
- Streams live feedback before showing the final structured score card
- Tracks review progress with SRS
- Stores sentence history in Supabase
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

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run import:words
npm run import:cet6
```

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

## Recommended Model Setup

For this project:

- Default: `gpt-4o-mini`
- Lower-friction alternative: `deepseek-chat`

If OpenAI billing or availability is inconvenient, use DeepSeek through the same server-side variables.

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

- Favorites are currently stored in browser local storage
- AI model config is server-side only
- TTS settings are browser-side only
