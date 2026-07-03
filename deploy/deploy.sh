#!/usr/bin/env bash
# =============================================================================
# AIWork-OS 一键部署脚本（生产环境）
#
# 适用场景：单机部署。流程：
#   1. 校验前置依赖（docker、前端目录、.env）
#   2. 构建前端 + 后端镜像（方案C：镜像外构建前端）
#   3. 通过 docker compose 启动 / 重建服务
#   4. 等待健康检查并打印验证信息
#
# 用法：
#   bash deploy/deploy.sh                          # 默认 IMAGE=aiwork:latest
#   IMAGE=aiwork:v1.0.0 bash deploy/deploy.sh
#   SKIP_FRONTEND_BUILD=1 bash deploy/deploy.sh    # 复用已有 console-dist/
#   SKIP_BUILD=1 bash deploy/deploy.sh             # 跳过镜像构建，仅重启
#   FRONTEND_DIR=/abs/path bash deploy/deploy.sh   # 自定义前端仓库路径
#
# 环境变量：
#   IMAGE                镜像 tag，默认 aiwork:latest
#   FRONTEND_DIR         前端仓库路径，默认 ../AIWork-OS-frontend
#   SKIP_BUILD           1=跳过镜像构建（直接 compose up）
#   SKIP_FRONTEND_BUILD  1=跳过前端 npm 构建（复用已有 console-dist/）
#   DOCKER_COMPOSE       compose 命令，默认自动探测 (docker compose / docker-compose)
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# 颜色与日志
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# 路径与默认配置
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

IMAGE="${IMAGE:-aiwork:latest}"
FRONTEND_DIR="${FRONTEND_DIR:-$REPO_ROOT/../AIWork-OS-frontend}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_FRONTEND_BUILD="${SKIP_FRONTEND_BUILD:-0}"

# ---------------------------------------------------------------------------
# Step 1: 前置检查
# ---------------------------------------------------------------------------
log_step "Step 1/4: 前置环境检查"

# 1.0 git pull 拉取最新代码
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

# 拉取当前项目代码
git_pull_if_repo "$REPO_ROOT" "后端项目"

# 拉取前端代码（若需要构建）
if [[ "$SKIP_BUILD" != "1" && "$SKIP_FRONTEND_BUILD" != "1" ]]; then
    git_pull_if_repo "$FRONTEND_DIR/console" "前端项目"
fi

# 1.1 docker
if ! command -v docker >/dev/null 2>&1; then
    log_error "未检测到 docker，请先安装 Docker Engine 20.10+。"
    exit 1
fi
log_ok "docker: $(docker --version)"

# 1.2 docker compose（兼容 v1 / v2）
if [[ -n "${DOCKER_COMPOSE:-}" ]]; then
    : # 用户指定
elif docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    log_error "未检测到 docker compose / docker-compose。"
    exit 1
fi
log_ok "compose: $DOCKER_COMPOSE"

# 1.3 .env
if [[ ! -f "$REPO_ROOT/.env" ]]; then
    log_error ".env 不存在。请执行: cp .env.example .env && vim .env"
    exit 1
fi
log_ok ".env 存在"

# 1.4 关键变量提示（只检查是否在 .env 出现，不解析）
for key in AIWORK_JWT_SECRET AIWORK_JWT_DB_URL AIWORK_REDIS_URL; do
    if ! grep -qE "^${key}=" "$REPO_ROOT/.env"; then
        log_warn ".env 中未发现 ${key}，JWT 认证可能无法工作。"
    fi
done

# 1.5 docker-compose.yml
if [[ ! -f "$REPO_ROOT/docker-compose.yml" ]]; then
    log_error "$REPO_ROOT/docker-compose.yml 不存在。"
    exit 1
fi
log_ok "docker-compose.yml 存在"

# 1.6 前端目录（若需要构建）
if [[ "$SKIP_BUILD" != "1" && "$SKIP_FRONTEND_BUILD" != "1" ]]; then
    if [[ ! -d "$FRONTEND_DIR/console" ]]; then
        log_error "未找到前端目录: $FRONTEND_DIR/console"
        log_error "请确认前后端已 clone 到同一父目录，或通过 FRONTEND_DIR=... 指定。"
        exit 1
    fi
    log_ok "前端目录: $FRONTEND_DIR/console"
fi

# ---------------------------------------------------------------------------
# Step 2: 构建镜像（方案 C）
# ---------------------------------------------------------------------------
if [[ "$SKIP_BUILD" == "1" ]]; then
    log_step "Step 2/4: 跳过镜像构建（SKIP_BUILD=1）"
else
    log_step "Step 2/4: 构建镜像 IMAGE=$IMAGE"
    if [[ "$SKIP_FRONTEND_BUILD" == "1" ]]; then
        log_info "复用已有 console-dist/（SKIP_FRONTEND_BUILD=1）"
        SKIP_FRONTEND_BUILD=1 bash "$REPO_ROOT/scripts/docker_build.sh" "$IMAGE"
    else
        FRONTEND_DIR="$FRONTEND_DIR" bash "$REPO_ROOT/scripts/docker_build.sh" "$IMAGE"
    fi
    log_ok "镜像构建完成: $IMAGE"
fi

# ---------------------------------------------------------------------------
# Step 3: docker compose 启动
# ---------------------------------------------------------------------------
log_step "Step 3/4: 启动容器"

# 3.0 幂等创建宿主机日志目录（容器内 /app/logs 通过 bind mount 映射到此）
#     - 不存在则创建；已存在则跳过；不影响目录内已有日志文件
#     - 显式创建可避免 docker 自动以 root:root 创建后的权限歧义
LOGS_DIR="$REPO_ROOT/logs"
if [[ ! -d "$LOGS_DIR" ]]; then
    mkdir -p "$LOGS_DIR"
    chmod 0755 "$LOGS_DIR"
    log_ok "已创建宿主机日志目录: $LOGS_DIR"
else
    log_info "宿主机日志目录已存在: $LOGS_DIR"
fi

# 让 compose 使用我们刚构建的镜像 tag。
# docker-compose.yml 中 image 已配置为 ${AIWORK_IMAGE:-aiwork:latest}，
# 通过下方 export 注入，确保 compose 使用本次构建的镜像，避免误用旧镜像或触发 compose 自身重建。
export AIWORK_IMAGE="$IMAGE"

log_info "执行: AIWORK_IMAGE=$AIWORK_IMAGE $DOCKER_COMPOSE up -d"
$DOCKER_COMPOSE up -d

log_ok "容器已启动"

# ---------------------------------------------------------------------------
# Step 4: 健康检查与验证
# ---------------------------------------------------------------------------
log_step "Step 4/4: 等待服务就绪"

CONTAINER_NAME="aiwork"
PORT="${AIWORK_PORT:-8088}"

# 等容器进入 running 状态
for i in $(seq 1 30); do
    state="$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo missing)"
    if [[ "$state" == "running" ]]; then
        log_ok "容器 $CONTAINER_NAME 状态: running"
        break
    fi
    sleep 1
    if [[ "$i" == "30" ]]; then
        log_error "容器 $CONTAINER_NAME 在 30s 内未进入 running 状态，状态=$state"
        log_error "查看日志: docker logs $CONTAINER_NAME"
        exit 1
    fi
done

# HTTP 探活（最多 90s，等 init + db_migrate 完成）
log_info "探测 http://127.0.0.1:${PORT}/ ..."
ok=0
for i in $(seq 1 90); do
    if curl -fsS -o /dev/null -m 2 "http://127.0.0.1:${PORT}/"; then
        ok=1
        break
    fi
    sleep 1
done
if [[ "$ok" == "1" ]]; then
    log_ok "HTTP 服务可访问"
else
    log_warn "90s 内未能访问 http://127.0.0.1:${PORT}/，请查看日志确认。"
fi

# 打印关键日志摘要
echo
log_info "最近的初始化 / 迁移日志："
docker logs "$CONTAINER_NAME" 2>&1 \
    | grep -E "Database|admin|Initialization|migration" \
    | tail -n 20 || true

# 总结
cat <<EOF

${C_BOLD}${C_GREEN}部署完成。${C_RESET}

  镜像        : $IMAGE
  访问地址    : http://<server-ip>:${PORT}
  默认管理员  : admin / admin123  (${C_YELLOW}请首次登录后立即改密${C_RESET})
  容器日志    : docker logs -f $CONTAINER_NAME
  容器服务    : docker exec $CONTAINER_NAME supervisorctl status
  应用日志    : tail -f $REPO_ROOT/logs/app.out.log  (按天自动滚动)

  升级:        bash deploy/deploy.sh
  回滚:        修改 docker-compose.yml 中 image 后 $DOCKER_COMPOSE up -d
  停止:        $DOCKER_COMPOSE down
EOF
