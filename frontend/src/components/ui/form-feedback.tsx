type FormFeedbackItem = {
  tone: "error" | "success" | "warning";
  text: string | null | undefined;
};

export function FormFeedback({
  items,
}: {
  items: Array<FormFeedbackItem | null | undefined | false>;
}) {
  const normalized = items.filter(
    (item): item is FormFeedbackItem => {
      if (!item || typeof item !== "object") {
        return false;
      }

      return Boolean(item.text);
    }
  );

  if (normalized.length === 0) {
    return null;
  }

  return (
    <div className="form-feedback">
      {normalized.map((item) => (
        <p
          key={`${item.tone}:${item.text}`}
          className={`status-message status-message--${item.tone}`}
        >
          {item.text}
        </p>
      ))}
    </div>
  );
}
