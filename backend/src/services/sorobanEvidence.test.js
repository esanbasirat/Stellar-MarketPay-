"use strict";

const {
  Networks,
  xdr,
} = require("@stellar/stellar-sdk");

describe("sorobanEvidence", () => {
  const originalEnv = { ...process.env };
  const mockPoolQuery = jest.fn();

  let mockRpcServerInstance;
  let mockSourceAccount;
  let mockPreparedTx;
  let mockStellarSdk;

  const TEST_JOB_ID = "job-456";
  const TEST_CID = "QmTestevidencecid11111111111111111111111111111";
  const TEST_CALLER = "GAFCZHH4Q2PYMJNUY7NICSLMMNHEJ72AG35FNED7IMQSCNCZF4VQHIFA";
  const TEST_CONTRACT_ID = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.DISPUTE_CONTRACT_ID;
    delete process.env.ESCROW_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_CONTRACT_ID;
    delete process.env.SOROBAN_RPC_URL;
    delete process.env.STELLAR_RPC_URL;
    process.env.STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;

    mockPoolQuery.mockReset();
    mockPoolQuery.mockResolvedValue({ rows: [] });
    jest.doMock("../db/pool", () => ({
      query: mockPoolQuery,
    }));

    mockSourceAccount = {
      sequenceNumber: () => "100",
      incrementSequenceNumber: jest.fn(),
      accountId: () => TEST_CALLER,
    };

    mockPreparedTx = {
      toEnvelope: () => ({
        toXDR: (format) => (format === "base64" ? "MOCK_BASE64_XDR" : Buffer.from("MOCK_XDR")),
      }),
    };

    mockRpcServerInstance = {
      getAccount: jest.fn().mockResolvedValue(mockSourceAccount),
      prepareTransaction: jest.fn().mockResolvedValue(mockPreparedTx),
      simulateTransaction: jest.fn(),
    };

    // Spy/mock @stellar/stellar-sdk rpc.Server
    const actualSdk = jest.requireActual("@stellar/stellar-sdk");
    mockStellarSdk = {
      ...actualSdk,
      rpc: {
        ...actualSdk.rpc,
        Server: jest.fn().mockImplementation(() => mockRpcServerInstance),
      },
    };
    jest.doMock("@stellar/stellar-sdk", () => mockStellarSdk);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("resolveContractId", () => {
    it("returns DISPUTE_CONTRACT_ID when configured", async () => {
      process.env.DISPUTE_CONTRACT_ID = TEST_CONTRACT_ID;
      const { resolveContractId } = require("./sorobanEvidence");

      const resolved = await resolveContractId(TEST_JOB_ID);
      expect(resolved).toBe(TEST_CONTRACT_ID);
      expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it("falls back to ESCROW_CONTRACT_ID", async () => {
      process.env.ESCROW_CONTRACT_ID = TEST_CONTRACT_ID;
      const { resolveContractId } = require("./sorobanEvidence");

      const resolved = await resolveContractId(TEST_JOB_ID);
      expect(resolved).toBe(TEST_CONTRACT_ID);
    });

    it("falls back to NEXT_PUBLIC_CONTRACT_ID", async () => {
      process.env.NEXT_PUBLIC_CONTRACT_ID = TEST_CONTRACT_ID;
      const { resolveContractId } = require("./sorobanEvidence");

      const resolved = await resolveContractId(TEST_JOB_ID);
      expect(resolved).toBe(TEST_CONTRACT_ID);
    });

    it("queries database when environment variables are unset", async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ escrow_contract_id: TEST_CONTRACT_ID }],
      });
      const { resolveContractId } = require("./sorobanEvidence");

      const resolved = await resolveContractId(TEST_JOB_ID);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        "SELECT escrow_contract_id FROM jobs WHERE id = $1",
        [TEST_JOB_ID],
      );
      expect(resolved).toBe(TEST_CONTRACT_ID);
    });

    it("returns null when neither env nor database provides contractId", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      const { resolveContractId } = require("./sorobanEvidence");

      const resolved = await resolveContractId(TEST_JOB_ID);
      expect(resolved).toBeNull();
    });
  });

  describe("recordEvidenceCidOnChain", () => {
    it("validates missing arguments", async () => {
      const { recordEvidenceCidOnChain } = require("./sorobanEvidence");

      expect(await recordEvidenceCidOnChain({})).toEqual({
        success: false,
        error: "Missing jobId / cid / callerAddress",
      });
      expect(await recordEvidenceCidOnChain({ jobId: "job-1", cid: "" })).toEqual({
        success: false,
        error: "Missing jobId / cid / callerAddress",
      });
    });

    it("returns error when contract ID cannot be resolved", async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      const { recordEvidenceCidOnChain } = require("./sorobanEvidence");

      const res = await recordEvidenceCidOnChain({
        jobId: TEST_JOB_ID,
        cid: TEST_CID,
        callerAddress: TEST_CALLER,
      });

      expect(res).toEqual({
        success: false,
        error: "Contract ID not configured",
      });
    });

    it("returns error when caller account is not found on network", async () => {
      process.env.DISPUTE_CONTRACT_ID = TEST_CONTRACT_ID;
      mockRpcServerInstance.getAccount.mockRejectedValueOnce(new Error("Not found"));
      const { recordEvidenceCidOnChain } = require("./sorobanEvidence");

      const res = await recordEvidenceCidOnChain({
        jobId: TEST_JOB_ID,
        cid: TEST_CID,
        callerAddress: TEST_CALLER,
      });

      expect(res).toEqual({
        success: false,
        error: `Account ${TEST_CALLER} not found on network`,
      });
    });

    it("assembles transaction with deterministic evidence byte encoding and prepares XDR", async () => {
      process.env.DISPUTE_CONTRACT_ID = TEST_CONTRACT_ID;
      const { recordEvidenceCidOnChain } = require("./sorobanEvidence");

      const res = await recordEvidenceCidOnChain({
        jobId: TEST_JOB_ID,
        cid: TEST_CID,
        callerAddress: TEST_CALLER,
      });

      expect(res.success).toBe(true);
      expect(res.contractId).toBe(TEST_CONTRACT_ID);
      expect(res.xdr).toBe("MOCK_BASE64_XDR");
      expect(res.networkPassphrase).toBe(Networks.TESTNET);
      expect(mockRpcServerInstance.prepareTransaction).toHaveBeenCalledTimes(1);

      // Verify transaction operation parameters
      const preparedCallArg = mockRpcServerInstance.prepareTransaction.mock.calls[0][0];
      expect(preparedCallArg.operations).toHaveLength(1);
      const op = preparedCallArg.operations[0];
      const invoke = op.func.invokeContract();

      // Operation function name & args: submit_evidence_cid
      expect(invoke.functionName().toString()).toBe("submit_evidence_cid");
      expect(invoke.args()).toHaveLength(3);

      // Verify deterministic CID conversion: utf-8 string to ScVal Bytes
      const expectedCidBytes = Buffer.from(TEST_CID, "utf8");
      const passedCidBytes = invoke.args()[1].bytes();
      expect(passedCidBytes).toEqual(expectedCidBytes);
      expect(passedCidBytes.toString("utf8")).toBe(TEST_CID);
    });

    it("handles prepareTransaction failures gracefully", async () => {
      process.env.DISPUTE_CONTRACT_ID = TEST_CONTRACT_ID;
      mockRpcServerInstance.prepareTransaction.mockRejectedValueOnce(
        new Error("Fee estimation failed"),
      );
      const { recordEvidenceCidOnChain } = require("./sorobanEvidence");

      const res = await recordEvidenceCidOnChain({
        jobId: TEST_JOB_ID,
        cid: TEST_CID,
        callerAddress: TEST_CALLER,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Soroban prepareTransaction failed: Fee estimation failed");
    });
  });

  describe("prepareDeliverableHashUpdate", () => {
    it("validates missing parameters", async () => {
      const { prepareDeliverableHashUpdate } = require("./sorobanEvidence");

      const res = await prepareDeliverableHashUpdate({ jobId: "", cid: TEST_CID });
      expect(res.success).toBe(false);
      expect(res.error).toBe("Missing jobId / cid / callerAddress");
    });

    it("assembles transaction and returns prepared base64 XDR", async () => {
      process.env.DISPUTE_CONTRACT_ID = TEST_CONTRACT_ID;
      const { prepareDeliverableHashUpdate } = require("./sorobanEvidence");

      const res = await prepareDeliverableHashUpdate({
        jobId: TEST_JOB_ID,
        cid: TEST_CID,
        callerAddress: TEST_CALLER,
      });

      expect(res.success).toBe(true);
      expect(res.contractId).toBe(TEST_CONTRACT_ID);
      expect(res.xdr).toBe("MOCK_BASE64_XDR");
      expect(mockRpcServerInstance.prepareTransaction).toHaveBeenCalledTimes(1);

      const op = mockRpcServerInstance.prepareTransaction.mock.calls[0][0].operations[0];
      const invoke = op.func.invokeContract();
      expect(invoke.functionName().toString()).toBe("update_deliverable_proof_hash");
    });

    it("returns error when caller account is missing", async () => {
      process.env.DISPUTE_CONTRACT_ID = TEST_CONTRACT_ID;
      mockRpcServerInstance.getAccount.mockResolvedValueOnce(null);
      const { prepareDeliverableHashUpdate } = require("./sorobanEvidence");

      const res = await prepareDeliverableHashUpdate({
        jobId: TEST_JOB_ID,
        cid: TEST_CID,
        callerAddress: TEST_CALLER,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe(`Account ${TEST_CALLER} not found on network`);
    });
  });

  describe("getOnchainEvidenceCids & round-trip decoding", () => {
    it("returns empty array when jobId is missing or contract ID unresolvable", async () => {
      const sorobanEvidence = require("./sorobanEvidence");
      sorobanEvidence._clearCache();

      expect(await sorobanEvidence.getOnchainEvidenceCids(null)).toEqual([]);

      mockPoolQuery.mockResolvedValue({ rows: [] });
      expect(await sorobanEvidence.getOnchainEvidenceCids("unconfigured-job")).toEqual([]);
    });

    it("decodes Vec<Bytes> contract simulation result back to original CID strings (round-trip)", async () => {
      process.env.DISPUTE_CONTRACT_ID = TEST_CONTRACT_ID;
      const sorobanEvidence = require("./sorobanEvidence");
      sorobanEvidence._clearCache();

      const cidsToAnchor = [
        "QmTestevidencecid11111111111111111111111111111",
        "QmTestevidencecid22222222222222222222222222222",
      ];

      // Convert CIDs into Soroban native/scVal representation (array of Bytes Buffers)
      const scValVec = xdr.ScVal.scvVec(
        cidsToAnchor.map((c) => xdr.ScVal.scvBytes(Buffer.from(c, "utf8"))),
      );

      mockRpcServerInstance.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: scValVec,
        },
      });

      const resultCids = await sorobanEvidence.getOnchainEvidenceCids(TEST_JOB_ID);

      // Verify perfect round-trip decoding
      expect(resultCids).toEqual(cidsToAnchor);
      expect(mockRpcServerInstance.simulateTransaction).toHaveBeenCalledTimes(1);

      // Verify that subsequent call within TTL returns cached result without RPC call
      const cachedCids = await sorobanEvidence.getOnchainEvidenceCids(TEST_JOB_ID);
      expect(cachedCids).toEqual(cidsToAnchor);
      expect(mockRpcServerInstance.simulateTransaction).toHaveBeenCalledTimes(1);
    });

    it("handles non-buffer string elements in retval cleanly", async () => {
      process.env.DISPUTE_CONTRACT_ID = TEST_CONTRACT_ID;
      const sorobanEvidence = require("./sorobanEvidence");
      sorobanEvidence._clearCache();

      const scValVec = xdr.ScVal.scvVec([
        xdr.ScVal.scvString("cid-string-1"),
        xdr.ScVal.scvString("cid-string-2"),
      ]);
      mockRpcServerInstance.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: scValVec,
        },
      });

      const res = await sorobanEvidence.getOnchainEvidenceCids(TEST_JOB_ID);
      expect(res).toEqual(["cid-string-1", "cid-string-2"]);
    });

    it("returns empty array without throwing when simulation fails or RPC is unreachable", async () => {
      process.env.DISPUTE_CONTRACT_ID = TEST_CONTRACT_ID;
      const sorobanEvidence = require("./sorobanEvidence");
      sorobanEvidence._clearCache();

      mockRpcServerInstance.simulateTransaction.mockRejectedValueOnce(
        new Error("Connection refused"),
      );

      const res = await sorobanEvidence.getOnchainEvidenceCids(TEST_JOB_ID);
      expect(res).toEqual([]);
    });
  });

  describe("isEvidenceAvailable", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("returns false if gatewayUrl is not provided", async () => {
      const { isEvidenceAvailable } = require("./sorobanEvidence");
      expect(await isEvidenceAvailable("")).toBe(false);
      expect(await isEvidenceAvailable(null)).toBe(false);
    });

    it("returns true when fetch responds with ok: true", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      const { isEvidenceAvailable } = require("./sorobanEvidence");

      const res = await isEvidenceAvailable("https://ipfs.io/ipfs/test-cid");
      expect(res).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://ipfs.io/ipfs/test-cid",
        expect.objectContaining({ method: "HEAD" }),
      );
    });

    it("returns false when fetch responds with ok: false (404 or 500)", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
      const { isEvidenceAvailable } = require("./sorobanEvidence");

      const res = await isEvidenceAvailable("https://ipfs.io/ipfs/missing-cid");
      expect(res).toBe(false);
    });

    it("returns false when fetch rejects or aborts", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("Timeout"));
      const { isEvidenceAvailable } = require("./sorobanEvidence");

      const res = await isEvidenceAvailable("https://ipfs.io/ipfs/timeout-cid");
      expect(res).toBe(false);
    });
  });
});
