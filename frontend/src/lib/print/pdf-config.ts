export type PdfColumnDefinition = {
  id: string;
  label: string;
  defaultEnabled?: boolean;
};

export type PdfSectionDefinition = {
  id: string;
  label: string;
  description?: string;
  defaultEnabled?: boolean;
  preview?: string[];
  columns?: PdfColumnDefinition[];
};

export type PdfConfigState = Record<
  string,
  {
    enabled: boolean;
    columns: Record<string, boolean>;
  }
>;

export type PdfDialogSection = Omit<PdfSectionDefinition, "columns"> & {
  enabled: boolean;
  columns?: Array<PdfColumnDefinition & { enabled: boolean }>;
};

export function createPdfConfigState(definitions: PdfSectionDefinition[]): PdfConfigState {
  return Object.fromEntries(
    definitions.map((section) => [
      section.id,
      {
        enabled: section.defaultEnabled ?? true,
        columns: Object.fromEntries(
          (section.columns || []).map((column) => [column.id, column.defaultEnabled ?? true])
        ),
      },
    ])
  );
}

export function buildPdfDialogSections(
  definitions: PdfSectionDefinition[],
  state: PdfConfigState
): PdfDialogSection[] {
  return definitions.map((section) => ({
    ...section,
    enabled: state[section.id]?.enabled ?? (section.defaultEnabled ?? true),
    columns: section.columns?.map((column) => ({
      ...column,
      enabled: state[section.id]?.columns?.[column.id] ?? (column.defaultEnabled ?? true),
    })),
  }));
}

export function togglePdfSection(state: PdfConfigState, sectionId: string): PdfConfigState {
  const current = state[sectionId];
  if (!current) return state;

  return {
    ...state,
    [sectionId]: {
      ...current,
      enabled: !current.enabled,
    },
  };
}

export function togglePdfColumn(
  state: PdfConfigState,
  sectionId: string,
  columnId: string
): PdfConfigState {
  const section = state[sectionId];
  if (!section) return state;

  const enabledColumns = Object.entries(section.columns).filter(([, enabled]) => enabled);
  const isCurrentlyEnabled = Boolean(section.columns[columnId]);

  if (isCurrentlyEnabled && enabledColumns.length === 1) {
    return state;
  }

  return {
    ...state,
    [sectionId]: {
      ...section,
      columns: {
        ...section.columns,
        [columnId]: !isCurrentlyEnabled,
      },
    },
  };
}

export function getEnabledPdfColumnIds(state: PdfConfigState, sectionId: string) {
  const columns = state[sectionId]?.columns || {};
  return Object.entries(columns)
    .filter(([, enabled]) => enabled)
    .map(([columnId]) => columnId);
}
