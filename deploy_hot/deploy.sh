#!/usr/bin/env bash
# =============================================================================
# AIWork-OS 热部署 - 首次完整部署
#
# 适用场景：
#   - 首次部署热模式版本
#   - 修改了 pyproject.toml 等依赖声明，必须重建镜像
#   - 基础镜像需要更新
#
# 日常代码更新请用：
#   - bash deploy_hot/deploy_backend.sh   仅后端代码修改
#   - bash deploy_hot/deploy_frontend.sh  仅前端代码修改
#
# 用法：
#   bash deploy_hot/deploy.sh
#   IMAGE=aiwork-hot:v1.0.0 bash deploy_hot/deploy.sh
#   SKIP_FRONTEND_BUILD=1 bash deploy_hot/deploy.sh
#   FRONTEND_DIR=/abs/path bash deploy_hot/deploy.sh
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

IMAGE="${IMAGE:-aiwork-hot:latest}"
FRONTEND_DIR="${FRONTEND_DIR:-$REPO_ROOT/../AIWork-OS-frontend}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_FRONTEND_BUILD="${SKIP_FRONTEND_BUILD:-0}"

# ---------------------------------------------------------------------------
# Step 1: 前置检查
# ---------------------------------------------------------------------------
log_step "Step 1/4: 前置环境检查"

git_pull_if_repo() {
    local dir="$1"
    local label="$2"
    if [[ -d "$dir/.git" ]]; then
        log_info "正在拉取 ${label} 最新代码: $dir"
        if (cd "$dir" && git pull --rebase --autostash); then
            log_ok "${label} 代码已更新"
        else
            log_warn "${label} git pull 失败，继续部署当前代码"
        fi
    else
        log_warn "${label} 不是 git 仓库: $dir"
    fi
}

git_pull_if_repo "$REPO_ROOT" "后端项目"
if [[ "$SKIP_BUILD" != "1" && "$SKIP_FRONTEND_BUILD" != "1" ]]; then
    git_pull_if_repo "$FRONTEND_DIR/console" "前端项目"
fi

# docker
if ! command -v docker >/dev/null 2>&1; then
    log_error "未检测到 docker"
    exit 1
fi
log_ok "docker: $(docker --version)"

# docker compose
if [[ -n "${DOCKER_COMPOSE:-}" ]]; then
    :
elif docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    log_error "未检测到 docker compose"
    exit 1
fi
log_ok "compose: $DOCKER_COMPOSE"

# .env
if [[ ! -f "$REPO_ROOT/.env" ]]; then
    log_error ".env 不存在: cp .env.example .env && vim .env"
    exit 1
fi
log_ok ".env 存在"

# compose 配置
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
if [[ ! -f "$COMPOSE_FILE" ]]; then
    log_error "未找到 $COMPOSE_FILE"
    exit 1
fi
log_ok "compose 配置: $COMPOSE_FILE"

# 前端目录
if [[ "$SKIP_BUILD" != "1" && "$SKIP_FRONTEND_BUILD" != "1" ]]; then
    if [[ ! -d "$FRONTEND_DIR/console" ]]; then
        log_error "未找到前端目录: $FRONTEND_DIR/console"
        exit 1
    fi
    log_ok "前端目录: $FRONTEND_DIR/console"
fi

# ---------------------------------------------------------------------------
# Step 2: 构建镜像
# ---------------------------------------------------------------------------
if [[ "$SKIP_BUILD" == "1" ]]; then
    log_step "Step 2/4: 跳过镜像构建（SKIP_BUILD=1）"
else
    log_step "Step 2/4: 构建镜像 IMAGE=$IMAGE"
    if [[ "$SKIP_FRONTEND_BUILD" == "1" ]]; then
        SKIP_FRONTEND_BUILD=1 bash "$SCRIPT_DIR/docker_build.sh" "$IMAGE"
    else
        FRONTEND_DIR="$FRONTEND_DIR" bash "$SCRIPT_DIR/docker_build.sh" "$IMAGE"
    fi
    log_ok "镜像构建完成: $IMAGE"
fi

# ---------------------------------------------------------------------------
# Step 3: docker compose 启动
# ---------------------------------------------------------------------------
log_step "Step 3/4: 启动容器"

# 宿主机日志目录
LOGS_DIR="$REPO_ROOT/logs"
if [[ ! -d "$LOGS_DIR" ]]; then
    mkdir -p "$LOGS_DIR"
    chmod 0755 "$LOGS_DIR"
fi

# 必须确保 console-dist/ 存在（compose bind mount 不允许缺失）
if [[ ! -d "$REPO_ROOT/console-dist" ]]; then
    log_error "$REPO_ROOT/console-dist 不存在，前端 bind mount 将失败。"
    log_error "请先构建前端或运行 deploy_frontend.sh"
    exit 1
fi
log_ok "console-dist/ 存在（将挂载到容器）"

export AIWORK_HOT_IMAGE="$IMAGE"

log_info "执行: $DOCKER_COMPOSE -f $COMPOSE_FILE up -d"
$DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d

log_ok "容器已启动"

# ---------------------------------------------------------------------------
# Step 4: 健康检查
# ---------------------------------------------------------------------------
log_step "Step 4/4: 等待服务就绪"

CONTAINER_NAME="aiwork-hot"
PORT="${AIWORK_HOT_PORT:-8088}"

for i in $(seq 1 30); do
    state="$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo missing)"
    if [[ "$state" == "running" ]]; then
        log_ok "容器 $CONTAINER_NAME 状态: running"
        break
    fi
    sleep 1
    if [[ "$i" == "30" ]]; then
        log_error "容器 $CONTAINER_NAME 30s 内未 running，状态=$state"
        log_error "查看日志: docker logs $CONTAINER_NAME"
        exit 1
    fi
done

log_info "探测 http://127.0.0.1:${PORT}/ ..."
ok=0
for i in $(seq 1 90); do
    if curl -fsS -o /dev/null -m 2 "http://127.0.0.1:${PORT}/"; then
        ok=1
        break
    fi
    sleep 1
done
[[ "$ok" == "1" ]] && log_ok "HTTP 服务可访问" || log_warn "90s 未能访问，请查日志"

echo
log_info "最近的初始化日志："
docker logs "$CONTAINER_NAME" 2>&1 | grep -E "Database|admin|Initialization|mounted|Console" | tail -n 20 || true

cat <<EOF

${C_BOLD}${C_GREEN}热部署版本已启动。${C_RESET}

  镜像        : $IMAGE
  容器        : $CONTAINER_NAME
  访问地址    : http://<server-ip>:${PORT}
  默认管理员  : admin / admin123  (${C_YELLOW}请立即改密${C_RESET})

  ${C_BOLD}日常更新（无需重建镜像）：${C_RESET}
    仅改后端: bash deploy_hot/deploy_backend.sh    （10-30 秒）
    仅改前端: bash deploy_hot/deploy_frontend.sh   （1-2 分钟）

  ${C_BOLD}容器管理：${C_RESET}
    日志: docker logs -f $CONTAINER_NAME
    停止: $DOCKER_COMPOSE -f $COMPOSE_FILE down
EOF
