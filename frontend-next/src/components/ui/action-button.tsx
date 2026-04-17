import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
};

export function ActionButton({
  children,
  className,
  variant = "primary",
  fullWidth = false,
  ...props
}: ActionButtonProps) {
  return (
    <button
      className={cn(
        "action-button",
        `action-button--${variant}`,
        fullWidth && "action-button--full",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
