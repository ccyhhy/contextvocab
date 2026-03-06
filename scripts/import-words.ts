/**
 * Sprint 2 — CET-4 词库批量导入脚本
 *
 * 用法:
 *   npx tsx scripts/import-words.ts
 *
 * 前提:
 *   - .env.local 里已填写 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   - data/ 目录下已有 CET4_A.json … CET4_Z.json
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── 环境变量 ────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
// 注意: 导入脚本需要 service_role key，不是 anon key
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ 请在 .env.local 中设置 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── 源数据类型（来自 cuttlin/Vocabulary-of-CET-4）──────────────
interface RawWord {
  word: string
  mean: string          // 中文释义，如 "vt.丢弃;放弃，抛弃"
  phonetic_symbol: string
  initial: string
}

// ── 目标类型（对应 public.words 表）─────────────────────────────
interface WordInsert {
  word: string
  phonetic: string
  definition: string
  tags: string
  example: string | null
}

function transformWord(raw: RawWord): WordInsert {
  return {
    // 去掉 BOM 和前后空格
    word: raw.word.replace(/^\uFEFF/, '').trim(),
    phonetic: raw.phonetic_symbol?.trim() ?? '',
    definition: raw.mean?.trim() ?? '',
    tags: 'CET-4',
    example: null,
  }
}

async function importAll() {
  const dataDir = path.join(process.cwd(), 'data')
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('CET4_') && f.endsWith('.json'))

  if (files.length === 0) {
    console.error('❌ data/ 目录下没有找到 CET4_*.json 文件')
    process.exit(1)
  }

  let totalInserted = 0
  const totalSkipped = 0

  const CHUNK_SIZE = 100

  for (const file of files.sort()) {
    const raw: RawWord[] = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'))
    const valid = raw.map(transformWord).filter(r => r.word.length > 0)

    let fileInserted = 0
    let fileError = false

    // 分批插入，每批 100 条，避免超大 payload
    for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
      const chunk = valid.slice(i, i + CHUNK_SIZE)
      const { error } = await supabase.from('words').insert(chunk)
      if (error) {
        console.error(`❌ ${file} 第 ${i / CHUNK_SIZE + 1} 批失败:`, error.message)
        fileError = true
        break
      }
      fileInserted += chunk.length
    }

    if (!fileError) {
      totalInserted += fileInserted
      console.log(`✅ ${file}: ${fileInserted} 条已导入`)
    }
  }

  console.log(`\n🎉 导入完成！`)
  console.log(`   新增: ${totalInserted} 条`)
  console.log(`   跳过(重复): ${totalSkipped} 条`)
}

importAll().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
