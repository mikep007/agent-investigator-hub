import html2canvas from 'html2canvas';
import { supabase } from '@/integrations/supabase/client';

export interface ScreenshotResult {
  success: boolean;
  url?: string;
  error?: string;
}

export const captureScreenshot = async (
  element: HTMLElement | null,
  userId: string,
  fileName: string
): Promise<ScreenshotResult> => {
  if (!element) {
    return { success: false, error: 'No element to capture' };
  }

  try {
    // Capture the element as canvas
    const canvas = await html2canvas(element, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#1a1a2e',
      scale: 2, // Higher quality
      logging: false,
    });

    // Convert canvas to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png', 0.95);
    });

    if (!blob) {
      return { success: false, error: 'Failed to create image blob' };
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9]/g, '_');
    const filePath = `${userId}/${timestamp}_${sanitizedFileName}.png`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('case-screenshots')
      .upload(filePath, blob, {
        contentType: 'image/png',
        cacheControl: '3600',
      });

    if (error) {
      console.error('Screenshot upload error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('case-screenshots')
      .getPublicUrl(data.path);

    return { success: true, url: urlData.publicUrl };
  } catch (err: any) {
    console.error('Screenshot capture error:', err);
    return { success: false, error: err.message || 'Failed to capture screenshot' };
  }
};
