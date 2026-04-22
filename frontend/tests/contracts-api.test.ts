import { beforeEach, describe, expect, it, vi } from "vitest";

const getContractSnapshotMock = vi.fn();
const updateContractControlMock = vi.fn();

vi.mock("@/lib/api/contracts", () => ({
  archiveContract: vi.fn(),
  createContract: vi.fn(),
  deleteContractPermanently: vi.fn(),
  getContract: vi.fn(),
  getContractSnapshot: (...args: unknown[]) => getContractSnapshotMock(...args),
  listContracts: vi.fn(),
  updateContract: vi.fn(),
  updateContractControl: (...args: unknown[]) => updateContractControlMock(...args),
}));

import {
  fetchContractSnapshot,
  normalizeContractControlPayload,
  saveContractControl,
} from "@/features/contracts/api";

describe("contracts api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes plan and forecast control values without frontend business logic", () => {
    expect(
      normalizeContractControlPayload({
        planned_revenue_total: "100000",
        planned_invoice_cost_total: "32000,50",
        planned_labor_cost_total: "",
        forecast_revenue_total: "",
        forecast_invoice_cost_total: "34000",
        forecast_labor_cost_total: "12000",
        note: "  kontrola kwartalna  ",
      }),
    ).toEqual({
      planned_revenue_total: 100000,
      planned_invoice_cost_total: 32000.5,
      planned_labor_cost_total: null,
      forecast_revenue_total: null,
      forecast_invoice_cost_total: 34000,
      forecast_labor_cost_total: 12000,
      note: "kontrola kwartalna",
    });
  });

  it("returns the backend snapshot payload for contract control", async () => {
    const snapshot = {
      contract: { id: "c-1" },
      plan: { is_configured: true },
      forecast: { is_configured: true },
    };
    getContractSnapshotMock.mockResolvedValueOnce(snapshot);
    updateContractControlMock.mockResolvedValueOnce(snapshot);

    await expect(fetchContractSnapshot("c-1")).resolves.toEqual(snapshot);
    await expect(saveContractControl("c-1", { forecast_invoice_cost_total: 34000 })).resolves.toEqual(
      snapshot,
    );

    expect(getContractSnapshotMock).toHaveBeenCalledWith("c-1");
    expect(updateContractControlMock).toHaveBeenCalledWith("c-1", {
      forecast_invoice_cost_total: 34000,
    });
  });
});
