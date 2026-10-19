"use strict";

const { SorobanContractError, CONTRACT_ERROR_CODES } = require("../utils/contractErrors");

describe("sorobanArbitratorRegistry", () => {
  const originalEnv = { ...process.env };
  const mockPoolQuery = jest.fn();
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
  };

  let mockReadContractValue;
  let nativeToScVal;
  let xdr;

  const TEST_REGISTRY_CONTRACT_ID = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";
  const TEST_ADDR_1 = "GAFCZHH4Q2PYMJNUY7NICSLMMNHEJ72AG35FNED7IMQSCNCZF4VQHIFA";
  const TEST_ADDR_2 = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.ARBITRATOR_REGISTRY_CONTRACT_ID = TEST_REGISTRY_CONTRACT_ID;

    // Load stellar-sdk from current module registry so xdr enum references match
    const sdk = require("@stellar/stellar-sdk");
    nativeToScVal = sdk.nativeToScVal;
    xdr = sdk.xdr;

    mockPoolQuery.mockReset();
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockCache.get.mockReset();
    mockCache.set.mockReset();

    mockReadContractValue = jest.fn();

    jest.doMock("../db/pool", () => ({
      query: mockPoolQuery,
    }));

    jest.doMock("../utils/cache", () => mockCache);

    jest.doMock("./sorobanClient", () => ({
      readContractValue: mockReadContractValue,
    }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("getArbitratorAddresses", () => {
    it("returns empty array if ARBITRATOR_REGISTRY_CONTRACT_ID is not configured", async () => {
      delete process.env.ARBITRATOR_REGISTRY_CONTRACT_ID;
      const { getArbitratorAddresses } = require("./sorobanArbitratorRegistry");

      const addresses = await getArbitratorAddresses();
      expect(addresses).toEqual([]);
      expect(mockReadContractValue).not.toHaveBeenCalled();
    });

    it("fetches and decodes arbitrator addresses from contract via retval", async () => {
      const { getArbitratorAddresses } = require("./sorobanArbitratorRegistry");

      const scValAddresses = xdr.ScVal.scvVec([
        nativeToScVal(TEST_ADDR_1, { type: "address" }),
        nativeToScVal(TEST_ADDR_2, { type: "address" }),
      ]);

      mockReadContractValue.mockResolvedValueOnce({
        retval: scValAddresses,
      });

      const addresses = await getArbitratorAddresses();
      expect(addresses).toEqual([TEST_ADDR_1, TEST_ADDR_2]);
      expect(mockReadContractValue).toHaveBeenCalledWith(
        TEST_REGISTRY_CONTRACT_ID,
        "get_arbitrators",
        [],
      );
    });

    it("handles results array format when retval is not present", async () => {
      const { getArbitratorAddresses } = require("./sorobanArbitratorRegistry");

      const scValAddresses = xdr.ScVal.scvVec([
        nativeToScVal(TEST_ADDR_1, { type: "address" }),
      ]);

      mockReadContractValue.mockResolvedValueOnce({
        results: [scValAddresses],
      });

      const addresses = await getArbitratorAddresses();
      expect(addresses).toEqual([TEST_ADDR_1]);
    });

    it("returns empty array if readContractValue returns null or empty scVals", async () => {
      const { getArbitratorAddresses } = require("./sorobanArbitratorRegistry");

      mockReadContractValue.mockResolvedValueOnce(null);
      expect(await getArbitratorAddresses()).toEqual([]);

      mockReadContractValue.mockResolvedValueOnce({ results: [] });
      expect(await getArbitratorAddresses()).toEqual([]);
    });
  });

  describe("isArbitrator", () => {
    it("returns false if contract ID is not configured", async () => {
      delete process.env.ARBITRATOR_REGISTRY_CONTRACT_ID;
      const { isArbitrator } = require("./sorobanArbitratorRegistry");

      expect(await isArbitrator(TEST_ADDR_1)).toBe(false);
    });

    it("returns true when contract simulation confirms arbitrator", async () => {
      const { isArbitrator } = require("./sorobanArbitratorRegistry");

      mockReadContractValue.mockResolvedValueOnce({
        retval: xdr.ScVal.scvBool(true),
      });

      const result = await isArbitrator(TEST_ADDR_1);
      expect(result).toBe(true);
      expect(mockReadContractValue).toHaveBeenCalledWith(
        TEST_REGISTRY_CONTRACT_ID,
        "is_arbitrator",
        [expect.any(Object)],
      );
    });

    it("returns false when contract returns false or call fails", async () => {
      const { isArbitrator } = require("./sorobanArbitratorRegistry");

      mockReadContractValue.mockResolvedValueOnce({
        retval: xdr.ScVal.scvBool(false),
      });
      expect(await isArbitrator(TEST_ADDR_1)).toBe(false);

      mockReadContractValue.mockRejectedValueOnce(new Error("RPC timeout"));
      expect(await isArbitrator(TEST_ADDR_1)).toBe(false);
    });
  });

  describe("getArbitratorCount", () => {
    it("returns 0 if contract ID is not set", async () => {
      delete process.env.ARBITRATOR_REGISTRY_CONTRACT_ID;
      const { getArbitratorCount } = require("./sorobanArbitratorRegistry");

      expect(await getArbitratorCount()).toBe(0);
    });

    it("decodes and returns numeric count", async () => {
      const { getArbitratorCount } = require("./sorobanArbitratorRegistry");

      mockReadContractValue.mockResolvedValueOnce({
        retval: xdr.ScVal.scvU32(5),
      });

      expect(await getArbitratorCount()).toBe(5);
      expect(mockReadContractValue).toHaveBeenCalledWith(
        TEST_REGISTRY_CONTRACT_ID,
        "get_arbitrator_count",
        [],
      );
    });

    it("returns 0 on simulation error", async () => {
      const { getArbitratorCount } = require("./sorobanArbitratorRegistry");

      mockReadContractValue.mockRejectedValueOnce(new Error("RPC failed"));
      expect(await getArbitratorCount()).toBe(0);
    });
  });

  describe("getArbitratorInfo", () => {
    it("returns null if contract ID is not set", async () => {
      delete process.env.ARBITRATOR_REGISTRY_CONTRACT_ID;
      const { getArbitratorInfo } = require("./sorobanArbitratorRegistry");

      expect(await getArbitratorInfo(TEST_ADDR_1)).toBeNull();
    });

    it("decodes arbitrator struct fields into formatted object", async () => {
      const { getArbitratorInfo } = require("./sorobanArbitratorRegistry");

      const infoScVal = nativeToScVal({
        active: true,
        staked_amount: 10000000n,
        metadata_uri: "ipfs://QmArbitratorInfo",
        registered_at: 1718000000n,
      });

      mockReadContractValue.mockResolvedValueOnce({
        retval: infoScVal,
      });

      const info = await getArbitratorInfo(TEST_ADDR_1);
      expect(info).toEqual({
        active: true,
        stakedAmount: "10000000",
        metadataUri: "ipfs://QmArbitratorInfo",
        registeredAt: 1718000000n,
      });
    });

    it("returns null on error or empty response", async () => {
      const { getArbitratorInfo } = require("./sorobanArbitratorRegistry");

      mockReadContractValue.mockResolvedValueOnce(null);
      expect(await getArbitratorInfo(TEST_ADDR_1)).toBeNull();

      mockReadContractValue.mockRejectedValueOnce(new Error("Contract call error"));
      expect(await getArbitratorInfo(TEST_ADDR_1)).toBeNull();
    });
  });

  describe("circuit breaker & contract error propagation", () => {
    it("opens circuit after 5 consecutive failures and fails fast with 503", async () => {
      const registry = require("./sorobanArbitratorRegistry");

      const contractError = new SorobanContractError(
        "Soroban simulation failed for get_arbitrators: Need at least 3 registered arbitrators",
        {
          code: CONTRACT_ERROR_CODES.NEED_3_ARBITRATORS,
          contractErrorCode: 7008,
          method: "get_arbitrators",
        },
      );

      // Trigger 5 consecutive failures
      for (let i = 0; i < 5; i++) {
        mockReadContractValue.mockRejectedValueOnce(contractError);
        await expect(registry.listArbitrators()).rejects.toMatchObject({
          status: 503,
          message: "Arbitrator registry temporarily unavailable",
        });
      }

      // 6th call should trip circuit breaker immediately without calling readContractValue
      await expect(registry.getArbitratorAddresses()).rejects.toThrow(
        "Soroban arbitrator registry circuit is open",
      );
      // readContractValue was only called 5 times, not 6
      expect(mockReadContractValue).toHaveBeenCalledTimes(5);
    });

    it("attaches isSorobanRegistryError and preserves contractErrorCode when readContractValue fails", async () => {
      const registry = require("./sorobanArbitratorRegistry");

      const contractError = new SorobanContractError(
        "Arbitration case not found",
        {
          code: 7010,
          contractErrorCode: 7010,
          method: "get_case",
        },
      );

      mockReadContractValue.mockRejectedValueOnce(contractError);

      try {
        await registry.getArbitratorAddresses();
        throw new Error("Expected call to fail");
      } catch (err) {
        expect(err.isSorobanRegistryError).toBe(true);
        expect(err.contractErrorCode).toBe(7010);
      }
    });
  });

  describe("listArbitrators", () => {
    it("enriches on-chain arbitrators with off-chain database metadata and caches result", async () => {
      const { listArbitrators } = require("./sorobanArbitratorRegistry");

      mockReadContractValue.mockResolvedValueOnce({
        retval: xdr.ScVal.scvVec([
          nativeToScVal(TEST_ADDR_1, { type: "address" }),
          nativeToScVal(TEST_ADDR_2, { type: "address" }),
        ]),
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            public_key: TEST_ADDR_1,
            display_name: "Alice Arbitrator",
            bio: "Certified Stellar mediator",
            disputes_resolved: "12",
          },
        ],
      });

      const list = await listArbitrators();

      expect(list).toEqual([
        {
          publicKey: TEST_ADDR_1,
          displayName: "Alice Arbitrator",
          bio: "Certified Stellar mediator",
          disputesResolved: 12,
          onChain: true,
        },
        {
          publicKey: TEST_ADDR_2,
          displayName: null,
          bio: null,
          disputesResolved: 0,
          onChain: true,
        },
      ]);

      expect(mockCache.set).toHaveBeenCalledWith(
        "dao:arbitrators:list",
        list,
        24 * 60 * 60,
      );
    });

    it("falls back to database when on-chain list is empty", async () => {
      const { listArbitrators } = require("./sorobanArbitratorRegistry");

      mockReadContractValue.mockResolvedValueOnce({
        retval: xdr.ScVal.scvVec([]),
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            public_key: TEST_ADDR_1,
            display_name: "Bob DB",
            bio: "Community voted arbitrator",
            disputes_resolved: 3,
            votes_received: 25,
          },
        ],
      });

      const list = await listArbitrators();
      expect(list).toEqual([
        {
          publicKey: TEST_ADDR_1,
          displayName: "Bob DB",
          bio: "Community voted arbitrator",
          disputesResolved: 3,
          onChain: false,
        },
      ]);
    });

    it("returns cached arbitrators if RPC call fails and cached data is available", async () => {
      const { listArbitrators } = require("./sorobanArbitratorRegistry");

      mockReadContractValue.mockRejectedValueOnce(new Error("RPC connection refused"));
      const cachedData = [
        { publicKey: TEST_ADDR_1, displayName: "Cached Arbitrator", onChain: true },
      ];
      mockCache.get.mockResolvedValueOnce(cachedData);

      const list = await listArbitrators();
      expect(list).toEqual(cachedData);
    });

    it("calls getDbArbitrators directly when ARBITRATOR_REGISTRY_CONTRACT_ID is unset", async () => {
      delete process.env.ARBITRATOR_REGISTRY_CONTRACT_ID;
      const { listArbitrators } = require("./sorobanArbitratorRegistry");

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            public_key: TEST_ADDR_1,
            display_name: "Fallback DB",
            bio: "Direct DB read",
            disputes_resolved: 1,
          },
        ],
      });

      const list = await listArbitrators();
      expect(list).toHaveLength(1);
      expect(list[0].publicKey).toBe(TEST_ADDR_1);
      expect(list[0].onChain).toBe(false);
      expect(mockReadContractValue).not.toHaveBeenCalled();
    });
  });
});
