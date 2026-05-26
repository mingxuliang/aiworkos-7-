import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Code,
  Cpu,
  Factory,
  FileText,
  Headphones,
  Lightbulb,
  Monitor,
  Network,
  Rocket,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import styles from "./index.module.less";

interface PromptItem {
  label?: string;
  value: string;
}

interface CopawChatWelcomeProps {
  prompts?: Array<string | PromptItem>;
  onSubmit: (payload: { query: string }) => void;
}

function normalizePrompt(item: string | PromptItem): PromptItem {
  if (typeof item === "string") {
    return { label: item, value: item };
  }
  return {
    label: item.label || item.value,
    value: item.value,
  };
}

const SUGGESTED_ICON_CYCLE: LucideIcon[] = [
  Rocket,
  Lightbulb,
  FileText,
  BarChart3,
  BookOpen,
  Code,
];

/** Agent 团队面板对齐的快捷场景标签（点击进入输入框）。 */
const TEAM_TAG_CONFIG = [
  { Icon: Users, labelKey: "chat.aiDocWelcome.tagTeamMgmt" },
  { Icon: Cpu, labelKey: "chat.aiDocWelcome.tagTeamRnD" },
  { Icon: Factory, labelKey: "chat.aiDocWelcome.tagTeamMfg" },
  { Icon: TrendingUp, labelKey: "chat.aiDocWelcome.tagTeamSales" },
  { Icon: Network, labelKey: "chat.aiDocWelcome.tagTeamCross" },
  { Icon: Headphones, labelKey: "chat.aiDocWelcome.tagTeamSvc" },
] as const;

const container = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
};

function focusComposer() {
  requestAnimationFrame(() => {
    const ta =
      document.querySelector<HTMLTextAreaElement>(
        ".qwenpaw-sender textarea",
      ) || document.querySelector<HTMLTextAreaElement>("textarea");
    ta?.focus();
  });
}

const BrandTag: React.FC<{
  text: string;
  icon: React.ReactNode;
  onActivate?: () => void;
}> = ({ text, icon, onActivate }) => (
  <button
    type="button"
    className={styles.brandTag}
    onClick={onActivate}
  >
    <span className={styles.brandTagIcon}>{icon}</span>
    {text}
  </button>
);

const GlowingCard: React.FC<{
  text: string;
  iconSlot: React.ReactNode;
  onClick: () => void;
}> = ({ text, iconSlot, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      className={`${styles.glowCard} ${hovered ? styles.glowCardHover : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div className={styles.glowCardShimmer} aria-hidden />
      <span
        className={`${styles.cardIconWrap} ${hovered ? styles.cardIconWrapHover : ""}`}
      >
        {iconSlot}
      </span>
      <span className={styles.cardBody}>{text}</span>
      <ArrowRight
        size={14}
        className={`${styles.cardArrow} ${hovered ? styles.cardArrowHover : ""}`}
        aria-hidden
      />
    </button>
  );
};

const CopawChatWelcome: React.FC<CopawChatWelcomeProps> = ({
  prompts = [],
  onSubmit,
}) => {
  const { t } = useTranslation();

  const [glowPhase, setGlowPhase] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setGlowPhase((p) => (p + 1) % 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const runtimePrompts = useMemo(() => prompts.map(normalizePrompt), [prompts]);

  const fallbackPrompts = useMemo(
    () =>
      ([1, 2, 3, 4, 5, 6] as const).map((n) => ({
        label: t(`chat.aiDocWelcome.suggested${n}`),
        value: t(`chat.aiDocWelcome.suggested${n}`),
      })),
    [t],
  );

  const displayPrompts =
    runtimePrompts.length > 0 ? runtimePrompts : fallbackPrompts;

  const onTagClick = useCallback(() => {
    focusComposer();
  }, []);

  return (
    <motion.section
      className={styles.root}
      variants={container}
      initial="hidden"
      animate="visible"
      aria-labelledby="copaw-aidoc-welcome-title"
    >
      <div className={styles.avatarRow}>
        <div
          className={styles.orbitDash}
          style={{ transform: `rotate(${glowPhase * 0.8}deg)` }}
          aria-hidden
        />
        <div className={styles.breatheRing} aria-hidden />
        <div className={styles.radialGlow} aria-hidden />
        <div className={styles.avatarCluster}>
          <div className={styles.avatarBall}>
            <Bot size={28} strokeWidth={1.85} color="#fff" aria-hidden />
          </div>
          <div className={styles.onlineDot} aria-hidden />
        </div>
      </div>

      <h2 id="copaw-aidoc-welcome-title" className={styles.heroTitle}>
        {t("chat.aiDocWelcome.title")}
      </h2>
      <p className={styles.heroSubtitle}>{t("chat.aiDocWelcome.subtitle")}</p>
      <p className={styles.heroIntro}>{t("chat.aiDocWelcome.intro")}</p>

      <div className={styles.tagRow}>
        {TEAM_TAG_CONFIG.map(({ Icon, labelKey }) => (
          <BrandTag
            key={labelKey}
            text={t(labelKey)}
            icon={<Icon size={14} />}
            onActivate={onTagClick}
          />
        ))}
      </div>

      <div className={styles.promptGrid}>
        {displayPrompts.map((p, idx) => {
          const Ico = SUGGESTED_ICON_CYCLE[idx % SUGGESTED_ICON_CYCLE.length];
          return (
            <GlowingCard
              key={`${idx}-${p.value}`}
              text={p.label ?? p.value}
              iconSlot={<Ico size={16} className={styles.promptLucideIcon} />}
              onClick={() => onSubmit({ query: p.value })}
            />
          );
        })}
      </div>

      <div className={styles.modelHint}>
        <Monitor size={14} className={styles.modelHintIcon} aria-hidden />
        <span className={styles.modelHintMain}>
          {t("chat.aiDocWelcome.modelHint")}
        </span>
      </div>
    </motion.section>
  );
};

export default CopawChatWelcome;
