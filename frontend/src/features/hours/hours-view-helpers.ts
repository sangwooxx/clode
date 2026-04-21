import type { ContractRecord } from "@/features/contracts/types";
import { formatEmployeeCodeLabel, formatEmployeeDisplayName } from "@/features/employees/formatters";
import { findEmployeeRecord } from "@/features/hours/mappers";
import type { HoursEmployeeRecord, TimeEntryRecord } from "@/features/hours/types";
import { UNASSIGNED_TIME_CONTRACT_ID } from "@/features/hours/types";
import type { HoursEmployeeRow } from "@/features/hours/view-types";

export function buildHoursMonthKey(year: string, month: string) {
  const normalizedYear = String(year || "").trim();
  const normalizedMonth = String(month || "").trim();

  if (!/^\d{4}$/.test(normalizedYear)) return "";
  if (!/^(0[1-9]|1[0-2])$/.test(normalizedMonth)) return "";

  return `${normalizedYear}-${normalizedMonth}`;
}

export function buildHoursEmployeeRows(args: {
  entries: TimeEntryRecord[];
  historicalEmployees: HoursEmployeeRecord[];
  contracts: ContractRecord[];
  search: string;
}): HoursEmployeeRow[] {
  const buckets = new Map<string, Omit<HoursEmployeeRow, "index">>();
  const contractDirectory = new Map(args.contracts.map((contract) => [contract.id, contract]));

  args.entries.forEach((entry) => {
    const employee = findEmployeeRecord(
      args.historicalEmployees,
      entry.employee_name,
      entry.employee_id
    );
    const employeeId = String(entry.employee_id || employee?.id || "").trim();
    const employeeName =
      String(entry.employee_name || employee?.name || "").trim() || "Nieznany pracownik";
    const employeeLabel = formatEmployeeDisplayName(employee, employeeName) || "Nieznany pracownik";
    const employeeCode = formatEmployeeCodeLabel(employee?.worker_code, "—");
    const employeePosition = String(employee?.position || "").trim() || "Bez stanowiska";
    const employeeStatus = employee?.status ?? "active";
    const rowKey = employeeId
      ? `id:${employeeId}`
      : [
          "name",
          employeeName.toLowerCase(),
          employeeCode.toLowerCase(),
          employeePosition.toLowerCase(),
        ].join("|");
    const contractKey =
      String(entry.contract_id || "").trim() || UNASSIGNED_TIME_CONTRACT_ID;
    const contractDirectoryItem =
      contractDirectory.get(String(entry.contract_id || "").trim()) ?? null;
    const contractStatus = entry.contract_id
      ? contractDirectoryItem?.status ?? "missing"
      : "unassigned";

    const current =
      buckets.get(rowKey) ?? {
        key: rowKey,
        employeeId,
        employeeName,
        employeeLabel,
        employeeCode,
        employeePosition,
        employeeStatus,
        contracts: [],
        totalHours: 0,
        totalCost: 0,
        entriesCount: 0,
      };

    const existingContract = current.contracts.find((item) => item.key === contractKey);

    if (existingContract) {
      existingContract.hours += Number(entry.hours || 0);
      existingContract.cost += Number(entry.cost_amount || 0);
      existingContract.entriesCount += 1;
    } else {
      current.contracts.push({
        key: contractKey,
        label: entry.contract_name || contractDirectoryItem?.name || "Nieprzypisane",
        code: contractDirectoryItem?.contract_number || (entry.contract_id ? "---" : "N/P"),
        status: contractStatus,
        hours: Number(entry.hours || 0),
        cost: Number(entry.cost_amount || 0),
        entriesCount: 1,
      });
    }

    current.totalHours += Number(entry.hours || 0);
    current.totalCost += Number(entry.cost_amount || 0);
    current.entriesCount += 1;
    buckets.set(rowKey, current);
  });

  const searchTerm = String(args.search || "").trim().toLowerCase();

  return [...buckets.values()]
    .map((row) => ({
      ...row,
      contracts: [...row.contracts].sort((left, right) =>
        left.label.localeCompare(right.label, "pl", {
          sensitivity: "base",
          numeric: true,
        })
      ),
    }))
    .filter((row) => {
      if (!searchTerm) return true;
      const haystack = [
        row.employeeLabel,
        row.employeeName,
        row.employeeCode,
        row.employeePosition,
        ...row.contracts.flatMap((contract) => [contract.label, contract.code]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchTerm);
    })
    .sort((left, right) =>
      `${left.employeeLabel} ${left.employeeId}`.localeCompare(
        `${right.employeeLabel} ${right.employeeId}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    )
    .map((row, index) => ({
      ...row,
      index: index + 1,
    }));
}
