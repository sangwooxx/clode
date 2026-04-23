import { canAccessView, type ViewPermissionId } from "@/lib/auth/permissions";
import type { AuthenticatedUser } from "@/lib/api/auth";

export const moduleNavigation = [
  { href: "/dashboard", label: "Pulpit", shortLabel: "PU", viewId: "dashboardView" },
  { href: "/contracts", label: "Kontrakty", shortLabel: "KO", viewId: "contractsView" },
  { href: "/invoices", label: "Faktury", shortLabel: "FA", viewId: "invoicesView" },
  { href: "/work-cards", label: "Karty pracy", shortLabel: "KP", viewId: "hoursView" },
  { href: "/hours", label: "Godziny", shortLabel: "GD", viewId: "hoursView" },
  { href: "/employees", label: "Pracownicy", shortLabel: "PR", viewId: "employeesView" },
  { href: "/planning", label: "Planowanie", shortLabel: "PL", viewId: "planningView" },
  { href: "/vacations", label: "Urlopy", shortLabel: "UR", viewId: "vacationsView" },
  { href: "/workwear", label: "Odzież", shortLabel: "OD", viewId: "workwearView" },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  shortLabel: string;
  viewId: ViewPermissionId;
}>;

export function getModuleNavigation(user: AuthenticatedUser | null | undefined) {
  return moduleNavigation.filter((item) => canAccessView(user, item.viewId));
}
