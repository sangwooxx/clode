import { canAccessView, type ViewPermissionId } from "@/lib/auth/permissions";
import type { AuthenticatedUser } from "@/lib/api/auth";

export const moduleNavigation = [
  { href: "/dashboard", label: "Dashboard", viewId: "dashboardView" },
  { href: "/contracts", label: "Rejestr kontraktow", viewId: "contractsView" },
  { href: "/invoices", label: "Rejestr faktur", viewId: "invoicesView" },
  { href: "/work-cards", label: "Karty pracy", viewId: "hoursView" },
  { href: "/hours", label: "Ewidencja czasu pracy", viewId: "hoursView" },
  { href: "/employees", label: "Kartoteka pracownikow", viewId: "employeesView" },
  { href: "/planning", label: "Planowanie zasobow", viewId: "planningView" },
  { href: "/vacations", label: "Urlopy i nieobecnosci", viewId: "vacationsView" },
  { href: "/workwear", label: "Odziez robocza", viewId: "workwearView" },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  viewId: ViewPermissionId;
}>;

export function getModuleNavigation(user: AuthenticatedUser | null | undefined) {
  return moduleNavigation.filter((item) => canAccessView(user, item.viewId));
}
