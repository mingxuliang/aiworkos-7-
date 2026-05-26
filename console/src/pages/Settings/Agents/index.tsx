import { useState, useRef, useCallback } from "react";
import { Alert, Button, Form } from "antd";
import { useAppMessage } from "../../../hooks/useAppMessage";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { agentsApi } from "../../../api/modules/agents";
import { invalidateSkillCache, skillApi } from "../../../api/modules/skill";
import type {
  AgentProfileConfig,
  AgentSummary,
  CreateAgentRequest,
} from "../../../api/types/agents";
import { useAgentStore } from "../../../stores/agentStore";
import { useAgents } from "./useAgents";
import { AgentCardGrid, AgentModal } from "./components";
import { PageHeader } from "@/components/PageHeader";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import { reorderAgents } from "./reorder";
import {
  loadAgentPresentation,
  removeAgentPresentation,
  saveAgentPresentation,
} from "@/utils/agentPresentationStorage";
import { DEFAULT_TEAM_ICON_KEY } from "./components/agentTeamIcons";
import styles from "./index.module.less";

export default function AgentsPage() {
  const { t, i18n } = useTranslation();
  const {
    agents,
    loading,
    error: agentsLoadError,
    deleteAgent,
    toggleAgent,
    loadAgents,
    setAgents,
  } = useAgents();
  const { selectedAgent, setSelectedAgent } = useAgentStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentSummary | null>(null);
  const [reordering, setReordering] = useState(false);
  const [form] = Form.useForm();
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const installedSkillsRef = useRef<string[]>([]);
  const { message } = useAppMessage();

  const handleCreate = () => {
    setEditingAgent(null);
    form.resetFields();
    form.setFieldsValue({
      workspace_dir: "",
      active_model_provider: undefined,
      active_model_model: undefined,
      team_icon: DEFAULT_TEAM_ICON_KEY,
      team_tags: [],
    });
    setSelectedSkills([]);
    installedSkillsRef.current = [];
    setModalVisible(true);
  };

  const handleEdit = async (agent: AgentSummary) => {
    try {
      setSelectedSkills([]);
      installedSkillsRef.current = [];
      invalidateSkillCache({ agentId: agent.id });
      const config = await agentsApi.getAgent(agent.id);
      const preset = loadAgentPresentation(agent.id);
      setEditingAgent(agent);
      form.setFieldsValue({
        ...config,
        active_model_provider: config.active_model?.provider_id || undefined,
        active_model_model: config.active_model?.model || undefined,
        team_icon: preset.iconKey,
        team_tags: preset.tags,
      });
      setModalVisible(true);
    } catch (error) {
      console.error("Failed to load agent config:", error);
      message.error(t("agent.loadConfigFailed"));
    }
  };

  const handleDelete = async (agentId: string) => {
    try {
      await deleteAgent(agentId);
      removeAgentPresentation(agentId);

      if (selectedAgent === agentId) {
        setSelectedAgent("default");
        message.info(t("agent.switchedToDefault"));
      }
    } catch {
      message.error(t("agent.deleteFailed"));
    }
  };

  const handleToggle = async (agentId: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled;
    try {
      await toggleAgent(agentId, newEnabled);

      if (!newEnabled && selectedAgent === agentId) {
        setSelectedAgent("default");
        message.info(t("agent.switchedToDefault"));
      }
    } catch {
      // Error already handled in hook
    }
  };

  const handleInstalledSkillsLoaded = useCallback((skills: string[]) => {
    installedSkillsRef.current = skills;
  }, []);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const workspaceRaw = values.workspace_dir;
      const workspace_dir =
        typeof workspaceRaw === "string"
          ? workspaceRaw.trim() || undefined
          : workspaceRaw;

      const providerId = values.active_model_provider;
      const modelId = values.active_model_model;
      const active_model =
        providerId && modelId
          ? { provider_id: providerId, model: modelId }
          : null;

      const {
        active_model_provider,
        active_model_model,
        team_icon,
        team_tags,
        ...rest
      } = values;
      let payload = {
        ...rest,
        workspace_dir,
        active_model,
      } as AgentProfileConfig;

      if (!editingAgent) {
        const rawId = payload.id;
        const idTrim =
          typeof rawId === "string" ? rawId.trim() : "";
        if (idTrim) {
          payload = { ...payload, id: idTrim };
        } else {
          const { id: _omitId, ...noIdPayload } = payload;
          payload = noIdPayload as AgentProfileConfig;
        }
      }

      if (editingAgent) {
        const previousInstalledSkills = installedSkillsRef.current;
        const newSkills = selectedSkills.filter(
          (skill) => !previousInstalledSkills.includes(skill),
        );

        for (const skill of newSkills) {
          await skillApi.downloadSkillPoolSkill({
            skill_name: skill,
            targets: [{ workspace_id: editingAgent.id }],
          });
        }
        await agentsApi.updateAgent(editingAgent.id, payload);
        saveAgentPresentation(editingAgent.id, {
          iconKey:
            typeof team_icon === "string" ? team_icon : DEFAULT_TEAM_ICON_KEY,
          tags: Array.isArray(team_tags) ? team_tags : [],
        });
        installedSkillsRef.current = [
          ...previousInstalledSkills,
          ...newSkills.filter(
            (skill) => !previousInstalledSkills.includes(skill),
          ),
        ];
        invalidateSkillCache({ agentId: editingAgent.id });
        message.success(t("agent.updateSuccess"));
      } else {
        const body: CreateAgentRequest = {
          ...payload,
          language: i18n.language,
          skill_names: selectedSkills,
        };
        const result = await agentsApi.createAgent(body);
        saveAgentPresentation(result.id, {
          iconKey:
            typeof team_icon === "string" ? team_icon : DEFAULT_TEAM_ICON_KEY,
          tags: Array.isArray(team_tags) ? team_tags : [],
        });
        message.success(`${t("agent.createSuccess")} (ID: ${result.id})`);
      }

      setModalVisible(false);
      await loadAgents();
    } catch (error: any) {
      console.error("Failed to save agent:", error);
      if (editingAgent) {
        invalidateSkillCache({ agentId: editingAgent.id });
      }
      message.error(error.message || t("agent.saveFailed"));
    }
  };

  const handleReorder = async (activeId: string, overId: string) => {
    const nextAgents = reorderAgents(agents, activeId, overId);
    if (nextAgents === agents) {
      return;
    }

    const previousAgents = agents;
    setAgents(nextAgents);
    setReordering(true);

    try {
      await agentsApi.reorderAgents(nextAgents.map((agent) => agent.id));
      message.success(t("agent.reorderSuccess"));
    } catch (error) {
      console.error("Failed to reorder agents:", error);
      setAgents(previousAgents);
      message.error(t("agent.reorderFailed"));
    } finally {
      setReordering(false);
    }
  };

  return (
    <CopawWorkbenchShell>
      <div className={styles.agentsPage}>
        <PageHeader
          parent={t("agent.parent")}
          current={t("agent.agents")}
          subRow={
            <p className={styles.pageDescription}>{t("agent.pageDescription")}</p>
          }
          extra={
            <div className={styles.headerRight}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                {t("agent.create")}
              </Button>
            </div>
          }
        />

        <div className={styles.agentGridSection}>
          {agentsLoadError ? (
            <Alert
              className={styles.listLoadAlert}
              type="error"
              showIcon
              message={t("agent.loadFailed")}
              description={
                <>
                  {agentsLoadError.message ? (
                    <p className={styles.listLoadDetail}>
                      {agentsLoadError.message}
                    </p>
                  ) : null}
                  <p className={styles.listLoadHint}>
                    {t("agent.loadListHint")}
                  </p>
                  <Button
                    size="small"
                    type="primary"
                    loading={loading}
                    onClick={() => void loadAgents()}
                  >
                    {t("agent.listRetry")}
                  </Button>
                </>
              }
            />
          ) : null}
          <AgentCardGrid
            agents={agents}
            loading={loading}
            reordering={reordering}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onReorder={handleReorder}
          />
        </div>

        <AgentModal
          open={modalVisible}
          editingAgent={editingAgent}
          form={form}
          selectedSkills={selectedSkills}
          onSelectedSkillsChange={setSelectedSkills}
          onInstalledSkillsLoaded={handleInstalledSkillsLoaded}
          onSave={handleSubmit}
          onCancel={() => setModalVisible(false)}
        />
      </div>
    </CopawWorkbenchShell>
  );
}
