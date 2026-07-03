# AIWork-OS 热部署方案 (deploy_hot)

> **目标**：通过 Bind Mount + Editable Install 实现免镜像重建的快速部署。
> 日常代码更新从 **5-10 分钟** 压缩至 **10-30 秒**。

> ⚠️ 本目录是**独立方案**，不影响原 `deploy/` 目录的所有脚本。

---

## 一、与原方案对比

| 项目 | 原方案 `deploy/` | 热部署 `deploy_hot/` |
|------|----------------|--------------------|
| 安装模式 | `pip install .` | `pip install -e .` (editable) |
| 后端源码 | 打入镜像 | bind mount 挂载 |
| 前端产物 | 打入镜像 | bind mount 挂载 |
| 后端更新耗时 | 5-10 分钟 | **10-30 秒** |
| 前端更新耗时 | 5-10 分钟 | **1-2 分钟** |
| 镜像名 | `aiwork:latest` | `aiwork-hot:latest` |
| 容器名 | `aiwork` | `aiwork-hot` |
| 工作目录 | `~/.aiwork` (bind mount) | `~/.aiwork` (bind mount，**与原版一致**) |
| 密钥目录 | `~/.aiwork.secret` (bind mount) | `~/.aiwork.secret` (bind mount，**与原版一致**) |
| 备份卷 | `aiwork-backups` | `aiwork-backups`（**与原版共享**） |

> ⚠️ 工作目录、密钥目录和备份卷与原版**完全共享**，两套方案**不可同时启动**（会并发写入相同数据）；如需共存，请先 `docker compose down` 另一边再启动本方案。

---

## 二、目录结构

```
deploy_hot/
├── Dockerfile                       # editable 模式镜像构建
├── docker-compose.yml               # 带 bind mount 的 compose 配置
├── entrypoint.sh                    # 容器启动入口
├── config/
│   ├── supervisord.conf.template    # supervisord 配置
│   └── aiwork.logrotate             # 日志滚动配置
├── docker_build.sh                  # 镜像构建脚本
├── deploy.sh                        # 首次部署（构建+启动）
├── deploy_backend.sh                # 后端热更新（无需重建镜像）
├── deploy_frontend.sh               # 前端热更新（无需重建镜像）
└── README.md
```

---

## 三、使用指南

### 3.1 首次部署

```bash
# 在仓库根目录执行
bash deploy_hot/deploy.sh
```

完成后：
- 镜像：`aiwork-hot:latest`
- 容器：`aiwork-hot`
- 默认端口：`8088`（可通过 `AIWORK_HOT_PORT` 环境变量修改）
- 管理员：`admin / admin123`（首次登录立即改密）

### 3.2 仅修改后端代码

```bash
bash deploy_hot/deploy_backend.sh
```

执行流程（**预计 10-30 秒**）：
1. git pull 后端最新代码
2. 检测是否有 pyproject.toml/Dockerfile 变更（有则提示需重建）
3. `docker exec aiwork-hot supervisorctl restart app`
4. HTTP 健康检查

**原理**：宿主机 `src/` 通过 bind mount 挂载到容器 `/app/src`，editable 模式让 Python 直接从挂载目录加载源码。

### 3.3 仅修改前端代码

```bash
bash deploy_hot/deploy_frontend.sh
```

执行流程（**预计 1-2 分钟**）：
1. git pull 前端最新代码
2. `npm ci && npm run build`
3. 同步 `dist/` → `console-dist/`
4. **无需重启容器**，浏览器强制刷新即可

**原理**：宿主机 `console-dist/` 通过 bind mount 挂载到容器 `/app/console-static`，FastAPI 直接从该目录响应静态请求。

### 3.4 需要重建镜像的场景

以下情况必须运行 `deploy.sh` 重建镜像：
- ✏️ 修改了 `pyproject.toml` / `setup.py`（依赖变更）
- ✏️ 新增了 Python 包依赖
- ✏️ 修改了 `deploy_hot/Dockerfile`
- ✏️ 修改了 `deploy_hot/entrypoint.sh`
- ✏️ 修改了 `deploy_hot/config/` 内的文件

---

## 四、环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `IMAGE` | `aiwork-hot:latest` | 镜像 tag |
| `AIWORK_HOT_IMAGE` | `aiwork-hot:latest` | compose 用的镜像 tag |
| `AIWORK_HOT_PORT` | `8088` | 宿主机映射端口 |
| `FRONTEND_DIR` | `../AIWork-OS-frontend` | 前端仓库路径 |
| `SKIP_BUILD` | `0` | `deploy.sh` 跳过镜像构建 |
| `SKIP_FRONTEND_BUILD` | `0` | 跳过前端 npm build |
| `SKIP_GIT_PULL` | `0` | 部署脚本跳过 git pull |
| `CONTAINER_NAME` | `aiwork-hot` | 容器名 |

---

## 五、与原版共存

原版与热部署版本**复用同一份用户数据/密钥/备份**，便于在两种部署方式之间无缝切换：

```bash
# 切换到原版（先停热部署，避免并发写入）
docker compose -f deploy_hot/docker-compose.yml down
bash deploy/deploy.sh

# 切换到热部署（先停原版）
docker compose down
bash deploy_hot/deploy.sh
```

两套版本的差异：
- ✅ 镜像不同（`aiwork:latest` vs `aiwork-hot:latest`）
- ✅ 容器名不同（`aiwork` vs `aiwork-hot`）
- ✅ 端口可独立配置（`AIWORK_PORT` vs `AIWORK_HOT_PORT`）
- ⚠️ **工作目录与备份卷共享**：`~/.aiwork`、`~/.aiwork.secret`、命名卷 `aiwork-backups` 三者一致，**禁止同时启动**两边容器，否则会并发写入相同数据库/文件，造成数据损坏。

---

## 六、运维管理

### 容器操作

```bash
# 查看容器状态
docker ps | grep aiwork-hot

# 查看应用日志
docker logs -f aiwork-hot

# 进入容器
docker exec -it aiwork-hot bash

# 查看 supervisor 状态
docker exec aiwork-hot supervisorctl status

# 手动重启 app（与 deploy_backend.sh 等价）
docker exec aiwork-hot supervisorctl restart app

# 停止服务
docker compose -f deploy_hot/docker-compose.yml down
```

### 数据持久化

热部署版本与原版**共享同一份持久化数据**，挂载策略与原 `docker-compose.yml` 保持一致：

| 宿主机路径 / 命名卷 | 容器内路径 | 用途 |
|---|---|---|
| `~/.aiwork` (bind mount) | `/app/working` | 配置、状态、SQLite 等运行时数据 |
| `~/.aiwork.secret` (bind mount) | `/app/working.secret` | 密钥与敏感信息 |
| 命名卷 `aiwork-backups` | `/app/working.backups` | 备份文件 |

这意味着：
- 首次切换到热部署时**不会**重新初始化数据库，会直接复用原版的用户/数据/备份。
- 两种部署方式可以无缝切换，但**不能同时运行**两套容器（详见上节）。
- 如果之前在 deploy_hot 用过隔离卷 `aiwork-hot-data`/`aiwork-hot-secrets`/`aiwork-hot-backups`，旧数据仍保留在这些命名卷中，可在确认无需迁移后通过 `docker volume rm` 清理。

---

## 七、故障排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 后端代码改动不生效 | bind mount 路径错误 | 检查 `docker-compose.yml` 中 `../src:/app/src:ro` |
| 前端 404 / 旧版本 | 浏览器缓存 | 强制刷新 `Ctrl+Shift+R` |
| 容器启动失败：mount path 错误 | `console-dist/` 不存在 | 先运行 `deploy.sh` 或 `deploy_frontend.sh` |
| editable 安装失败 | `egg-info` 异常 | 重建镜像 `bash deploy_hot/deploy.sh` |
| 修改了 pyproject 不生效 | 依赖未更新 | 必须 `bash deploy_hot/deploy.sh` 重建镜像 |
| 端口冲突 | 与原版同时启动同端口 | 设置 `AIWORK_HOT_PORT=8089` |

### 验证 editable 安装

```bash
docker exec aiwork-hot pip show aiwork | grep Location
# 应输出：Location: /app/src （而非 /app/venv/lib/...）

docker exec aiwork-hot cat /app/venv/lib/python3.10/site-packages/aiwork.egg-link
# 应输出：/app
```

### 验证源码挂载

```bash
# 在宿主机修改一个 .py 文件，然后在容器内查看
docker exec aiwork-hot head /app/src/aiwork/__version__.py
```

---

## 八、TL;DR

```bash
# === 首次部署 ===
bash deploy_hot/deploy.sh

# === 日常更新 ===
bash deploy_hot/deploy_backend.sh    # 仅后端 (10-30秒)
bash deploy_hot/deploy_frontend.sh   # 仅前端 (1-2分钟)
bash deploy_hot/deploy.sh            # 完整重建 (依赖变更时)

# === 容器管理 ===
docker logs -f aiwork-hot
docker compose -f deploy_hot/docker-compose.yml down
```
