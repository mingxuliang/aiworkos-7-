import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppMessage } from "./useAppMessage";
import { authApi } from "../api/modules/auth";

export function useLogout() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { message } = useAppMessage();

  const logout = useCallback(
    async (options?: { redirect?: boolean; showMessage?: boolean }) => {
      const redirect = options?.redirect ?? true;
      const showMessage = options?.showMessage ?? true;
      try {
        await authApi.logout();
      } catch {
        /* local token cleared in authApi.logout */
      }
      if (showMessage) {
        message.success(t("login.logoutSuccess"));
      }
      if (redirect) {
        navigate("/login", { replace: true });
      }
    },
    [message, navigate, t],
  );

  return { logout };
}
