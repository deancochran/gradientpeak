import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/contract-epoch";

/** Headers required by app API routes that enforce the current client contract. */
export const currentContractEpochHeaders = {
  [CONTRACT_EPOCH_HEADER]: String(CURRENT_CONTRACT_EPOCH),
};
