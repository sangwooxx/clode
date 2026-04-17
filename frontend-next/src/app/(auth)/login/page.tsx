import { LoginForm } from "@/app/(auth)/login/login-form";
import { BrandMark } from "@/components/ui/brand-mark";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextValue = resolvedSearchParams.next;
  const nextUrl =
    Array.isArray(nextValue) ? nextValue[0] ?? "/dashboard" : nextValue ?? "/dashboard";

  return (
    <div className="auth-page">
      <section className="auth-page__content">
        <BrandMark className="app-shell__brand auth-page__brand" labelClassName="app-shell__brand-mark" />
        <div className="auth-page__intro">
          <h1 className="auth-page__title">Zaloguj sie</h1>
          <p className="auth-page__description">Dostep do systemu Clode.</p>
        </div>
      </section>

      <LoginForm nextUrl={nextUrl} />
    </div>
  );
}
