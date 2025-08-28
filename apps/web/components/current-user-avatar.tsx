'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCurrentUserImage } from '@/hooks/use-current-user-image';
import { UserRound } from 'lucide-react';

export const CurrentUserAvatar = () => {
  const profileImage = useCurrentUserImage()

  
  return (
    <Avatar >
      {profileImage && <AvatarImage src={profileImage} alt={"User"} />}
      <AvatarFallback><UserRound/></AvatarFallback>
    </Avatar>
  )
}
