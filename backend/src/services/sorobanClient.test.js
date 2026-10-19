"use strict";

const {
  CONTRACT_ERROR_CODES,
  getContractErrorCode,
  mapContractError,
  SorobanContractError,
} = require("../utils/contractErrors");

describe("sorobanClient", () => {
  const originalEnv = { ...process.env };
  let mockServerInstance;
  let mockContractInstance;
  let mockIsSimulationError;
  let mockTransactionBuilderInstance;
  let mockStellarSdk;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SOROBAN_RPC_URL;
    delete process.env.STELLAR_RPC_URL;
    process.env.STELLAR_NETWORK = "testnet";

    mockServerInstance = {
      simulateTransaction: jest.fn(),
    };

    mockContractInstance = {
      call: jest.fn().mockImplementation((method, ...args) => ({
        type: "contract_call",
        method,
        args,
      })),
    };

    mockTransactionBuilderInstance = {
      addOperation: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({ id: "mock_built_tx" }),
    };

    mockIsSimulationError = jest.fn().mockReturnValue(false);

    mockStellarSdk = {
      SorobanRpc: {
        Server: jest.fn().mockImplementation(() => mockServerInstance),
        TransactionBuilder: jest.fn().mockImplementation(() => mockTransactionBuilderInstance),
        Api: {
          isSimulationError: mockIsSimulationError,
        },
      },
      Contract: jest.fn().mockImplementation(() => mockContractInstance),
    };

    jest.doMock("@stellar/stellar-sdk", () => mockStellarSdk);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("getServer & configuration", () => {
    it("initializes SorobanRpc.Server with testnet RPC url by default", () => {
      process.env.STELLAR_NETWORK = "testnet";
      const sorobanClient = require("./sorobanClient");

      const server = sorobanClient.getServer();
      expect(server).toBe(mockServerInstance);
      expect(mockStellarSdk.SorobanRpc.Server).toHaveBeenCalledWith(
        "https://rpc-testnet.stellar.org",
        { allowHttp: false },
      );
    });

    it("initializes SorobanRpc.Server with mainnet RPC url when STELLAR_NETWORK is mainnet", () => {
      process.env.STELLAR_NETWORK = "mainnet";
      const sorobanClient = require("./sorobanClient");

      const server = sorobanClient.getServer();
      expect(server).toBe(mockServerInstance);
      expect(mockStellarSdk.SorobanRpc.Server).toHaveBeenCalledWith(
        "https://rpc.mainnet.stellar.org",
        { allowHttp: false },
      );
    });

    it("respects process.env.SOROBAN_RPC_URL and sets allowHttp for http URLs", () => {
      process.env.SOROBAN_RPC_URL = "http://localhost:8000/soroban/rpc";
      const sorobanClient = require("./sorobanClient");

      const server = sorobanClient.getServer();
      expect(server).toBe(mockServerInstance);
      expect(mockStellarSdk.SorobanRpc.Server).toHaveBeenCalledWith(
        "http://localhost:8000/soroban/rpc",
        { allowHttp: true },
      );
    });

    it("respects process.env.STELLAR_RPC_URL when SOROBAN_RPC_URL is unset", () => {
      process.env.STELLAR_RPC_URL = "https://custom-stellar-rpc.org";
      const sorobanClient = require("./sorobanClient");

      sorobanClient.getServer();
      expect(mockStellarSdk.SorobanRpc.Server).toHaveBeenCalledWith(
        "https://custom-stellar-rpc.org",
        { allowHttp: false },
      );
    });

    it("caches the server instance as a singleton on repeated calls", () => {
      const sorobanClient = require("./sorobanClient");

      const server1 = sorobanClient.getServer();
      const server2 = sorobanClient.getServer();
      expect(server1).toBe(server2);
      expect(mockStellarSdk.SorobanRpc.Server).toHaveBeenCalledTimes(1);
    });
  });

  describe("getContract", () => {
    it("returns a new Contract instance with the provided contract ID", () => {
      const sorobanClient = require("./sorobanClient");
      const contract = sorobanClient.getContract("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

      expect(contract).toBe(mockContractInstance);
      expect(mockStellarSdk.Contract).toHaveBeenCalledWith(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      );
    });
  });

  describe("readContractValue", () => {
    it("assembles transaction and decodes simulated result successfully", async () => {
      process.env.STELLAR_NETWORK = "testnet";
      const sorobanClient = require("./sorobanClient");

      const expectedValue = { xdr: "AAAA..." };
      mockServerInstance.simulateTransaction.mockResolvedValue({
        result: expectedValue,
      });

      const res = await sorobanClient.readContractValue(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "get_escrow",
        ["job-123"],
      );

      expect(res).toEqual(expectedValue);
      expect(mockStellarSdk.Contract).toHaveBeenCalledWith(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      );
      expect(mockContractInstance.call).toHaveBeenCalledWith("get_escrow", "job-123");
      expect(mockStellarSdk.SorobanRpc.TransactionBuilder).toHaveBeenCalledWith(
        undefined,
        { networkPassphrase: "Test SDF Network ; September 2015" },
      );
      expect(mockTransactionBuilderInstance.addOperation).toHaveBeenCalledWith(
        expect.objectContaining({ method: "get_escrow", args: ["job-123"] }),
      );
      expect(mockServerInstance.simulateTransaction).toHaveBeenCalledWith({
        id: "mock_built_tx",
      });
    });

    it("uses mainnet passphrase when STELLAR_NETWORK is mainnet", async () => {
      process.env.STELLAR_NETWORK = "mainnet";
      const sorobanClient = require("./sorobanClient");

      mockServerInstance.simulateTransaction.mockResolvedValue({
        result: "sample_result",
      });

      const res = await sorobanClient.readContractValue(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "is_arbitrator",
        [],
      );

      expect(res).toBe("sample_result");
      expect(mockStellarSdk.SorobanRpc.TransactionBuilder).toHaveBeenCalledWith(
        undefined,
        { networkPassphrase: "Public Global Stellar Network ; September 2015" },
      );
    });

    it("returns null when result.result is missing or undefined", async () => {
      const sorobanClient = require("./sorobanClient");

      mockServerInstance.simulateTransaction.mockResolvedValue({});

      const res = await sorobanClient.readContractValue(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "get_escrow",
      );

      expect(res).toBeNull();
    });

    it("maps contract error codes to typed SorobanContractError when simulation fails (code 2004)", async () => {
      const sorobanClient = require("./sorobanClient");

      mockIsSimulationError.mockReturnValue(true);
      mockServerInstance.simulateTransaction.mockResolvedValue({
        error: "HostError: Error(Contract, #2004)",
      });

      await expect(
        sorobanClient.readContractValue(
          "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "get_escrow",
          ["job-123"],
        ),
      ).rejects.toThrow(sorobanClient.SorobanContractError);

      try {
        await sorobanClient.readContractValue(
          "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "get_escrow",
          ["job-123"],
        );
      } catch (err) {
        expect(err).toBeInstanceOf(sorobanClient.SorobanContractError);
        expect(err).toBeInstanceOf(Error);
        expect(err.contractErrorCode).toBe(CONTRACT_ERROR_CODES.ESCROW_NOT_FOUND);
        expect(err.code).toBe(2004);
        expect(err.method).toBe("get_escrow");
        expect(err.rawError).toBe("HostError: Error(Contract, #2004)");
        expect(err.message).toContain("Soroban simulation failed for get_escrow: HostError: Error(Contract, #2004)");
      }
    });

    it("maps panic strings to contract error codes (code 7001)", async () => {
      const sorobanClient = require("./sorobanClient");

      mockIsSimulationError.mockReturnValue(true);
      mockServerInstance.simulateTransaction.mockResolvedValue({
        error: "Error(Contract, #1): Only participants can raise a dispute",
      });

      try {
        await sorobanClient.readContractValue(
          "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "raise_dispute",
        );
        throw new Error("Expected call to fail");
      } catch (err) {
        expect(err).toBeInstanceOf(sorobanClient.SorobanContractError);
        expect(err.contractErrorCode).toBe(CONTRACT_ERROR_CODES.ONLY_PARTICIPANTS_CAN_DISPUTE);
        expect(err.code).toBe(7001);
      }
    });

    it("maps unknown simulation errors to UNKNOWN code (0)", async () => {
      const sorobanClient = require("./sorobanClient");

      mockIsSimulationError.mockReturnValue(true);
      mockServerInstance.simulateTransaction.mockResolvedValue({
        error: "Random unknown RPC failure occurred",
      });

      try {
        await sorobanClient.readContractValue(
          "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "test_method",
        );
        throw new Error("Expected call to fail");
      } catch (err) {
        expect(err).toBeInstanceOf(sorobanClient.SorobanContractError);
        expect(err.contractErrorCode).toBe(CONTRACT_ERROR_CODES.UNKNOWN);
        expect(err.code).toBe(0);
        expect(err.method).toBe("test_method");
      }
    });
  });

  describe("contractErrors helper utilities", () => {
    it("correctly extracts error codes across various panic formats", () => {
      expect(getContractErrorCode("Amount must be positive")).toBe(2001);
      expect(getContractErrorCode("Error(Contract, #2001)")).toBe(2001);
      expect(getContractErrorCode("HostError: Error(Contract, #2004)")).toBe(2004);
      expect(getContractErrorCode("Error: Error(Contract, #5): Proposal not found")).toBe(6002);
      expect(getContractErrorCode("Arithmetic overflow")).toBe(9901);
      expect(getContractErrorCode("Error(Contract, #42)")).toBe(0);
      expect(getContractErrorCode(null)).toBe(0);
      expect(getContractErrorCode(2004)).toBe(2004);
    });

    it("mapContractError formats error properly", () => {
      const mapped = mapContractError("Escrow not found", "release_escrow");
      expect(mapped).toBeInstanceOf(SorobanContractError);
      expect(mapped.contractErrorCode).toBe(2004);
      expect(mapped.code).toBe(2004);
      expect(mapped.method).toBe("release_escrow");
      expect(mapped.rawError).toBe("Escrow not found");
      expect(mapped.message).toBe("Soroban simulation failed for release_escrow: Escrow not found");
    });
  });
});
