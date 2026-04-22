import { beforeEach, describe, expect, it, vi } from "vitest";

const createContractMock = vi.fn();
const updateContractMock = vi.fn();
const archiveContractMock = vi.fn();
const deleteContractPermanentlyMock = vi.fn();
const getContractSnapshotMock = vi.fn();

vi.mock("@/lib/api/contracts", () => ({
  createContract: (...args: unknown[]) => createContractMock(...args),
  updateContract: (...args: unknown[]) => updateContractMock(...args),
  archiveContract: (...args: unknown[]) => archiveContractMock(...args),
  deleteContractPermanently: (...args: unknown[]) => deleteContractPermanentlyMock(...args),
  getContractSnapshot: (...args: unknown[]) => getContractSnapshotMock(...args),
  getContract: vi.fn(),
  listContracts: vi.fn()
}));

import {
  archiveContractRecord,
  deleteContractRecord,
  fetchContractSnapshot,
  saveContract
} from "@/features/contracts/api";

describe("contracts api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new contract without changing the CRUD path", async () => {
    createContractMock.mockResolvedValueOnce({
      contract: { id: "contract-1", name: "Budowa hali" }
    });

    const result = await saveContract(null, {
      contract_number: "K/2026/011",
      name: "Budowa hali",
      investor: "Inwestor A",
      signed_date: "2026-01-10",
      end_date: "2026-11-30",
      contract_value: 250000,
      status: "active"
    });

    expect(createContractMock).toHaveBeenCalledTimes(1);
    expect(updateContractMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "contract-1", name: "Budowa hali" });
  });

  it("updates an existing contract without changing the CRUD path", async () => {
    updateContractMock.mockResolvedValueOnce({
      contract: { id: "contract-1", name: "Budowa hali po zmianie" }
    });

    const result = await saveContract("contract-1", {
      contract_number: "K/2026/011",
      name: "Budowa hali po zmianie",
      investor: "Inwestor A",
      signed_date: "2026-01-10",
      end_date: "2026-11-30",
      contract_value: 255000,
      status: "active"
    });

    expect(updateContractMock).toHaveBeenCalledWith(
      "contract-1",
      expect.objectContaining({ name: "Budowa hali po zmianie" })
    );
    expect(createContractMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "contract-1", name: "Budowa hali po zmianie" });
  });

  it("fetches the backend-first contract snapshot and preserves archive/delete actions", async () => {
    getContractSnapshotMock.mockResolvedValueOnce({
      contract: { id: "contract-1", name: "Budowa hali" },
      metrics: { revenue_total: 1 },
      activity: { has_data: true },
      monthly_breakdown: []
    });
    archiveContractMock.mockResolvedValueOnce({
      contract: { id: "contract-1", status: "archived" }
    });
    deleteContractPermanentlyMock.mockResolvedValueOnce({ ok: true });

    const snapshot = await fetchContractSnapshot("contract-1");
    const archived = await archiveContractRecord("contract-1");
    await deleteContractRecord("contract-1");

    expect(getContractSnapshotMock).toHaveBeenCalledWith("contract-1");
    expect(snapshot.contract.id).toBe("contract-1");
    expect(archiveContractMock).toHaveBeenCalledWith("contract-1");
    expect(archived.status).toBe("archived");
    expect(deleteContractPermanentlyMock).toHaveBeenCalledWith("contract-1");
  });
});
