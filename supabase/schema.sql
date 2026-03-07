-- ============================================================
-- ContextVocab Supabase Database Schema
-- Run this in Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. words
CREATE TABLE IF NOT EXISTS public.words (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word         VARCHAR(255) NOT NULL,
    phonetic     VARCHAR(255),
    definition   TEXT NOT NULL,
    tags         VARCHAR(255),
    example      TEXT,
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  ALTER TABLE public.words
    ADD CONSTRAINT words_word_unique UNIQUE (word);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_words_tags ON public.words (tags);

-- 1.5 libraries / wordbooks
CREATE TABLE IF NOT EXISTS public.libraries (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug         TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    description  TEXT,
    source_type  TEXT NOT NULL DEFAULT 'official' CHECK (source_type IN ('official', 'custom')),
    language     TEXT NOT NULL DEFAULT 'en',
    is_public    BOOLEAN NOT NULL DEFAULT TRUE,
    created_by   UUID,
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.library_words (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    library_id   UUID NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
    word_id      UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
    position     INTEGER,
    added_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (library_id, word_id)
);

CREATE TABLE IF NOT EXISTS public.user_library_plans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL,
    library_id      UUID NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    daily_new_limit INTEGER,
    started_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_studied_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, library_id)
);

CREATE TABLE IF NOT EXISTS public.user_library_words (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL,
    library_id       UUID NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
    word_id          UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
    introduced_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    first_studied_at TIMESTAMPTZ,
    last_studied_at  TIMESTAMPTZ,
    source           TEXT DEFAULT 'scheduled',
    is_hidden        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, library_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_library_words_library_id
  ON public.library_words (library_id, position);
CREATE INDEX IF NOT EXISTS idx_library_words_word_id
  ON public.library_words (word_id);
CREATE INDEX IF NOT EXISTS idx_user_library_plans_user_id
  ON public.user_library_plans (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_library_words_user_library
  ON public.user_library_words (user_id, library_id);
CREATE INDEX IF NOT EXISTS idx_user_library_words_word
  ON public.user_library_words (user_id, word_id);

-- 2. user_words
CREATE TABLE IF NOT EXISTS public.user_words (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL,
    word_id              UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
    interval             INTEGER DEFAULT 0,
    ease_factor          REAL DEFAULT 2.5,
    next_review_date     DATE DEFAULT CURRENT_DATE,
    repetitions          INTEGER DEFAULT 0,
    last_score           INTEGER,
    last_reviewed_at     TIMESTAMPTZ,
    consecutive_failures INTEGER DEFAULT 0,
    lapse_count          INTEGER DEFAULT 0,
    is_favorite          BOOLEAN DEFAULT FALSE,
    created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_user_words_user_id
  ON public.user_words (user_id);
CREATE INDEX IF NOT EXISTS idx_user_words_next_review_date
  ON public.user_words (next_review_date);
CREATE INDEX IF NOT EXISTS idx_user_words_user_review_date
  ON public.user_words (user_id, next_review_date);
CREATE INDEX IF NOT EXISTS idx_user_words_user_favorite
  ON public.user_words (user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_user_words_due_failures
  ON public.user_words (user_id, next_review_date, consecutive_failures);

-- 3. sentences
CREATE TABLE IF NOT EXISTS public.sentences (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                UUID NOT NULL,
    word_id                UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
    original_text          TEXT NOT NULL,
    ai_score               INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
    ai_feedback            TEXT,
    attempt_status         TEXT DEFAULT 'valid',
    usage_quality          TEXT DEFAULT 'weak',
    uses_word_in_context   BOOLEAN DEFAULT FALSE,
    is_meta_sentence       BOOLEAN DEFAULT FALSE,
    created_at             TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sentences_user_id
  ON public.sentences (user_id);
CREATE INDEX IF NOT EXISTS idx_sentences_word_id
  ON public.sentences (word_id);
CREATE INDEX IF NOT EXISTS idx_sentences_user_word_created_at
  ON public.sentences (user_id, word_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_libraries_updated_at ON public.libraries;
CREATE TRIGGER trg_libraries_updated_at
  BEFORE UPDATE ON public.libraries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_user_words_updated_at ON public.user_words;
CREATE TRIGGER trg_user_words_updated_at
  BEFORE UPDATE ON public.user_words
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_user_library_plans_updated_at ON public.user_library_plans;
CREATE TRIGGER trg_user_library_plans_updated_at
  BEFORE UPDATE ON public.user_library_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_user_library_words_updated_at ON public.user_library_words;
CREATE TRIGGER trg_user_library_words_updated_at
  BEFORE UPDATE ON public.user_library_words
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- legacy RPC for fallback new-word picking
CREATE OR REPLACE FUNCTION public.pick_unstudied_word(
  p_user_id UUID,
  p_tag TEXT DEFAULT NULL,
  p_skipped_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS SETOF public.words
LANGUAGE sql
STABLE
AS $$
  SELECT w.*
  FROM public.words w
  LEFT JOIN public.user_words uw
    ON uw.word_id = w.id
   AND uw.user_id = p_user_id
  WHERE uw.id IS NULL
    AND (p_tag IS NULL OR p_tag = 'All' OR w.tags = p_tag)
    AND (cardinality(p_skipped_ids) = 0 OR NOT (w.id = ANY(p_skipped_ids)))
  ORDER BY random()
  LIMIT 1;
$$;

-- incremental migration safety for existing projects
ALTER TABLE public.user_words
  ADD COLUMN IF NOT EXISTS last_score INTEGER,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lapse_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

ALTER TABLE public.sentences
  ADD COLUMN IF NOT EXISTS attempt_status TEXT DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS usage_quality TEXT DEFAULT 'weak',
  ADD COLUMN IF NOT EXISTS uses_word_in_context BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_meta_sentence BOOLEAN DEFAULT FALSE;

-- official library seeds based on legacy tags
INSERT INTO public.libraries (slug, name, description, source_type, language, is_public)
VALUES
  ('cet-4', 'CET-4', '大学英语四级核心词库', 'official', 'en', TRUE),
  ('cet-6', 'CET-6', '大学英语六级核心词库', 'official', 'en', TRUE)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source_type = EXCLUDED.source_type,
  language = EXCLUDED.language,
  is_public = EXCLUDED.is_public;

INSERT INTO public.library_words (library_id, word_id, position)
SELECT
  libraries.id,
  words.id,
  ROW_NUMBER() OVER (PARTITION BY libraries.id ORDER BY words.word)
FROM public.words AS words
JOIN public.libraries AS libraries
  ON (
    (libraries.slug = 'cet-4' AND (',' || REPLACE(COALESCE(words.tags, ''), ' ', '') || ',') LIKE '%,CET-4,%')
    OR
    (libraries.slug = 'cet-6' AND (',' || REPLACE(COALESCE(words.tags, ''), ' ', '') || ',') LIKE '%,CET-6,%')
  )
ON CONFLICT (library_id, word_id) DO NOTHING;

-- row level security
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_library_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_library_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Words are publicly readable" ON public.words;
CREATE POLICY "Words are publicly readable"
  ON public.words
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Libraries are readable" ON public.libraries;
CREATE POLICY "Libraries are readable"
  ON public.libraries
  FOR SELECT
  USING (is_public = true OR created_by = auth.uid());

DROP POLICY IF EXISTS "Users can manage their own libraries" ON public.libraries;
CREATE POLICY "Users can manage their own libraries"
  ON public.libraries
  FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Library words are readable" ON public.library_words;
CREATE POLICY "Library words are readable"
  ON public.library_words
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.libraries
      WHERE libraries.id = library_words.library_id
        AND (libraries.is_public = true OR libraries.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage library words for their own libraries" ON public.library_words;
CREATE POLICY "Users can manage library words for their own libraries"
  ON public.library_words
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.libraries
      WHERE libraries.id = library_words.library_id
        AND libraries.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.libraries
      WHERE libraries.id = library_words.library_id
        AND libraries.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage their own user_words" ON public.user_words;
CREATE POLICY "Users can manage their own user_words"
  ON public.user_words
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own library plans" ON public.user_library_plans;
CREATE POLICY "Users can manage their own library plans"
  ON public.user_library_plans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own library words" ON public.user_library_words;
CREATE POLICY "Users can manage their own library words"
  ON public.user_library_words
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own sentences" ON public.sentences;
CREATE POLICY "Users can manage their own sentences"
  ON public.sentences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
