import type { Dispatch, FormEvent, SetStateAction } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { FormActions } from "@/components/ui/form-actions";
import { FormFeedback } from "@/components/ui/form-feedback";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { buildPermissionLabels, formatRoleLabel } from "@/features/settings/components/settings-formatters";
import {
  isAdminRole,
  settingsPermissionDefinitions,
  type SettingsUserFormValues,
} from "@/features/settings/types";
import type { ManagedUserRecord } from "@/lib/api/users";

type SettingsUserFormPanelProps = {
  currentUserId: string;
  editingUser: ManagedUserRecord | null;
  formError: string | null;
  formStatus: string | null;
  formValues: SettingsUserFormValues;
  isDeletingUser: boolean;
  isSubmittingUser: boolean;
  onCreateNewUser: () => void;
  onDeleteUser: () => void;
  onPasswordReset: () => void;
  onRoleChange: (nextRole: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resetTargetUsername: string | null;
  setFormValues: Dispatch<SetStateAction<SettingsUserFormValues>>;
  embedded?: boolean;
};

export function SettingsUserFormPanel({
  currentUserId,
  editingUser,
  formError,
  formStatus,
  formValues,
  isDeletingUser,
  isSubmittingUser,
  onCreateNewUser,
  onDeleteUser,
  onPasswordReset,
  onRoleChange,
  onSubmit,
  resetTargetUsername,
  setFormValues,
  embedded = false,
}: SettingsUserFormPanelProps) {
  const editingUserPermissions = buildPermissionLabels(editingUser?.permissions);

  const content = (
    <>
      {editingUser ? (
        <div className="settings-user-spotlight">
          <div className="data-table__stack">
            <span className="data-table__primary">{editingUser.name}</span>
            <span className="data-table__secondary">
              {editingUser.username} | {formatRoleLabel(editingUser.role)}
            </span>
          </div>
          <div className="settings-module-pills">
            {editingUserPermissions.length ? (
              editingUserPermissions.map((label) => (
                <span key={label} className="employees-relation-pill employees-relation-pill--muted">
                  {label}
                </span>
              ))
            ) : (
              <p className="status-message">To konto nie ma aktywnych uprawnień.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="status-message">Nowe konto użytkownika.</p>
      )}

      <form className="settings-user-form" onSubmit={onSubmit}>
        <FormGrid columns={2}>
          <label className="form-field">
            <span>Imię i nazwisko</span>
            <input
              value={formValues.name}
              onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
              placeholder="Jan Kowalski"
            />
          </label>
          <label className="form-field">
            <span>Login</span>
            <input
              value={formValues.username}
              onChange={(event) => setFormValues((current) => ({ ...current, username: event.target.value }))}
              placeholder="jan.kowalski"
            />
          </label>
          <label className="form-field">
            <span>Adres e-mail</span>
            <input
              value={formValues.email}
              onChange={(event) => setFormValues((current) => ({ ...current, email: event.target.value }))}
              placeholder="jan.kowalski@clode.pl"
            />
          </label>
          <label className="form-field">
            <span>{editingUser ? "Nowe hasło (opcjonalnie)" : "Hasło startowe"}</span>
            <input
              type="password"
              value={formValues.password}
              onChange={(event) => setFormValues((current) => ({ ...current, password: event.target.value }))}
              placeholder={editingUser ? "Pozostaw puste bez zmiany" : "Minimum startowe"}
            />
          </label>
          <label className="form-field">
            <span>Rola</span>
            <select value={formValues.role} onChange={(event) => onRoleChange(event.target.value)}>
              <option value="admin">Administrator</option>
              <option value="kierownik">Kierownik</option>
              <option value="ksiegowosc">Księgowość</option>
              <option value="read-only">Tylko odczyt</option>
            </select>
          </label>
          <label className="form-field">
            <span>Status konta</span>
            <select
              value={formValues.status}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  status: event.target.value === "inactive" ? "inactive" : "active",
                }))
              }
            >
              <option value="active">Aktywne</option>
              <option value="inactive">Nieaktywne</option>
            </select>
          </label>
          <label className="settings-toggle-card">
            <input
              type="checkbox"
              checked={formValues.canApproveVacations}
              disabled={isAdminRole(formValues.role)}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  canApproveVacations: event.target.checked,
                }))
              }
            />
            <div>
              <strong>Akceptacja urlopów</strong>
              <small>
                {isAdminRole(formValues.role)
                  ? "Administrator akceptuje urlopy zawsze."
                  : "Włącz, jeśli konto ma zatwierdzać wnioski urlopowe."}
              </small>
            </div>
          </label>
        </FormGrid>

        <div className="settings-permissions">
          <div className="panel__heading">
            <h3 className="panel__title">Uprawnienia modułowe</h3>
          </div>
          <div className="settings-permissions-grid">
            {settingsPermissionDefinitions.map((definition) => {
              const locked = isAdminRole(formValues.role);
              return (
                <label
                  key={definition.id}
                  className={["settings-permission-card", locked ? "settings-permission-card--locked" : ""].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(formValues.permissions[definition.id])}
                    disabled={locked}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        permissions: {
                          ...current.permissions,
                          [definition.id]: event.target.checked,
                        },
                      }))
                    }
                  />
                  <div>
                    <strong>{definition.label}</strong>
                    <small>{definition.id}</small>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <FormFeedback
          items={[
            formError ? { tone: "error", text: formError } : null,
            formStatus ? { tone: "success", text: formStatus } : null,
          ]}
        />

        <FormActions
          leading={
            <>
              <ActionButton
                type="button"
                variant="secondary"
                onClick={onCreateNewUser}
                disabled={isSubmittingUser || isDeletingUser}
              >
                {editingUser ? "Nowe konto" : "Wyczyść formularz"}
              </ActionButton>
              {editingUser ? (
                <ActionButton
                  type="button"
                  variant="secondary"
                  disabled={resetTargetUsername === editingUser.username}
                  onClick={() => void onPasswordReset()}
                >
                  {resetTargetUsername === editingUser.username ? "Wysyłanie..." : "Reset hasła użytkownika"}
                </ActionButton>
              ) : null}
              {editingUser ? (
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={isDeletingUser || editingUser.id === currentUserId}
                  onClick={() => void onDeleteUser()}
                >
                  {isDeletingUser ? "Usuwanie..." : "Usuń konto"}
                </ActionButton>
              ) : null}
            </>
          }
          trailing={
            <ActionButton type="submit" disabled={isSubmittingUser}>
              {isSubmittingUser ? "Zapisywanie..." : editingUser ? "Zapisz zmiany" : "Dodaj konto"}
            </ActionButton>
          }
        />
      </form>
    </>
  );

  if (embedded) {
    return content;
  }

  return <Panel title={editingUser ? `Edycja konta: ${editingUser.name}` : "Nowe konto użytkownika"}>{content}</Panel>;
}
