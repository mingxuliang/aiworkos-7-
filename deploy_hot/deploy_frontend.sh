#!/usr/bin/env bash
# =============================================================================
# AIWork-OS 热部署 - 前端代码快速更新（无需重建镜像）
#
# 原理：
#   - 宿主机 console-dist/ 通过 bind mount 挂载到容器 /app/console-static
#   - 前端构建产物同步到 console-dist/ 后，容器内立即可见
#   - 静态资源浏览器刷新即生效，无需重启容器
#
# 用法：
#   bash deploy_hot/deploy_frontend.sh
#   FRONTEND_DIR=/abs/path bash deploy_hot/deploy_frontend.sh
#   SKIP_GIT_PULL=1 bash deploy_hot/deploy_frontend.sh
# =============================================================================
set -euo pipefail

if [[ -t 1 ]]; then
    C_RESET=$'\033[0m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
    C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_BOLD=$'\033[1m'
else
    C_RESET=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_BOLD=""
fi

log_info()  { echo "${C_BLUE}[INFO]${C_RESET}  $*"; }
log_ok()    { echo "${C_GREEN}[ OK ]${C_RESET}  $*"; }
log_warn()  { echo "${C_YELLOW}[WARN]${C_RESET}  $*"; }
log_error() { echo "${C_RED}[ERR ]${C_RESET}  $*" >&2; }
log_step()  { echo; echo "${C_BOLD}${C_BLUE}==>${C_RESET} ${C_BOLD}$*${C_RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

CONTAINER_NAME="${CONTAINER_NAME:-aiwork-hot}"
FRONTEND_DIR="${FRONTEND_DIR:-$REPO_ROOT/../AIWork-OS-frontend}"
CONSOLE_DIST_DIR="$REPO_ROOT/console-dist"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"
PORT="${AIWORK_HOT_PORT:-8088}"

START_TIME=$(date +%s)

# ---------------------------------------------------------------------------
# Step 1: 前置检查
# ---------------------------------------------------------------------------
log_step "Step 1/4: 前置环境检查"

if [[ ! -d "$FRONTEND_DIR/console" ]]; then
    log_error "未找到前端目录: $FRONTEND_DIR/console"
    exit 1
fi
log_ok "前端目录: $FRONTEND_DIR/console"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_warn "容器 ${CONTAINER_NAME} 未运行（前端产物会更新，但用户无法访问）"
else
    log_ok "容器 ${CONTAINER_NAME} 正在运行"
fi

# ---------------------------------------------------------------------------
# Step 2: 拉取前端最新代码
# ---------------------------------------------------------------------------
if [[ "$SKIP_GIT_PULL" == "1" ]]; then
    log_step "Step 2/4: 跳过 git pull（SKIP_GIT_PULL=1）"
else
    log_step "Step 2/4: 拉取前端最新代码"
    if [[ -d "$FRONTEND_DIR/console/.git" ]]; then
        if (cd "$FRONTEND_DIR/console" && git pull --rebase --autostash); then
            log_ok "前端代码已更新"
        else
            log_warn "前端 git pull 失败，使用当前代码继续"
        fi
    else
        log_warn "前端目录不是 git 仓库，跳过 git pull"
    fi
fi

# ---------------------------------------------------------------------------
# Step 3: 构建前端并同步到 console-dist/
# ---------------------------------------------------------------------------
log_step "Step 3/4: 构建前端"
log_info "进入 $FRONTEND_DIR/console 执行 npm ci && npm ci @agentscope-ai/chat && python3 patch_builder.py && npm run build"
(
    cd "$FRONTEND_DIR/console"
    npm ci --include=dev
    npm ci --include=dev @agentscope-ai/chat
    python3 patch_builder.py
    npm run build
)

if [[ ! -d "$FRONTEND_DIR/console/dist" ]]; then
    log_error "前端构建后未生成 dist/ 目录"
    exit 1
fi
log_ok "前端构建完成"

log_info "同步 dist -> $CONSOLE_DIST_DIR"
# 注意：不能 rm -rf 目录本身，否则 Docker bind mount 的 inode 会失效，
# 导致容器内 /app/console-static 仍指向已删除的空目录。
# 正确做法是先确保目录存在，再清空内容（保留目录 inode）。
mkdir -p "$CONSOLE_DIST_DIR"
rm -rf "$CONSOLE_DIST_DIR"/*
cp -a "$FRONTEND_DIR/console/dist/." "$CONSOLE_DIST_DIR/"
log_ok "console-dist/ 已更新（容器内立即可见，浏览器刷新即可）"

# ---------------------------------------------------------------------------
# Step 4: 健康检查
# ---------------------------------------------------------------------------
log_step "Step 4/4: 验证服务"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_info "探测 http://127.0.0.1:${PORT}/ ..."
    if curl -fsS -o /dev/null -m 5 "http://127.0.0.1:${PORT}/"; then
        log_ok "HTTP 服务可访问"
    else
        log_warn "HTTP 探活失败，请检查容器日志"
    fi
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

cat <<EOF

${C_BOLD}${C_GREEN}前端热更新完成（耗时 ${ELAPSED}s）${C_RESET}

  前端目录    : $FRONTEND_DIR/console
  产物路径    : $CONSOLE_DIST_DIR
  容器        : $CONTAINER_NAME (无需重启)
  访问地址    : http://<server-ip>:${PORT}

  ${C_YELLOW}提示：${C_RESET}浏览器需要强制刷新（Ctrl+Shift+R / Cmd+Shift+R）以加载新资源。
EOF
