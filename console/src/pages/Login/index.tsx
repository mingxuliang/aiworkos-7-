import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Form, Input } from "antd";
import { useAppMessage } from "../../hooks/useAppMessage";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { authApi, jwtAuthApi } from "../../api/modules/auth";
import { setAuthToken, setAuthMode } from "../../api/config";
import { useTheme } from "../../contexts/ThemeContext";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);
  const [authMode, setLocalAuthMode] = useState<"legacy" | "jwt">("legacy");
  const { message } = useAppMessage();

  useEffect(() => {
    // Step 1: Detect JWT auth mode
    jwtAuthApi
      .getStatus()
      .then((res) => {
        if (res.enabled) {
          setLocalAuthMode("jwt");
          setAuthMode("jwt");
          // In JWT mode, always allow login form (register is for first user)
          setHasUsers(true); // don't auto-switch to register
          return;
        }
        // Legacy mode
        setLocalAuthMode("legacy");
        setAuthMode("legacy");
        return authApi.getStatus();
      })
      .then((res) => {
        if (!res) return; // JWT mode, no legacy check
        if (!res.enabled) {
          navigate("/chat", { replace: true });
          return;
        }
        setHasUsers(res.has_users);
        if (!res.has_users) {
          setIsRegister(true);
        }
      })
      .catch(() => {
        // Fallback: try legacy auth status
        authApi
          .getStatus()
          .then((res) => {
            setLocalAuthMode("legacy");
            setAuthMode("legacy");
            if (!res.enabled) {
              navigate("/chat", { replace: true });
              return;
            }
            setHasUsers(res.has_users);
            if (!res.has_users) {
              setIsRegister(true);
            }
          })
          .catch(() => {});
      });
  }, [navigate]);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const raw = searchParams.get("redirect") || "/chat";
      const redirect =
        raw.startsWith("/") && !raw.startsWith("//") ? raw : "/chat";

      if (authMode === "jwt") {
        // JWT mode
        if (isRegister) {
          const res = await jwtAuthApi.register(values.username, values.password);
          if (res.token) {
            setAuthToken(res.token);
            message.success(t("login.registerSuccess"));
            navigate(redirect, { replace: true });
          }
        } else {
          const res = await jwtAuthApi.login(values.username, values.password);
          if (res.token) {
            setAuthToken(res.token);
            navigate(redirect, { replace: true });
          }
        }
      } else {
        // Legacy mode
        if (isRegister) {
          const res = await authApi.register(values.username, values.password);
          if (res.token) {
            setAuthToken(res.token);
            message.success(t("login.registerSuccess"));
            navigate(redirect, { replace: true });
          }
        } else {
          const res = await authApi.login(values.username, values.password);
          if (res.token) {
            setAuthToken(res.token);
            navigate(redirect, { replace: true });
          } else {
            message.info(t("login.authNotEnabled"));
            navigate(redirect, { replace: true });
          }
        }
      }
    } catch (err) {
      message.error(
        isRegister
          ? err instanceof Error
            ? err.message
            : t("login.registerFailed")
          : t("login.failed"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark
          ? "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)"
          : "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
      }}
    >
      <div
        style={{
          width: 400,
          padding: 32,
          borderRadius: 12,
          background: isDark ? "#1f1f1f" : "#fff",
          boxShadow: isDark
            ? "0 4px 24px rgba(0,0,0,0.4)"
            : "0 4px 24px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img
            src={isDark ? "/logo-dark.svg" : "/logo-light.svg"}
            alt="QwenPaw"
            style={{ height: 48, marginBottom: 12 }}
          />
          <h2 style={{ margin: 0, fontWeight: 600, fontSize: 20 }}>
            {isRegister ? t("login.registerTitle") : t("login.title")}
          </h2>
          {!hasUsers && (
            <p
              style={{
                margin: "8px 0 0",
                color: isDark ? "rgba(255,255,255,0.45)" : "#666",
                fontSize: 13,
              }}
            >
              {authMode === "jwt"
                ? t("login.jwtFirstUserHint")
                : t("login.firstUserHint")}
            </p>
          )}
        </div>

        <Form
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: t("login.usernameRequired") }]}
          >
            <Input
              prefix={
                <UserOutlined
                  style={{
                    color: isDark ? "rgba(255,255,255,0.45)" : undefined,
                  }}
                />
              }
              placeholder={t("login.usernamePlaceholder")}
              autoFocus
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t("login.passwordRequired") }]}
          >
            <Input.Password
              prefix={
                <LockOutlined
                  style={{
                    color: isDark ? "rgba(255,255,255,0.45)" : undefined,
                  }}
                />
              }
              placeholder={t("login.passwordPlaceholder")}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ height: 44, borderRadius: 8, fontWeight: 500 }}
            >
              {isRegister ? t("login.register") : t("login.submit")}
            </Button>
          </Form.Item>

          {/* Toggle between login and register */}
          {hasUsers && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <Button
                type="link"
                onClick={() => setIsRegister(!isRegister)}
                style={{ padding: 0, fontSize: 13 }}
              >
                {isRegister
                  ? t("login.switchToLogin", "Already have an account? Login")
                  : t("login.switchToRegister", "No account? Register")}
              </Button>
            </div>
          )}
        </Form>
      </div>
    </div>
  );
}
