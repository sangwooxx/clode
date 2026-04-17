import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function FormGrid({
  children,
  className,
  columns = 3,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
}) {
  return (
    <div
      className={cn("form-grid", `form-grid--${columns}`, className)}
      {...props}
    >
      {children}
    </div>
  );
}
