export const ACTIVITY_CATEGORY_CONFIG = {
  run: {
    name: "Run",
    icon: "🏃",
    color: "#2563eb",
    category: "cardio",
    description: "Running activity",
  },
  bike: {
    name: "Bike",
    icon: "🚴",
    color: "#16a34a",
    category: "cardio",
    description: "Cycling activity",
  },
  swim: {
    name: "Swim",
    icon: "🏊",
    color: "#0891b2",
    category: "cardio",
    description: "Swimming activity",
  },
  strength: {
    name: "Strength",
    icon: "💪",
    color: "#dc2626",
    category: "strength",
    description: "Resistance training",
  },
  other: {
    name: "Other",
    icon: "⚡",
    color: "#6b7280",
    category: "other",
    description: "Other physical activity",
  },
} as const;

export const ACTIVITY_CATEGORIES = {
  cardio: "Cardio",
  strength: "Strength",
  other: "Other",
} as const;
