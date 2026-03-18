import winston from 'winston'
import path from 'path'
import fs from 'fs'

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
    }),
  ],
})

/**
 * Log a user action to the audit log.
 * @param {string} userId - The ID of the acting user
 * @param {string} action - e.g. 'LOGIN', 'RECEIPT_CREATED', 'MAGAZINE_DELETED'
 * @param {object} details - Additional context
 */
export function auditLog(userId, action, details = {}) {
  logger.info({ userId, action, ...details })
}
