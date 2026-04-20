import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import { fetchEmployeesBootstrapServer } from "@/features/employees/server";
import {
  emptyWorkwearCatalogStore,
  emptyWorkwearIssuesStore,
  normalizeWorkwearCatalogStore,
  normalizeWorkwearIssuesStore,
} from "@/features/workwear/mappers";
import type {
  WorkwearBootstrapData,
  WorkwearCatalogItem,
  WorkwearIssueRecord,
} from "@/features/workwear/types";

async function fetchWorkwearCatalogServer() {
  const { status, payload } = await fetchBackendJsonServer<{ catalog?: WorkwearCatalogItem[] }>(
    "/workwear/catalog",
    {
      nextPath: "/workwear",
      allowStatuses: [404],
    }
  );

  if (status === 404) {
    return emptyWorkwearCatalogStore();
  }

  return normalizeWorkwearCatalogStore(payload?.catalog);
}

async function fetchWorkwearIssuesServer() {
  const { status, payload } = await fetchBackendJsonServer<{ issues?: WorkwearIssueRecord[] }>(
    "/workwear/issues",
    {
      nextPath: "/workwear",
      allowStatuses: [404],
    }
  );

  if (status === 404) {
    return emptyWorkwearIssuesStore();
  }

  return normalizeWorkwearIssuesStore(payload?.issues);
}

export async function fetchWorkwearBootstrapServer(): Promise<WorkwearBootstrapData> {
  const [employeesBootstrap, catalog, issues] = await Promise.all([
    fetchEmployeesBootstrapServer(),
    fetchWorkwearCatalogServer(),
    fetchWorkwearIssuesServer(),
  ]);

  return {
    ...employeesBootstrap,
    catalog,
    issues,
  };
}
