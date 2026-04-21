"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { useAuth } from "@/lib/auth/auth-context";

export function LoginForm({
  nextUrl,
  statusMessage,
}: {
  nextUrl: string;
  statusMessage?: string | null;
}) {
  const { login, isLoading, initialized, isAuthenticated } = useAuth();
  const router = useRouter();
  const resolvedNextUrl = useMemo(
    () => (nextUrl.startsWith("/") ? nextUrl : "/dashboard"),
    [nextUrl]
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function probeExistingSession() {
      try {
        const response = await fetch("/api/v1/auth/me", {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json().catch(() => null)) as { user?: unknown } | null;
        if (payload?.user) {
          router.replace(resolvedNextUrl as Route);
          router.refresh();
        }
      } catch {
        // Login should stay interactive even if the background session probe fails.
      }
    }

    void probeExistingSession();

    return () => controller.abort();
  }, [resolvedNextUrl, router]);

  useEffect(() => {
    if (initialized && isAuthenticated) {
      router.replace(resolvedNextUrl as Route);
      router.refresh();
    }
  }, [initialized, isAuthenticated, resolvedNextUrl, router]);

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
        submitError instanceof Error ? submitError.message : "Logowanie nie powiodlo sie."
      );
    }
  }

  return (
    <form className="auth-form auth-form--login" onSubmit={handleSubmit}>
      <label className="field-card">
        <span className="field-card__label">Uzytkownik</span>
        <input
          className="text-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          placeholder="login lub e-mail"
          autoFocus
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
          placeholder="haslo"
        />
      </label>

      {statusMessage ? <p className="auth-form__status">{statusMessage}</p> : null}
      {error ? <p className="auth-form__error">{error}</p> : null}
      {initialized && isAuthenticated ? (
        <p className="auth-form__status">Sesja jest juz aktywna.</p>
      ) : null}

      <ActionButton type="submit" disabled={isLoading} fullWidth>
        {isLoading ? "Logowanie..." : "Zaloguj sie"}
      </ActionButton>
    </form>
  );
}
