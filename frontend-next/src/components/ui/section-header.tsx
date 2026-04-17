import type { ReactNode } from "react";

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow ? <p className="section-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="section-header__title">{title}</h1>
      </div>
      {actions ? <div className="section-header__actions">{actions}</div> : null}
    </div>
  );
}
