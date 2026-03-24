/**
 * Retry utility for SQLite write operations.
 * Catches SQLITE_BUSY / SQLITE_LOCKED errors and Prisma P2034 (transaction conflict),
 * retrying up to `maxRetries` times with a short delay before giving up.
 */

/** Error shape that may carry a `code` from the SQLite driver or Prisma */
interface RetryableError {
  code?: string
  message?: string
}

/** Returns true if the error is a transient SQLite lock / Prisma transaction conflict */
function isRetryable(err: unknown): boolean {
  const e = err as RetryableError
  const code = e?.code ?? ''
  return (
    code === 'SQLITE_BUSY' ||
    code === 'SQLITE_LOCKED' ||
    code === 'P2034' ||
    (e?.message ?? '').includes('database is locked')
  )
}

/**
 * Wraps a database operation with automatic retry on transient SQLite errors.
 *
 * @param fn        - Async function that performs the DB operation
 * @param maxRetries - Maximum number of retries (default 2)
 * @param delayMs   - Milliseconds to wait between retries (default 100)
 * @returns The result of `fn()` on success
 * @throws The original error if all retries are exhausted or the error is not retryable
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  delayMs = 100,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (!isRetryable(err) || attempt === maxRetries) {
        throw err
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  // Unreachable, but satisfies TypeScript
  throw lastError
}
