"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { useAuth } from "@/lib/auth/auth-context";

export function LoginForm({
  nextUrl
}: {
  nextUrl: string;
}) {
  const { login, isLoading, initialized, isAuthenticated } = useAuth();
  const router = useRouter();
  const resolvedNextUrl = useMemo(
    () => (nextUrl.startsWith("/") ? nextUrl : "/dashboard"),
    [nextUrl]
  );
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const user = await login(username, password);
      if (!user) {
        setError("Backend nie zwrocil uzytkownika dla tej sesji.");
        return;
      }
      router.replace(resolvedNextUrl as Route);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Logowanie nie powiodlo sie."
      );
    }
  }

  return (
    <div className="auth-card">
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field-card">
          <span className="field-card__label">Uzytkownik</span>
          <input
            className="text-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="admin"
          />
        </label>

        <label className="field-card">
          <span className="field-card__label">Haslo</span>
          <input
            className="text-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="admin"
          />
        </label>

        {error ? <p className="auth-form__error">{error}</p> : null}
        {initialized && isAuthenticated ? (
          <p className="auth-form__status">Sesja jest juz aktywna.</p>
        ) : null}

        <ActionButton type="submit" disabled={isLoading} fullWidth>
          {isLoading ? "Logowanie..." : "Zaloguj"}
        </ActionButton>
      </form>
    </div>
  );
}
