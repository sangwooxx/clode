import { canAccessView, type PermissionSubject, type ViewPermissionId } from "@/lib/auth/permissions";

export const appViewRoutes = [
  { path: "/dashboard", viewId: "dashboardView" },
  { path: "/contracts", viewId: "contractsView" },
  { path: "/invoices", viewId: "invoicesView" },
  { path: "/employees", viewId: "employeesView" },
  { path: "/hours", viewId: "hoursView" },
  { path: "/planning", viewId: "planningView" },
  { path: "/vacations", viewId: "vacationsView" },
  { path: "/workwear", viewId: "workwearView" },
  { path: "/settings", viewId: "settingsView" },
] as const satisfies ReadonlyArray<{
  path: string;
  viewId: ViewPermissionId;
}>;

export function resolveFirstAccessibleAppPath(subject: PermissionSubject | null | undefined) {
  return appViewRoutes.find((route) => canAccessView(subject, route.viewId))?.path ?? "/login";
}
