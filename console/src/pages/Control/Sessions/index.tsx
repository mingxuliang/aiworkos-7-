import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Modal, Button } from "@agentscope-ai/design";
import { Spin } from "antd";
import { useAppMessage } from "../../../hooks/useAppMessage";
import { useTranslation } from "react-i18next";
import {
  FilterBar,
  SessionDrawer,
  SessionCard,
  type Session,
} from "./components";
import { useSessions } from "./useSessions";
import api from "../../../api";
import { PageHeader } from "@/components/PageHeader";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import styles from "./index.module.less";

function SessionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    sessions,
    loading,
    updateSession,
    deleteSession,
    batchDeleteSessions,
  } = useSessions();
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<Session>();

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterChannel, setFilterChannel] = useState<string>("");
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);

  const { message } = useAppMessage();

  useEffect(() => {
    const fetchChannelTypes = async () => {
      try {
        const types = await api.listChannelTypes();
        setAvailableChannels(types);
      } catch (error) {
        console.error("❌ Failed to load channel types:", error);
      }
    };
    fetchChannelTypes();
  }, []);

  useEffect(() => {
    let filtered: Session[] = sessions;

    if (filterUserId) {
      filtered = filtered.filter((session: Session) =>
        session.user_id?.toLowerCase().includes(filterUserId.toLowerCase()),
      );
    }

    if (filterChannel) {
      filtered = filtered.filter(
        (session: Session) => session.channel === filterChannel,
      );
    }

    setFilteredSessions(filtered);
  }, [sessions, filterUserId, filterChannel]);

  const handleEdit = (session: Session) => {
    setEditingSession(session);
    // Form model is a subset of runtime session; avoid strict meta typing clash.
    form.setFieldsValue(session as never);
    setDrawerOpen(true);
  };

  const handleDelete = (sessionId: string) => {
    Modal.confirm({
      title: t("sessions.confirmDelete"),
      content: t("sessions.deleteConfirm"),
      okText: t("cronJobs.deleteText"),
      okType: "primary",
      cancelText: t("cronJobs.cancelText"),
      onOk: async () => {
        await deleteSession(sessionId);
      },
    });
  };

  const handleView = (session: Session) => {
    navigate(`/chat/${encodeURIComponent(session.id)}`);
  };

  const handleCardSelect = (id: string, checked: boolean) => {
    setSelectedRowKeys((prev) =>
      checked ? [...prev.filter((k) => k !== id), id] : prev.filter((k) => k !== id),
    );
  };

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t("sessions.batchDeleteConfirm", { count: 0 }));
      return;
    }

    Modal.confirm({
      title: t("sessions.confirmDelete"),
      content: t("sessions.batchDeleteConfirm", {
        count: selectedRowKeys.length,
      }),
      okText: t("cronJobs.deleteText"),
      okType: "danger",
      cancelText: t("cronJobs.cancelText"),
      onOk: async () => {
        const success = await batchDeleteSessions(selectedRowKeys as string[]);
        if (success) {
          setSelectedRowKeys([]);
        }
      },
    });
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setEditingSession(null);
  };

  const handleSubmit = async (values: Session) => {
    if (editingSession) {
      setSaving(true);
      try {
        const updated = {
          name: values.name,
        };
        const success = await updateSession(editingSession.id, updated);
        if (success) {
          setDrawerOpen(false);
        }
      } finally {
        setSaving(false);
      }
    }
  };

  let mainBody: ReactNode;

  if (loading) {
    mainBody = (
      <div className={styles.stateWrap}>
        <Spin tip={t("sessions.loading")} />
      </div>
    );
  } else if (sessions.length === 0) {
    mainBody = (
      <div className={styles.stateWrapMuted}>{t("sessions.noSessionsYet")}</div>
    );
  } else if (filteredSessions.length === 0) {
    mainBody = (
      <div className={styles.stateWrapMuted}>
        {t("sessions.noSessionsMatchFilters")}
      </div>
    );
  } else {
    mainBody = (
      <div className="cbc-agent-grid">
        {filteredSessions.map((session, index) => (
          <SessionCard
            key={session.id}
            session={session}
            index={index}
            selected={selectedRowKeys.includes(session.id)}
            onSelect={handleCardSelect}
            onEdit={handleEdit}
            onView={handleView}
            onDelete={handleDelete}
            t={t}
          />
        ))}
      </div>
    );
  }

  return (
    <CopawWorkbenchShell>
      <div className={styles.sessionsPage}>
        <PageHeader
          parent={t("nav.control")}
          current={t("sessions.title")}
          subRow={
            <p className="copaw-bench-page-desc">{t("sessions.description")}</p>
          }
          extra={
            <div className={styles.headerRight}>
              <FilterBar
                filterUserId={filterUserId}
                filterChannel={filterChannel}
                uniqueChannels={availableChannels}
                onUserIdChange={setFilterUserId}
                onChannelChange={setFilterChannel}
              />
              {selectedRowKeys.length > 0 && (
                <Button type="primary" danger onClick={handleBatchDelete}>
                  {t("sessions.batchDeleteButton")} ({selectedRowKeys.length})
                </Button>
              )}
            </div>
          }
        />

        <div className="copaw-bench-main-section copaw-bench-main-section--scroll">
          {mainBody}
        </div>

        <SessionDrawer
          open={drawerOpen}
          editingSession={editingSession}
          form={form}
          saving={saving}
          onClose={handleDrawerClose}
          onSubmit={handleSubmit}
        />
      </div>
    </CopawWorkbenchShell>
  );
}

export default SessionsPage;
