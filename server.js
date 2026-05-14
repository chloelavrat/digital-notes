import express from 'express'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

const anthropic = new Anthropic()

app.get('/api/health', (_, res) => res.json({ ok: true }))

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')))
}

const SYSTEM = `You are a document digitisation specialist. Your sole job is to produce an exact digital twin of the source — every word, number, label, and connection must match the original precisely.

GENERAL RULES
- Transcribe every visible word, number, abbreviation, and symbol exactly as written — do not paraphrase, summarise, or infer meaning
- Preserve the original structure: use headings, lists, and tables to mirror the spatial layout of the source
- Strip only visual decoration (colours, fonts, underlines used purely for style); keep everything that carries meaning
- Return ONLY the Markdown — no preamble, no explanation, no wrapping code fences

DIAGRAMS (strict)
- ONLY emit a \`\`\`mermaid block when a diagram with explicit visual connections is physically drawn in the source (boxes, circles, arrows, lines between nodes, org-chart branches, flowchart decision shapes, etc.)
- The Mermaid output must be a 1-to-1 replica: same number of nodes, same number of arrows, same labels on every node and edge, same direction, same branching — nothing added, nothing removed, nothing renamed
- If a node has 3 outgoing arrows in the drawing, it must have exactly 3 in the Mermaid code
- If there is no drawn diagram, use lists, tables, or headings — never invent a visual representation
- Do not convert bullet lists, numbered steps, or prose into diagrams even if they could be represented that way`

async function generateMeta(markdown) {
  const date = new Date().toISOString().slice(0, 10)
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Analyze this document excerpt and return a JSON object with exactly these fields:
{
  "title": "Concise title in title case (4-7 words)",
  "slug": "2-4-word-lowercase-hyphenated-slug",
  "description": "One sentence describing the document content.",
  "tags": ["tag1", "tag2", "tag3"]
}

Return ONLY valid JSON. 3-6 tags, lowercase, hyphenated if multi-word.\n\n${markdown.slice(0, 800)}`,
      }],
    })

    const raw = res.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '')
    const meta = JSON.parse(raw)

    const slug = String(meta.slug || 'document')
      .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

    const tags = Array.isArray(meta.tags)
      ? meta.tags.map(t => `#${String(t).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`).join(' ')
      : ''

    const frontmatter = [
      '---',
      `title: ${meta.title || 'Untitled'}`,
      `description: ${meta.description || ''}`,
      `date: ${date}`,
      `tags: ${tags}`,
      '---',
      '',
    ].join('\n')

    return { frontmatter, filename: `${date}-${slug}.md` }
  } catch {
    const frontmatter = `---\ntitle: Document\ndescription: \ndate: ${date}\ntags: \n---\n`
    return { frontmatter, filename: `${date}-document.md` }
  }
}

app.post('/api/process', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' })

  const { mimetype, buffer, originalname } = req.file

  try {
    let content

    if (mimetype.startsWith('image/')) {
      const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!supported.includes(mimetype)) {
        return res.status(400).json({ error: 'Unsupported image type. Use JPEG, PNG, WEBP, or GIF.' })
      }
      content = [
        { type: 'image', source: { type: 'base64', media_type: mimetype, data: buffer.toString('base64') } },
        { type: 'text', text: 'Convert this to Markdown.' },
      ]
    } else if (mimetype === 'application/pdf') {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
        { type: 'text', text: 'Convert this to Markdown.' },
      ]
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const { value } = await mammoth.extractRawText({ buffer })
      content = `File: ${originalname}\n\n${value}\n\nConvert this to Markdown.`
    } else if (mimetype.startsWith('text/')) {
      content = `File: ${originalname}\n\n${buffer.toString('utf-8')}\n\nConvert this to Markdown.`
    } else {
      return res.status(400).json({ error: 'Unsupported file type.' })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const stream = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      stream: true,
    })

    let accumulated = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        accumulated += event.delta.text
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
      }
    }

    const { frontmatter, filename } = await generateMeta(accumulated)
    const markdown = frontmatter + '\n' + accumulated
    res.write(`data: ${JSON.stringify({ done: true, filename, markdown })}\n\n`)
    res.end()
  } catch (err) {
    console.error(err.message)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Processing failed' })
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message || 'Processing failed' })}\n\n`)
      res.end()
    }
  }
})

if (process.env.NODE_ENV === 'production') {
  app.get('*', (_, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))
}

const port = process.env.PORT || 8080
app.listen(port, () => console.log(`Digital Notes :${port}`))
