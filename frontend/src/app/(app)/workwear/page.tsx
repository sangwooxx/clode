import { WorkwearView } from "@/features/workwear";
import { fetchWorkwearBootstrapServer } from "@/features/workwear/server";
import { requireServerViewAccess } from "@/lib/auth/server-auth";

export default async function WorkwearPage() {
  await requireServerViewAccess("/workwear", "workwearView");

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
