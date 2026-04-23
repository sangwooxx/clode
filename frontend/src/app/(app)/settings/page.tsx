import { SettingsView } from "@/features/settings";
import { requireServerViewAccess } from "@/lib/auth/server-auth";

export default async function SettingsPage() {
  await requireServerViewAccess("/settings", "settingsView");
  return <SettingsView />;
}
