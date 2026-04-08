#!/bin/bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
CTID=100
CT_ROOT="/var/lib/lxc/${CTID}/rootfs"
APP_DIR="${CT_ROOT}/home/epltech/epl-magazines"
DB_PATH="${APP_DIR}/prisma/dev.db"
LOG_PATH="${APP_DIR}/logs/audit.log"

NAS_MOUNT="/mnt/pve/nas-backup"
BACKUP_BASE="${NAS_MOUNT}/epl-magazines/daily"
TODAY=$(date +%Y-%m-%d)
BACKUP_DIR="${BACKUP_BASE}/${TODAY}"

LOGFILE="/var/log/epl-magazines-backup.log"
RETENTION_DAYS=14

MAIL_TO="itdepartment@edisonpubliclibrary.org"
MAIL_FROM="proxmox-alerts@edisonpubliclibrary.org"
MIN_DB_SIZE=8192  # At least one SQLite page

MOUNTED_BY_US=false

# ── Helpers ───────────────────────────────────────────────────────────
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOGFILE"; }

cleanup() {
  rm -f "/tmp/epl-dev-backup.db" 2>/dev/null || true
  if [ "$MOUNTED_BY_US" = "true" ]; then
    log "Unmounting CT ${CTID}..."
    /usr/sbin/pct unmount "$CTID" 2>> "$LOGFILE" || log "Notice: CT ${CTID} unmount may have failed."
  fi
}
trap cleanup EXIT

send_failure_email() {
  local subject="[EPL-MAGAZINES] BACKUP FAILED: ${1}"
  echo -e "EPL Magazine Tracker — Backup Failure\nTime: $(date '+%Y-%m-%d %H:%M:%S')\nHost: $(hostname)\nError: ${1}\n\nCheck log: ${LOGFILE}" \
    | mail -s "[Proxmox Alert] $subject" -r "$MAIL_FROM" "$MAIL_TO"
}

fail() {
  log "✗ $1"
  send_failure_email "$1"
  exit 1
}

# ── Preflight ─────────────────────────────────────────────────────────
mountpoint -q "$NAS_MOUNT" || fail "QNAP NAS not mounted at ${NAS_MOUNT}"

# ── Mount CT 100 filesystem ──────────────────────────────────────────
log "Starting daily backup"

if [ ! -d "$APP_DIR" ]; then
  log "Mounting CT ${CTID}..."
  /usr/sbin/pct mount "$CTID" 2>> "$LOGFILE" || log "Notice: CT ${CTID} might already be mounted."
  MOUNTED_BY_US=true
fi

# Verify source paths exist
if [ ! -f "$DB_PATH" ]; then
  fail "Source database not found at ${DB_PATH}"
fi

# ── Backup ────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

# 1. Copy SQLite DB (file-level copy from mounted filesystem)
#    CT 100 is running so WAL may be active — copy all SQLite files
cp "$DB_PATH" "${BACKUP_DIR}/dev.db" \
  || fail "Failed to copy dev.db"
# Copy WAL/SHM if they exist (ensures consistent backup)
cp "${DB_PATH}-wal" "${BACKUP_DIR}/dev.db-wal" 2>/dev/null || true
cp "${DB_PATH}-shm" "${BACKUP_DIR}/dev.db-shm" 2>/dev/null || true

# 2. Integrity check on the backup copy
INTEGRITY=$(sqlite3 "${BACKUP_DIR}/dev.db" "PRAGMA integrity_check;" 2>&1)
if [ "$INTEGRITY" != "ok" ]; then
  fail "Integrity check failed: ${INTEGRITY}"
fi

# 3. File size check
FILE_SIZE=$(stat -c%s "${BACKUP_DIR}/dev.db")
if [ "$FILE_SIZE" -lt "$MIN_DB_SIZE" ]; then
  fail "Backup file suspiciously small: ${FILE_SIZE} bytes (minimum: ${MIN_DB_SIZE})"
fi

# 4. Copy audit log
if [ -f "$LOG_PATH" ]; then
  cp "$LOG_PATH" "${BACKUP_DIR}/audit.log" \
    || fail "Failed to copy audit.log"
else
  log "Notice: No audit.log found at ${LOG_PATH}"
fi

# 5. Clean up WAL/SHM from backup (checkpoint into main db)
sqlite3 "${BACKUP_DIR}/dev.db" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
rm -f "${BACKUP_DIR}/dev.db-wal" "${BACKUP_DIR}/dev.db-shm" 2>/dev/null || true

# ── Retention ─────────────────────────────────────────────────────────
find "$BACKUP_BASE" -maxdepth 1 -type d -name '20*' -mtime +${RETENTION_DAYS} -exec rm -rf {} + 2>/dev/null || true

log "✓ Backup complete: ${BACKUP_DIR} (db: ${FILE_SIZE} bytes)"
