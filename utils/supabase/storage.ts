'use server';

import { createClient } from '@/utils/supabase/server';

/**
 * Upload a file to the proposal-assets bucket (private).
 * Returns the file path (not a public URL — use getSignedUrl to read).
 */
export async function uploadProposalAsset(formData: FormData): Promise<{ success: boolean; path?: string; error?: string }> {
  const supabase = await createClient();
  const file = formData.get('file') as File;
  if (!file) return { success: false, error: 'No file provided' };

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = `proposals/${fileName}`;

  const { error } = await supabase.storage
    .from('proposal-assets')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Upload error:', error);
    return { success: false, error: error.message };
  }

  return { success: true, path: filePath };
}

/**
 * Get a signed URL for a private file in proposal-assets bucket.
 * Valid for 1 hour.
 */
export async function getProposalAssetSignedUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('proposal-assets')
    .createSignedUrl(path, 3600); // 1 hour

  if (error) {
    console.error('Signed URL error:', error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Delete a file from proposal-assets bucket.
 */
export async function deleteProposalAsset(path: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.storage
    .from('proposal-assets')
    .remove([path]);

  if (error) {
    console.error('Delete error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
