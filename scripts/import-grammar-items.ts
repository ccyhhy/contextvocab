import { readFileSync } from 'fs'
import path from 'path'
import {
  createGrammarLibraryClient,
  normalizeGeneratedDataset,
  parseImportGrammarCliArgs,
  type GrammarGeneratedItem,
  type GrammarLibraryGeneratedDataset,
} from './grammar-library-utils'

async function main() {
  const options = parseImportGrammarCliArgs(process.argv.slice(2))
  const inputPath = path.resolve(options.input)
  const supabase = createGrammarLibraryClient()
  const dataset = normalizeGeneratedDataset(
    JSON.parse(readFileSync(inputPath, 'utf-8')) as GrammarLibraryGeneratedDataset
  )

  await assertGrammarSchemaReady(supabase)

  if (dataset.items.length === 0) {
    throw new Error('Generated dataset has no items to import.')
  }

  const summary = {
    grammarItems: dataset.items.length,
    examples: dataset.items.reduce((sum, item) => sum + item.examples.length, 0),
    templates: dataset.items.reduce((sum, item) => sum + item.templates.length, 0),
    contrasts: dataset.items.reduce((sum, item) => sum + item.contrasts.length, 0),
  }

  const libraryPayload = {
    slug: dataset.library.slug,
    name: dataset.library.name,
    description: dataset.library.description ?? null,
    source_type: dataset.library.sourceType === 'custom' ? 'custom' : 'official',
    content_type: 'grammar',
    language: dataset.library.language ?? 'en',
    is_public: dataset.library.isPublic !== false,
  }

  if (options.dryRun) {
    console.log('Grammar import dry run complete')
    console.log(`  input: ${inputPath}`)
    console.log(`  library: ${libraryPayload.slug}`)
    console.log(`  grammar items: ${summary.grammarItems}`)
    console.log(`  examples: ${summary.examples}`)
    console.log(`  templates: ${summary.templates}`)
    console.log(`  contrasts: ${summary.contrasts}`)
    return
  }

  const { data: library, error: libraryError } = await supabase
    .from('libraries')
    .upsert(libraryPayload, { onConflict: 'slug' })
    .select('id, slug')
    .single()

  if (libraryError || !library) {
    throw libraryError ?? new Error('Failed to upsert grammar library.')
  }

  const grammarRows = dataset.items.map((item) => ({
    slug: item.slug,
    title: item.title,
    short_label: item.shortLabel ?? null,
    pattern: item.pattern,
    family: item.family,
    subtype: item.subtype ?? null,
    anchor: item.anchor ?? null,
    core_explanation: item.coreExplanation,
    usage_note: item.usageNote ?? null,
    usage_register: item.usageRegister ?? null,
    scene_tags: item.sceneTags,
    slot_schema: item.slotSchema,
    common_errors: item.commonErrors,
    difficulty: item.difficulty,
  }))

  const { error: itemError } = await supabase
    .from('grammar_items')
    .upsert(grammarRows, { onConflict: 'slug' })

  if (itemError) {
    throw itemError
  }

  const { data: storedItems, error: storedItemsError } = await supabase
    .from('grammar_items')
    .select('id, slug')
    .in('slug', dataset.items.map((item) => item.slug))

  if (storedItemsError) {
    throw storedItemsError
  }

  const itemIdBySlug = new Map(
    ((storedItems ?? []) as Array<{ id: string; slug: string }>).map((row) => [row.slug, row.id])
  )

  for (const item of dataset.items) {
    const grammarItemId = itemIdBySlug.get(item.slug)
    if (!grammarItemId) {
      throw new Error(`Failed to resolve grammar item id for ${item.slug}`)
    }

    await replaceExamples(supabase, grammarItemId, item)
    await replaceTemplates(supabase, grammarItemId, item)
    await replaceContrasts(supabase, grammarItemId, item, itemIdBySlug)
  }

  const { error: deleteLinksError } = await supabase
    .from('library_grammar_items')
    .delete()
    .eq('library_id', library.id)

  if (deleteLinksError) {
    throw deleteLinksError
  }

  const linkRows = dataset.items
    .map((item, index) => {
      const grammarItemId = itemIdBySlug.get(item.slug)
      if (!grammarItemId) {
        return null
      }

      return {
        library_id: library.id,
        grammar_item_id: grammarItemId,
        position: index + 1,
      }
    })
    .filter(
      (item): item is { library_id: string; grammar_item_id: string; position: number } =>
        item !== null
    )

  if (linkRows.length > 0) {
    const { error: linkError } = await supabase.from('library_grammar_items').insert(linkRows)
    if (linkError) {
      throw linkError
    }
  }

  console.log('Grammar import complete')
  console.log(`  input: ${inputPath}`)
  console.log(`  library: ${library.slug}`)
  console.log(`  grammar items: ${summary.grammarItems}`)
  console.log(`  examples: ${summary.examples}`)
  console.log(`  templates: ${summary.templates}`)
  console.log(`  contrasts: ${summary.contrasts}`)
}

async function assertGrammarSchemaReady(
  supabase: ReturnType<typeof createGrammarLibraryClient>
) {
  const checks = [
    {
      name: 'libraries.content_type',
      run: () => supabase.from('libraries').select('content_type').limit(1),
    },
    {
      name: 'grammar_items',
      run: () => supabase.from('grammar_items').select('id').limit(1),
    },
  ] as const

  for (const check of checks) {
    const { error } = await check.run()
    if (!error) {
      continue
    }

    if (
      error.code === 'PGRST204' ||
      error.code === '42P01' ||
      /schema cache|grammar_items|content_type/i.test(error.message)
    ) {
      throw new Error(
        `Grammar schema is not applied in Supabase yet. Run supabase/migrations/20260322_add_grammar_library_support.sql first. Missing: ${check.name}`
      )
    }

    throw error
  }
}

async function replaceExamples(
  supabase: ReturnType<typeof createGrammarLibraryClient>,
  grammarItemId: string,
  item: GrammarGeneratedItem
) {
  const { error: deleteError } = await supabase
    .from('grammar_item_examples')
    .delete()
    .eq('grammar_item_id', grammarItemId)

  if (deleteError) {
    throw deleteError
  }

  const rows = item.examples.map((example) => ({
    grammar_item_id: grammarItemId,
    sentence: example.sentence,
    translation: example.translation ?? null,
    note: example.note ?? null,
    scene: example.scene ?? null,
    source_name: 'ai_grammar_seed',
    source_url: null,
    license: null,
    quality_score: example.isPrimary ? 1 : null,
    is_primary: example.isPrimary,
  }))

  if (rows.length === 0) {
    return
  }

  const { error: insertError } = await supabase.from('grammar_item_examples').insert(rows)
  if (insertError) {
    throw insertError
  }
}

async function replaceTemplates(
  supabase: ReturnType<typeof createGrammarLibraryClient>,
  grammarItemId: string,
  item: GrammarGeneratedItem
) {
  const { error: deleteError } = await supabase
    .from('grammar_item_templates')
    .delete()
    .eq('grammar_item_id', grammarItemId)

  if (deleteError) {
    throw deleteError
  }

  const rows = item.templates.map((template, index) => ({
    grammar_item_id: grammarItemId,
    label: template.label,
    template: template.template,
    slot_hints: template.slotHints,
    example_sentence: template.exampleSentence ?? null,
    example_translation: template.exampleTranslation ?? null,
    position: template.position || index + 1,
  }))

  if (rows.length === 0) {
    return
  }

  const { error: insertError } = await supabase.from('grammar_item_templates').insert(rows)
  if (insertError) {
    throw insertError
  }
}

async function replaceContrasts(
  supabase: ReturnType<typeof createGrammarLibraryClient>,
  grammarItemId: string,
  item: GrammarGeneratedItem,
  itemIdBySlug: Map<string, string>
) {
  const { error: deleteError } = await supabase
    .from('grammar_item_contrasts')
    .delete()
    .eq('grammar_item_id', grammarItemId)

  if (deleteError) {
    throw deleteError
  }

  const rows = item.contrasts
    .map((contrast, index) => {
      const contrastItemId = itemIdBySlug.get(contrast.slug)
      if (!contrastItemId || contrastItemId === grammarItemId) {
        return null
      }

      return {
        grammar_item_id: grammarItemId,
        contrast_item_id: contrastItemId,
        note: contrast.note,
        position: index + 1,
      }
    })
    .filter(
      (
        row
      ): row is {
        grammar_item_id: string
        contrast_item_id: string
        note: string
        position: number
      } => row !== null
    )

  if (rows.length === 0) {
    return
  }

  const { error: insertError } = await supabase.from('grammar_item_contrasts').insert(rows)
  if (insertError) {
    throw insertError
  }
}

main().catch((error) => {
  console.error('Grammar import failed:', error)
  process.exit(1)
})
