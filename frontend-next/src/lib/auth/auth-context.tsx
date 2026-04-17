"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { AuthenticatedUser } from "@/lib/api/auth";
import {
  bootstrapSession,
  login as loginRequest,
  logout as logoutRequest,
  requestPasswordReset
} from "@/lib/api/auth";

type AuthContextValue = {
  user: AuthenticatedUser | null;
  initialized: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<AuthenticatedUser | null>;
  logout: () => Promise<void>;
  remindPassword: (username: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const bootstrap = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextUser = await bootstrapSession();
      setUser(nextUser);
    } catch {
      setUser(null);
    } finally {
      setInitialized(true);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(async () => {
    await bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const nextUser = await loginRequest(username, password);
      setUser(nextUser);
      return nextUser;
    } finally {
      setInitialized(true);
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await logoutRequest();
      setUser(null);
    } finally {
      setInitialized(true);
      setIsLoading(false);
    }
  }, []);

  const remindPassword = useCallback(async (username: string) => {
    await requestPasswordReset(username);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initialized,
      isLoading,
      isAuthenticated: Boolean(user),
      bootstrap,
      refresh,
      login,
      logout,
      remindPassword
    }),
    [bootstrap, initialized, isLoading, login, logout, refresh, remindPassword, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
