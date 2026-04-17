export function resolveBackendOrigin() {
  const configured =
    process.env.CLODE_BACKEND_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_CLODE_BACKEND_ORIGIN?.trim();

  return configured && configured.length > 0
    ? configured.replace(/\/+$/, "")
    : "http://127.0.0.1:8787";
}
