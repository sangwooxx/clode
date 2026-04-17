import { LoginForm } from "@/app/(auth)/login/login-form";
import { BrandMark } from "@/components/ui/brand-mark";

const loginHighlights = [
  {
    title: "To samo konto",
    description: "Logujesz sie tym samym kontem i sesja, ktorych uzywa glowny frontend produktu."
  },
  {
    title: "Jeden runtime",
    description: "Po zalogowaniu trafiasz do tego samego shellu i tych samych modulow operacyjnych."
  },
  {
    title: "Bezpieczna sesja",
    description: "Refresh, ochrona tras i wylogowanie dzialaja na tym samym modelu auth co aplikacja."
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
        <BrandMark className="app-shell__brand auth-page__brand" labelClassName="app-shell__brand-mark" />
        <p className="auth-page__eyebrow">Wejscie do aplikacji</p>
        <h1 className="auth-page__title">Zaloguj sie do Clode.</h1>
        <p className="auth-page__description">
          Ekran logowania korzysta z tego samego backendu auth i prowadzi bezposrednio do
          glownego shellu operacyjnego.
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
