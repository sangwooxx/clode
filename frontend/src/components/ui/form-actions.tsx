import type { ReactNode } from "react";

export function FormActions({
  leading,
  trailing,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  if (!leading && !trailing) {
    return null;
  }

  return (
    <div className="form-actions">
      <div className="form-actions__leading">{leading}</div>
      <div className="form-actions__trailing">{trailing}</div>
    </div>
  );
}
