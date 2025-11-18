-- Create investigations table to track search targets
CREATE TABLE public.investigations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create findings table to store OSINT results
CREATE TABLE public.findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investigation_id UUID NOT NULL REFERENCES public.investigations(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  source TEXT NOT NULL,
  data JSONB NOT NULL,
  confidence_score DECIMAL(3,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for investigations
CREATE POLICY "Users can view their own investigations"
ON public.investigations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own investigations"
ON public.investigations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own investigations"
ON public.investigations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own investigations"
ON public.investigations FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for findings
CREATE POLICY "Users can view findings for their investigations"
ON public.findings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.investigations
    WHERE investigations.id = findings.investigation_id
    AND investigations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create findings for their investigations"
ON public.findings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.investigations
    WHERE investigations.id = findings.investigation_id
    AND investigations.user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX idx_investigations_user_id ON public.investigations(user_id);
CREATE INDEX idx_investigations_status ON public.investigations(status);
CREATE INDEX idx_findings_investigation_id ON public.findings(investigation_id);
CREATE INDEX idx_findings_agent_type ON public.findings(agent_type);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for investigations
CREATE TRIGGER set_investigations_updated_at
  BEFORE UPDATE ON public.investigations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();