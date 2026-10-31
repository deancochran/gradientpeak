import type { AvatarStackProps } from "./shared";

export const avatarStackFixtures = {
  team: {
    avatars: [
      { id: "alex-morgan", name: "Alex Morgan", image: "/avatars/alex.png" },
      { id: "jordan-lee", name: "Jordan Lee", image: "/avatars/jordan.png" },
      { id: "sam-patel", name: "Sam Patel", image: "/avatars/sam.png" },
      { id: "casey-nguyen", name: "Casey Nguyen", image: "/avatars/casey.png" },
    ],
    maxAvatarsAmount: 3,
    orientation: "vertical",
  } satisfies AvatarStackProps,
};
