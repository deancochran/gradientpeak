export interface DailyTargetProfile {
  targetTss: number;
  targetZones: string[];
  effortCategory: "easy" | "moderate" | "hard";
}

export interface UserContext {
  currentCtl: number;
  currentAtl: number;
}

export interface ActivityPlanCandidate {
  id: string;
  name: string;
  tss: number;
  zones: string[];
  effortCategory: "easy" | "moderate" | "hard";
}

export interface RecommendationResult {
  planId: string;
  score: number;
  matchRationale: string[];
  isRejected: boolean;
  rejectionReason?: string;
}
