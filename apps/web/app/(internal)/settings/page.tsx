'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle 
} from '@/components/ui/card'
import { 
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage 
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

import { 
  Calendar,
  Camera,
  Loader2,
  LogOut,
  Mail,
  Trash2,
  Upload,
  UserRound 
} from 'lucide-react'

// Types
interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string | null
}

// Zod schema for profile form validation
const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name must be less than 50 characters'),
  avatar_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
})

type ProfileFormValues = z.infer<typeof profileSchema>

export default function SettingsPage() {
  // State
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null)
  
  // Hooks
  const router = useRouter()
  const supabase = createClient()

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: '',
      avatar_url: '',
    },
  })

  // Effects
  useEffect(() => {
    const getProfile = async () => {
      try {
        setLoading(true)
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          router.push('/login')
          return
        }

        setUser(user)

        // Get profile data
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error('Error fetching profile:', error)
          toast.error('Failed to load profile')
          return
        }

        setProfile(profile)
        
        // Update form with profile data
        form.reset({
          full_name: profile.full_name || '',
          avatar_url: profile.avatar_url || '',
        })

      } catch (error) {
        console.error('Error:', error)
        toast.error('An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }

    getProfile()
  }, [supabase, router, form])

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
        
        const url = URL.createObjectURL(data)
        setAvatarBlobUrl(url)
      } catch (error) {
        console.error('Error downloading image:', error)
      }
    }

    if (profile?.avatar_url) {
      downloadAvatar(profile.avatar_url)
    }

    // Cleanup blob URL when component unmounts or avatar changes
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

  // Event handlers
  const onSubmit = async (values: ProfileFormValues) => {
    if (!user) return

    try {
      setUpdating(true)
      
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: values.full_name,
          avatar_url: values.avatar_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (error) {
        console.error('Error updating profile:', error)
        toast.error('Failed to update profile')
        return
      }

      // Update local state
      setProfile(prev => prev ? {
        ...prev,
        full_name: values.full_name,
        avatar_url: values.avatar_url || null,
        updated_at: new Date().toISOString(),
      } : null)

      toast.success('Profile updated successfully')

    } catch (error) {
      console.error('Error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setUpdating(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !user) return

    try {
      setUploadingAvatar(true)

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file')
        return
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB')
        return
      }

      // Create unique filename
      const fileExt = file.name.split('.').pop()
      const filePath = `${user.id}/${user.id}-${Math.random()}.${fileExt}` 
      // Upload to private profile-avatars bucket
      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Error uploading avatar:', uploadError)
        toast.error('Failed to upload avatar')
        return
      }

      // Update profile with new avatar path (not URL since it's private)
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          avatar_url: filePath,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (updateError) {
        console.error('Error updating profile avatar:', updateError)
        toast.error('Failed to update profile avatar')
        return
      }

      // Update local state
      setProfile(prev => prev ? {
        ...prev,
        avatar_url: filePath,
        updated_at: new Date().toISOString(),
      } : null)

      // Update form
      form.setValue('avatar_url', filePath)

      toast.success('Avatar updated successfully')

    } catch (error) {
      console.error('Error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setUploadingAvatar(false)
      // Reset file input
      event.target.value = ''
    }
  }

  const handleSignOut = async () => {
    try {
      setSigningOut(true)
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        console.error('Error signing out:', error)
        toast.error('Failed to sign out')
        return
      }

      router.push('/login')
      toast.success('Signed out successfully')

    } catch (error) {
      console.error('Error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setSigningOut(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!user) return

    try {
      setDeleting(true)

      // Delete profile (user will be deleted via cascade)
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id)

      if (profileError) {
        console.error('Error deleting profile:', profileError)
        toast.error('Failed to delete profile')
        return
      }

      // Delete auth user
      const { error: authError } = await supabase.auth.admin.deleteUser(user.id)
      
      if (authError) {
        console.error('Error deleting user:', authError)
        toast.error('Failed to delete account')
        return
      }

      router.push('/login')
      toast.success('Account deleted successfully')

    } catch (error) {
      console.error('Error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setDeleting(false)
    }
  }

  // Utility functions
  const getInitials = (name: string | null) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  // Main render
  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account settings and preferences.
          </p>
        </div>

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Update your profile information and avatar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-6">
              <div className="relative group">
                <Avatar className="h-20 w-20 cursor-pointer transition-all duration-200 group-hover:opacity-70">
                  <AvatarImage src={avatarBlobUrl || ''} alt={'User'} />
                  <AvatarFallback className="text-lg">
                    <UserRound className="h-8 w-8" />
                  </AvatarFallback>
                </Avatar>
                
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {uploadingAvatar ? (
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  ) : (
                    <Camera className="h-6 w-6 text-white" />
                  )}
                </div>

                {/* Hidden file input */}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>
              
              <div>
                <h3 className="font-medium">{profile?.full_name || 'No name set'}</h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click avatar to change picture (max 5MB)
                </p>
              </div>
            </div>

            {/* Profile Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your full name" {...field} />
                      </FormControl>
                      <FormDescription>
                        This is the name that will be displayed on your profile.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={updating}>
                  {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Profile
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Account Information
            </CardTitle>
            <CardDescription>
              View your account details and status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Email</Label>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Email Verified</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={user?.email_confirmed_at ? 'default' : 'secondary'}>
                    {user?.email_confirmed_at ? 'Verified' : 'Unverified'}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Account Created</Label>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {profile?.created_at ? formatDate(profile.created_at) : 'Unknown'}
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium">Last Updated</Label>
                <p className="text-sm text-muted-foreground">
                  {profile?.updated_at ? formatDate(profile.updated_at) : 'Never'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleting} className="flex-1">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your
                      account and remove all your data from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
