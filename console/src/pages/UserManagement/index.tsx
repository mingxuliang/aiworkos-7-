import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Tag,
  Button,
  Popconfirm,
  Modal,
  Select,
  Space,
  Input,
  Form,
  Upload,
  message as antdMessage,
} from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { jwtAuthApi } from "../../api/modules/auth";
import type {
  JWTUserOut,
  JWTRoleOut,
  PaginatedUserResponse,
} from "../../api/modules/auth";
import { useAuthStore } from "../../stores/authStore";
import { PageHeader } from "../../components/PageHeader";
import {
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  KeyOutlined,
  UserSwitchOutlined,
  SearchOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import styles from "./index.module.less";

const DEFAULT_PAGE_SIZE = 10;

export default function UserManagementPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user: authUser } = useAuthStore();
  const [apiMessage, contextHolder] = antdMessage.useMessage();

  // Data state
  const [users, setUsers] = useState<JWTUserOut[]>([]);
  const [roles, setRoles] = useState<JWTRoleOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Search state
  const [searchUsername, setSearchUsername] = useState("");
  const [filterRole, setFilterRole] = useState<string | undefined>(undefined);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm] = Form.useForm();

  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<JWTUserOut | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const [resetPwdModalOpen, setResetPwdModalOpen] = useState(false);
  const [resetPwdUser, setResetPwdUser] = useState<JWTUserOut | null>(null);
  const [resetPwdLoading, setResetPwdLoading] = useState(false);
  const [resetPwdForm] = Form.useForm();

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  // Admin check
  const isAdmin = authUser?.roles?.includes("admin") ?? false;

  // Fetch data
  const fetchData = useCallback(
    async (page = currentPage, size = pageSize) => {
      try {
        setLoading(true);
        const res: PaginatedUserResponse =
          await jwtAuthApi.listUsersPaginated({
            page,
            page_size: size,
            username: searchUsername || undefined,
            role: filterRole || undefined,
          });
        setUsers(res.items);
        setTotal(res.total);

        // Also refresh roles
        const rolesData = await jwtAuthApi.listRoles();
        setRoles(rolesData);
      } catch {
        apiMessage.error(t("userManagementPage.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [currentPage, pageSize, searchUsername, filterRole, t, apiMessage],
  );

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin, fetchData]);

  // Search handler
  const handleSearch = useCallback(() => {
    setCurrentPage(1);
    fetchData(1, pageSize);
  }, [pageSize, fetchData]);

  const handleReset = useCallback(() => {
    setSearchUsername("");
    setFilterRole(undefined);
    setCurrentPage(1);
    // Need to fetch with cleared filters
    const doReset = async () => {
      try {
        setLoading(true);
        const res = await jwtAuthApi.listUsersPaginated({
          page: 1,
          page_size: pageSize,
        });
        setUsers(res.items);
        setTotal(res.total);
      } catch {
        apiMessage.error(t("userManagementPage.loadFailed"));
      } finally {
        setLoading(false);
      }
    };
    doReset();
  }, [pageSize, t, apiMessage]);

  // Pagination handler
  const handlePageChange = useCallback(
    (page: number, size: number) => {
      setCurrentPage(page);
      setPageSize(size);
      fetchData(page, size);
    },
    [fetchData],
  );

  // Add user
  const handleAddUser = useCallback(async () => {
    try {
      const values = await addForm.validateFields();
      setAddLoading(true);
      await jwtAuthApi.createUser({
        username: values.username,
        password: values.password,
        role_names: values.role_names || ["user"],
      });
      apiMessage.success(t("userManagementPage.addUserSuccess"));
      setAddModalOpen(false);
      addForm.resetFields();
      fetchData(currentPage, pageSize);
    } catch (err: unknown) {
      if (err instanceof Error && err.message) {
        apiMessage.error(err.message);
      } else {
        apiMessage.error(t("userManagementPage.addUserFailed"));
      }
    } finally {
      setAddLoading(false);
    }
  }, [addForm, currentPage, pageSize, fetchData, t, apiMessage]);

  // Delete single user
  const handleDeleteUser = useCallback(
    async (userId: number) => {
      try {
        await jwtAuthApi.deleteUser(userId);
        apiMessage.success(t("userManagementPage.deleteSuccess"));
        setSelectedRowKeys((prev) => prev.filter((k) => k !== userId));
        fetchData(currentPage, pageSize);
      } catch {
        apiMessage.error(t("userManagementPage.deleteFailed"));
      }
    },
    [currentPage, pageSize, fetchData, t, apiMessage],
  );

  // Batch delete
  const handleBatchDelete = useCallback(async () => {
    try {
      await jwtAuthApi.batchDeleteUsers(selectedRowKeys as number[]);
      apiMessage.success(
        t("userManagementPage.batchDeleteSuccess", {
          count: selectedRowKeys.length,
        }),
      );
      setSelectedRowKeys([]);
      fetchData(currentPage, pageSize);
    } catch {
      apiMessage.error(t("userManagementPage.batchDeleteFailed"));
    }
  }, [selectedRowKeys, currentPage, pageSize, fetchData, t, apiMessage]);

  // Assign roles
  const openRolesModal = useCallback(
    (user: JWTUserOut) => {
      setEditingUser(user);
      setSelectedRoleIds(
        roles.filter((r) => user.roles.includes(r.name)).map((r) => r.id),
      );
      setRolesModalOpen(true);
    },
    [roles],
  );

  const handleAssignRoles = useCallback(async () => {
    if (!editingUser) return;
    try {
      setSavingRoles(true);
      await jwtAuthApi.assignRoles(editingUser.id, selectedRoleIds);
      apiMessage.success(t("userManagementPage.assignRolesSuccess"));
      setRolesModalOpen(false);
      setEditingUser(null);
      fetchData(currentPage, pageSize);
    } catch {
      apiMessage.error(t("userManagementPage.assignRolesFailed"));
    } finally {
      setSavingRoles(false);
    }
  }, [editingUser, selectedRoleIds, currentPage, pageSize, fetchData, t, apiMessage]);

  // Reset password
  const openResetPwdModal = useCallback((user: JWTUserOut) => {
    setResetPwdUser(user);
    resetPwdForm.resetFields();
    setResetPwdModalOpen(true);
  }, [resetPwdForm]);

  const handleResetPassword = useCallback(async () => {
    if (!resetPwdUser) return;
    try {
      const values = await resetPwdForm.validateFields();
      if (values.new_password !== values.confirm_password) {
        apiMessage.error(t("userManagementPage.passwordMismatch"));
        return;
      }
      setResetPwdLoading(true);
      await jwtAuthApi.resetUserPassword(resetPwdUser.id, values.new_password);
      apiMessage.success(t("userManagementPage.resetPasswordSuccess"));
      setResetPwdModalOpen(false);
      setResetPwdUser(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.message) {
        apiMessage.error(err.message);
      } else {
        apiMessage.error(t("userManagementPage.resetPasswordFailed"));
      }
    } finally {
      setResetPwdLoading(false);
    }
  }, [resetPwdUser, resetPwdForm, t, apiMessage]);

  // Import
  const handleImport = useCallback(async () => {
    if (!importFile) return;
    try {
      setImportLoading(true);
      const result = await jwtAuthApi.importUsers(importFile);
      if (result.errors.length > 0) {
        apiMessage.warning(
          t("userManagementPage.importResultWithErrors", {
            created: result.created,
            errorCount: result.errors.length,
          }),
        );
      } else {
        apiMessage.success(
          t("userManagementPage.importResult", { created: result.created }),
        );
      }
      setImportModalOpen(false);
      setImportFile(null);
      fetchData(currentPage, pageSize);
    } catch (err: unknown) {
      if (err instanceof Error && err.message) {
        apiMessage.error(err.message);
      } else {
        apiMessage.error(t("userManagementPage.importFailed"));
      }
    } finally {
      setImportLoading(false);
    }
  }, [importFile, currentPage, pageSize, fetchData, t, apiMessage]);

  // Table columns
  const columns = [
    {
      title: t("userManagementPage.username"),
      dataIndex: "username",
      key: "username",
    },
    {
      title: t("userManagementPage.roles"),
      dataIndex: "roles",
      key: "roles",
      render: (roles: string[]) => (
        <Space>
          {roles.map((role) => (
            <Tag
              key={role}
              color={role === "admin" ? "red" : role === "user" ? "blue" : "default"}
            >
              {role}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: t("userManagementPage.actions"),
      key: "actions",
      width: 240,
      render: (_: unknown, record: JWTUserOut) => (
        <Space>
          <Button
            type="text"
            icon={<UserSwitchOutlined />}
            size="small"
            onClick={() => openRolesModal(record)}
          >
            {t("userManagementPage.assignRoles")}
          </Button>
          <Button
            type="text"
            icon={<KeyOutlined />}
            size="small"
            onClick={() => openResetPwdModal(record)}
          >
            {t("userManagementPage.resetPassword")}
          </Button>
          <Popconfirm
            title={t("userManagementPage.deleteConfirm", {
              username: record.username,
            })}
            onConfirm={() => handleDeleteUser(record.id)}
            okText={t("common.delete")}
            cancelText={t("common.cancel")}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              {t("userManagementPage.deleteUser")}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Row selection
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  // Not admin
  if (!isAdmin) {
    return (
      <div className={styles.userManagementPage}>
        <div className={styles.forbiddenState}>
          <span className={styles.forbiddenText}>
            {t("common.forbidden", "Access denied. Admin role required.")}
          </span>
          <Button onClick={() => navigate("/chat")}>
            {t("common.back", "Go Back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.userManagementPage}>
      {contextHolder}
      <PageHeader
        parent={t("nav.settings")}
        current={t("userManagementPage.title")}
      />

      <div className={styles.content}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBar}>
            <Input
              placeholder={t("userManagementPage.searchUsername")}
              value={searchUsername}
              onChange={(e) => setSearchUsername(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder={t("userManagementPage.filterRole")}
              value={filterRole}
              onChange={setFilterRole}
              style={{ width: 140 }}
              allowClear
              options={roles.map((r) => ({ label: r.name, value: r.name }))}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
            >
              {t("userManagementPage.search")}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              {t("userManagementPage.reset")}
            </Button>
          </div>
          <div className={styles.actionBar}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                addForm.resetFields();
                setAddModalOpen(true);
              }}
            >
              {t("userManagementPage.addUser")}
            </Button>
            <Button
              icon={<UploadOutlined />}
              onClick={() => {
                setImportFile(null);
                setImportModalOpen(true);
              }}
            >
              {t("userManagementPage.batchImport")}
            </Button>
            <Popconfirm
              title={t("userManagementPage.batchDeleteConfirm", {
                count: selectedRowKeys.length,
              })}
              onConfirm={handleBatchDelete}
              okText={t("common.delete")}
              cancelText={t("common.cancel")}
              disabled={selectedRowKeys.length === 0}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={selectedRowKeys.length === 0}
              >
                {t("userManagementPage.batchDelete")}
                {selectedRowKeys.length > 0 && (
                  <span className={styles.selectedInfo}>
                    ({selectedRowKeys.length})
                  </span>
                )}
              </Button>
            </Popconfirm>
          </div>
        </div>

        {/* Table */}
        <Card className={styles.tableCard}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={users}
            loading={loading}
            rowSelection={rowSelection}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: total,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ["10", "20", "50", "100"],
              onChange: handlePageChange,
              showTotal: (total) =>
                t("userManagementPage.totalUsers", { total }),
            }}
            size="middle"
            locale={{
              emptyText: t("userManagementPage.noUsers"),
            }}
          />
        </Card>

        {/* Selected info */}
        {selectedRowKeys.length > 0 && (
          <div className={styles.paginationBar}>
            <span className={styles.selectedInfo}>
              {t("userManagementPage.selectedCount", {
                count: selectedRowKeys.length,
              })}
            </span>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <Modal
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        title={t("userManagementPage.addUser")}
        onOk={handleAddUser}
        confirmLoading={addLoading}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        destroyOnClose
        centered
      >
        <Form form={addForm} layout="vertical">
          <Form.Item
            name="username"
            label={t("userManagementPage.username")}
            rules={[
              { required: true, message: t("userManagementPage.usernamePlaceholder") },
              { min: 2, max: 64, message: "2-64 characters" },
            ]}
          >
            <Input placeholder={t("userManagementPage.usernamePlaceholder")} />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("userManagementPage.password")}
            rules={[
              { required: true, message: t("userManagementPage.passwordPlaceholder") },
              { min: 6, message: "At least 6 characters" },
            ]}
          >
            <Input.Password placeholder={t("userManagementPage.passwordPlaceholder")} />
          </Form.Item>
          <Form.Item
            name="role_names"
            label={t("userManagementPage.roles")}
            initialValue={["user"]}
          >
            <Select
              mode="multiple"
              style={{ width: "100%" }}
              options={roles.map((r) => ({ label: r.name, value: r.name }))}
              placeholder={t("userManagementPage.rolePlaceholder")}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Assign Roles Modal */}
      <Modal
        open={rolesModalOpen}
        onCancel={() => {
          setRolesModalOpen(false);
          setEditingUser(null);
        }}
        title={`${t("userManagementPage.assignRoles")} - ${editingUser?.username}`}
        onOk={handleAssignRoles}
        confirmLoading={savingRoles}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        destroyOnClose
        centered
      >
        <Select
          mode="multiple"
          style={{ width: "100%" }}
          value={selectedRoleIds}
          onChange={setSelectedRoleIds}
          options={roles.map((r) => ({ label: r.name, value: r.id }))}
          placeholder={t("userManagementPage.rolePlaceholder")}
        />
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={resetPwdModalOpen}
        onCancel={() => {
          setResetPwdModalOpen(false);
          setResetPwdUser(null);
        }}
        title={`${t("userManagementPage.resetPassword")} - ${resetPwdUser?.username}`}
        onOk={handleResetPassword}
        confirmLoading={resetPwdLoading}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        destroyOnClose
        centered
      >
        <Form form={resetPwdForm} layout="vertical">
          <Form.Item
            name="new_password"
            label={t("userManagementPage.newPassword")}
            rules={[
              { required: true, message: t("userManagementPage.newPasswordPlaceholder") },
              { min: 6, message: "At least 6 characters" },
            ]}
          >
            <Input.Password placeholder={t("userManagementPage.newPasswordPlaceholder")} />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label={t("userManagementPage.confirmPassword")}
            dependencies={["new_password"]}
            rules={[
              { required: true, message: t("userManagementPage.confirmPasswordPlaceholder") },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (value && value !== getFieldValue("new_password")) {
                    return Promise.reject(
                      new Error(t("userManagementPage.passwordMismatch")),
                    );
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <Input.Password placeholder={t("userManagementPage.confirmPasswordPlaceholder")} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Import Modal */}
      <Modal
        open={importModalOpen}
        onCancel={() => {
          setImportModalOpen(false);
          setImportFile(null);
        }}
        title={t("userManagementPage.importTitle")}
        onOk={handleImport}
        confirmLoading={importLoading}
        okText={t("userManagementPage.batchImport")}
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: !importFile }}
        destroyOnClose
        centered
      >
        <Upload
          beforeUpload={(file) => {
            setImportFile(file);
            return false; // Prevent auto upload
          }}
          onRemove={() => setImportFile(null)}
          maxCount={1}
          accept=".xlsx,.xls"
          fileList={importFile ? [importFile as any] : []}
        >
          <Button icon={<UploadOutlined />}>
            {t("userManagementPage.importDragHint")}
          </Button>
        </Upload>
        <p style={{ marginTop: 12, color: "#999", fontSize: 13 }}>
          {t("userManagementPage.importFormatHint")}
        </p>
      </Modal>
    </div>
  );
}
