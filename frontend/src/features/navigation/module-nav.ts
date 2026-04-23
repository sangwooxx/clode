import { canAccessView, type ViewPermissionId } from "@/lib/auth/permissions";
import type { AuthenticatedUser } from "@/lib/api/auth";

export const moduleNavigation = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "DB", viewId: "dashboardView" },
  { href: "/contracts", label: "Rejestr kontraktów", shortLabel: "RK", viewId: "contractsView" },
  { href: "/invoices", label: "Rejestr faktur", shortLabel: "RF", viewId: "invoicesView" },
  { href: "/work-cards", label: "Karty pracy", shortLabel: "KP", viewId: "hoursView" },
  { href: "/hours", label: "Ewidencja czasu pracy", shortLabel: "ET", viewId: "hoursView" },
  { href: "/employees", label: "Kartoteka pracowników", shortLabel: "PR", viewId: "employeesView" },
  { href: "/planning", label: "Planowanie zasobów", shortLabel: "PZ", viewId: "planningView" },
  { href: "/vacations", label: "Urlopy i nieobecności", shortLabel: "UN", viewId: "vacationsView" },
  { href: "/workwear", label: "Odzież robocza", shortLabel: "OR", viewId: "workwearView" },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  shortLabel: string;
  viewId: ViewPermissionId;
}>;

export function getModuleNavigation(user: AuthenticatedUser | null | undefined) {
  return moduleNavigation.filter((item) => canAccessView(user, item.viewId));
}
