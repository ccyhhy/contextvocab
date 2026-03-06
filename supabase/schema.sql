-- ============================================================
-- ContextVocab — Supabase Database Schema
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. words ──────────────────────────────────────────────────
-- Vocabulary library (shared, not user-specific)
CREATE TABLE public.words (
    id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
    word         VARCHAR(255) NOT NULL,
    phonetic     VARCHAR(255),
    definition   TEXT        NOT NULL,
    tags         VARCHAR(255),           -- e.g. "CET-6,formal"
    example      TEXT,                   -- curated example sentence
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint (also provides the index) — required for upsert ON CONFLICT
ALTER TABLE public.words ADD CONSTRAINT words_word_unique UNIQUE (word);

-- ── 2. user_words ─────────────────────────────────────────────
-- Per-user SRS (Spaced Repetition System) learning progress
CREATE TABLE public.user_words (
    id               UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id          UUID    NOT NULL,   -- references auth.users(id)
    word_id          UUID    NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
    interval         INTEGER DEFAULT 0,          -- days until next review
    ease_factor      REAL    DEFAULT 2.5,         -- SM-2 ease factor
    next_review_date DATE    DEFAULT CURRENT_DATE,
    repetitions      INTEGER DEFAULT 0,           -- total review count
    is_favorite      BOOLEAN DEFAULT FALSE,       -- bookmark word for focused review
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, word_id)
);

CREATE INDEX idx_user_words_user_id          ON public.user_words (user_id);
CREATE INDEX idx_user_words_next_review_date ON public.user_words (next_review_date);
CREATE INDEX idx_user_words_user_review_date ON public.user_words (user_id, next_review_date);
CREATE INDEX idx_user_words_user_favorite    ON public.user_words (user_id, is_favorite);

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_words_updated_at
  BEFORE UPDATE ON public.user_words
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 3. sentences ──────────────────────────────────────────────
-- User-submitted sentences and AI evaluation results
CREATE TABLE public.sentences (
    id            UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id       UUID    NOT NULL,
    word_id       UUID    NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
    original_text TEXT    NOT NULL,
    ai_score      INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
    ai_feedback   TEXT,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sentences_user_id ON public.sentences (user_id);
CREATE INDEX idx_sentences_word_id ON public.sentences (word_id);
CREATE INDEX idx_sentences_user_word_created_at ON public.sentences (user_id, word_id, created_at DESC);
CREATE INDEX idx_words_tags ON public.words (tags);

-- Optional RPC for selecting a random unstudied word server-side.
-- Useful if you want to avoid client-side exclusion lists as vocabulary grows.
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

-- ── Row Level Security ────────────────────────────────────────
-- Enable RLS so users can only see their own data
ALTER TABLE public.user_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentences  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own user_words"
  ON public.user_words
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own sentences"
  ON public.sentences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- words table is public read-only
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Words are publicly readable"
  ON public.words
  FOR SELECT
  USING (true);
