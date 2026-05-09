import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Tag,
  Button,
  Popconfirm,
  Modal,
  Space,
  Input,
  Form,
  Tooltip,
  message as antdMessage,
} from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { jwtAuthApi } from "../../api/modules/auth";
import type { JWTRoleOut } from "../../api/modules/auth";
import { useAuthStore } from "../../stores/authStore";
import { PageHeader } from "../../components/PageHeader";
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons";
import styles from "./index.module.less";

export default function RoleManagementPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user: authUser } = useAuthStore();
  const [apiMessage, contextHolder] = antdMessage.useMessage();

  // Data state
  const [roles, setRoles] = useState<JWTRoleOut[]>([]);
  const [loading, setLoading] = useState(true);

  // Add modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm] = Form.useForm();

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm] = Form.useForm();
  const [editingRole, setEditingRole] = useState<JWTRoleOut | null>(null);

  // Admin check
  const isAdmin = authUser?.roles?.includes("admin") ?? false;

  // Fetch roles
  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await jwtAuthApi.listRoles();
      setRoles(data);
    } catch {
      apiMessage.error(t("roleManagementPage.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, apiMessage]);

  useEffect(() => {
    if (isAdmin) {
      fetchRoles();
    }
  }, [isAdmin, fetchRoles]);

  // Add role
  const handleAddRole = useCallback(async () => {
    try {
      const values = await addForm.validateFields();
      setAddLoading(true);
      await jwtAuthApi.createRole(values.name, values.description || "");
      apiMessage.success(t("roleManagementPage.createSuccess"));
      setAddModalOpen(false);
      addForm.resetFields();
      fetchRoles();
    } catch (err: unknown) {
      if (err instanceof Error && err.message) {
        apiMessage.error(err.message);
      } else {
        apiMessage.error(t("roleManagementPage.createFailed"));
      }
    } finally {
      setAddLoading(false);
    }
  }, [addForm, fetchRoles, t, apiMessage]);

  // Open edit modal
  const openEditModal = useCallback(
    (role: JWTRoleOut) => {
      setEditingRole(role);
      editForm.setFieldsValue({
        name: role.name,
        description: role.description,
      });
      setEditModalOpen(true);
    },
    [editForm],
  );

  // Edit role
  const handleEditRole = useCallback(async () => {
    if (!editingRole) return;
    try {
      const values = await editForm.validateFields();
      setEditLoading(true);
      const data: { name?: string; description?: string } = {};
      if (values.name && values.name !== editingRole.name) {
        data.name = values.name;
      }
      if (values.description !== undefined && values.description !== editingRole.description) {
        data.description = values.description;
      }
      if (Object.keys(data).length === 0) {
        setEditModalOpen(false);
        return;
      }
      await jwtAuthApi.updateRole(editingRole.id, data);
      apiMessage.success(t("roleManagementPage.updateSuccess"));
      setEditModalOpen(false);
      setEditingRole(null);
      fetchRoles();
    } catch (err: unknown) {
      if (err instanceof Error && err.message) {
        apiMessage.error(err.message);
      } else {
        apiMessage.error(t("roleManagementPage.updateFailed"));
      }
    } finally {
      setEditLoading(false);
    }
  }, [editingRole, editForm, fetchRoles, t, apiMessage]);

  // Delete role
  const handleDeleteRole = useCallback(
    async (roleId: number) => {
      try {
        await jwtAuthApi.deleteRole(roleId);
        apiMessage.success(t("roleManagementPage.deleteSuccess"));
        fetchRoles();
      } catch (err: unknown) {
        if (err instanceof Error && err.message) {
          apiMessage.error(err.message);
        } else {
          apiMessage.error(t("roleManagementPage.deleteFailed"));
        }
      }
    },
    [fetchRoles, t, apiMessage],
  );

  // Table columns
  const columns = [
    {
      title: t("roleManagementPage.roleName"),
      dataIndex: "name",
      key: "name",
      render: (name: string) => (
        <Tag
          color={
            name === "admin"
              ? "red"
              : name === "user"
                ? "blue"
                : name === "guest"
                  ? "default"
                  : "green"
          }
        >
          {name}
        </Tag>
      ),
    },
    {
      title: t("roleManagementPage.description"),
      dataIndex: "description",
      key: "description",
      ellipsis: true,
    },
    {
      title: t("roleManagementPage.permissions"),
      dataIndex: "permissions",
      key: "permissions",
      width: 320,
      render: (permissions: string[]) => (
        <div className={styles.permissionTags}>
          {permissions.length > 0 ? (
            permissions.map((perm) => (
              <Tag key={perm} style={{ fontSize: 11 }}>
                {perm}
              </Tag>
            ))
          ) : (
            <span style={{ color: "#999" }}>-</span>
          )}
        </div>
      ),
    },
    {
      title: t("roleManagementPage.userCount"),
      dataIndex: "user_count",
      key: "user_count",
      width: 120,
      align: "center" as const,
      render: (count: number) => <span>{count}</span>,
    },
    {
      title: t("roleManagementPage.actions"),
      key: "actions",
      width: 160,
      render: (_: unknown, record: JWTRoleOut) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            size="small"
            onClick={() => openEditModal(record)}
          >
            {t("roleManagementPage.editRole")}
          </Button>
          {record.user_count > 0 ? (
            <Tooltip title={t("roleManagementPage.deleteHasUsers")}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
                disabled
              >
                {t("roleManagementPage.deleteRole")}
              </Button>
            </Tooltip>
          ) : (
            <Popconfirm
              title={t("roleManagementPage.deleteConfirm", {
                name: record.name,
              })}
              onConfirm={() => handleDeleteRole(record.id)}
              okText={t("common.delete")}
              cancelText={t("common.cancel")}
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
              >
                {t("roleManagementPage.deleteRole")}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // Not admin
  if (!isAdmin) {
    return (
      <div className={styles.roleManagementPage}>
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
    <div className={styles.roleManagementPage}>
      {contextHolder}
      <PageHeader
        parent={t("nav.settings")}
        current={t("roleManagementPage.title")}
      />

      <div className={styles.content}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div />
          <div className={styles.actionBar}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                addForm.resetFields();
                setAddModalOpen(true);
              }}
            >
              {t("roleManagementPage.addRole")}
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card className={styles.tableCard}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={roles}
            loading={loading}
            pagination={false}
            size="middle"
            locale={{
              emptyText: t("roleManagementPage.noRoles"),
            }}
          />
        </Card>
      </div>

      {/* Add Role Modal */}
      <Modal
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        title={t("roleManagementPage.addRole")}
        onOk={handleAddRole}
        confirmLoading={addLoading}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        destroyOnClose
        centered
      >
        <Form form={addForm} layout="vertical">
          <Form.Item
            name="name"
            label={t("roleManagementPage.roleName")}
            rules={[
              {
                required: true,
                message: t("roleManagementPage.roleNamePlaceholder"),
              },
              { min: 1, max: 32, message: "1-32 characters" },
            ]}
          >
            <Input placeholder={t("roleManagementPage.roleNamePlaceholder")} />
          </Form.Item>
          <Form.Item
            name="description"
            label={t("roleManagementPage.description")}
          >
            <Input placeholder={t("roleManagementPage.descriptionPlaceholder")} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingRole(null);
        }}
        title={`${t("roleManagementPage.editRole")} - ${editingRole?.name}`}
        onOk={handleEditRole}
        confirmLoading={editLoading}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        destroyOnClose
        centered
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label={t("roleManagementPage.roleName")}
            rules={[
              {
                required: true,
                message: t("roleManagementPage.roleNamePlaceholder"),
              },
              { min: 1, max: 32, message: "1-32 characters" },
            ]}
          >
            <Input placeholder={t("roleManagementPage.roleNamePlaceholder")} />
          </Form.Item>
          <Form.Item
            name="description"
            label={t("roleManagementPage.description")}
          >
            <Input placeholder={t("roleManagementPage.descriptionPlaceholder")} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
