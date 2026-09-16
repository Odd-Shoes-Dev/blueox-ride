import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Camera, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CarPhoto } from '@/types'

interface CarPhotoUploadProps {
  photos: CarPhoto[]
  onPhotosChange: (photos: CarPhoto[]) => void
  maxPhotos?: number
  className?: string
}

export function CarPhotoUpload({
  photos,
  onPhotosChange,
  maxPhotos = 3,
  className,
}: CarPhotoUploadProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files || e.target.files.length === 0) return

    const file = e.target.files[0]

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please select an image file.',
        variant: 'destructive',
      })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image under 5MB.',
        variant: 'destructive',
      })
      return
    }

    setUploading(true)

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/${Date.now()}.${fileExt}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('car-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('car-photos')
        .getPublicUrl(fileName)

      // Create car_photo record
      const { data: photoRecord, error: dbError } = await supabase
        .from('car_photos')
        .insert({
          driver_id: user.id,
          photo_url: publicUrl,
          is_primary: photos.length === 0, // First photo is primary
        })
        .select()
        .single()

      if (dbError) throw dbError

      onPhotosChange([...photos, photoRecord as CarPhoto])

      toast({
        title: 'Photo uploaded',
        description: 'Your car photo has been added.',
        variant: 'success',
      })
    } catch (error: any) {
      console.error('Upload error:', error)
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload photo.',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = async (photo: CarPhoto) => {
    try {
      // Delete from storage
      const fileName = photo.photo_url.split('/car-photos/')[1]
      if (fileName) {
        await supabase.storage.from('car-photos').remove([fileName])
      }

      // Delete from database
      await supabase.from('car_photos').delete().eq('id', photo.id)

      onPhotosChange(photos.filter((p) => p.id !== photo.id))

      toast({
        title: 'Photo removed',
        description: 'Your car photo has been removed.',
      })
    } catch (error: any) {
      console.error('Remove error:', error)
      toast({
        title: 'Remove failed',
        description: error.message || 'Failed to remove photo.',
        variant: 'destructive',
      })
    }
  }

  const canUpload = photos.length < maxPhotos

  return (
    <div className={cn('space-y-3', className)}>
      {/* Photo Grid */}
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
            <img
              src={photo.photo_url}
              alt="Car photo"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => handleRemove(photo)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70"
            >
              <X className="w-4 h-4" />
            </button>
            {photo.is_primary && (
              <span className="absolute bottom-1 left-1 text-xs bg-coral-500 text-white px-1.5 py-0.5 rounded">
                Primary
              </span>
            )}
          </div>
        ))}

        {/* Upload Button */}
        {canUpload && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-1 hover:border-muted-foreground/50 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            ) : (
              <>
                <Camera className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Add Photo</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />

      <p className="text-xs text-muted-foreground">
        Add up to {maxPhotos} photos of your car. Max 5MB each.
      </p>
    </div>
  )
}
