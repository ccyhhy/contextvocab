# Deploy Guide

This document is the deployment checklist for ContextVocab.

## 1. Prepare Supabase

Create a Supabase project, then collect:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

Run [schema.sql](e:/codework/words/supabase/schema.sql) in Supabase SQL Editor.

In Supabase Auth settings, add these redirect URLs for password reset:

- `http://localhost:3000/auth/callback`
- `https://your-domain/auth/callback`

## 2. Prepare AI Provider

Choose one provider.

### OpenAI

```env
OPENAI_API_KEY=...
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

### DeepSeek

```env
OPENAI_API_KEY=...
OPENAI_API_BASE=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

## 3. Import the Repository into Vercel

Import:

- `ccyhhy/contextvocab`

Important:

- use the repository root
- do not select a subdirectory as the root directory

## 4. Set Vercel Environment Variables

Add all of these:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `OPENAI_MODEL`

## 5. Deploy

Click deploy.

After the first deployment, verify:

- `/study` loads
- a word appears
- submitting a sentence returns AI feedback
- `/history` loads
- `/dashboard` loads

## 6. Import Vocabulary Data

The app needs words in Supabase.

Run locally with your `.env.local` pointing at the production Supabase project:

```bash
npm run import:words
npm run import:cet6
```

## 7. Update Flow

For normal code changes:

```bash
npm run lint
npm run build
git add .
git commit -m "your change"
git push
```

Vercel auto-deploys after push.

## 8. If You Change Environment Variables

Update them in Vercel, then redeploy.

## 9. If You Change the Database Schema

Apply the SQL change in Supabase first, then deploy the matching code.

Current schema update for cloud favorites:

```sql
ALTER TABLE public.user_words
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_words_user_favorite
ON public.user_words (user_id, is_favorite);
```

## 10. Common Problems

### “No Next.js version detected”

Vercel is building the wrong directory. Use the repo root.

### AI is missing after deployment

Check:

- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `OPENAI_MODEL`

### No words available

Check:

- schema was executed
- import scripts completed successfully
- Vercel and local Supabase variables point to the correct project
