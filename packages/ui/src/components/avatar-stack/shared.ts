export interface AvatarStackAvatar {
  /** Stable identity used when the stack is reordered or members share display data. */
  id: string;
  name: string;
  image: string;
}

export interface AvatarStackProps {
  avatars: AvatarStackAvatar[];
  maxAvatarsAmount?: number;
  className?: string;
  orientation?: "vertical" | "horizontal";
}
