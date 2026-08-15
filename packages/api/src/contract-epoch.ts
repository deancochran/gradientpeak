export const CURRENT_CONTRACT_EPOCH = 2;
export const CONTRACT_EPOCH_HEADER = "x-gradientpeak-contract-epoch";

const CURRENT_CONTRACT_EPOCH_HEADER_VALUE = String(CURRENT_CONTRACT_EPOCH);

export function hasCurrentContractEpoch(headers: Headers) {
  // Fetch combines duplicate header values with commas, so only a single exact
  // ASCII value is accepted.
  return headers.get(CONTRACT_EPOCH_HEADER) === CURRENT_CONTRACT_EPOCH_HEADER_VALUE;
}
