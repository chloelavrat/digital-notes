import pg from 'pg'
const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30_000,
})

pool.on('error', (err) => console.error('DB pool error:', err.message))

export default pool
export const query = (text, params) => pool.query(text, params)
