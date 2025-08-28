'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { UserRound } from 'lucide-react'
import { type User } from '@supabase/supabase-js'

interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  updated_at: string | null
}

export function CurrentUserAvatar() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (user) {
        // Get initial profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        
        if (profile) {
          setProfile(profile)
        }
      }
    }

    getUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  // Set up real-time subscription for profile changes
  useEffect(() => {
    if (!user) return

    const profileSubscription = supabase
      .channel('profile-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          setProfile(payload.new as Profile)
        }
      )
      .subscribe()

    return () => {
      profileSubscription.unsubscribe()
    }
  }, [user, supabase])

  // Download avatar when profile changes
  useEffect(() => {
    const downloadAvatar = async (path: string) => {
      try {
        const { data, error } = await supabase.storage
          .from('profile-avatars')
          .download(path)
          
        if (error) {
          console.error('Error downloading avatar:', error)
          return
        }
        
        // Revoke previous blob URL to prevent memory leaks
        if (avatarBlobUrl) {
          URL.revokeObjectURL(avatarBlobUrl)
        }
        
        const url = URL.createObjectURL(data)
        setAvatarBlobUrl(url)
      } catch (error) {
        console.error('Error downloading image:', error)
      }
    }

    if (profile?.avatar_url) {
      downloadAvatar(profile.avatar_url)
    } else {
      // Clear avatar if no URL
      if (avatarBlobUrl) {
        URL.revokeObjectURL(avatarBlobUrl)
        setAvatarBlobUrl(null)
      }
    }

    // Cleanup function
    return () => {
      if (avatarBlobUrl) {
        URL.revokeObjectURL(avatarBlobUrl)
      }
    }
  }, [profile?.avatar_url, supabase])

  // Cleanup blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (avatarBlobUrl) {
        URL.revokeObjectURL(avatarBlobUrl)
      }
    }
  }, [])

  const getInitials = (name: string | null) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <Avatar className="h-8 w-8">
      <AvatarImage src={avatarBlobUrl || ''} alt={profile?.full_name || 'User'} />
      <AvatarFallback className="text-sm">
        {profile?.full_name ? getInitials(profile.full_name) : <UserRound className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  )
}
