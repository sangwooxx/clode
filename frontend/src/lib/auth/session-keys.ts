export const SESSION_STORAGE_KEYS = [
  "clode_backend_session_token",
  "agent_backend_session_token",
  "clode_backend_persisted_session_token",
  "agent_backend_persisted_session_token"
] as const;

export const SESSION_COOKIE_NAMES = ["clode_session", "agent_session"] as const;
