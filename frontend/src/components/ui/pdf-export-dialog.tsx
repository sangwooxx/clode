"use client";

import { useEffect, useMemo } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { FormActions } from "@/components/ui/form-actions";
import type { PdfDialogSection } from "@/lib/print/pdf-config";

type PdfExportDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  context?: string[];
  sections: PdfDialogSection[];
  onClose: () => void;
  onToggleSection: (sectionId: string) => void;
  onToggleColumn: (sectionId: string, columnId: string) => void;
  onReset: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
};

export function PdfExportDialog({
  open,
  title,
  description,
  context,
  sections,
  onClose,
  onToggleSection,
  onToggleColumn,
  onReset,
  onConfirm,
  confirmLabel = "Drukuj PDF",
}: PdfExportDialogProps) {
  const enabledSections = useMemo(
    () => sections.filter((section) => section.enabled),
    [sections]
  );

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="pdf-dialog-backdrop" onClick={onClose}>
      <div
        className="pdf-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pdf-dialog__header">
          <div className="pdf-dialog__title-block">
            <span className="pdf-dialog__eyebrow">Clode</span>
            <h2 className="pdf-dialog__title">{title}</h2>
            {description ? <p className="pdf-dialog__description">{description}</p> : null}
          </div>
          <ActionButton type="button" variant="ghost" onClick={onClose}>
            Zamknij
          </ActionButton>
        </div>

        <div className="pdf-dialog__summary">
          <div className="pdf-dialog__summary-card">
            <span className="pdf-dialog__summary-label">Sekcje w dokumencie</span>
            <strong className="pdf-dialog__summary-value">{enabledSections.length}</strong>
          </div>
          <div className="pdf-dialog__summary-card pdf-dialog__summary-card--wide">
            <span className="pdf-dialog__summary-label">Podgląd logiczny wydruku</span>
            <div className="pdf-dialog__tags">
              {enabledSections.length ? (
                enabledSections.map((section) => (
                  <span key={section.id} className="pdf-dialog__tag">
                    {section.label}
                  </span>
                ))
              ) : (
                <span className="pdf-dialog__empty">Wybierz co najmniej jedną sekcję dokumentu.</span>
              )}
            </div>
          </div>
        </div>

        {context?.length ? (
          <div className="pdf-dialog__context">
            {context.map((item) => (
              <span key={item} className="pdf-dialog__context-item">
                {item}
              </span>
            ))}
          </div>
        ) : null}

        <div className="pdf-dialog__body">
          {sections.map((section) => (
            <section
              key={section.id}
              className={section.enabled ? "pdf-dialog__section" : "pdf-dialog__section pdf-dialog__section--muted"}
            >
              <label className="pdf-dialog__toggle">
                <input
                  type="checkbox"
                  checked={section.enabled}
                  onChange={() => onToggleSection(section.id)}
                />
                <div className="pdf-dialog__toggle-copy">
                  <span className="pdf-dialog__section-title">{section.label}</span>
                  {section.description ? (
                    <span className="pdf-dialog__section-description">{section.description}</span>
                  ) : null}
                </div>
              </label>

              {section.preview?.length ? (
                <div className="pdf-dialog__preview">
                  {section.preview.map((item) => (
                    <span key={item} className="pdf-dialog__preview-item">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}

              {section.columns?.length ? (
                <div className="pdf-dialog__columns">
                  <span className="pdf-dialog__columns-title">Kolumny tabeli</span>
                  <div className="pdf-dialog__checkbox-grid">
                    {section.columns.map((column) => (
                      <label
                        key={column.id}
                        className={
                          section.enabled
                            ? "pdf-dialog__checkbox"
                            : "pdf-dialog__checkbox pdf-dialog__checkbox--disabled"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={column.enabled}
                          disabled={!section.enabled}
                          onChange={() => onToggleColumn(section.id, column.id)}
                        />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ))}
        </div>

        <FormActions
          leading={
            <ActionButton type="button" variant="secondary" onClick={onReset}>
              Ustaw domyślne
            </ActionButton>
          }
          trailing={
            <>
              <ActionButton type="button" variant="secondary" onClick={onClose}>
                Anuluj
              </ActionButton>
              <ActionButton
                type="button"
                onClick={onConfirm}
                disabled={enabledSections.length === 0}
              >
                {confirmLabel}
              </ActionButton>
            </>
          }
        />
      </div>
    </div>
  );
}
