import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { SessionPayload, UserRole } from '@/types'

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/** Returns the encoded SESSION_SECRET key, throwing if not configured */
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

/**
 * Encrypts a session payload into a signed JWT string.
 * @param payload - Session data to encrypt
 */
export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

/**
 * Decrypts and verifies a session JWT, returning the payload or null on failure.
 * @param session - The JWT string from the session cookie
 */
export async function decrypt(session: string | undefined): Promise<SessionPayload | null> {
  if (!session) return null
  try {
    const { payload } = await jwtVerify(session, getSecret(), {
      algorithms: ['HS256'],
    })
    // jose returns JWTPayload; we cast here because we know the shape we signed
    // TODO: improve typing — add runtime validation (e.g. zod) to confirm shape
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

/**
 * Creates an encrypted session cookie for the given user.
 * @param userId - The authenticated user's ID
 * @param role - The user's role (ADMIN | STAFF)
 */
export async function createSession(userId: string, role: UserRole): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  const token = await encrypt({ userId, role, expiresAt })
  const cookieStore = await cookies()

  cookieStore.set('session', token, {
    httpOnly: true,
    secure: false, // Internal LAN only — no HTTPS
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })
}

/** Deletes the session cookie, effectively logging the user out */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}
