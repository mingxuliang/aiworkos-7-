import { useState, useEffect, useCallback } from "react";
import { Card, Table, Tag, Button, Popconfirm, Modal, Select, Space } from "antd";
import { useAppMessage } from "../../../../hooks/useAppMessage";
import { useTranslation } from "react-i18next";
import { jwtAuthApi } from "../../../../api/modules/auth";
import type { JWTUserOut, JWTRoleOut } from "../../../../api/modules/auth";
import { Trash2, UserCog } from "lucide-react";
import styles from "../index.module.less";

export function UserManagementTab() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<JWTUserOut[]>([]);
  const [roles, setRoles] = useState<JWTRoleOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<JWTUserOut | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);
  const { message } = useAppMessage();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersData, rolesData] = await Promise.all([
        jwtAuthApi.listUsers(),
        jwtAuthApi.listRoles(),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch {
      message.error(t("security.userManagement.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteUser = useCallback(
    async (userId: number, username: string) => {
      try {
        await jwtAuthApi.deleteUser(userId);
        message.success(t("security.userManagement.deleteSuccess"));
        fetchData();
      } catch {
        message.error(t("security.userManagement.deleteFailed"));
      }
    },
    [t, message, fetchData],
  );

  const openRolesModal = useCallback((user: JWTUserOut) => {
    setEditingUser(user);
    setSelectedRoleIds(
      roles
        .filter((r) => user.roles.includes(r.name))
        .map((r) => r.id),
    );
    setRolesModalOpen(true);
  }, [roles]);

  const handleAssignRoles = useCallback(async () => {
    if (!editingUser) return;
    try {
      setSavingRoles(true);
      await jwtAuthApi.assignRoles(editingUser.id, selectedRoleIds);
      message.success(t("security.userManagement.assignRolesSuccess"));
      setRolesModalOpen(false);
      setEditingUser(null);
      fetchData();
    } catch {
      message.error(t("security.userManagement.assignRolesFailed"));
    } finally {
      setSavingRoles(false);
    }
  }, [editingUser, selectedRoleIds, t, message, fetchData]);

  const columns = [
    {
      title: t("security.userManagement.username"),
      dataIndex: "username",
      key: "username",
    },
    {
      title: t("security.userManagement.roles"),
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
      title: t("security.userManagement.status"),
      dataIndex: "is_active",
      key: "is_active",
      width: 100,
      render: (active: boolean) => (
        <Tag color={active ? "green" : "default"}>
          {active
            ? t("security.userManagement.active")
            : t("security.userManagement.inactive")}
        </Tag>
      ),
    },
    {
      title: t("security.userManagement.actions"),
      key: "actions",
      width: 140,
      render: (_: unknown, record: JWTUserOut) => (
        <Space>
          <Button
            type="text"
            icon={<UserCog size={16} />}
            size="small"
            onClick={() => openRolesModal(record)}
          >
            {t("security.userManagement.assignRoles")}
          </Button>
          <Popconfirm
            title={t("security.userManagement.deleteConfirm", {
              username: record.username,
            })}
            onConfirm={() => handleDeleteUser(record.id, record.username)}
            okText={t("common.delete")}
            cancelText={t("common.cancel")}
          >
            <Button
              type="text"
              danger
              icon={<Trash2 size={16} />}
              size="small"
            >
              {t("security.userManagement.deleteUser")}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionSkillScannerContainer}>
        <p className={styles.tabDescription}>
          {t("security.userManagement.description")}
        </p>
      </div>

      <Card className={styles.tableCard}>
        <Table
          columns={columns}
          dataSource={users.map((u) => ({ ...u, key: u.id }))}
          loading={loading}
          pagination={false}
          size="middle"
          locale={{
            emptyText: t("security.userManagement.noUsers"),
          }}
        />
      </Card>

      <Modal
        open={rolesModalOpen}
        onCancel={() => {
          setRolesModalOpen(false);
          setEditingUser(null);
        }}
        title={`${t("security.userManagement.assignRoles")} - ${editingUser?.username}`}
        onOk={handleAssignRoles}
        confirmLoading={savingRoles}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        destroyOnHidden
        centered
      >
        <Select
          mode="multiple"
          style={{ width: "100%" }}
          value={selectedRoleIds}
          onChange={setSelectedRoleIds}
          options={roles.map((r) => ({ label: r.name, value: r.id }))}
          placeholder={t("security.userManagement.assignRoles")}
        />
      </Modal>
    </div>
  );
}
