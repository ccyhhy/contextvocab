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
    AND (
      p_tag IS NULL
      OR p_tag = 'All'
      OR (',' || REPLACE(COALESCE(w.tags, ''), ' ', '') || ',') LIKE
         ('%,' || REPLACE(p_tag, ' ', '') || ',%')
    )
    AND (cardinality(p_skipped_ids) = 0 OR NOT (w.id = ANY(p_skipped_ids)))
  ORDER BY random()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pick_unstudied_library_word(
  p_user_id UUID,
  p_library_id UUID,
  p_skipped_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS SETOF public.words
LANGUAGE sql
STABLE
AS $$
  SELECT w.*
  FROM public.library_words lw
  JOIN public.words w
    ON w.id = lw.word_id
  WHERE lw.library_id = p_library_id
    AND (cardinality(p_skipped_ids) = 0 OR NOT (w.id = ANY(p_skipped_ids)))
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_words uw
      WHERE uw.user_id = p_user_id
        AND uw.word_id = w.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.sentences s
      WHERE s.user_id = p_user_id
        AND s.word_id = w.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_library_words ulw
      WHERE ulw.user_id = p_user_id
        AND ulw.word_id = w.id
    )
  ORDER BY random()
  LIMIT 1;
$$;
