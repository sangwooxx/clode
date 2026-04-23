import { canAccessView, type ViewPermissionId } from "@/lib/auth/permissions";
import { hasCapability, type CapabilityId } from "@/lib/auth/user-context";
import type { AuthenticatedUser } from "@/lib/api/auth";

const routeDefinitions = {
  dashboard: { href: "/dashboard", label: "Pulpit", viewId: "dashboardView" },
  contracts: { href: "/contracts", label: "Kontrakty", viewId: "contractsView" },
  invoices: { href: "/invoices", label: "Faktury", viewId: "invoicesView" },
  employees: { href: "/employees", label: "Pracownicy", viewId: "employeesView" },
  workwear: { href: "/workwear", label: "Odziez", viewId: "workwearView" },
  hours: { href: "/hours", label: "Godziny", viewId: "hoursView" },
  workCards: { href: "/work-cards", label: "Karty pracy", viewId: "hoursView" },
  planning: { href: "/planning", label: "Planowanie", viewId: "planningView" },
  vacations: { href: "/vacations", label: "Urlopy", viewId: "vacationsView" },
  settings: { href: "/settings", label: "Ustawienia", viewId: "settingsView" },
} as const satisfies Record<
  string,
  {
    href: string;
    label: string;
    viewId: ViewPermissionId;
  }
>;

export const moduleNavigation = [
  {
    label: "Pulpit",
    shortLabel: "PU",
    capabilityId: "dashboard.view",
    grouped: false,
    routes: [routeDefinitions.dashboard],
  },
  {
    label: "Kontrakty",
    shortLabel: "KO",
    capabilityId: "contracts.view",
    grouped: false,
    routes: [routeDefinitions.contracts],
  },
  {
    label: "Finanse",
    shortLabel: "FI",
    capabilityId: "finance.view",
    grouped: true,
    routes: [routeDefinitions.invoices],
  },
  {
    label: "Zasoby",
    shortLabel: "ZA",
    capabilityId: "resources.view",
    grouped: true,
    routes: [routeDefinitions.employees, routeDefinitions.workwear],
  },
  {
    label: "Operacje",
    shortLabel: "OP",
    capabilityId: "operations.view",
    grouped: true,
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
    grouped: false,
    routes: [routeDefinitions.settings],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  shortLabel: string;
  capabilityId: CapabilityId;
  grouped: boolean;
  routes: ReadonlyArray<{
    href: string;
    label: string;
    viewId: ViewPermissionId;
  }>;
}>;

export type ModuleNavigationChild = {
  href: string;
  label: string;
};

export type ModuleNavigationItem = {
  href: string;
  label: string;
  shortLabel: string;
  activeHrefs: string[];
  children: ModuleNavigationChild[];
  showChildren: boolean;
};

export function getModuleNavigation(user: AuthenticatedUser | null | undefined) {
  return moduleNavigation.flatMap((item) => {
    const visibleRoutes = item.routes.filter((route) => canAccessView(user, route.viewId));
    const isVisible = hasCapability(user, item.capabilityId) || visibleRoutes.length > 0;
    if (!isVisible || visibleRoutes.length === 0) {
      return [];
    }

    return [
      {
        href: visibleRoutes[0].href,
        label: item.label,
        shortLabel: item.shortLabel,
        activeHrefs: item.routes.map((route) => route.href),
        children: item.grouped
          ? visibleRoutes.map((route) => ({
              href: route.href,
              label: route.label,
            }))
          : [],
        showChildren: item.grouped,
      } satisfies ModuleNavigationItem,
    ];
  });
}

export function isModuleNavigationItemActive(pathname: string, item: ModuleNavigationItem) {
  return item.activeHrefs.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`)
  );
}

export function isModuleNavigationChildActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
