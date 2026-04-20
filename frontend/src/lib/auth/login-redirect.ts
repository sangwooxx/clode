export type LoginRedirectReason = "session-expired";

export function buildLoginRedirectPath(
  nextPath: string | null | undefined,
  reason?: LoginRedirectReason
) {
  const normalizedNext =
    typeof nextPath === "string" && nextPath.startsWith("/") ? nextPath : "/dashboard";
  const params = new URLSearchParams({ next: normalizedNext });
  if (reason) {
    params.set("reason", reason);
  }
  return `/login?${params.toString()}`;
}

export function redirectToLogin(
  nextPath: string | null | undefined,
  reason?: LoginRedirectReason
) {
  if (typeof window === "undefined") {
    return;
  }
  window.location.assign(buildLoginRedirectPath(nextPath, reason));
}
