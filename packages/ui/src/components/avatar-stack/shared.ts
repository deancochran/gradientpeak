export interface AvatarStackAvatar {
  name: string;
  image: string;
}

export interface AvatarStackProps {
  avatars: AvatarStackAvatar[];
  maxAvatarsAmount?: number;
  className?: string;
  orientation?: "vertical" | "horizontal";
}
