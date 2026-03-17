const EXPLICIT_CONTENT_PATTERN =
  /\b(?:fuck(?:ed|ing)?|fucking|sex(?:ual)?|sexual|intercourse|porn(?:ography)?|nude|naked|orgasm|rape|raped|raping|penis|vagina|dick|cock|pussy|cum|cumming|blowjob|handjob)\b/i

const PERSON_REFERENCE_PATTERN =
  /\b(?:girl|boy|woman|man|lady|guy|wife|husband|girlfriend|boyfriend|partner|her|him)\b/i

const INTIMACY_CONTEXT_PATTERN =
  /\b(?:last night|tonight|in bed|sleep with|slept with|hook(?:ed|ing)? up|made love)\b/i

function countWords(text: string) {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
    .filter(Boolean).length
}

export function isLearnerFriendlyExampleSentence(sentence: string) {
  const trimmed = sentence.trim()
  if (!trimmed) {
    return false
  }

  if (trimmed.length < 8 || trimmed.length > 140) {
    return false
  }

  if (/[\r\n]/.test(trimmed)) {
    return false
  }

  if (!/[A-Za-z]/.test(trimmed)) {
    return false
  }

  const wordCount = countWords(trimmed)
  if (wordCount < 3 || wordCount > 24) {
    return false
  }

  if (/https?:\/\/|www\./i.test(trimmed)) {
    return false
  }

  if (/[\[\]{}]/.test(trimmed)) {
    return false
  }

  if (/[;:]/.test(trimmed)) {
    return false
  }

  if ((trimmed.match(/,/g) ?? []).length > 2) {
    return false
  }

  if (/[0-9]/.test(trimmed)) {
    return false
  }

  if (/[\u4E00-\u9FFF]/.test(trimmed)) {
    return false
  }

  if (/^[a-z]/.test(trimmed)) {
    return false
  }

  if (/[\u2013\u2014]/.test(trimmed)) {
    return false
  }

  if (EXPLICIT_CONTENT_PATTERN.test(trimmed)) {
    return false
  }

  if (PERSON_REFERENCE_PATTERN.test(trimmed) && INTIMACY_CONTEXT_PATTERN.test(trimmed)) {
    return false
  }

  return true
}
