import { WorkCardView } from "@/features/work-cards";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function WorkCardsPage() {
  await requireServerSession("/work-cards");
  return <WorkCardView />;
}
