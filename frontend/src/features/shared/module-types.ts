export type ModuleScaffoldConfig = {
  id:
    | "dashboard"
    | "contracts"
    | "invoices"
    | "hours"
    | "employees"
    | "planning"
    | "vacations"
    | "workwear"
    | "settings";
  label: string;
  title: string;
  description: string;
  apiNotes: string[];
  foundationNotes: string[];
};
