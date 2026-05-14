import { parseFrontmatter } from './frontmatter'

function cleanInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

function mermaidToArrows(codeLines) {
  const labels = {}
  const edges = []

  for (const raw of codeLines) {
    const line = raw.trim()
    if (!line || /^(flowchart|graph|sequenceDiagram|classDiagram|mindmap|timeline)\b/.test(line)) continue

    // Standalone node definition: ID[label] or ID["label"]
    const def = line.match(/^(\w+)\[["']?(.*?)["']?\]\s*$/)
    if (def) {
      labels[def[1]] = def[2].replace(/<br\s*\/?>/gi, ' / ').trim()
      continue
    }

    // Edge line: A --> B  or  A["label"] --> B["label"]  or  A -->|via| B
    const edgeRe = /(\w+)(?:\[["']?.*?["']?\])?\s*-+>(?:\|([^|]*)\|)?\s*(\w+)(?:\[["']?(.*?)["']?\])?/
    const em = edgeRe.exec(line)
    if (em) {
      if (em[1] && !labels[em[1]] && em[0].includes('[')) {
        const inlineFrom = line.match(/^(\w+)\[["']?(.*?)["']?\]/)
        if (inlineFrom) labels[inlineFrom[1]] = inlineFrom[2].replace(/<br\s*\/?>/gi, ' / ').trim()
      }
      if (em[3] && !labels[em[3]] && em[4]) {
        labels[em[3]] = em[4].replace(/<br\s*\/?>/gi, ' / ').trim()
      }
      edges.push({ from: em[1], via: em[2]?.trim() || '', to: em[3] })
    }
  }

  if (!edges.length) return []

  const L = id => labels[id] || id

  // Build adjacency
  const out = {}  // node → [targets]
  const inc = {}  // node → [sources]
  const nodes = new Set()
  for (const { from, to } of edges) {
    nodes.add(from); nodes.add(to)
    ;(out[from] = out[from] || []).push(to)
    ;(inc[to]   = inc[to]   || []).push(from)
  }

  // Roots = nodes with no incoming edges
  const roots = [...nodes].filter(n => !inc[n])

  // Walk the graph from roots, building segments
  const visited = new Set()
  const lines = []

  function walk(start) {
    // Collect all nodes in the chain starting from `start`
    const chain = [start]
    visited.add(start)
    let cur = start
    while (out[cur]?.length === 1) {
      const next = out[cur][0]
      if (visited.has(next)) break
      // Only follow if this next node has exactly one incoming (no other branches merging)
      if ((inc[next] || []).length > 1) break
      chain.push(next)
      visited.add(next)
      cur = next
    }
    return chain
  }

  // Group roots that all converge to the same first target (fan-in)
  const rootsByTarget = {}
  for (const r of roots) {
    const t = out[r]?.[0]
    if (t) (rootsByTarget[t] = rootsByTarget[t] || []).push(r)
  }

  const handledRoots = new Set()

  for (const [target, sources] of Object.entries(rootsByTarget)) {
    if (sources.every(r => !handledRoots.has(r))) {
      sources.forEach(r => { handledRoots.add(r); visited.add(r) })
      const inputPart = sources.map(L).join(', ')
      // Continue chain from target
      const chain = walk(target)
      const chainPart = chain.map(L).join('  →  ')
      lines.push(`${inputPart}  →  ${chainPart}`)

      // Handle fan-out at end of chain
      const last = chain[chain.length - 1]
      if (out[last]?.length > 1) {
        lines.push(`  →  ${out[last].map(L).join(' / ')}`)
        out[last].forEach(n => visited.add(n))
      }
    }
  }

  // Handle any remaining unvisited roots (simple chains)
  for (const r of roots) {
    if (!visited.has(r)) {
      const chain = walk(r)
      lines.push(chain.map(L).join('  →  '))
      const last = chain[chain.length - 1]
      if (out[last]?.length > 1) {
        lines.push(`  →  ${out[last].map(L).join(' / ')}`)
        out[last].forEach(n => visited.add(n))
      }
    }
  }

  return lines.length ? lines : [edges.map(e => `${L(e.from)} → ${L(e.to)}`).join('  ')]
}

export function toAppleNotesText(markdown) {
  const { meta, body } = parseFrontmatter(markdown || '')
  const out = []

  // ── Frontmatter block ────────────────────────────────────────
  if (meta) {
    if (meta.title)       out.push(meta.title)
    if (meta.description) out.push(meta.description)
    const dateLine = [meta.date, meta.tags].filter(Boolean).join('   ')
    if (dateLine) out.push(dateLine)
    out.push('', '─'.repeat(36), '')
  }

  // ── Body ─────────────────────────────────────────────────────
  const lines = (body || '').split('\n')
  let inFence = false
  let fenceType = ''
  let fenceLines = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Opening fence
    if (!inFence && /^```/.test(line)) {
      inFence = true
      fenceType = line.slice(3).trim().toLowerCase()
      fenceLines = []
      continue
    }

    // Closing fence
    if (inFence && /^```/.test(line)) {
      inFence = false
      if (fenceType === 'mermaid') {
        out.push(...mermaidToArrows(fenceLines))
      } else if (fenceLines.length) {
        out.push(...fenceLines.map(l => `    ${l}`))
      }
      out.push('')
      fenceLines = []
      fenceType = ''
      continue
    }

    if (inFence) { fenceLines.push(line); continue }

    // H1
    const h1 = line.match(/^#\s+(.+)/)
    if (h1) { out.push('', cleanInline(h1[1]).toUpperCase(), ''); continue }

    // H2
    const h2 = line.match(/^##\s+(.+)/)
    if (h2) { const t = cleanInline(h2[1]); out.push('', t, '─'.repeat(t.length), ''); continue }

    // H3–H6
    const h3 = line.match(/^#{3,6}\s+(.+)/)
    if (h3) { out.push('', cleanInline(h3[1]), ''); continue }

    // Unordered list
    const ul = line.match(/^([*-])\s+(.+)/)
    if (ul) { out.push(`• ${cleanInline(ul[2])}`); continue }

    // Ordered list
    const ol = line.match(/^\d+\.\s+(.+)/)
    if (ol) { out.push(`• ${cleanInline(ol[1])}`); continue }

    // Blockquote
    const bq = line.match(/^>\s*(.*)/)
    if (bq) { out.push(`"${cleanInline(bq[1])}"`); continue }

    // HR
    if (/^---+$/.test(line.trim())) { out.push('─'.repeat(36)); continue }

    out.push(cleanInline(line))
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
