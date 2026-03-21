import type { AvatarStackProps } from "./shared";

export const avatarStackFixtures = {
  team: {
    avatars: [
      { name: "Alex Morgan", image: "/avatars/alex.png" },
      { name: "Jordan Lee", image: "/avatars/jordan.png" },
      { name: "Sam Patel", image: "/avatars/sam.png" },
      { name: "Casey Nguyen", image: "/avatars/casey.png" },
    ],
    maxAvatarsAmount: 3,
    orientation: "vertical",
  } satisfies AvatarStackProps,
};
