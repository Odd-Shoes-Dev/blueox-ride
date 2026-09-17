import { supabase } from './client'

export async function uploadPublicFile(
  bucket: string,
  path: string,
  file: File,
  options?: { cacheControl?: string; upsert?: boolean }
): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, options)
  if (error) throw error

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
  return publicUrl
}

export async function removePublicFile(bucket: string, path: string): Promise<void> {
  await supabase.storage.from(bucket).remove([path])
}
