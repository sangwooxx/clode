import { canAccessView, type ViewPermissionId } from "@/lib/auth/permissions";
import { hasCapability, type CapabilityId } from "@/lib/auth/user-context";
import type { AuthenticatedUser } from "@/lib/api/auth";

const routeDefinitions = {
  dashboard: { href: "/dashboard", viewId: "dashboardView" },
  contracts: { href: "/contracts", viewId: "contractsView" },
  invoices: { href: "/invoices", viewId: "invoicesView" },
  employees: { href: "/employees", viewId: "employeesView" },
  workwear: { href: "/workwear", viewId: "workwearView" },
  hours: { href: "/hours", viewId: "hoursView" },
  workCards: { href: "/work-cards", viewId: "hoursView" },
  planning: { href: "/planning", viewId: "planningView" },
  vacations: { href: "/vacations", viewId: "vacationsView" },
  settings: { href: "/settings", viewId: "settingsView" },
} as const satisfies Record<
  string,
  {
    href: string;
    viewId: ViewPermissionId;
  }
>;

export const moduleNavigation = [
  {
    label: "Pulpit",
    shortLabel: "PU",
    capabilityId: "dashboard.view",
    routes: [routeDefinitions.dashboard],
  },
  {
    label: "Kontrakty",
    shortLabel: "KO",
    capabilityId: "contracts.view",
    routes: [routeDefinitions.contracts],
  },
  {
    label: "Finanse",
    shortLabel: "FI",
    capabilityId: "finance.view",
    routes: [routeDefinitions.invoices],
  },
  {
    label: "Zasoby",
    shortLabel: "ZA",
    capabilityId: "resources.view",
    routes: [routeDefinitions.employees, routeDefinitions.workwear],
  },
  {
    label: "Operacje",
    shortLabel: "OP",
    capabilityId: "operations.view",
    routes: [
      routeDefinitions.hours,
      routeDefinitions.workCards,
      routeDefinitions.planning,
      routeDefinitions.vacations,
    ],
  },
  {
    label: "Administracja",
    shortLabel: "AD",
    capabilityId: "admin.view",
    routes: [routeDefinitions.settings],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  shortLabel: string;
  capabilityId: CapabilityId;
  routes: ReadonlyArray<{
    href: string;
    viewId: ViewPermissionId;
  }>;
}>;

export type ModuleNavigationItem = {
  href: string;
  label: string;
  shortLabel: string;
  activeHrefs: string[];
};

export function getModuleNavigation(user: AuthenticatedUser | null | undefined) {
  return moduleNavigation.flatMap((item) => {
    if (!hasCapability(user, item.capabilityId)) {
      return [];
    }

    const visibleRoutes = item.routes.filter((route) => canAccessView(user, route.viewId));
    if (visibleRoutes.length === 0) {
      return [];
    }

    return [
      {
        href: visibleRoutes[0].href,
        label: item.label,
        shortLabel: item.shortLabel,
        activeHrefs: item.routes.map((route) => route.href),
      } satisfies ModuleNavigationItem,
    ];
  });
}

export function isModuleNavigationItemActive(pathname: string, item: ModuleNavigationItem) {
  return item.activeHrefs.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`)
  );
}
