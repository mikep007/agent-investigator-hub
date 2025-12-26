-- Create table for Sunbiz verification status
CREATE TABLE public.sunbiz_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.investigations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  entity_number text NOT NULL,
  entity_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('confirmed', 'rejected')),
  notes text,
  verified_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (investigation_id, entity_number)
);

-- Enable RLS
ALTER TABLE public.sunbiz_verifications ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own verifications"
ON public.sunbiz_verifications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own verifications"
ON public.sunbiz_verifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own verifications"
ON public.sunbiz_verifications
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own verifications"
ON public.sunbiz_verifications
FOR DELETE
USING (auth.uid() = user_id);