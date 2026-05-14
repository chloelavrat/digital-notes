export function parseFrontmatter(md) {
  const match = md?.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return { meta: null, body: md || '' }

  const meta = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const val = line.slice(colon + 1).trim()
    if (key) meta[key] = val
  }
  return { meta, body: md.slice(match[0].length) }
}
