import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { Camera, Star, Car, LogOut } from 'lucide-react'

export default function ProfilePage() {
  const { profile, updateProfile, signOut, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || '')
  const [loading, setLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await updateProfile({
      full_name: fullName,
      phone_number: phoneNumber || null,
    })

    if (error) {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Profile updated',
        description: 'Your profile has been updated successfully.',
        variant: 'success',
      })
    }

    setLoading(false)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an image file.',
        variant: 'destructive',
      })
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 2MB.',
        variant: 'destructive',
      })
      return
    }

    setUploadingAvatar(true)

    const fileExt = file.name.split('.').pop()
    const filePath = `${profile.id}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file)

    if (uploadError) {
      toast({
        title: 'Upload failed',
        description: uploadError.message,
        variant: 'destructive',
      })
      setUploadingAvatar(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    const { error: updateError } = await updateProfile({
      avatar_url: publicUrl,
    })

    if (updateError) {
      toast({
        title: 'Update failed',
        description: updateError.message,
        variant: 'destructive',
      })
    } else {
      await refreshProfile()
      toast({
        title: 'Avatar updated',
        description: 'Your profile picture has been updated.',
        variant: 'success',
      })
    }

    setUploadingAvatar(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-gradient-to-b from-navy-900 to-navy-800 pt-12 pb-24 px-4">
        <h1 className="text-xl font-semibold text-white text-center">Profile</h1>
      </div>

      {/* Profile Card */}
      <div className="px-4 -mt-16">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6">
            {/* Avatar */}
            <div className="flex flex-col items-center mb-6">
              <div className="relative">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="text-2xl bg-coral-100 text-navy-800">
                    {getInitials(profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <h2 className="mt-4 text-xl font-semibold">{profile.full_name}</h2>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
            </div>

            {/* Stats */}
            <div className="flex justify-center gap-8 mb-6 py-4 border-y">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  <span className="font-semibold">
                    {profile.average_rating?.toFixed(1) || '-'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Rating</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Car className="w-4 h-4 text-coral-500" />
                  <span className="font-semibold">{profile.total_rides}</span>
                </div>
                <p className="text-xs text-muted-foreground">Rides</p>
              </div>
            </div>

            {/* Edit Form */}
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="07XX XXX XXX"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Required for drivers and receiving refunds
                </p>
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                Save Changes
              </Button>
            </form>

            {/* Sign Out */}
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
