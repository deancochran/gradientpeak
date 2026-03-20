export const badgeFixtures = {
  featured: {
    children: "Featured",
    testId: "featured-badge",
    variant: "default",
  },
  variants: ["default", "secondary", "destructive", "outline"] as const,
} as const;
