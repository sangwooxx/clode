import type { Dispatch, SetStateAction } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { FormActions } from "@/components/ui/form-actions";
import { FormFeedback } from "@/components/ui/form-feedback";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import type { SettingsWorkflowValues } from "@/features/settings/types";

type SettingsWorkflowPanelProps = {
  isSavingWorkflow: boolean;
  onSave: () => void;
  setWorkflowValues: Dispatch<SetStateAction<SettingsWorkflowValues>>;
  workflowStatus: string | null;
  workflowValues: SettingsWorkflowValues;
};

export function SettingsWorkflowPanel({
  isSavingWorkflow,
  onSave,
  setWorkflowValues,
  workflowStatus,
  workflowValues,
}: SettingsWorkflowPanelProps) {
  return (
    <Panel title="Workflow urlopów">
      <FormGrid columns={1}>
        <label className="form-field">
          <span>Tryb akceptacji urlopów</span>
          <select
            value={workflowValues.vacationApprovalMode}
            onChange={(event) =>
              setWorkflowValues((current) => ({
                ...current,
                vacationApprovalMode: event.target.value === "admin" ? "admin" : "permission",
              }))
            }
          >
            <option value="permission">Według uprawnień użytkowników</option>
            <option value="admin">Tylko administrator</option>
          </select>
        </label>
        <label className="form-field">
          <span>Powiadomienia urlopowe</span>
          <select
            value={workflowValues.vacationNotifications}
            onChange={(event) =>
              setWorkflowValues((current) => ({
                ...current,
                vacationNotifications: event.target.value === "off" ? "off" : "on",
              }))
            }
          >
            <option value="on">Włączone</option>
            <option value="off">Wyłączone</option>
          </select>
        </label>
      </FormGrid>
      <FormFeedback
        items={[
          workflowStatus
            ? {
                tone: workflowStatus.includes("Nie udało") ? "error" : "success",
                text: workflowStatus,
              }
            : null,
        ]}
      />
      <FormActions
        trailing={
          <ActionButton type="button" disabled={isSavingWorkflow} onClick={() => void onSave()}>
            {isSavingWorkflow ? "Zapisywanie..." : "Zapisz workflow"}
          </ActionButton>
        }
      />
    </Panel>
  );
}
