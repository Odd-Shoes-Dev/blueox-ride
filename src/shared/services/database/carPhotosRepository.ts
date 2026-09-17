import { supabase } from './client'
import { uploadPublicFile, removePublicFile } from './storage'
import type { CarPhoto } from '@/shared/types'

export async function getCarPhotosForDriver(driverId: string): Promise<CarPhoto[]> {
  const { data, error } = await supabase
    .from('car_photos')
    .select('*')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as CarPhoto[]
}

export async function uploadCarPhoto(driverId: string, file: File, isPrimary: boolean): Promise<CarPhoto> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${driverId}/${Date.now()}.${fileExt}`
  const publicUrl = await uploadPublicFile('car-photos', fileName, file, { cacheControl: '3600', upsert: false })

  const { data, error } = await supabase
    .from('car_photos')
    .insert({
      driver_id: driverId,
      photo_url: publicUrl,
      is_primary: isPrimary,
    })
    .select()
    .single()

  if (error) throw error
  return data as CarPhoto
}

export async function removeCarPhoto(photo: CarPhoto): Promise<void> {
  const fileName = photo.photo_url.split('/car-photos/')[1]
  if (fileName) {
    await removePublicFile('car-photos', fileName)
  }

  const { error } = await supabase.from('car_photos').delete().eq('id', photo.id)
  if (error) throw error
}
