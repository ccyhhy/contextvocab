import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeStudyContentType } from "@/lib/study-content"
import type { StudyEnrichmentProgress, StudyLibrary } from "../actions"

const SUPABASE_PAGE_SIZE = 1000
const STUDY_LIBRARY_MEMBERSHIP_CACHE_TTL_MS = 60 * 60 * 1000
const STUDY_ENRICHMENT_PROGRESS_CACHE_TTL_MS = 60 * 60 * 1000

interface TimedCacheEntry<T> {
  value: T
  expiresAt: number
}

interface LegacyLibraryOption {
  slug: string
  name: string
  tag: string
}

interface LibrarySummaryRow {
  id: string
  slug: string
  name: string
  description?: string | null
  source_type?: string | null
  content_type?: string | null
}

interface UserLibraryPlanRow {
  status?: StudyLibrary["planStatus"] | null
  daily_new_limit?: number | null
}

interface WordProfileProgressRow {
  word_id?: string | null
  generation_method?: string | null
}

interface WordIdRow {
  id?: string | null
}

interface WordIdOnlyRow {
  word_id?: string | null
}

interface GrammarIdOnlyRow {
  grammar_item_id?: string | null
}

interface StudySidebarServiceDeps {
  getStartedWordIds: (
    supabase: SupabaseClient,
    userId: string,
    candidateWordIds?: string[]
  ) => Promise<Set<string>>
  getDueWordIds: (supabase: SupabaseClient, userId: string, today: string) => Promise<Set<string>>
  getLibraryWordIds: (supabase: SupabaseClient, libraryId: string) => Promise<string[]>
  isMissingLibrariesTableError: (error: { message?: string; details?: string } | null) => boolean
  isMissingWordProfileTableError: (error: { message?: string; details?: string } | null) => boolean
  logStudyPerformance: (
    label: string,
    startedAt: number,
    metadata?: Record<string, string | number | boolean | null | undefined>
  ) => void
}

const OFFICIAL_LIBRARY_TAG_MAP: Record<string, string> = {
  "cet-4": "CET-4",
  "cet-6": "CET-6",
}

const officialTagWordIdsCache = new Map<string, TimedCacheEntry<string[]>>()
const libraryGrammarItemIdsCache = new Map<string, TimedCacheEntry<string[]>>()
let studyEnrichmentProgressCache: TimedCacheEntry<StudyEnrichmentProgress[]> | null = null
let studyEnrichmentProgressCacheKey = ""

function getActiveTimedCacheValue<T>(entry?: TimedCacheEntry<T> | null) {
  if (!entry) {
    return null
  }

  if (entry.expiresAt <= Date.now()) {
    return null
  }

  return entry.value
}

function setTimedCacheValue<T>(
  cache: Map<string, TimedCacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number
) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })

  return value
}

function countMatchingWordIds(wordIds: string[], lookup: Set<string>) {
  let count = 0

  for (const wordId of wordIds) {
    if (lookup.has(wordId)) {
      count += 1
    }
  }

  return count
}

function isBaseGenerationMethod(method?: string | null) {
  return typeof method === "string" && method.includes("base")
}

function createStudyLibraryPlaceholder(
  library: Pick<
    LibrarySummaryRow,
    "id" | "slug" | "name" | "description" | "source_type" | "content_type"
  >
): StudyLibrary {
  return {
    id: library.id,
    slug: library.slug,
    name: library.name,
    description: library.description ?? null,
    sourceType: library.source_type === "custom" ? "custom" : "official",
    contentType: normalizeStudyContentType(library.content_type),
    wordCount: 0,
    activeCount: 0,
    dueCount: 0,
    remainingCount: 0,
    planStatus: "not_started",
    dailyNewLimit: null,
  }
}

function getLegacyStudyLibraryOptions(legacyLibraryOptions: readonly LegacyLibraryOption[]): StudyLibrary[] {
  return legacyLibraryOptions
    .filter((option) => option.slug !== "all")
    .map((option) =>
      createStudyLibraryPlaceholder({
        id: option.slug,
        slug: option.slug,
        name: option.name,
        description: null,
        source_type: "official",
        content_type: "word",
      })
    )
}

async function getWordIdsByOfficialTag(supabase: SupabaseClient, tag: string) {
  const cached = getActiveTimedCacheValue(officialTagWordIdsCache.get(tag))
  if (cached) {
    return cached
  }

  const ids: string[] = []
  let from = 0

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from("words")
      .select("id")
      .ilike("tags", `%${tag}%`)
      .order("word", { ascending: true })
      .range(from, to)

    if (error) {
      console.error("Failed to load official library word ids for progress:", error)
      return [] as string[]
    }

    const rows = (data ?? []) as WordIdRow[]
    ids.push(...rows.map((row) => row.id).filter((id): id is string => typeof id === "string"))

    if (rows.length < SUPABASE_PAGE_SIZE) {
      break
    }

    from += SUPABASE_PAGE_SIZE
  }

  return setTimedCacheValue(
    officialTagWordIdsCache,
    tag,
    ids,
    STUDY_LIBRARY_MEMBERSHIP_CACHE_TTL_MS
  )
}

async function getLibraryGrammarItemIds(supabase: SupabaseClient, libraryId: string) {
  const cached = getActiveTimedCacheValue(libraryGrammarItemIdsCache.get(libraryId))
  if (cached) {
    return cached
  }

  const ids: string[] = []
  let from = 0

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from("library_grammar_items")
      .select("grammar_item_id")
      .eq("library_id", libraryId)
      .order("position", { ascending: true, nullsFirst: false })
      .range(from, to)

    if (error) {
      console.error("Failed to load library grammar item ids:", error)
      return [] as string[]
    }

    const rows = (data ?? []) as GrammarIdOnlyRow[]
    ids.push(
      ...rows
        .map((row) => row.grammar_item_id)
        .filter((id): id is string => typeof id === "string")
    )

    if (rows.length < SUPABASE_PAGE_SIZE) {
      break
    }

    from += SUPABASE_PAGE_SIZE
  }

  return setTimedCacheValue(
    libraryGrammarItemIdsCache,
    libraryId,
    ids,
    STUDY_LIBRARY_MEMBERSHIP_CACHE_TTL_MS
  )
}

async function getStartedGrammarIds(supabase: SupabaseClient, userId: string) {
  const startedIds = new Set<string>()
  const tables = ["user_grammar_items", "grammar_attempts", "user_library_grammar_items"] as const

  for (const table of tables) {
    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
      const to = from + SUPABASE_PAGE_SIZE - 1
      const { data, error } = await supabase
        .from(table)
        .select("grammar_item_id")
        .eq("user_id", userId)
        .range(from, to)

      if (error) {
        console.error(`Failed to load started grammar ids from ${table}:`, error)
        break
      }

      const rows = (data ?? []) as GrammarIdOnlyRow[]
      for (const row of rows) {
        if (typeof row.grammar_item_id === "string") {
          startedIds.add(row.grammar_item_id)
        }
      }

      if (rows.length < SUPABASE_PAGE_SIZE) {
        break
      }
    }
  }

  return startedIds
}

async function getDueGrammarIds(supabase: SupabaseClient, userId: string, today: string) {
  const dueIds = new Set<string>()

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from("user_grammar_items")
      .select("grammar_item_id")
      .eq("user_id", userId)
      .lte("next_review_date", today)
      .range(from, to)

    if (error) {
      console.error("Failed to load due grammar ids:", error)
      break
    }

    const rows = (data ?? []) as GrammarIdOnlyRow[]
    for (const row of rows) {
      if (typeof row.grammar_item_id === "string") {
        dueIds.add(row.grammar_item_id)
      }
    }

    if (rows.length < SUPABASE_PAGE_SIZE) {
      break
    }
  }

  return dueIds
}

async function getAllWordProfileProgressRows(
  supabase: SupabaseClient,
  isMissingWordProfileTableError: StudySidebarServiceDeps["isMissingWordProfileTableError"]
) {
  const rows: WordProfileProgressRow[] = []
  let from = 0

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from("word_profiles")
      .select("word_id, generation_method")
      .order("word_id", { ascending: true })
      .range(from, to)

    if (error) {
      if (!isMissingWordProfileTableError(error)) {
        console.error("Failed to load word profile progress:", error)
      }
      return [] as WordProfileProgressRow[]
    }

    const pageRows = (data ?? []) as WordProfileProgressRow[]
    rows.push(...pageRows)

    if (pageRows.length < SUPABASE_PAGE_SIZE) {
      break
    }

    from += SUPABASE_PAGE_SIZE
  }

  return rows
}

async function getAllExampleWordIds(
  supabase: SupabaseClient,
  isMissingWordProfileTableError: StudySidebarServiceDeps["isMissingWordProfileTableError"]
) {
  const ids = new Set<string>()
  let from = 0

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from("word_profile_examples")
      .select("word_id")
      .order("word_id", { ascending: true })
      .range(from, to)

    if (error) {
      if (!isMissingWordProfileTableError(error)) {
        console.error("Failed to load word example progress:", error)
      }
      return ids
    }

    const pageRows = (data ?? []) as WordIdOnlyRow[]
    for (const row of pageRows) {
      if (typeof row.word_id === "string") {
        ids.add(row.word_id)
      }
    }

    if (pageRows.length < SUPABASE_PAGE_SIZE) {
      break
    }

    from += SUPABASE_PAGE_SIZE
  }

  return ids
}

async function buildLibrarySummary(
  supabase: SupabaseClient,
  userId: string,
  library: LibrarySummaryRow,
  startedWordIds: Set<string>,
  dueWordIds: Set<string>,
  startedGrammarIds: Set<string>,
  dueGrammarIds: Set<string>,
  deps: Pick<StudySidebarServiceDeps, "getLibraryWordIds" | "logStudyPerformance">
): Promise<StudyLibrary> {
  const startedAt = Date.now()
  const planPromise = supabase
    .from("user_library_plans")
    .select("status, daily_new_limit")
    .eq("user_id", userId)
    .eq("library_id", library.id)
    .maybeSingle()
  const contentType = normalizeStudyContentType(library.content_type)

  if (contentType === "grammar") {
    const [libraryGrammarItemIds, { data: plan }] = await Promise.all([
      getLibraryGrammarItemIds(supabase, library.id),
      planPromise,
    ])
    const itemCount = libraryGrammarItemIds.length
    const planRow = (plan as UserLibraryPlanRow | null) ?? null
    const activeCount = countMatchingWordIds(libraryGrammarItemIds, startedGrammarIds)
    const dueCount = countMatchingWordIds(libraryGrammarItemIds, dueGrammarIds)

    return {
      id: library.id,
      slug: library.slug,
      name: library.name,
      description: library.description ?? null,
      sourceType: library.source_type === "custom" ? "custom" : "official",
      contentType,
      wordCount: itemCount,
      activeCount,
      dueCount,
      remainingCount: Math.max(itemCount - activeCount, 0),
      planStatus: planRow?.status ?? "not_started",
      dailyNewLimit: planRow?.daily_new_limit ?? null,
    }
  }

  if (contentType !== "word") {
    const { data: plan } = await planPromise
    const planRow = (plan as UserLibraryPlanRow | null) ?? null

    return {
      id: library.id,
      slug: library.slug,
      name: library.name,
      description: library.description ?? null,
      sourceType: library.source_type === "custom" ? "custom" : "official",
      contentType,
      wordCount: 0,
      activeCount: 0,
      dueCount: 0,
      remainingCount: 0,
      planStatus: planRow?.status ?? "not_started",
      dailyNewLimit: planRow?.daily_new_limit ?? null,
    }
  }

  const [libraryWordIds, { data: plan }] = await Promise.all([
    deps.getLibraryWordIds(supabase, library.id),
    planPromise,
  ])
  const wordCount = libraryWordIds.length

  if (libraryWordIds.length === 0) {
    const planRow = (plan as UserLibraryPlanRow | null) ?? null
    const summary: StudyLibrary = {
      id: library.id,
      slug: library.slug,
      name: library.name,
      description: library.description ?? null,
      sourceType: library.source_type === "custom" ? "custom" : "official",
      contentType,
      wordCount: 0,
      activeCount: 0,
      dueCount: 0,
      remainingCount: 0,
      planStatus: planRow?.status ?? "not_started",
      dailyNewLimit: planRow?.daily_new_limit ?? null,
    }

    deps.logStudyPerformance("buildLibrarySummary", startedAt, {
      library: library.slug,
      wordCount: 0,
      activeCount: 0,
      dueCount: 0,
    })

    return summary
  }

  const planRow = (plan as UserLibraryPlanRow | null) ?? null
  const activeCount = countMatchingWordIds(libraryWordIds, startedWordIds)
  const dueCount = countMatchingWordIds(libraryWordIds, dueWordIds)

  const summary: StudyLibrary = {
    id: library.id,
    slug: library.slug,
    name: library.name,
    description: library.description ?? null,
    sourceType: library.source_type === "custom" ? "custom" : "official",
    contentType,
    wordCount,
    activeCount,
    dueCount,
    remainingCount: Math.max(wordCount - activeCount, 0),
    planStatus: planRow?.status ?? "not_started",
    dailyNewLimit: planRow?.daily_new_limit ?? null,
  }

  deps.logStudyPerformance("buildLibrarySummary", startedAt, {
    library: library.slug,
    wordCount,
    activeCount,
    dueCount,
  })

  return summary
}

export async function loadStudyLibraries({
  supabase,
  userId,
  today,
  legacyLibraryOptions,
  deps,
}: {
  supabase: SupabaseClient
  userId: string
  today: string
  legacyLibraryOptions: readonly LegacyLibraryOption[]
  deps: StudySidebarServiceDeps
}): Promise<StudyLibrary[]> {
  const startedAt = Date.now()
  const [{ data, error }, startedWordIds, dueWordIds, startedGrammarIds, dueGrammarIds] =
    await Promise.all([
    supabase
      .from("libraries")
      .select("id, slug, name, description, source_type, content_type")
      .order("name", { ascending: true }),
    deps.getStartedWordIds(supabase, userId),
    deps.getDueWordIds(supabase, userId, today),
    getStartedGrammarIds(supabase, userId),
    getDueGrammarIds(supabase, userId, today),
  ])

  if (error || !data) {
    if (error && !deps.isMissingLibrariesTableError(error)) {
      console.error("Failed to load study libraries:", error)
    }

    deps.logStudyPerformance("getStudyLibraries", startedAt, {
      libraryCount: 0,
      fallback: true,
    })

    return getLegacyStudyLibraryOptions(legacyLibraryOptions)
  }

  const libraries = (data as LibrarySummaryRow[]).filter(
    (row) => typeof row.id === "string" && typeof row.slug === "string" && typeof row.name === "string"
  )

  const summaries = await Promise.all(
    libraries.map((library) =>
      buildLibrarySummary(
        supabase,
        userId,
        library,
        startedWordIds,
        dueWordIds,
        startedGrammarIds,
        dueGrammarIds,
        deps
      )
    )
  )

  deps.logStudyPerformance("getStudyLibraries", startedAt, {
    libraryCount: summaries.length,
    startedWordIds: startedWordIds.size,
    dueWordIds: dueWordIds.size,
    startedGrammarIds: startedGrammarIds.size,
    dueGrammarIds: dueGrammarIds.size,
  })

  return summaries
}

export async function loadStudyLibraryOptions({
  supabase,
  legacyLibraryOptions,
  deps,
}: {
  supabase: SupabaseClient
  legacyLibraryOptions: readonly LegacyLibraryOption[]
  deps: Pick<StudySidebarServiceDeps, "isMissingLibrariesTableError">
}): Promise<StudyLibrary[]> {
  const { data, error } = await supabase
    .from("libraries")
    .select("id, slug, name, description, source_type, content_type")
    .order("name", { ascending: true })

  if (error || !data) {
    if (error && !deps.isMissingLibrariesTableError(error)) {
      console.error("Failed to load study library options:", error)
    }

    return getLegacyStudyLibraryOptions(legacyLibraryOptions)
  }

  const libraries = (data as LibrarySummaryRow[]).filter(
    (row) => typeof row.id === "string" && typeof row.slug === "string" && typeof row.name === "string"
  )

  if (libraries.length === 0) {
    return getLegacyStudyLibraryOptions(legacyLibraryOptions)
  }

  return libraries.map((library) => createStudyLibraryPlaceholder(library))
}

export async function loadStudyEnrichmentProgress({
  supabase,
  libraries = [],
  deps,
}: {
  supabase: SupabaseClient
  libraries?: StudyLibrary[]
  deps: Pick<
    StudySidebarServiceDeps,
    "getLibraryWordIds" | "isMissingWordProfileTableError" | "logStudyPerformance"
  >
}): Promise<StudyEnrichmentProgress[]> {
  const startedAt = Date.now()
  const cacheKey = JSON.stringify(
    libraries.map((library) => ({
      id: library.id,
      slug: library.slug,
      name: library.name,
      wordCount: library.wordCount,
    }))
  )
  const cachedProgress = getActiveTimedCacheValue(studyEnrichmentProgressCache)
  if (cachedProgress && studyEnrichmentProgressCacheKey === cacheKey) {
    deps.logStudyPerformance("getStudyEnrichmentProgress", startedAt, {
      libraryCount: libraries.length,
      cacheHit: true,
    })
    return cachedProgress
  }

  const [{ count: totalWordsCount }, profileRows, exampleWordIds] = await Promise.all([
    supabase.from("words").select("id", { count: "exact", head: true }),
    getAllWordProfileProgressRows(supabase, deps.isMissingWordProfileTableError),
    getAllExampleWordIds(supabase, deps.isMissingWordProfileTableError),
  ])

  const coveredWordIds = new Set<string>()
  const refinedWordIds = new Set<string>()

  for (const row of profileRows) {
    if (typeof row.word_id !== "string") {
      continue
    }

    coveredWordIds.add(row.word_id)
    if (!isBaseGenerationMethod(row.generation_method)) {
      refinedWordIds.add(row.word_id)
    }
  }

  const progressItems: StudyEnrichmentProgress[] = [
    {
      slug: "all",
      name: "全部词库",
      totalWords: totalWordsCount ?? 0,
      coveredWords: coveredWordIds.size,
      refinedWords: refinedWordIds.size,
      exampleWords: exampleWordIds.size,
    },
  ]

  for (const library of libraries) {
    if (library.contentType !== "word") {
      progressItems.push({
        slug: library.slug,
        name: library.name,
        totalWords: 0,
        coveredWords: 0,
        refinedWords: 0,
        exampleWords: 0,
      })
      continue
    }

    const officialTag = OFFICIAL_LIBRARY_TAG_MAP[library.slug]
    const libraryWordIds = officialTag
      ? await getWordIdsByOfficialTag(supabase, officialTag)
      : await deps.getLibraryWordIds(supabase, library.id)

    const libraryWordIdSet = new Set(libraryWordIds)
    let coveredWords = 0
    let refinedWords = 0
    let exampleWords = 0

    for (const wordId of libraryWordIdSet) {
      if (coveredWordIds.has(wordId)) {
        coveredWords += 1
      }
      if (refinedWordIds.has(wordId)) {
        refinedWords += 1
      }
      if (exampleWordIds.has(wordId)) {
        exampleWords += 1
      }
    }

    progressItems.push({
      slug: library.slug,
      name: library.name,
      totalWords: library.wordCount || libraryWordIdSet.size,
      coveredWords,
      refinedWords,
      exampleWords,
    })
  }

  studyEnrichmentProgressCache = {
    value: progressItems,
    expiresAt: Date.now() + STUDY_ENRICHMENT_PROGRESS_CACHE_TTL_MS,
  }
  studyEnrichmentProgressCacheKey = cacheKey

  deps.logStudyPerformance("getStudyEnrichmentProgress", startedAt, {
    libraryCount: libraries.length,
    cacheHit: false,
    progressItems: progressItems.length,
  })

  return progressItems
}

export async function loadStudySidebarData({
  supabase,
  userId,
  today,
  legacyLibraryOptions,
  deps,
}: {
  supabase: SupabaseClient
  userId: string
  today: string
  legacyLibraryOptions: readonly LegacyLibraryOption[]
  deps: StudySidebarServiceDeps
}): Promise<{
  libraries: StudyLibrary[]
  enrichmentProgress: StudyEnrichmentProgress[]
}> {
  const startedAt = Date.now()
  const libraries = await loadStudyLibraries({
    supabase,
    userId,
    today,
    legacyLibraryOptions,
    deps,
  })
  const enrichmentProgress = await loadStudyEnrichmentProgress({
    supabase,
    libraries,
    deps,
  })

  deps.logStudyPerformance("getStudySidebarData", startedAt, {
    libraryCount: libraries.length,
    progressItems: enrichmentProgress.length,
  })

  return {
    libraries,
    enrichmentProgress,
  }
}
