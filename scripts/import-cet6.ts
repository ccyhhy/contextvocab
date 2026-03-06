/**
 * Sprint 2 — CET-6 词库导入脚本
 *
 * 用法:
 *   npm run import:cet6
 *
 * 数据来源: mahavivo/english-wordlists — CET6_edited.txt
 * 格式: word [phonetic] pos. Chinese definition（每行一个单词）
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ 请在 .env.local 中设置 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface WordInsert {
  word: string
  phonetic: string
  definition: string
  tags: string
  example: null
}

/**
 * 解析 CET6_edited.txt 的每一行
 * 格式示例: abandon [əˈbændən] v. 1. 抛弃，放弃 2. 离弃...
 */
function parseLine(line: string): WordInsert | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // 提取音标（方括号内容）
  const phoneticMatch = trimmed.match(/\[([^\]]+)\]/)
  const phonetic = phoneticMatch ? `[${phoneticMatch[1]}]` : ''

  // 提取单词（第一个空白字符之前）
  const word = trimmed.split(/[\s\[]/)[0].trim()
  if (!word || !/^[a-zA-Z]/.test(word)) return null

  // 提取释义（音标之后的所有内容）
  let definition = ''
  if (phoneticMatch) {
    const afterPhonetic = trimmed.slice(trimmed.indexOf(']') + 1).trim()
    definition = afterPhonetic
  } else {
    // 无音标：取第一个空格之后的内容
    definition = trimmed.slice(word.length).trim()
  }

  if (!definition) return null

  return { word, phonetic, definition, tags: 'CET-6', example: null }
}

async function importCET6() {
  const filePath = path.join(process.cwd(), 'data', 'CET6.txt')
  if (!fs.existsSync(filePath)) {
    console.error('❌ 找不到 data/CET6.txt，请先下载该文件')
    process.exit(1)
  }

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
  const words: WordInsert[] = []

  for (const line of lines) {
    const parsed = parseLine(line)
    if (parsed) words.push(parsed)
  }

  console.log(`📖 解析完成，共 ${words.length} 个单词`)

  const CHUNK_SIZE = 100
  let totalInserted = 0
  let totalSkipped = 0

  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    const chunk = words.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from('words').insert(chunk)

    if (error) {
      // 处理重复单词（与 CET-4 有重叠）
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        // 逐条插入，跳过重复的
        for (const w of chunk) {
          const { error: singleError } = await supabase.from('words').insert(w)
          if (!singleError) {
            totalInserted++
          } else {
            totalSkipped++
          }
        }
      } else {
        console.error(`❌ 第 ${Math.floor(i / CHUNK_SIZE) + 1} 批失败:`, error.message)
      }
    } else {
      totalInserted += chunk.length
      process.stdout.write(`\r进度: ${Math.min(i + CHUNK_SIZE, words.length)}/${words.length}`)
    }
  }

  console.log(`\n\n🎉 CET-6 导入完成！`)
  console.log(`   新增: ${totalInserted} 条`)
  console.log(`   跳过(重复): ${totalSkipped} 条`)
}

importCET6().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
