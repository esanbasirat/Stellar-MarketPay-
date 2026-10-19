"use strict";

/**
 * backend/src/utils/contractErrors.js
 *
 * Canonical mapping of Soroban contract error codes and panic messages
 * (mirrors contracts/marketpay-contract/src/errors.rs and docs/contract-errors.md).
 *
 * Provides typed SorobanContractError and extraction utilities for the backend.
 */

const CONTRACT_ERROR_CODES = {
  UNKNOWN: 0,

  // 1xxx: Initialization & admin
  ALREADY_INITIALIZED: 1001,
  NOT_INITIALIZED: 1002,
  CONTRACT_FROZEN: 1003,
  CONTRACT_NOT_FROZEN: 1004,
  ONLY_ADMIN_SET_TREASURY: 1010,
  ONLY_ADMIN_SET_FEE: 1011,
  PLATFORM_FEE_EXCEEDS_MAX: 1012,
  ONLY_ADMIN_CAN_FREEZE: 1013,
  INSUFFICIENT_SIGNATURES: 1014,
  NOT_AN_ADMIN: 1015,
  DUPLICATE_ADMIN_SIGNATURE: 1016,
  ONLY_ADMIN_CAN_ADD_ADMIN: 1017,
  ALREADY_ADMIN: 1018,
  ONLY_ADMIN_UPDATE_THRESHOLD: 1019,
  INVALID_THRESHOLD: 1020,
  ONLY_ADMIN_SET_REFERRER_CAP: 1021,
  REFERRER_CAP_NEGATIVE: 1022,
  ONLY_ADMIN_UPDATE_TIMEOUT: 1023,
  TIMEOUT_MUST_BE_POSITIVE: 1024,

  // 2xxx: Escrow lifecycle
  AMOUNT_MUST_BE_POSITIVE: 2001,
  INVALID_REFERRER: 2002,
  ESCROW_ALREADY_EXISTS: 2003,
  ESCROW_NOT_FOUND: 2004,
  ONLY_FREELANCER_CAN_START_WORK: 2005,
  ESCROW_NOT_LOCKED: 2006,
  ONLY_CLIENT_CAN_RELEASE: 2007,
  CANNOT_RELEASE_STATUS: 2008,
  DELIVERABLE_HASH_MISMATCH: 2009,
  ONLY_CLIENT_CAN_REFUND: 2010,
  CAN_ONLY_REFUND_LOCKED: 2011,
  ONLY_CLIENT_CAN_TIMEOUT_REFUND: 2012,
  TIMEOUT_NOT_EXPIRED: 2013,

  // 3xxx: Milestones
  MAX_MILESTONES: 3001,
  MILESTONE_PERCENTAGE_POSITIVE: 3002,
  MILESTONE_PERCENTAGES_SUM: 3003,
  ONLY_CLIENT_CAN_RELEASE_MILESTONE: 3004,
  CANNOT_RELEASE_MILESTONE_STATUS: 3005,
  INVALID_MILESTONE_INDEX: 3006,
  MILESTONE_ALREADY_COMPLETED: 3007,

  // 4xxx: Bidding & sealed-bid auction
  BUDGET_POSITIVE: 4001,
  BUDGET_COMMITMENT_NOT_FOUND: 4002,
  ONLY_CLIENT_CAN_REVEAL_BUDGET: 4003,
  BUDGET_ALREADY_REVEALED: 4004,
  BIDDING_CLOSED: 4005,
  BID_COMMITMENT_ALREADY_SUBMITTED: 4006,
  BIDDING_NOT_CLOSED: 4007,
  REVEAL_WINDOW_CLOSED: 4008,
  BID_ALREADY_REVEALED: 4009,
  COMMITMENT_VERIFICATION_FAILED: 4010,

  // 5xxx: Ratings & certificates
  INVALID_SCORE: 5001,
  RATINGS_ONLY_AFTER_RELEASE: 5002,
  RATING_ALREADY_SUBMITTED: 5003,
  FREELANCER_RATING_ALREADY_SUBMITTED: 5004,
  ESCROW_MUST_BE_RELEASED: 5005,
  CERTIFICATE_ALREADY_MINTED: 5006,

  // 6xxx: Governance (DAO) & proposals
  DURATION_POSITIVE: 6001,
  PROPOSAL_NOT_FOUND: 6002,
  PROPOSAL_ALREADY_RESOLVED: 6003,
  VOTING_PERIOD_ENDED: 6004,
  ONLY_COMPLETED_JOBS_CAN_VOTE: 6005,
  ALREADY_VOTED: 6006,
  VOTING_NOT_OVER: 6007,
  ONLY_ADMIN_SET_QUORUM: 6008,
  QUORUM_CANNOT_EXCEED_50_PERCENT: 6009,
  QUORUM_CHANGE_NOT_PASSED: 6010,
  NO_MATCHING_QUORUM_PROPOSAL: 6011,

  // 7xxx: Disputes & arbitration
  ONLY_PARTICIPANTS_CAN_DISPUTE: 7001,
  CANNOT_DISPUTE_RESOLVED: 7002,
  ONLY_ADMIN_CAN_RESOLVE_DISPUTE: 7003,
  ESCROW_NOT_DISPUTED: 7004,
  ONLY_ADMIN_UPDATE_DISPUTE_BOND: 7005,
  BOND_AMOUNT_POSITIVE: 7006,
  ONLY_ADMIN_REGISTER_ARBITRATORS: 7007,
  NEED_3_ARBITRATORS: 7008,
  ONLY_ADMIN_OPEN_ARBITRATION: 7009,
  ARBITRATION_CASE_NOT_FOUND: 7010,
  ARBITRATION_CASE_NOT_OPEN: 7011,
  ONLY_SELECTED_ARBITRATORS: 7012,
  ALL_VOTES_SUBMITTED: 7013,
  EXACTLY_3_VOTES_REQUIRED: 7014,

  // 8xxx: Deliverable oracle & messaging
  ONLY_FREELANCER_OR_ORACLE: 8001,
  NO_DELIVERABLE_HASH: 8002,
  IPFS_CID_EMPTY: 8003,

  // 9xxx: Job boost & extensions
  MINIMUM_BOOST_5_XLM: 9001,
  BOOST_AMOUNT_POSITIVE: 9002,
  ONLY_PARTICIPANTS_CAN_EXTEND: 9003,
  CANNOT_EXTEND_STATUS: 9004,
  NEW_TIMEOUT_MUST_BE_LATER: 9005,
  EXTENSION_ALREADY_PENDING: 9006,
  NO_PENDING_EXTENSION: 9007,
  CANNOT_APPROVE_OWN_EXTENSION: 9008,
  ONLY_PARTICIPANTS_CAN_APPROVE: 9009,

  // 99xx: Arithmetic & system
  ARITHMETIC_OVERFLOW: 9901,
  COUNTER_OVERFLOW: 9902,
  TIMEOUT_LEDGER_OVERFLOW: 9903,
  TIMEOUT_TIMESTAMP_OVERFLOW: 9904,
};

const PANIC_TO_CODE = {
  // 1xxx
  "Already initialized": 1001,
  "Not initialized": 1002,
  "Contract is frozen": 1003,
  "Contract is not frozen": 1004,
  "Only admin can set treasury address": 1010,
  "Only admin can set platform fee": 1011,
  "Platform fee cannot exceed 10% (1000 bps)": 1012,
  "Only an admin can freeze the contract": 1013,
  "Insufficient admin signatures to unfreeze": 1014,
  "One of the provided addresses is not an admin": 1015,
  "Duplicate admin in unfreeze signatures": 1016,
  "Only an admin can add new admins": 1017,
  "Address is already an admin": 1018,
  "Only an admin can update the threshold": 1019,
  "Threshold must be between 1 and the number of admins": 1020,
  "Only admin can set the referrer bonus cap": 1021,
  "Referrer bonus cap must be non-negative": 1022,
  "Only admin can update the timeout": 1023,
  "Timeout must be positive": 1024,

  // 2xxx
  "Amount must be positive": 2001,
  "Referrer cannot be the client or freelancer": 2002,
  "Escrow already exists for this job": 2003,
  "Escrow not found": 2004,
  "Only the freelancer can start work": 2005,
  "Escrow is not in Locked state": 2006,
  "Only the client can release escrow": 2007,
  "Cannot release escrow in current status": 2008,
  "Freelancer deliverable hash does not match or not submitted": 2009,
  "Only the client can request a refund": 2010,
  "Can only refund before work has started": 2011,
  "Only the client can request a timeout refund": 2012,
  "Timeout period has not expired yet": 2013,

  // 3xxx
  "Maximum 5 milestones allowed": 3001,
  "Milestone percentage must be positive": 3002,
  "Milestone percentages must sum to 100": 3003,
  "Only the client can release a milestone": 3004,
  "Cannot release milestone in current status": 3005,
  "Milestone index out of bounds": 3006,
  "Invalid milestone index": 3006,
  "Milestone already completed": 3007,

  // 4xxx
  "Budget must be positive": 4001,
  "Budget commitment not found": 4002,
  "Only the client can reveal the budget": 4003,
  "Budget already revealed": 4004,
  "Bidding is closed": 4005,
  "Bid commitment already submitted": 4006,
  "Bidding not closed": 4007,
  "Reveal window has closed": 4008,
  "Bid already revealed": 4009,
  "Commitment verification failed": 4010,

  // 5xxx
  "Score must be between 1 and 5": 5001,
  "Ratings are allowed only after escrow release": 5002,
  "Client rating already submitted for this job": 5003,
  "Freelancer rating already submitted for this job": 5004,
  "Escrow must be released to mint certificate": 5005,
  "Certificate already minted": 5006,

  // 6xxx
  "Duration must be positive": 6001,
  "Proposal not found": 6002,
  "Proposal already resolved": 6003,
  "Voting period has ended": 6004,
  "Only users with completed jobs can vote": 6005,
  "Voter has already cast a vote": 6006,
  "Voting period is not over yet": 6007,
  "Only admin can set the quorum": 6008,
  "Quorum cannot exceed 50% (5000 bps)": 6009,
  "Quorum change proposal has not passed": 6010,
  "No matching quorum change proposal": 6011,

  // 7xxx
  "Only participants can raise a dispute": 7001,
  "Cannot dispute a resolved, frozen, or already-disputed escrow": 7002,
  "Only admin can resolve a dispute": 7003,
  "Escrow is not in Disputed state": 7004,
  "Only admin can update the dispute bond": 7005,
  "Bond amount must be positive": 7006,
  "Only admin can register arbitrators": 7007,
  "Need at least 3 registered arbitrators": 7008,
  "Only admin can open arbitration": 7009,
  "Arbitration case not found": 7010,
  "Arbitration case is not open": 7011,
  "Only selected arbitrators can vote": 7012,
  "All votes already submitted": 7013,
  "Exactly 3 votes required": 7014,

  // 8xxx
  "Only freelancer or oracle can submit deliverable": 8001,
  "Escrow has no deliverable hash": 8002,
  "IPFS CID cannot be empty": 8003,

  // 9xxx
  "Minimum boost is 5 XLM": 9001,
  "Boost amount must be positive": 9002,
  "Only the client or freelancer can request an extension": 9003,
  "Cannot extend timeout in current status": 9004,
  "New timeout must be later than current timeout": 9005,
  "An extension request is already pending for this job": 9006,
  "No pending extension request": 9007,
  "Cannot approve your own extension request": 9008,
  "Only the client or freelancer can approve an extension": 9009,

  // 99xx
  "Arithmetic overflow": 9901,
  "Counter overflow": 9902,
  "Timeout ledger overflow": 9903,
  "Timeout timestamp overflow": 9904,
};

class SorobanContractError extends Error {
  constructor(message, { code = 0, contractErrorCode = 0, method = "", rawError = "" } = {}) {
    super(message);
    this.name = "SorobanContractError";
    this.code = code;
    this.contractErrorCode = contractErrorCode || code;
    this.method = method;
    this.rawError = rawError;
  }
}

/**
 * Extract the numeric contract error code from a Soroban error string or object.
 * Returns numeric code (e.g. 2004) or CONTRACT_ERROR_CODES.UNKNOWN (0).
 */
function getContractErrorCode(errorOrMessage) {
  if (!errorOrMessage) return CONTRACT_ERROR_CODES.UNKNOWN;
  if (typeof errorOrMessage === "number") {
    return errorOrMessage;
  }

  let msg = typeof errorOrMessage === "string" ? errorOrMessage : (errorOrMessage.message || String(errorOrMessage));
  msg = msg.trim();

  // Strip prefixes
  if (msg.startsWith("Error: ")) msg = msg.slice("Error: ".length).trim();
  if (msg.startsWith("HostError: ")) msg = msg.slice("HostError: ".length).trim();

  // Check for explicit 4-digit contract error: Error(Contract, #2004) or similar
  const fourDigitMatch = msg.match(/Error\(Contract,\s*#?(\d{4})\)/);
  if (fourDigitMatch) {
    return parseInt(fourDigitMatch[1], 10);
  }

  // Check for Error(Contract, #N): <message>
  const withMsgMatch = msg.match(/Error\(Contract,\s*#?\d+\):\s*(.+)/s);
  if (withMsgMatch) {
    const candidate = withMsgMatch[1].trim();
    if (PANIC_TO_CODE[candidate]) return PANIC_TO_CODE[candidate];
  }

  // Check for direct panic match
  if (PANIC_TO_CODE[msg]) {
    return PANIC_TO_CODE[msg];
  }

  // Check if any known panic phrase is contained within the message
  for (const [panic, code] of Object.entries(PANIC_TO_CODE)) {
    if (msg.includes(panic)) {
      return code;
    }
  }

  // Generic Error(Contract, #N) without recognizable panic
  if (/Error\(Contract,\s*#?\d+\)/.test(msg)) {
    return CONTRACT_ERROR_CODES.UNKNOWN;
  }

  return CONTRACT_ERROR_CODES.UNKNOWN;
}

/**
 * Map a raw simulation error into a typed SorobanContractError.
 */
function mapContractError(rawError, method = "") {
  const rawStr = typeof rawError === "string" ? rawError : (rawError ? (rawError.message || String(rawError)) : "");
  const code = getContractErrorCode(rawStr);
  const prefix = method ? `Soroban simulation failed for ${method}` : "Soroban simulation failed";
  const message = rawStr ? `${prefix}: ${rawStr}` : prefix;

  return new SorobanContractError(message, {
    code,
    contractErrorCode: code,
    method,
    rawError: rawStr,
  });
}

module.exports = {
  CONTRACT_ERROR_CODES,
  PANIC_TO_CODE,
  SorobanContractError,
  getContractErrorCode,
  mapContractError,
};
