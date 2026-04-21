const DEFAULT_LOCAL_BACKEND_ORIGIN = "http://127.0.0.1:8787";

type ResolveBackendOriginOptions = {
  requestOrigin?: string | null;
};

function normalizeOrigin(value: string | null | undefined) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function readConfiguredOrigin() {
  return normalizeOrigin(
    process.env.CLODE_BACKEND_ORIGIN || process.env.NEXT_PUBLIC_CLODE_BACKEND_ORIGIN
  );
}

export function resolveBackendOrigin(options: ResolveBackendOriginOptions = {}) {
  const configuredOrigin = readConfiguredOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const requestOrigin = normalizeOrigin(options.requestOrigin);
  if (requestOrigin) {
    return requestOrigin;
  }

  if (process.env.NODE_ENV === "development") {
    return DEFAULT_LOCAL_BACKEND_ORIGIN;
  }

  throw new Error(
    "Cannot resolve backend origin without CLODE_BACKEND_ORIGIN or a same-origin request context."
  );
}
