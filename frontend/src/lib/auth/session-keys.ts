export const PRIMARY_SESSION_COOKIE_NAME = "clode_session";

export const LEGACY_SESSION_COOKIE_NAMES = ["agent_session"] as const;

export const SESSION_COOKIE_NAMES = [
  PRIMARY_SESSION_COOKIE_NAME,
  ...LEGACY_SESSION_COOKIE_NAMES,
] as const;
