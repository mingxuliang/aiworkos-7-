#!/bin/sh
# 容器启动入口（热部署版本）
#
# 关键点：
#   - 镜像中已通过 `pip install -e .` 注册项目为 editable 模式
#   - 宿主机源码通过 bind mount 挂载到 /app/src，修改后重启 app 进程即生效
#   - 前端产物通过 bind mount 挂载到 /app/console-static，AIWORK_CONSOLE_STATIC_DIR 指向该目录
set -e

# Auto-initialize if config.json is missing
if [ ! -f "${AIWORK_WORKING_DIR}/config.json" ]; then
  echo "⚠️  No config.json found in ${AIWORK_WORKING_DIR}"
  echo "📦 Running initialization..."
  aiwork init --defaults --accept-security
  echo "✅ Initialization complete!"
else
  echo "✓ Config found in ${AIWORK_WORKING_DIR}, skipping initialization."
fi

# 提示当前 editable 源码挂载状态
if [ -d "/app/src/aiwork" ]; then
    echo "✓ Source code mounted at /app/src (editable mode)"
fi
if [ -d "${AIWORK_CONSOLE_STATIC_DIR:-/app/console-static}" ]; then
    echo "✓ Console static dir: ${AIWORK_CONSOLE_STATIC_DIR:-/app/console-static}"
fi

export AIWORK_PORT="${AIWORK_PORT:-8088}"
envsubst '${AIWORK_PORT}' \
  < /etc/supervisor/conf.d/supervisord.conf.template \
  > /etc/supervisor/conf.d/supervisord.conf
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
