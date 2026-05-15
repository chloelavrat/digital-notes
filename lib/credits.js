import { query } from './db.js'

/**
 * Return credit status for a user.
 * Usage is computed live from digital_notes_scans — no drift possible.
 */
export async function getCredits(userId) {
  const { rows } = await query(`
    SELECT
      u.monthly_limit,
      u.credit_policy,
      COUNT(s.id)::int AS used_this_month
    FROM users u
    LEFT JOIN digital_notes_scans s
      ON  s.user_id     = u.id
      AND s.processed_at >= DATE_TRUNC('month', NOW())
      AND s.processed_at <  DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
    WHERE u.id = $1
    GROUP BY u.id, u.monthly_limit, u.credit_policy
  `, [userId])

  if (!rows[0]) throw new Error('User not found')

  const { monthly_limit, credit_policy, used_this_month } = rows[0]
  const remaining = monthly_limit - used_this_month

  return {
    monthly_limit,
    used_this_month,
    remaining,
    credit_policy,
    exceeded: remaining <= 0,
  }
}

/**
 * Express middleware — blocks or warns based on the user's credit policy.
 * Attaches `req.credits` for downstream use.
 */
export async function creditsMiddleware(req, res, next) {
  if (!req.user) return next()           // no user = auth middleware handles it
  try {
    const credits = await getCredits(req.user.id)
    req.credits = credits
    if (credits.exceeded && credits.credit_policy === 'hard') {
      return res.status(402).json({
        error: `Monthly scan limit reached (${credits.monthly_limit}/month). Your credits will reset on the 1st.`,
        credits,
      })
    }
    next()
  } catch (err) {
    console.error('credits check:', err.message)
    next()   // fail open — don't block processing on a DB error
  }
}
