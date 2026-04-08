CREATE INDEX IF NOT EXISTS time_entries_month_id_idx ON time_entries(month_id);
CREATE INDEX IF NOT EXISTS time_entries_employee_id_idx ON time_entries(employee_id);
CREATE INDEX IF NOT EXISTS time_entries_month_contract_idx ON time_entries(month_id, contract_id);
CREATE INDEX IF NOT EXISTS time_entries_month_employee_idx ON time_entries(month_id, employee_id);
