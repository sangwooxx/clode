import { Panel } from "@/components/ui/panel";
import type { AuthenticatedUser } from "@/lib/api/auth";
import { formatRoleLabel, formatStatusLabel, formatTimestamp } from "@/features/settings/components/settings-formatters";

type SettingsAccountPanelsProps = {
  currentUser: AuthenticatedUser;
  currentUserPermissions: string[];
  hasAdminAccess: boolean;
};

export function SettingsProfilePanels({
  currentUser,
  currentUserPermissions,
  hasAdminAccess,
}: SettingsAccountPanelsProps) {
  return (
    <>
      <Panel title="Profil i sesja">
        <dl>
          <div className="info-list__row">
            <dt>Nazwa wyświetlana</dt>
            <dd>{currentUser.displayName}</dd>
          </div>
          <div className="info-list__row">
            <dt>Login</dt>
            <dd>{currentUser.username}</dd>
          </div>
          <div className="info-list__row">
            <dt>Rola</dt>
            <dd>{formatRoleLabel(currentUser.role)}</dd>
          </div>
          <div className="info-list__row">
            <dt>Status</dt>
            <dd>{formatStatusLabel(currentUser.status)}</dd>
          </div>
          <div className="info-list__row">
            <dt>Adres e-mail</dt>
            <dd>{currentUser.email || "Brak danych"}</dd>
          </div>
          <div className="info-list__row">
            <dt>Ostatnie logowanie</dt>
            <dd>{formatTimestamp(currentUser.lastLoginAt)}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title={hasAdminAccess ? "Dostęp bieżącego konta" : "Dostęp w aplikacji"}>
        <div className="settings-module-pills">
          {currentUserPermissions.length ? (
            currentUserPermissions.map((label) => (
              <span key={label} className="employees-relation-pill">
                {label}
              </span>
            ))
          ) : (
            <p className="status-message">Brak aktywnych modułów dla tego konta.</p>
          )}
        </div>
      </Panel>
    </>
  );
}

type SettingsCurrentAccountPanelProps = {
  currentUser: AuthenticatedUser;
  currentUserPermissions: string[];
};

export function SettingsCurrentAccountPanel({
  currentUser,
  currentUserPermissions,
}: SettingsCurrentAccountPanelProps) {
  return (
    <Panel title="Konto bieżące">
      <div className="settings-detail-grid">
        <div className="settings-detail-card">
          <span className="field-card__label">Login</span>
          <strong>{currentUser.username}</strong>
          <small>{currentUser.email || "Brak e-maila"}</small>
        </div>
        <div className="settings-detail-card">
          <span className="field-card__label">Rola</span>
          <strong>{formatRoleLabel(currentUser.role)}</strong>
          <small>{formatStatusLabel(currentUser.status)}</small>
        </div>
        <div className="settings-detail-card">
          <span className="field-card__label">Uprawnienia</span>
          <strong>{currentUserPermissions.length}</strong>
          <small>aktywnych modułów</small>
        </div>
        <div className="settings-detail-card">
          <span className="field-card__label">Sesja</span>
          <strong>Aktywna</strong>
          <small>{formatTimestamp(currentUser.lastLoginAt)}</small>
        </div>
      </div>
    </Panel>
  );
}
