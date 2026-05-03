#!/usr/bin/env bash
# Backs up the most recent Claude conversation transcript before compaction.
# Fires via the PreCompact hook in .claude/settings.local.json.

set -euo pipefail

PROJECT_DIR="/Volumes/MACBOOK_NVME/Mike&Payne Dropbox/Richard Payne/02_PERSONAL_BRAND/06_PAYNE-BOT/finance-hub"
BACKUP_DIR="${PROJECT_DIR}/.claude/backups"
ENCODED="-Volumes-MACBOOK-NVME-Mike-Payne-Dropbox-Richard-Payne-02-PERSONAL-BRAND-06-PAYNE-BOT-finance-hub"
TRANSCRIPT_DIR="${HOME}/.claude/projects/${ENCODED}"

mkdir -p "${BACKUP_DIR}"

LATEST=$(find "${TRANSCRIPT_DIR}" -maxdepth 1 -name "*.jsonl" -type f 2>/dev/null \
  | xargs ls -t 2>/dev/null | head -1)

if [[ -z "${LATEST}" ]]; then
  echo "[pre-compact] No transcript found — skipping backup." >&2
  exit 0
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BASENAME=$(basename "${LATEST}" .jsonl)
DEST="${BACKUP_DIR}/${TIMESTAMP}_${BASENAME}.jsonl"

cp "${LATEST}" "${DEST}"
echo "[pre-compact] Backed up transcript to ${DEST}" >&2
