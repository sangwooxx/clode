import { LoginForm } from "@/app/(auth)/login/login-form";

const loginHighlights = [
  {
    title: "Realny login",
    description: "Nowy frontend loguje sie do tego samego backendu auth co obecne MVP."
  },
  {
    title: "Bootstrap sesji",
    description: "Po refreshu sesja odtwarza sie z ciasteczka i naglowkow sesyjnych."
  },
  {
    title: "Bezpieczny shell",
    description: "Czesc app jest chroniona i dziala rownolegle do legacy frontendu."
  }
];

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextValue = resolvedSearchParams.next;
  const nextUrl =
    Array.isArray(nextValue) ? nextValue[0] ?? "/dashboard" : nextValue ?? "/dashboard";
  const backendLabel =
    process.env.NEXT_PUBLIC_CLODE_API_BASE_URL?.trim() ||
    process.env.CLODE_BACKEND_ORIGIN?.trim() ||
    "same-origin /api/v1 proxy -> backend";

  return (
    <div className="auth-page">
      <section className="auth-page__content">
        <p className="auth-page__eyebrow">Clode / Next.js runtime</p>
        <h1 className="auth-page__title">Logowanie do nowego runtime frontendu Clode.</h1>
        <p className="auth-page__description">
          Ten etap domyka prawdziwy login, bootstrap sesji, route protection i shell
          aplikacji bez ruszania legacy MVP.
        </p>

        <div className="auth-page__highlights">
          {loginHighlights.map((item) => (
            <article className="auth-highlight" key={item.title}>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <LoginForm nextUrl={nextUrl} backendLabel={backendLabel} />
    </div>
  );
}
