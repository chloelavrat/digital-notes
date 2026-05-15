import express from 'express'
import multer from 'multer'
import cookieParser from 'cookie-parser'
import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import heicConvert from 'heic-convert'
import { OAuth2Client } from 'google-auth-library'
import { createHmac, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { query as dbQuery } from './lib/db.js'
import { uploadBuffer, BUCKET } from './lib/storage.js'
import { creditsMiddleware } from './lib/credits.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(cookieParser())
app.use(express.json())

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

const anthropic = new Anthropic()

// ── Auth ─────────────────────────────────────────────────────────

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true'
const AUTH_SECRET  = process.env.AUTH_SECRET || 'change-me-in-production'

// Build user list from AUTH_USERS=alice:pass1,bob:pass2  or legacy AUTH_USERNAME/AUTH_PASSWORD
const AUTH_USERS = (() => {
  const users = []
  const multi = process.env.AUTH_USERS || ''
  if (multi) {
    multi.split(',').forEach(entry => {
      const sep = entry.indexOf(':')
      if (sep !== -1) users.push({ username: entry.slice(0, sep).trim(), password: entry.slice(sep + 1).trim() })
    })
  }
  if (process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD) {
    if (!users.find(u => u.username === process.env.AUTH_USERNAME)) {
      users.push({ username: process.env.AUTH_USERNAME, password: process.env.AUTH_PASSWORD })
    }
  }
  return users
})()

const sign = (v) => createHmac('sha256', AUTH_SECRET).update(v).digest('hex')

const makeToken = (username) =>
  Buffer.from(`${username}:${sign(username)}`).toString('base64url')

const verifyToken = (token) => {
  if (!token) return false
  try {
    const raw  = Buffer.from(token, 'base64url').toString()
    const sep  = raw.lastIndexOf(':')
    const user = raw.slice(0, sep)
    const sig  = raw.slice(sep + 1)
    return sig === sign(user) ? user : false
  } catch { return false }
}

const requireAuth = (req, res, next) => {
  if (!AUTH_ENABLED) return next()
  if (!verifyToken(req.cookies?.dn_auth)) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

app.get('/api/auth/check', (req, res) => {
  if (!AUTH_ENABLED) return res.json({ required: false, authenticated: true })
  res.json({ required: true, authenticated: !!verifyToken(req.cookies?.dn_auth) })
})

app.post('/api/auth/login', (req, res) => {
  if (!AUTH_ENABLED) return res.json({ ok: true })
  const { username, password } = req.body || {}
  const match = AUTH_USERS.find(u => u.username === username && u.password === password)
  if (match) {
    res.cookie('dn_auth', makeToken(username), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    return res.json({ ok: true })
  }
  res.status(401).json({ error: 'Invalid username or password' })
})

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('dn_auth')
  res.clearCookie('dn_session')
  res.json({ ok: true })
})

// ── Google OAuth ──────────────────────────────────────────────────

const SESSION_SECRET = process.env.SESSION_SECRET || AUTH_SECRET
const googleClient   = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null

const signSession   = (userId) => createHmac('sha256', SESSION_SECRET).update(userId).digest('hex')
const makeSession   = (userId) => Buffer.from(`${userId}:${signSession(userId)}`).toString('base64url')
const verifySession = (token)  => {
  if (!token) return null
  try {
    const raw = Buffer.from(token, 'base64url').toString()
    const sep = raw.lastIndexOf(':')
    const id  = raw.slice(0, sep)
    const sig = raw.slice(sep + 1)
    return sig === signSession(id) ? id : null
  } catch { return null }
}

// POST /api/auth/google  — verify Google ID token, upsert user, set session cookie
app.post('/api/auth/google', async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: 'Google OAuth not configured (GOOGLE_CLIENT_ID missing)' })
  const { credential } = req.body || {}
  if (!credential) return res.status(400).json({ error: 'Missing credential' })

  try {
    const ticket  = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })
    const payload = ticket.getPayload()
    const { sub: googleId, email, name, picture: avatar_url } = payload

    // Upsert user
    const { rows } = await dbQuery(`
      INSERT INTO users (google_id, email, name, avatar_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (google_id) DO UPDATE
        SET email      = EXCLUDED.email,
            name       = EXCLUDED.name,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = NOW()
      RETURNING id, email, name, avatar_url, access, preferences, monthly_limit, credit_policy
    `, [googleId, email, name, avatar_url])

    const user = rows[0]

    // Check app access
    if (!user.access?.digital_notes && !user.access?.admin) {
      return res.status(403).json({ error: 'Access to Digital Notes not granted. Contact the administrator.' })
    }

    res.cookie('dn_session', makeSession(user.id), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
    })
    res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, access: user.access, preferences: user.preferences } })
  } catch (err) {
    console.error('Google auth error:', err.message)
    res.status(401).json({ error: 'Invalid Google credential' })
  }
})

// GET /api/auth/me — return current session user
app.get('/api/auth/me', async (req, res) => {
  const userId = verifySession(req.cookies?.dn_session)
  if (!userId) return res.json({ user: null })
  try {
    const { rows } = await dbQuery(
      'SELECT id, email, name, avatar_url, access, preferences, monthly_limit, credit_policy FROM users WHERE id = $1',
      [userId]
    )
    res.json({ user: rows[0] || null })
  } catch { res.json({ user: null }) }
})

// Middleware: load authenticated user from session cookie
const requireUser = async (req, res, next) => {
  const userId = verifySession(req.cookies?.dn_session)
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const { rows } = await dbQuery(
      'SELECT id, email, name, access, monthly_limit, credit_policy FROM users WHERE id = $1',
      [userId]
    )
    if (!rows[0]) return res.status(401).json({ error: 'User not found' })
    if (!rows[0].access?.digital_notes && !rows[0].access?.admin) {
      return res.status(403).json({ error: 'Access denied' })
    }
    req.user = rows[0]
    next()
  } catch (err) {
    console.error('requireUser:', err.message)
    res.status(500).json({ error: 'Auth check failed' })
  }
}

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

app.post('/api/process', requireUser, creditsMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' })

  let { mimetype, buffer } = req.file
  const { originalname } = req.file
  const scanId = randomUUID()

  const userId = req.user?.id
  let inputGcsPath = null

  try {
    // Convert HEIC/HEIF → JPEG (Claude doesn't support HEIC natively)
    if (mimetype === 'image/heic' || mimetype === 'image/heif') {
      const converted = await heicConvert({ buffer, format: 'JPEG', quality: 0.92 })
      buffer = Buffer.from(converted)
      mimetype = 'image/jpeg'
    }

    // Upload input file to GCS (best-effort — don't block processing on failure)
    if (userId) {
      try {
        const ext = originalname.split('.').pop() || 'bin'
        inputGcsPath = `dn/${userId}/${scanId}/input.${ext}`
        await uploadBuffer(inputGcsPath, buffer, mimetype)
      } catch (gcsErr) {
        console.warn('GCS input upload failed (continuing):', gcsErr.message)
        inputGcsPath = null
      }
    }

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

    // Upload output to GCS + record scan in DB (best-effort)
    if (userId) {
      const outputGcsPath = `dn/${userId}/${scanId}/output.md`
      try {
        await uploadBuffer(outputGcsPath, Buffer.from(markdown), 'text/markdown')
      } catch (gcsErr) {
        console.warn('GCS output upload failed:', gcsErr.message)
      }
      try {
        // Extract token counts from the final stream message
        const finalMsg = await stream.finalMessage().catch(() => null)
        const inputTokens  = finalMsg?.usage?.input_tokens  ?? null
        const outputTokens = finalMsg?.usage?.output_tokens ?? null
        // Rough cost estimate for claude-opus-4-7 (update if pricing changes)
        const costUsd = inputTokens && outputTokens
          ? (inputTokens * 0.000015 + outputTokens * 0.000075)
          : null

        await dbQuery(`
          INSERT INTO digital_notes_scans
            (id, user_id, cost_usd, input_tokens, output_tokens,
             input_gcs_path, output_gcs_path, file_metadata, output_metadata)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [
          scanId, userId, costUsd, inputTokens, outputTokens,
          inputGcsPath || `dn/${userId}/${scanId}/input.bin`,
          `dn/${userId}/${scanId}/output.md`,
          JSON.stringify({ filename: originalname, size: req.file.size, mime: req.file.mimetype }),
          JSON.stringify({ filename }),
        ])
      } catch (dbErr) {
        console.warn('DB scan record failed:', dbErr.message)
      }
    }

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
  app.get('/{*path}', (_, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))
}

const port = process.env.PORT || 8080
app.listen(port, () => console.log(`Digital Notes :${port}`))
