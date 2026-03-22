ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'word';

ALTER TABLE public.libraries
  ALTER COLUMN content_type SET DEFAULT 'word';

UPDATE public.libraries
SET content_type = 'word'
WHERE content_type IS NULL;

ALTER TABLE public.libraries
  ALTER COLUMN content_type SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.libraries
    DROP CONSTRAINT IF EXISTS libraries_content_type_check;
  ALTER TABLE public.libraries
    ADD CONSTRAINT libraries_content_type_check
    CHECK (content_type IN ('word', 'grammar', 'mixed'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.grammar_items (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug             TEXT NOT NULL UNIQUE,
    title            TEXT NOT NULL,
    short_label      TEXT,
    pattern          TEXT NOT NULL,
    family           TEXT NOT NULL,
    subtype          TEXT,
    anchor           TEXT,
    core_explanation TEXT NOT NULL,
    usage_note       TEXT,
    usage_register   TEXT CHECK (usage_register IN ('formal', 'neutral', 'informal') OR usage_register IS NULL),
    scene_tags       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    slot_schema      JSONB NOT NULL DEFAULT '[]'::JSONB,
    common_errors    JSONB NOT NULL DEFAULT '[]'::JSONB,
    difficulty       INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.grammar_item_examples (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grammar_item_id     UUID NOT NULL REFERENCES public.grammar_items(id) ON DELETE CASCADE,
    sentence            TEXT NOT NULL,
    translation         TEXT,
    note                TEXT,
    scene               TEXT,
    source_name         TEXT,
    source_url          TEXT,
    license             TEXT,
    quality_score       REAL,
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (grammar_item_id, sentence)
);

CREATE TABLE IF NOT EXISTS public.grammar_item_contrasts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grammar_item_id     UUID NOT NULL REFERENCES public.grammar_items(id) ON DELETE CASCADE,
    contrast_item_id    UUID NOT NULL REFERENCES public.grammar_items(id) ON DELETE CASCADE,
    note                TEXT NOT NULL,
    position            INTEGER,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (grammar_item_id, contrast_item_id)
);

CREATE TABLE IF NOT EXISTS public.grammar_item_templates (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grammar_item_id     UUID NOT NULL REFERENCES public.grammar_items(id) ON DELETE CASCADE,
    label               TEXT NOT NULL,
    template            TEXT NOT NULL,
    slot_hints          JSONB NOT NULL DEFAULT '[]'::JSONB,
    example_sentence    TEXT,
    example_translation TEXT,
    position            INTEGER,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_grammar_items_family
  ON public.grammar_items (family, subtype);
CREATE INDEX IF NOT EXISTS idx_grammar_items_scene_tags
  ON public.grammar_items USING GIN (scene_tags);
CREATE INDEX IF NOT EXISTS idx_grammar_item_examples_item_id
  ON public.grammar_item_examples (grammar_item_id, is_primary DESC, quality_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_grammar_item_contrasts_item_id
  ON public.grammar_item_contrasts (grammar_item_id, position, contrast_item_id);
CREATE INDEX IF NOT EXISTS idx_grammar_item_templates_item_id
  ON public.grammar_item_templates (grammar_item_id, position);

CREATE TABLE IF NOT EXISTS public.library_grammar_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    library_id      UUID NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
    grammar_item_id UUID NOT NULL REFERENCES public.grammar_items(id) ON DELETE CASCADE,
    position        INTEGER,
    added_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (library_id, grammar_item_id)
);

CREATE INDEX IF NOT EXISTS idx_library_grammar_items_library_id
  ON public.library_grammar_items (library_id, position);
CREATE INDEX IF NOT EXISTS idx_library_grammar_items_item_id
  ON public.library_grammar_items (grammar_item_id);

CREATE TABLE IF NOT EXISTS public.user_grammar_items (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL,
    grammar_item_id      UUID NOT NULL REFERENCES public.grammar_items(id) ON DELETE CASCADE,
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
    UNIQUE (user_id, grammar_item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_grammar_items_user_id
  ON public.user_grammar_items (user_id);
CREATE INDEX IF NOT EXISTS idx_user_grammar_items_next_review_date
  ON public.user_grammar_items (next_review_date);
CREATE INDEX IF NOT EXISTS idx_user_grammar_items_user_review_date
  ON public.user_grammar_items (user_id, next_review_date);
CREATE INDEX IF NOT EXISTS idx_user_grammar_items_user_favorite
  ON public.user_grammar_items (user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_user_grammar_items_due_failures
  ON public.user_grammar_items (user_id, next_review_date, consecutive_failures);
CREATE INDEX IF NOT EXISTS idx_user_grammar_items_due_queue
  ON public.user_grammar_items (user_id, next_review_date, last_reviewed_at, created_at);

CREATE TABLE IF NOT EXISTS public.user_library_grammar_items (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL,
    library_id       UUID NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
    grammar_item_id  UUID NOT NULL REFERENCES public.grammar_items(id) ON DELETE CASCADE,
    introduced_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    first_studied_at TIMESTAMPTZ,
    last_studied_at  TIMESTAMPTZ,
    source           TEXT DEFAULT 'scheduled',
    is_hidden        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, library_id, grammar_item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_library_grammar_items_user_library
  ON public.user_library_grammar_items (user_id, library_id);
CREATE INDEX IF NOT EXISTS idx_user_library_grammar_items_item
  ON public.user_library_grammar_items (user_id, grammar_item_id);

CREATE TABLE IF NOT EXISTS public.grammar_attempts (
    id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                      UUID NOT NULL,
    grammar_item_id              UUID NOT NULL REFERENCES public.grammar_items(id) ON DELETE CASCADE,
    original_text                TEXT NOT NULL,
    ai_score                     INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
    ai_feedback                  TEXT,
    corrected_text               TEXT,
    corrected_text_translation   TEXT,
    attempt_status               TEXT DEFAULT 'valid',
    pattern_matched              BOOLEAN DEFAULT FALSE,
    structure_accuracy           INTEGER CHECK (structure_accuracy >= 1 AND structure_accuracy <= 5),
    scene_fit                    INTEGER CHECK (scene_fit >= 1 AND scene_fit <= 5),
    naturalness                  INTEGER CHECK (naturalness >= 1 AND naturalness <= 5),
    created_at                   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_grammar_attempts_user_id
  ON public.grammar_attempts (user_id);
CREATE INDEX IF NOT EXISTS idx_grammar_attempts_item_id
  ON public.grammar_attempts (grammar_item_id);
CREATE INDEX IF NOT EXISTS idx_grammar_attempts_user_item_created_at
  ON public.grammar_attempts (user_id, grammar_item_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_grammar_items_updated_at ON public.grammar_items;
CREATE TRIGGER trg_grammar_items_updated_at
  BEFORE UPDATE ON public.grammar_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_user_library_grammar_items_updated_at ON public.user_library_grammar_items;
CREATE TRIGGER trg_user_library_grammar_items_updated_at
  BEFORE UPDATE ON public.user_library_grammar_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_user_grammar_items_updated_at ON public.user_grammar_items;
CREATE TRIGGER trg_user_grammar_items_updated_at
  BEFORE UPDATE ON public.user_grammar_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

UPDATE public.libraries
SET content_type = 'word'
WHERE slug IN ('cet-4', 'cet-6');

ALTER TABLE public.grammar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grammar_item_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grammar_item_contrasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grammar_item_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_grammar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_grammar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_library_grammar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grammar_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Grammar items are publicly readable" ON public.grammar_items;
CREATE POLICY "Grammar items are publicly readable"
  ON public.grammar_items
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Grammar item examples are publicly readable" ON public.grammar_item_examples;
CREATE POLICY "Grammar item examples are publicly readable"
  ON public.grammar_item_examples
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Grammar item contrasts are publicly readable" ON public.grammar_item_contrasts;
CREATE POLICY "Grammar item contrasts are publicly readable"
  ON public.grammar_item_contrasts
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Grammar item templates are publicly readable" ON public.grammar_item_templates;
CREATE POLICY "Grammar item templates are publicly readable"
  ON public.grammar_item_templates
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Library grammar items are readable" ON public.library_grammar_items;
CREATE POLICY "Library grammar items are readable"
  ON public.library_grammar_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.libraries
      WHERE libraries.id = library_grammar_items.library_id
        AND (libraries.is_public = true OR libraries.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage library grammar items for their own libraries" ON public.library_grammar_items;
CREATE POLICY "Users can manage library grammar items for their own libraries"
  ON public.library_grammar_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.libraries
      WHERE libraries.id = library_grammar_items.library_id
        AND libraries.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.libraries
      WHERE libraries.id = library_grammar_items.library_id
        AND libraries.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage their own user_grammar_items" ON public.user_grammar_items;
CREATE POLICY "Users can manage their own user_grammar_items"
  ON public.user_grammar_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own library grammar items" ON public.user_library_grammar_items;
CREATE POLICY "Users can manage their own library grammar items"
  ON public.user_library_grammar_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own grammar attempts" ON public.grammar_attempts;
CREATE POLICY "Users can manage their own grammar attempts"
  ON public.grammar_attempts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
