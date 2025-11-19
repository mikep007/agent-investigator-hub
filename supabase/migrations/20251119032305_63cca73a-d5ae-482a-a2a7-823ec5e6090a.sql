-- Create table for premium platform investigations
CREATE TABLE public.platform_investigations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investigation_id UUID NOT NULL REFERENCES public.investigations(id) ON DELETE CASCADE,
  finding_id UUID NOT NULL REFERENCES public.findings(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  results JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_investigations ENABLE ROW LEVEL SECURITY;

-- Users can view platform investigations for their investigations
CREATE POLICY "Users can view their platform investigations"
ON public.platform_investigations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM investigations
    WHERE investigations.id = platform_investigations.investigation_id
    AND investigations.user_id = auth.uid()
  )
);

-- Users can create platform investigations for their investigations
CREATE POLICY "Users can create platform investigations"
ON public.platform_investigations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM investigations
    WHERE investigations.id = platform_investigations.investigation_id
    AND investigations.user_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_platform_investigations_investigation_id ON public.platform_investigations(investigation_id);
CREATE INDEX idx_platform_investigations_finding_id ON public.platform_investigations(finding_id);