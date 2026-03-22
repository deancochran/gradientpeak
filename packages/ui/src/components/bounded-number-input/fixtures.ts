export const boundedNumberInputFixtures = {
  ftp: {
    id: "ftp-target",
    label: "FTP target",
    value: "250",
    min: 100,
    max: 500,
    decimals: 0,
    unitLabel: "W",
    testId: "ftp-target-input",
  },
} as const;
