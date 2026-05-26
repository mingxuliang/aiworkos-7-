import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppMessage } from "./useAppMessage";
import { authApi } from "../api/modules/auth";
import { clearAuthToken } from "../api/config";
import { isJwtToken } from "../utils/authUsername";

export interface AccountFormValues {
  currentPassword: string;
  newUsername?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function useAccountProfile() {
  const { t } = useTranslation();
  const { message } = useAppMessage();
  const [loading, setLoading] = useState(false);
  const jwtMode = isJwtToken();

  const handleUpdateProfile = useCallback(
    async (values: AccountFormValues): Promise<boolean> => {
      const trimmedUsername = values.newUsername?.trim() || undefined;
      const trimmedPassword = values.newPassword?.trim() || undefined;

      if (jwtMode) {
        if (!trimmedPassword) {
          message.warning(t("account.nothingToUpdate"));
          return false;
        }
        if (values.confirmPassword !== trimmedPassword) {
          message.error(t("account.passwordMismatch"));
          return false;
        }
        setLoading(true);
        try {
          await authApi.changePassword(trimmedPassword, values.confirmPassword!);
          message.success(t("account.updateSuccess"));
          clearAuthToken();
          window.location.href = "/login";
          return true;
        } catch (err: unknown) {
          const raw = err instanceof Error ? err.message : "";
          message.error(raw || t("account.updateFailed"));
          return false;
        } finally {
          setLoading(false);
        }
      }

      if (values.newPassword && !trimmedPassword) {
        message.error(t("account.passwordEmpty"));
        return false;
      }
      if (values.newUsername && !trimmedUsername) {
        message.error(t("account.usernameEmpty"));
        return false;
      }
      if (!trimmedUsername && !trimmedPassword) {
        message.warning(t("account.nothingToUpdate"));
        return false;
      }

      setLoading(true);
      try {
        await authApi.updateProfile(
          values.currentPassword,
          trimmedUsername,
          trimmedPassword,
        );
        message.success(t("account.updateSuccess"));
        clearAuthToken();
        window.location.href = "/login";
        return true;
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : "";
        let msg = t("account.updateFailed");
        if (raw.includes("password is incorrect")) {
          msg = t("account.wrongPassword");
        } else if (
          raw.includes("Nothing to update") ||
          raw.includes("cannot be empty")
        ) {
          msg = t("account.nothingToUpdate");
        } else if (raw) {
          msg = raw;
        }
        message.error(msg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [jwtMode, message, t],
  );

  return { loading, jwtMode, handleUpdateProfile };
}
