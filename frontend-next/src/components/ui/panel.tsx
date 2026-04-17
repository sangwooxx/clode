import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  title?: string;
  description?: string;
};

export function Panel({
  children,
  className,
  title,
  description,
  ...props
}: PanelProps) {
  return (
    <section className={cn("panel", className)} {...props}>
      {(title || description) && (
        <div className="panel__heading">
          {title ? <h2 className="panel__title">{title}</h2> : null}
          {description ? <p className="panel__description">{description}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}
