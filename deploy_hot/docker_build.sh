#!/usr/bin/env bash
# 热部署镜像构建脚本
#
# 与 scripts/docker_build.sh 的区别：
#   - 使用 deploy_hot/Dockerfile（editable 模式）
#   - 镜像 tag 默认 aiwork-hot:latest
#   - 前端构建产物仍写到 console-dist/（运行时由 docker-compose 挂载）
#
# 用法:
#   bash deploy_hot/docker_build.sh [IMAGE_TAG]
#   FRONTEND_DIR=/path/to/frontend bash deploy_hot/docker_build.sh
#   SKIP_FRONTEND_BUILD=1 bash deploy_hot/docker_build.sh
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DOCKERFILE="${DOCKERFILE:-$REPO_ROOT/deploy_hot/Dockerfile}"
TAG="${1:-aiwork-hot:latest}"
shift || true

DISABLED_CHANNELS="${AIWORK_DISABLED_CHANNELS:-imessage}"

# ---------------------------------------------------------------------------
# Step 1/2: 前端构建（产物落到 console-dist/）
# ---------------------------------------------------------------------------
FRONTEND_DIR="${FRONTEND_DIR:-$REPO_ROOT/../AIWork-OS-frontend}"
CONSOLE_DIST_DIR="$REPO_ROOT/console-dist"

if [[ "${SKIP_FRONTEND_BUILD:-0}" == "1" ]]; then
    echo "[docker_build_hot] SKIP_FRONTEND_BUILD=1, 复用 $CONSOLE_DIST_DIR"
    if [[ ! -d "$CONSOLE_DIST_DIR" ]] || [[ -z "$(ls -A "$CONSOLE_DIST_DIR" 2>/dev/null)" ]]; then
        echo "[docker_build_hot] ERROR: $CONSOLE_DIST_DIR 不存在或为空。" >&2
        exit 1
    fi
else
    if [[ ! -d "$FRONTEND_DIR/console" ]]; then
        echo "[docker_build_hot] ERROR: 未找到前端目录: $FRONTEND_DIR/console" >&2
        exit 1
    fi

    echo "[docker_build_hot] Step 1/2: 构建前端 $FRONTEND_DIR/console"
    (
        cd "$FRONTEND_DIR/console"
        npm ci --include=dev
        npm run build
    )

    if [[ ! -d "$FRONTEND_DIR/console/dist" ]]; then
        echo "[docker_build_hot] ERROR: 前端构建后未生成 dist/ 目录。" >&2
        exit 1
    fi

    echo "[docker_build_hot] 同步 dist -> $CONSOLE_DIST_DIR"
    rm -rf "$CONSOLE_DIST_DIR"
    mkdir -p "$CONSOLE_DIST_DIR"
    cp -a "$FRONTEND_DIR/console/dist/." "$CONSOLE_DIST_DIR/"
fi

# ---------------------------------------------------------------------------
# Step 2/2: docker build
# ---------------------------------------------------------------------------
echo "[docker_build_hot] Step 2/2: 构建镜像 $TAG (Dockerfile: $DOCKERFILE)"

# 启用 BuildKit（COPY --chmod 需要）
export DOCKER_BUILDKIT=1

docker build -f "$DOCKERFILE" \
    --build-arg AIWORK_DISABLED_CHANNELS="$DISABLED_CHANNELS" \
    ${AIWORK_ENABLED_CHANNELS:+--build-arg AIWORK_ENABLED_CHANNELS="$AIWORK_ENABLED_CHANNELS"} \
    -t "$TAG" "$@" .

echo "[docker_build_hot] Done. 镜像 tag: $TAG"
