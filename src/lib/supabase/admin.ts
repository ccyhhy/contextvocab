import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

export const GUEST_ID = '00000000-0000-4000-8000-000000000000'

type AdminClient = SupabaseClient

declare global {
  var __contextVocabAdminClient__: AdminClient | undefined
}

export function getAdminClient(): AdminClient {
  if (!globalThis.__contextVocabAdminClient__) {
    globalThis.__contextVocabAdminClient__ = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }

  return globalThis.__contextVocabAdminClient__
}
