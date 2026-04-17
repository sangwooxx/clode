import { WorkwearView } from "@/features/workwear";
import { fetchWorkwearBootstrapServer } from "@/features/workwear/server";

export default async function WorkwearPage() {
  try {
    const bootstrap = await fetchWorkwearBootstrapServer();
    return <WorkwearView initialBootstrap={bootstrap} />;
  } catch (error) {
    return (
      <WorkwearView
        initialError={
          error instanceof Error
            ? error.message
            : "Nie udalo sie zaladowac modulu odziezy roboczej."
        }
      />
    );
  }
}
