import { useEffect, useState } from "react";
import {
  getEffectiveUserId,
  getStoredAuthenticatedUserKey,
  syncAuthenticatedUserKeyFromToken,
} from "../utils/authUsername";
import { getApiToken } from "../api/config";

const DEFAULT_USER_ID = "default";

export function useAuthenticatedUserId() {
  const [userId, setUserId] = useState(() => getEffectiveUserId(DEFAULT_USER_ID));

  useEffect(() => {
    const token = getApiToken();
    if (token) {
      syncAuthenticatedUserKeyFromToken(token);
    }
    setUserId(getEffectiveUserId(DEFAULT_USER_ID));
  }, []);

  return {
    userId,
    refreshUserId: () => {
      syncAuthenticatedUserKeyFromToken();
      setUserId(getEffectiveUserId(DEFAULT_USER_ID));
    },
    storedUserKey: getStoredAuthenticatedUserKey(),
  };
}

export { DEFAULT_USER_ID as DEFAULT_CHAT_USER_ID };
