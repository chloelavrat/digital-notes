import { useEffect } from 'react'

let ready = false
async function getMermaid() {
  const { default: mermaid } = await import('mermaid')
  if (!ready) {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' })
    ready = true
  }
  return mermaid
}

export function prepareMermaid(html) {
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/gi,
    (_, encoded) => {
      const code = encoded
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      return `<div class="mermaid-block" data-code="${encodeURIComponent(code)}"></div>`
    }
  )
}

export function useMermaid(ref, deps) {
  useEffect(() => {
    if (!ref.current) return
    const blocks = ref.current.querySelectorAll('.mermaid-block[data-code]')
    if (!blocks.length) return

    getMermaid().then(async (mermaid) => {
      for (const el of blocks) {
        const code = decodeURIComponent(el.getAttribute('data-code') || '')
        if (!code) continue
        try {
          const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2)}`
          const { svg } = await mermaid.render(id, code)
          el.innerHTML = svg
          el.removeAttribute('data-code')
        } catch {
          el.innerHTML = '<span style="font-size:8pt;color:#9ca3af;font-family:monospace">⚠ diagram error</span>'
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
