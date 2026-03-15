CREATE INDEX IF NOT EXISTS idx_user_words_due_queue
  ON public.user_words (user_id, next_review_date, last_reviewed_at, created_at);

CREATE INDEX IF NOT EXISTS idx_user_words_favorite_due_queue
  ON public.user_words (user_id, next_review_date, last_reviewed_at)
  WHERE is_favorite = true;

CREATE INDEX IF NOT EXISTS idx_user_words_weak_candidates
  ON public.user_words (user_id, next_review_date, last_score, consecutive_failures, last_reviewed_at)
  WHERE last_score < 75 OR consecutive_failures >= 2;

CREATE INDEX IF NOT EXISTS idx_user_words_recent_failures_candidates
  ON public.user_words (user_id, last_reviewed_at DESC, next_review_date, last_score, consecutive_failures)
  WHERE last_score < 60 OR consecutive_failures >= 1;
