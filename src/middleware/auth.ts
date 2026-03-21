import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { verify } from 'hono/jwt'
import type { JwtPayload, Role } from '../types'

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'

// ─── Context Extension ────────────────────────────────────────────────────────
// Hono uses this to type c.get('auth') in route handlers.

export type AuthEnv = {
  Variables: {
    auth: JwtPayload
  }
}

// ─── Core Verify Helper ───────────────────────────────────────────────────────

async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const payload = await verify(token, JWT_SECRET, 'HS256') as unknown as JwtPayload
    return payload
  } catch {
    return null
  }
}

// ─── requireAuth ─────────────────────────────────────────────────────────────
// Verifies the JWT cookie and attaches the payload to context.
// Accepts an optional list of roles — if provided, rejects any other role.
// Usage:
//   app.use('/api/admin/*', requireAuth('admin'))
//   app.use('/api/host/*',  requireAuth('host', 'admin'))
//   app.use('/api/live/*',  requireAuth())   ← any valid JWT

export function requireAuth(...roles: Role[]) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = getCookie(c, 'auth_token')

    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const payload = await verifyToken(token)

    if (!payload) {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }

    if (roles.length > 0 && !roles.includes(payload.role as Role)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    c.set('auth', payload)
    await next()
  })
}

// ─── optionalAuth ─────────────────────────────────────────────────────────────
// Attaches auth payload if cookie is present, but does not block if absent.
// Used on public pages that show extra controls when logged in (e.g. /t/:slug/live).

export function optionalAuth() {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = getCookie(c, 'auth_token')

    if (token) {
      const payload = await verifyToken(token)
      if (payload) c.set('auth', payload)
    }

    await next()
  })
}

// ─── JWT Issue Helper ─────────────────────────────────────────────────────────
// Used in route handlers to issue a cookie after successful login.

import { sign } from 'hono/jwt'
import { setCookie } from 'hono/cookie'
import type { Context } from 'hono'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 14 // 14 days

export async function issueAuthCookie(c: Context, payload: JwtPayload): Promise<void> {
  const token = await sign(
    { ...payload, exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE },
    JWT_SECRET,
    'HS256'
  )

  setCookie(c, 'auth_token', token, {
    httpOnly: true,          // not accessible from JS — XSS safe
    sameSite: 'Lax',         // CSRF protection for same-origin navigations
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
}

export async function clearAuthCookie(c: Context): Promise<void> {
  setCookie(c, 'auth_token', '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  })
}

export { JWT_SECRET }