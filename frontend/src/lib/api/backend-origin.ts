const PRODUCTION_BACKEND_ORIGIN = "https://clode-iota.vercel.app";

function normalizeConfiguredOrigin(configured: string | undefined) {
  const trimmed = configured?.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return null;
  }

  if (process.env.VERCEL_ENV !== "production") {
    return trimmed;
  }

  try {
    const hostname = new URL(trimmed).hostname;
    if (
      hostname.endsWith(".vercel.app") &&
      hostname.startsWith("backend-") &&
      hostname !== "backend-sangwooxxs-projects.vercel.app"
    ) {
      return PRODUCTION_BACKEND_ORIGIN;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function resolveBackendOrigin() {
  const configured = normalizeConfiguredOrigin(
    process.env.CLODE_BACKEND_ORIGIN?.trim() ||
      process.env.NEXT_PUBLIC_CLODE_BACKEND_ORIGIN?.trim()
  );

  if (configured) {
    return configured;
  }

  return process.env.VERCEL_ENV === "production"
    ? PRODUCTION_BACKEND_ORIGIN
    : "http://127.0.0.1:8787";
}
