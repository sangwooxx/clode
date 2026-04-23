"use client";

import { useEffect, type ReactNode } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { cn } from "@/lib/utils/cn";

type AppDrawerProps = {
  eyebrow?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  size?: "default" | "wide";
  actions?: ReactNode;
};

export function AppDrawer({
  eyebrow,
  title,
  onClose,
  children,
  className,
  bodyClassName,
  size = "default",
  actions,
}: AppDrawerProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="app-drawer-shell" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="app-drawer-shell__backdrop"
        aria-label="Zamknij panel"
        onClick={onClose}
      />
      <aside className={cn("app-drawer", size === "wide" && "app-drawer--wide", className)}>
        <div className="app-drawer__header">
          <div className="app-drawer__title-block">
            {eyebrow ? <p className="section-header__eyebrow">{eyebrow}</p> : null}
            <h2 className="app-drawer__title">{title}</h2>
          </div>
          <div className="app-drawer__header-actions">
            {actions}
            <ActionButton type="button" variant="ghost" onClick={onClose}>
              Zamknij
            </ActionButton>
          </div>
        </div>
        <div className={cn("app-drawer__body", bodyClassName)}>{children}</div>
      </aside>
    </div>
  );
}
