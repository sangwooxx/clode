import { WorkwearView } from "@/features/workwear";
import { fetchWorkwearBootstrapServer } from "@/features/workwear/server";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function WorkwearPage() {
  await requireServerSession("/workwear");

  let initialError: string | undefined;
  let initialBootstrap;

  try {
    initialBootstrap = await fetchWorkwearBootstrapServer();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie zaladowac modulu odziezy roboczej.";
  }

  return <WorkwearView initialBootstrap={initialBootstrap} initialError={initialError} />;
}
