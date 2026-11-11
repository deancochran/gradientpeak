interface ListedContract {
  beta: string;
  alpha: number;
}

export type { ListedContract };

export const FIRST_VALUES = ["one", "two"] as const,
  SECOND_VALUES = ["three"] as const;

export const calculateFixtureScore = (value: number) => value * 2;
