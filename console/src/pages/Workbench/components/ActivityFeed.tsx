import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../contexts/ThemeContext";
import type { ChatSpec } from "../../../api/types/chat";
import dayjs from "dayjs";

interface Props {
  recentChats: ChatSpec[];
}

const DOT_COLORS = ["#22d3ee", "#4ade80", "#f97316", "#a78bfa", "#f59e0b"];

export default function ActivityFeed({ recentChats }: Props) {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const offsetRef = useRef(0);
  const rafRef = useRef<number>(0);

  // Always double for seamless loop (same as opt平台)
  const items = recentChats.slice(0, 20);
  const doubled = [...items, ...items];

  useEffect(() => {
    const speed = 0.5;
    const animate = () => {
      if (!paused && trackRef.current) {
        offsetRef.current += speed;
        const half = trackRef.current.scrollHeight / 2;
        if (half > 0 && offsetRef.current >= half) {
          offsetRef.current = 0;
        }
        trackRef.current.style.transform = `translateY(-${offsetRef.current}px)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // paused 变化时重新绑定 RAF 即可，无需其他依赖
  }, [paused]);

  const cardBg = isDark ? "#1a2235" : "#ffffff";

  return (
    <div
      style={{
        borderRadius: 12,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100%",
        overflow: "hidden",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0"}`,
        background: cardBg,
        transition: "background 0.3s",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          flexShrink: 0,
          color: isDark ? "#ffffff" : "#0f172a",
        }}
      >
        {t("workbench.activity.title", "最近动态")}
      </div>

      {items.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            color: isDark ? "#475569" : "#94a3b8",
          }}
        >
          {t("workbench.activity.empty", "暂无动态")}
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            position: "relative",
            cursor: "default",
          }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Top fade */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 28,
              zIndex: 10,
              pointerEvents: "none",
              background: `linear-gradient(to bottom, ${cardBg}, transparent)`,
            }}
          />
          {/* Bottom fade */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 28,
              zIndex: 10,
              pointerEvents: "none",
              background: `linear-gradient(to top, ${cardBg}, transparent)`,
            }}
          />

          <div
            ref={trackRef}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              willChange: "transform",
            }}
          >
            {doubled.map((chat, i) => (
              <div
                key={`${chat.id}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  paddingTop: 2,
                  paddingBottom: 2,
                }}
              >
                <div style={{ flexShrink: 0, marginTop: 6 }}>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: DOT_COLORS[i % DOT_COLORS.length],
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: isDark ? "#cbd5e1" : "#475569",
                    }}
                  >
                    <span style={{ color: "#22d3ee", fontWeight: 500 }}>
                      {chat.channel ||
                        t("workbench.activity.defaultChannel", "默认频道")}
                    </span>{" "}
                    {chat.name || t("workbench.activity.newChat", "新建对话")}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      marginTop: 2,
                      color: isDark ? "#475569" : "#94a3b8",
                    }}
                  >
                    {chat.updated_at ? dayjs(chat.updated_at).fromNow() : "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
