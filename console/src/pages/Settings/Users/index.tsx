import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Button,
  Table,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Popconfirm,
  message as antdMessage,
  Avatar,
  Badge,
  Tooltip,
  Empty,
  Alert,
  Spin,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  ImportOutlined,
  ReloadOutlined,
  SearchOutlined,
  DeleteOutlined,
  KeyOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import { useTheme } from "../../../contexts/ThemeContext";
import { usersApi } from "../../../api/modules/users";
import { jwtRolesApi } from "../../../api/modules/jwtRoles";
import type { JwtUserOut, JwtRoleOut } from "../../../api/types/user";
import styles from "./index.module.less";

const ROLE_TAG_COLORS: Record<string, string> = {
  admin: "red",
  user: "blue",
  guest: "default",
};

function roleTagColor(role: string): string {
  return ROLE_TAG_COLORS[role] ?? "purple";
}

function avatarColor(name: string): string {
  const colors = ["#06b6d4", "#4ade80", "#f59e0b", "#a78bfa", "#f97316", "#ef4444"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const PAGE_SIZE = 10;

export default function UsersPage() {
  const { isDark } = useTheme();

  const [users, setUsers] = useState<JwtUserOut[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [roles, setRoles] = useState<JwtRoleOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();

  const [resetOpen, setResetOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetUser, setResetUser] = useState<JwtUserOut | null>(null);
  const [resetForm] = Form.useForm();

  const [rolesOpen, setRolesOpen] = useState(false);
  const [rolesSaving, setRolesSaving] = useState(false);
  const [rolesUser, setRolesUser] = useState<JwtUserOut | null>(null);
  const [rolesForm] = Form.useForm();

  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchUsers = useCallback(
    async (
      targetPage = page,
      username = search,
      role = roleFilter,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const res = await usersApi.listUsers({
          page: targetPage,
          page_size: PAGE_SIZE,
          username: username || undefined,
          role: role || undefined,
        });
        setForbidden(false);
        setUsers(res.items);
        setTotal(res.total);
        setTotalPages(res.total_pages);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Admin access required") || msg.includes("403")) {
          setForbidden(true);
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [page, search, roleFilter],
  );

  const fetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const list = await jwtRolesApi.listRoles();
      setRoles(list);
    } catch {
      /* roles optional for display */
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(page, search, roleFilter);
  }, [page, roleFilter]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      setSelectedRowKeys([]);
      fetchUsers(1, value, roleFilter);
    }, 400);
  };

  const handleRoleFilterChange = (value: string | undefined) => {
    setRoleFilter(value);
    setPage(1);
    setSelectedRowKeys([]);
    fetchUsers(1, search, value);
  };

  const handleCreate = async () => {
    try {
      const vals = await createForm.validateFields();
      setCreateLoading(true);
      await usersApi.createUser({
        username: vals.username,
        password: vals.password,
        role_names: vals.role_names ?? ["user"],
      });
      antdMessage.success("用户创建成功");
      setCreateOpen(false);
      createForm.resetFields();
      setPage(1);
      fetchUsers(1, search, roleFilter);
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      antdMessage.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (userId: number) => {
    try {
      await usersApi.deleteUser(userId);
      antdMessage.success("用户已删除");
      setSelectedRowKeys((keys) => keys.filter((k) => k !== userId));
      fetchUsers(page, search, roleFilter);
    } catch (err) {
      antdMessage.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleBatchDelete = () => {
    if (!selectedRowKeys.length) return;
    Modal.confirm({
      title: `确认删除 ${selectedRowKeys.length} 个用户？`,
      content: "此操作不可撤销。",
      okText: "确认删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await usersApi.batchDeleteUsers(selectedRowKeys as number[]);
          antdMessage.success(`已删除 ${selectedRowKeys.length} 个用户`);
          setSelectedRowKeys([]);
          setPage(1);
          fetchUsers(1, search, roleFilter);
        } catch (err) {
          antdMessage.error(err instanceof Error ? err.message : "批量删除失败");
        }
      },
    });
  };

  const openResetModal = (user: JwtUserOut) => {
    setResetUser(user);
    resetForm.resetFields();
    setResetOpen(true);
  };

  const handleResetPassword = async () => {
    try {
      const vals = await resetForm.validateFields();
      if (!resetUser) return;
      setResetLoading(true);
      await usersApi.resetPassword(resetUser.id, vals.new_password);
      antdMessage.success(`用户 ${resetUser.username} 密码已重置`);
      setResetOpen(false);
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      antdMessage.error(err instanceof Error ? err.message : "重置失败");
    } finally {
      setResetLoading(false);
    }
  };

  const openRolesModal = (user: JwtUserOut) => {
    setRolesUser(user);
    const roleIds = roles
      .filter((r) => user.roles.includes(r.name))
      .map((r) => r.id);
    rolesForm.setFieldsValue({ role_ids: roleIds });
    setRolesOpen(true);
  };

  const handleAssignRoles = async () => {
    try {
      const vals = await rolesForm.validateFields();
      if (!rolesUser) return;
      setRolesSaving(true);
      await usersApi.assignRoles(rolesUser.id, vals.role_ids ?? []);
      antdMessage.success("角色已更新");
      setRolesOpen(false);
      fetchUsers(page, search, roleFilter);
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      antdMessage.error(err instanceof Error ? err.message : "角色更新失败");
    } finally {
      setRolesSaving(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportResult(null);
    setImportOpen(true);
    setImportLoading(true);
    try {
      const result = await usersApi.importUsers(file);
      setImportResult(result);
      if (result.created > 0) {
        setPage(1);
        fetchUsers(1, search, roleFilter);
      }
    } catch (err) {
      antdMessage.error(err instanceof Error ? err.message : "导入失败");
      setImportOpen(false);
    } finally {
      setImportLoading(false);
    }
  };

  const columns: ColumnsType<JwtUserOut> = [
    {
      title: "用户名",
      key: "username",
      render: (_, r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar
            style={{ background: avatarColor(r.username), flexShrink: 0, fontWeight: 700 }}
            size={34}
          >
            {r.username.slice(0, 1).toUpperCase()}
          </Avatar>
          <span
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: isDark ? "#e2e8f0" : "#0f172a",
            }}
          >
            @{r.username}
          </span>
        </div>
      ),
    },
    {
      title: "角色",
      key: "roles",
      render: (_, r) =>
        r.roles.length ? (
          <Space size={4} wrap>
            {r.roles.map((role) => (
              <Tag key={role} color={roleTagColor(role)} style={{ margin: 0 }}>
                {role}
              </Tag>
            ))}
          </Space>
        ) : (
          <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
        ),
    },
    {
      title: "状态",
      key: "is_active",
      width: 80,
      render: (_, r) => (
        <Badge
          status={r.is_active ? "success" : "default"}
          text={
            <span
              style={{
                fontSize: 12,
                color: r.is_active ? "#4ade80" : "#64748b",
              }}
            >
              {r.is_active ? "启用" : "停用"}
            </span>
          }
        />
      ),
    },
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 60,
      render: (id) => (
        <span style={{ color: "#64748b", fontSize: 12 }}>{id}</span>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      fixed: "right",
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="修改角色">
            <Button
              size="small"
              type="text"
              icon={<UserSwitchOutlined />}
              onClick={() => openRolesModal(r)}
            />
          </Tooltip>
          <Tooltip title="重置密码">
            <Button
              size="small"
              type="text"
              icon={<KeyOutlined />}
              onClick={() => openResetModal(r)}
            />
          </Tooltip>
          <Popconfirm
            title={`确认删除用户 "${r.username}"？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(r.id)}
          >
            <Tooltip title="删除">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (forbidden) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          gap: 16,
          color: isDark ? "#94a3b8" : "#64748b",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <i
            className="ri-lock-line"
            style={{ fontSize: 28, color: isDark ? "#64748b" : "#94a3b8" }}
          />
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: isDark ? "#cbd5e1" : "#334155",
              marginBottom: 6,
            }}
          >
            权限不足
          </div>
          <div style={{ fontSize: 13 }}>
            当前账号没有访问用户管理的权限，请使用管理员账号登录后再试。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>用户管理</h2>
          <p className={styles.subtitle}>
            管理系统登录账号、角色与权限 · 共{" "}
            <b style={{ color: isDark ? "#93c5fd" : "#3b82f6" }}>{total}</b> 名用户
          </p>
        </div>
        <Space>
          <Tooltip title="导入 Excel（列：username, password, role）">
            <Button
              icon={<ImportOutlined />}
              onClick={() => fileInputRef.current?.click()}
            >
              导入 Excel
            </Button>
          </Tooltip>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchUsers(page, search, roleFilter)}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields();
              createForm.setFieldsValue({ role_names: ["user"] });
              setCreateOpen(true);
            }}
          >
            添加用户
          </Button>
        </Space>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />

      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError(null)}
          action={
            <Button size="small" onClick={() => fetchUsers(page, search, roleFilter)}>
              重试
            </Button>
          }
        />
      )}

      <div className={styles.toolbar}>
        <Space>
          <Input
            prefix={<SearchOutlined style={{ color: isDark ? "#64748b" : "#94a3b8" }} />}
            placeholder="搜索用户名..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            allowClear
            onClear={() => handleSearchChange("")}
            style={{ width: 240, borderRadius: 8 }}
          />
          <Select
            placeholder="按角色筛选"
            allowClear
            loading={rolesLoading}
            value={roleFilter}
            onChange={handleRoleFilterChange}
            style={{ width: 160 }}
            options={roles.map((r) => ({
              value: r.name,
              label: (
                <Space size={4}>
                  <Tag color={roleTagColor(r.name)} style={{ margin: 0 }}>
                    {r.name}
                  </Tag>
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>
                    ({r.user_count})
                  </span>
                </Space>
              ),
            }))}
          />
        </Space>
        {selectedRowKeys.length > 0 && (
          <Space>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>
              已选 <b style={{ color: isDark ? "#f1f5f9" : "#0f172a" }}>{selectedRowKeys.length}</b> 项
            </span>
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={handleBatchDelete}
            >
              批量删除
            </Button>
          </Space>
        )}
      </div>

      <div className={styles.tableWrap}>
        <Spin spinning={loading}>
          <Table<JwtUserOut>
            columns={columns}
            dataSource={users}
            rowKey="id"
            scroll={{ x: 700 }}
            size="middle"
            locale={{ emptyText: <Empty description="暂无用户" /> }}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showTotal: (t) => `共 ${t} 条，第 ${page}/${totalPages || 1} 页`,
              onChange: (p) => {
                setPage(p);
                setSelectedRowKeys([]);
              },
              showSizeChanger: false,
            }}
          />
        </Spin>
      </div>

      <Modal
        open={createOpen}
        title="添加用户"
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={createLoading}
        okText="创建"
        cancelText="取消"
        destroyOnHidden
        width={440}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: "请填写用户名" },
              { min: 2, max: 64, message: "用户名 2-64 个字符" },
            ]}
          >
            <Input placeholder="请输入用户名" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: "请填写密码" },
              { min: 6, message: "密码至少 6 位" },
            ]}
          >
            <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role_names" label="角色">
            <Select
              mode="multiple"
              placeholder="选择角色（默认 user）"
              loading={rolesLoading}
              options={roles.map((r) => ({
                value: r.name,
                label: (
                  <Space size={4}>
                    <Tag color={roleTagColor(r.name)} style={{ margin: 0 }}>
                      {r.name}
                    </Tag>
                    {r.description && (
                      <span style={{ color: "#94a3b8", fontSize: 11 }}>
                        {r.description}
                      </span>
                    )}
                  </Space>
                ),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={resetOpen}
        title={`重置密码 · @${resetUser?.username ?? ""}`}
        onOk={handleResetPassword}
        onCancel={() => setResetOpen(false)}
        confirmLoading={resetLoading}
        okText="确认重置"
        cancelText="取消"
        destroyOnHidden
        width={400}
      >
        <Form form={resetForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: "请填写新密码" },
              { min: 6, message: "密码至少 6 位" },
            ]}
          >
            <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认密码"
            dependencies={["new_password"]}
            rules={[
              { required: true, message: "请再次输入密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("new_password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("两次密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={rolesOpen}
        title={`修改角色 · @${rolesUser?.username ?? ""}`}
        onOk={handleAssignRoles}
        onCancel={() => setRolesOpen(false)}
        confirmLoading={rolesSaving}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        width={440}
      >
        <Form form={rolesForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="role_ids" label="分配角色">
            <Select
              mode="multiple"
              placeholder="选择角色"
              loading={rolesLoading}
              options={roles.map((r) => ({
                value: r.id,
                label: (
                  <Space size={4}>
                    <Tag color={roleTagColor(r.name)} style={{ margin: 0 }}>
                      {r.name}
                    </Tag>
                    <span style={{ color: "#94a3b8", fontSize: 11 }}>
                      {r.description} · {r.user_count} 人
                    </span>
                  </Space>
                ),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={importOpen}
        title="Excel 导入结果"
        onOk={() => setImportOpen(false)}
        onCancel={() => setImportOpen(false)}
        okText="确认"
        cancelButtonProps={{ style: { display: "none" } }}
        destroyOnHidden
        width={480}
      >
        {importLoading ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <Spin tip="正在导入..." />
          </div>
        ) : importResult ? (
          <div style={{ marginTop: 8 }}>
            <Alert
              type={importResult.errors.length === 0 ? "success" : "warning"}
              message={`成功创建 ${importResult.created} 个用户${
                importResult.errors.length
                  ? `，${importResult.errors.length} 条失败`
                  : ""
              }`}
              style={{ marginBottom: 12 }}
            />
            {importResult.errors.length > 0 && (
              <div
                style={{
                  maxHeight: 200,
                  overflowY: "auto",
                  fontSize: 12,
                  color: "#ef4444",
                  background: isDark ? "rgba(255,0,0,0.05)" : "#fef2f2",
                  padding: "10px 14px",
                  borderRadius: 8,
                }}
              >
                {importResult.errors.map((msg, i) => (
                  <div key={i}>{msg}</div>
                ))}
              </div>
            )}
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: "#94a3b8",
                background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc",
                padding: "10px 14px",
                borderRadius: 8,
              }}
            >
              <b>Excel 格式要求：</b>首行为表头，列：
              <code>username</code>、<code>password</code>、<code>role</code>
              （可选，逗号分隔多角色，默认 user）
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
