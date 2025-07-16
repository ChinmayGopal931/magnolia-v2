#!/bin/sh
# Database backup script

set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/magnolia_backup_${TIMESTAMP}.sql.gz"

echo "Starting backup at ${TIMESTAMP}..."

# Create backup
pg_dump -h postgres -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${BACKUP_FILE}"

echo "Backup completed: ${BACKUP_FILE}"

# Remove backups older than 30 days
find "${BACKUP_DIR}" -name "magnolia_backup_*.sql.gz" -type f -mtime +30 -delete

echo "Old backups cleaned up"

# Calculate backup size
BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "Backup size: ${BACKUP_SIZE}"