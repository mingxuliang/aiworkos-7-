#!/usr/bin/env bash
# =============================================================================
# AIWork-OS 热部署 - 后端代码快速更新（无需重建镜像）
#
# 原理：
#   - 容器内 /app/src 已通过 bind mount 挂载宿主机 src/
#   - 镜像中使用 editable 模式安装（pip install -e .）
#   - 修改 .py 后，只需重启 app 进程即可生效
#
# ⚠️ 不适用场景（请改用 deploy_hot/deploy.sh 重建镜像）：
#   - 修改了 pyproject.toml / setup.py
#   - 新增了 Python 依赖
#   - 修改了 deploy_hot/Dockerfile 或 entrypoint.sh
#
# 用法：
#   bash deploy_hot/deploy_backend.sh
#   SKIP_GIT_PULL=1 bash deploy_hot/deploy_backend.sh   # 跳过 git pull
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
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"
PORT="${AIWORK_HOT_PORT:-8088}"

START_TIME=$(date +%s)

# ---------------------------------------------------------------------------
# Step 1: 检查容器是否运行
# ---------------------------------------------------------------------------
log_step "Step 1/4: 检查容器状态"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_error "容器 ${CONTAINER_NAME} 未运行"
    log_error "请先运行: bash deploy_hot/deploy.sh"
    exit 1
fi
log_ok "容器 ${CONTAINER_NAME} 正在运行"

# ---------------------------------------------------------------------------
# Step 2: 拉取后端最新代码
# ---------------------------------------------------------------------------
if [[ "$SKIP_GIT_PULL" == "1" ]]; then
    log_step "Step 2/4: 跳过 git pull（SKIP_GIT_PULL=1）"
else
    log_step "Step 2/4: 拉取后端最新代码"
    if [[ -d "$REPO_ROOT/.git" ]]; then
        OLD_HEAD=$(git rev-parse HEAD)
        if git pull --rebase --autostash; then
            NEW_HEAD=$(git rev-parse HEAD)
            if [[ "$OLD_HEAD" == "$NEW_HEAD" ]]; then
                log_info "代码无变化"
            else
                log_ok "代码已更新 ${OLD_HEAD:0:7} -> ${NEW_HEAD:0:7}"
            fi
        else
            log_warn "git pull 失败，使用当前代码继续"
        fi
    else
        log_warn "当前目录不是 git 仓库，跳过 git pull"
    fi
fi

# ---------------------------------------------------------------------------
# Step 2.5: 风险提示
# ---------------------------------------------------------------------------
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -qE '^(pyproject\.toml|setup\.py|deploy_hot/)'; then
    log_warn "检测到 pyproject.toml / setup.py / deploy_hot/ 有变更"
    log_warn "此类变更需要重建镜像，请改用: bash deploy_hot/deploy.sh"
    log_warn "若坚持继续，仅 .py 改动会生效。"
fi

# ---------------------------------------------------------------------------
# Step 3: 重启 app 进程
# ---------------------------------------------------------------------------
log_step "Step 3/4: 重启 app 进程"
log_info "执行: docker exec ${CONTAINER_NAME} supervisorctl restart app"
docker exec "${CONTAINER_NAME}" supervisorctl restart app
log_ok "app 进程已重启"

# ---------------------------------------------------------------------------
# Step 4: 健康检查
# ---------------------------------------------------------------------------
log_step "Step 4/4: 等待服务就绪"
log_info "探测 http://127.0.0.1:${PORT}/ ..."
ok=0
for i in $(seq 1 60); do
    if curl -fsS -o /dev/null -m 2 "http://127.0.0.1:${PORT}/"; then
        ok=1
        break
    fi
    sleep 1
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

if [[ "$ok" == "1" ]]; then
    log_ok "HTTP 服务可访问"
else
    log_warn "60s 内未能访问，请查日志: docker logs $CONTAINER_NAME"
fi

cat <<EOF

${C_BOLD}${C_GREEN}后端热更新完成（耗时 ${ELAPSED}s）${C_RESET}

  容器        : $CONTAINER_NAME
  访问地址    : http://<server-ip>:${PORT}

  查看日志    : docker logs -f $CONTAINER_NAME
  app 状态    : docker exec $CONTAINER_NAME supervisorctl status app
EOF
