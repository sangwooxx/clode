import { SettingsView } from "@/features/settings";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function SettingsPage() {
  await requireServerSession("/settings");
  return <SettingsView />;
}
