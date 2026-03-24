# Application Logs

## Audit Log

**Location**: `logs/audit.log`
**Format**: JSON lines (one JSON object per line)
**Library**: Winston

Each entry contains:

```json
{
  "level": "info",
  "timestamp": "2026-03-23T14:30:00.000Z",
  "userId": "clxyz...",
  "action": "MAGAZINE_CREATED",
  "magazineName": "Time",
  "cadence": "WEEKLY"
}
```

## Logged Actions

| Action | Trigger |
|---|---|
| `LOGIN` / `LOGOUT` | User authenticates or logs out |
| `MAGAZINE_CREATED` / `MAGAZINE_UPDATED` / `MAGAZINE_DELETED` | Admin manages magazines |
| `RECEIPT_CREATED` / `RECEIPT_EDITED` | Staff marks a magazine as received |
| `USER_CREATED` / `USER_UPDATED` / `USER_DELETED` | Admin manages users |
| `USER_NAME_CHANGED` / `USER_PASSWORD_CHANGED` | User updates their profile |
| `BRANCH_MAGAZINE_ADDED` / `BRANCH_MAGAZINE_UPDATED` / `BRANCH_MAGAZINE_REMOVED` | Admin manages branch subscriptions |
| `TRANSFER_INITIATED` / `TRANSFER_COMPLETED` / `TRANSFER_CANCELLED` | Magazine transfers between branches |

Update actions include before/after values for changed fields (e.g., `cadence: "WEEKLY → MONTHLY"`).

## Reading Logs

```bash
# View last 50 entries
tail -n 50 logs/audit.log

# Pretty-print a single entry
tail -n 1 logs/audit.log | jq .

# Filter by action type
cat logs/audit.log | jq 'select(.action == "LOGIN")'

# Filter by user
cat logs/audit.log | jq 'select(.userId == "clxyz...")'

# Filter by date range
cat logs/audit.log | jq 'select(.timestamp >= "2026-03-01" and .timestamp < "2026-04-01")'

# Count actions by type
cat logs/audit.log | jq -r '.action' | sort | uniq -c | sort -rn
```

## Log Rotation

No automatic rotation is configured. The log file will grow indefinitely. Set up external rotation:

```bash
# /etc/logrotate.d/epl-magazines
/path/to/epl-magazines/logs/audit.log {
    weekly
    rotate 12
    compress
    missingok
    notifempty
    copytruncate
}
```

Or configure size-based rotation directly in Winston if preferred.
