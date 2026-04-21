import { describe, expect, it } from "vitest";

import {
  buildEmployeePdfDefinitions,
  buildEmployeePrintDocument,
} from "@/features/employees/pdf";
import type {
  EmployeeDirectoryRecord,
  EmployeeMedicalState,
  EmployeeRelationSnapshot,
} from "@/features/employees/types";

const employee: EmployeeDirectoryRecord = {
  key: "id:emp-1",
  id: "emp-1",
  name: "Jan Nowak",
  first_name: "Jan",
  last_name: "Nowak",
  worker_code: "WK-1",
  position: "Monter",
  status: "active",
  employment_date: "2024-01-10",
  employment_end_date: undefined,
  street: "ul. Testowa 1",
  city: "00-001 Warszawa",
  phone: "+48 500 000 000",
  medical_exam_valid_until: "2026-12-31",
  source: "directory",
  isPersisted: true,
};

const relations: EmployeeRelationSnapshot = {
  hoursEntries: 3,
  workCards: 2,
  monthsCount: 2,
  totalHours: 24,
  totalCost: 960,
};

const medical: EmployeeMedicalState = {
  label: "Aktualne",
  tone: "ok",
  dateText: "31.12.2026",
  daysText: "200 dni",
};

describe("employees pdf helpers", () => {
  it("builds dialog definitions from employee details", () => {
    const definitions = buildEmployeePdfDefinitions({
      employee,
      relations,
      medical,
    });

    expect(definitions.map((definition) => definition.id)).toEqual([
      "basic",
      "contact",
      "hr",
      "relations",
    ]);
    expect(definitions[2]?.preview).toContain("Aktualne");
    expect(definitions[3]?.preview).toContain("24 h");
  });

  it("builds a print document limited to enabled sections", () => {
    const document = buildEmployeePrintDocument({
      employee,
      relations,
      medical,
      enabledSectionIds: new Set(["basic", "relations"]),
    });

    expect(document.filename).toBe("clode-pracownik-WK-1");
    expect(document.sections).toHaveLength(2);
    expect(document.sections[0]?.title).toBe("Dane podstawowe");
    expect(document.sections[1]?.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Koszt godzin",
          value: expect.stringContaining("960"),
        }),
      ])
    );
  });
});
