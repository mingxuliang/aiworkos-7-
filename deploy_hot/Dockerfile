# -----------------------------------------------------------------------------
# AIWork-OS 热部署镜像（editable 模式）
#
# 与原 deploy/Dockerfile 的关键差异：
#   1. 使用 `pip install --no-deps -e .` 进行 editable 安装
#   2. 镜像内 src/ 仅作为兜底，运行时由 docker-compose 通过 bind mount 覆盖为宿主机源码
#   3. 前端产物不打入镜像，运行时通过 AIWORK_CONSOLE_STATIC_DIR 指向挂载目录
#
# 优势：
#   - 后端 .py 修改后只需 supervisorctl restart app，无需重建镜像
#   - 前端只需 npm build + 同步 console-dist，无需重建镜像
# -----------------------------------------------------------------------------
FROM agentscope-registry.ap-southeast-1.cr.aliyuncs.com/agentscope/node:slim

# ENV variables
ENV NODE_ENV=production
ENV WORKSPACE_DIR=/app
ENV AIWORK_WORKING_DIR=/app/working
ENV AIWORK_SECRET_DIR=/app/working.secret
ENV AIWORK_BACKUP_DIR=/app/working.backups

# 时区设置
ENV TZ=Asia/Shanghai

# Channel filtering
ARG AIWORK_DISABLED_CHANNELS="imessage"
ENV AIWORK_DISABLED_CHANNELS=${AIWORK_DISABLED_CHANNELS}
ARG AIWORK_ENABLED_CHANNELS=""
ENV AIWORK_ENABLED_CHANNELS=${AIWORK_ENABLED_CHANNELS}

ARG DEBIAN_FRONTEND=noninteractive

# 阿里云镜像源加速 apt-get
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources && \
        sed -i 's|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
    elif [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then \
        sed -i 's|archive.ubuntu.com|mirrors.aliyun.com|g' /etc/apt/sources.list.d/ubuntu.sources && \
        sed -i 's|security.ubuntu.com|mirrors.aliyun.com|g' /etc/apt/sources.list.d/ubuntu.sources; \
    elif [ -f /etc/apt/sources.list ]; then \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list && \
        sed -i 's|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list && \
        sed -i 's|archive.ubuntu.com|mirrors.aliyun.com|g' /etc/apt/sources.list && \
        sed -i 's|security.ubuntu.com|mirrors.aliyun.com|g' /etc/apt/sources.list; \
    fi

# 系统依赖（与原 Dockerfile 一致）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl  \
    tzdata \
    build-essential  \
    libssl-dev  \
    libffi-dev \
    libsqlite3-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libncurses5-dev \
    liblzma-dev \
    git  \
    supervisor  \
    logrotate \
    vim  \
    gettext-base \
    xfce4 \
    xfce4-terminal \
    xvfb \
    dbus-x11 \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    chromium \
    chromium-sandbox \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libglib2.0-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    fonts-liberation \
    libu2f-udev \
  && rm -rf /var/lib/apt/lists/*

# 编译安装 Python 3.10.14
ARG PYTHON_VERSION=3.10.14
RUN curl -fsSL https://repo.huaweicloud.com/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tgz -o /tmp/python.tgz \
  && tar xzf /tmp/python.tgz -C /tmp \
  && cd /tmp/Python-${PYTHON_VERSION} \
  && ./configure --prefix=/usr/local --enable-shared --with-ensurepip=install LDFLAGS="-Wl,-rpath /usr/local/lib" \
  && make -j$(nproc) \
  && make altinstall \
  && cd / && rm -rf /tmp/python.tgz /tmp/Python-${PYTHON_VERSION} \
  && ln -sf /usr/local/bin/python3.10 /usr/local/bin/python3 \
  && ln -sf /usr/local/bin/pip3.10 /usr/local/bin/pip3 \
  && ldconfig

RUN sed -i 's/^CHROMIUM_FLAGS=""/CHROMIUM_FLAGS="--no-sandbox"/' /usr/bin/chromium

# Playwright 使用系统 Chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV AIWORK_RUNNING_IN_CONTAINER=1

WORKDIR ${WORKSPACE_DIR}

RUN python3.10 -m venv venv
ENV PATH="/app/venv/bin:$PATH"

# uv 加速 Python 包安装
COPY --from=agentscope-registry.ap-southeast-1.cr.aliyuncs.com/agentscope/uv:latest /uv /bin/uv
ENV UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/

# 依赖层（pyproject.toml 不变则缓存命中）
COPY pyproject.toml setup.py ./
COPY src/aiwork/__version__.py ./src/aiwork/__version__.py
COPY src/aiwork/__init__.py ./src/aiwork/__init__.py
RUN uv pip install --no-cache-dir --only-binary :all: ".[jwt-auth,metrics]" 2>/dev/null \
  || uv pip install --no-cache-dir ".[jwt-auth,metrics]"

# ⚠️ 关键差异：editable 安装
# COPY src 作为兜底；运行时 bind mount 会覆盖此目录为宿主机源码
COPY src ./src
RUN uv pip install --no-cache-dir --no-deps -e .

# 前端产物挂载点（不打入镜像）
# 通过 docker-compose 挂载宿主机 console-dist/ 到该目录
ENV AIWORK_CONSOLE_STATIC_DIR=/app/console-static
RUN mkdir -p /app/console-static

# AIWork app port
ENV AIWORK_PORT=8088

COPY deploy_hot/config/supervisord.conf.template /etc/supervisor/conf.d/supervisord.conf.template
COPY deploy_hot/config/aiwork.logrotate /etc/logrotate.d/aiwork
COPY --chmod=755 deploy_hot/entrypoint.sh /entrypoint.sh

# 容器内日志目录
RUN mkdir -p /app/logs && chmod 0755 /app/logs
VOLUME ["/app/logs"]

EXPOSE 8088

CMD ["/entrypoint.sh"]
