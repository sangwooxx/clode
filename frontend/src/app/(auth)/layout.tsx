import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/app-providers";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AppProviders initialUser={null}>{children}</AppProviders>;
}
