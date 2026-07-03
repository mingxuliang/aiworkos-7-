#!/bin/sh
# Substitute AIWORK_PORT in supervisord template and start supervisord.
# Default port 8088; override at runtime with -e AIWORK_PORT=3000.
set -e

# Auto-initialize if config.json is missing (bind mount with empty directory).
if [ ! -f "${AIWORK_WORKING_DIR}/config.json" ]; then
  echo "⚠️  No config.json found in ${AIWORK_WORKING_DIR}"
  echo "📦 Running initialization..."
  aiwork init --defaults --accept-security
  echo "✅ Initialization complete!"
else
  echo "✓ Config found in ${AIWORK_WORKING_DIR}, skipping initialization."
fi

export AIWORK_PORT="${AIWORK_PORT:-8088}"
envsubst '${AIWORK_PORT}' \
  < /etc/supervisor/conf.d/supervisord.conf.template \
  > /etc/supervisor/conf.d/supervisord.conf
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
