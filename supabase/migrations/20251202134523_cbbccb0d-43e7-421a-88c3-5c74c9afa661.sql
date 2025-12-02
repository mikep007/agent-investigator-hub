-- Create storage bucket for case screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('case-screenshots', 'case-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload screenshots
CREATE POLICY "Users can upload case screenshots"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'case-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to view their own screenshots
CREATE POLICY "Users can view their case screenshots"
ON storage.objects
FOR SELECT
USING (bucket_id = 'case-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own screenshots
CREATE POLICY "Users can delete their case screenshots"
ON storage.objects
FOR DELETE
USING (bucket_id = 'case-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add screenshot_url column to case_items
ALTER TABLE public.case_items
ADD COLUMN IF NOT EXISTS screenshot_url TEXT;