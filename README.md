# ContextVocab

A Next.js vocabulary learning app focused on learning words through sentence writing, AI feedback, and spaced repetition.

## Stack

- Next.js App Router
- Supabase
- Vercel
- OpenAI-compatible chat API

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.local.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `OPENAI_MODEL`

3. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI Configuration

AI keys are server-side only.

- Do not store provider API keys in the browser.
- For local development, change `.env.local`.
- For production on Vercel, change Project Settings -> Environment Variables and redeploy.

OpenAI example:

```env
OPENAI_API_KEY=...
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

DeepSeek example:

```env
OPENAI_API_KEY=...
OPENAI_API_BASE=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

## Supabase

Run [schema.sql](e:/codework/words/supabase/schema.sql) in the Supabase SQL editor to create the required tables and RPC.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run import:words
npm run import:cet6
```

## Deploy

Deploy to Vercel and set the same environment variables there.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `OPENAI_MODEL`
