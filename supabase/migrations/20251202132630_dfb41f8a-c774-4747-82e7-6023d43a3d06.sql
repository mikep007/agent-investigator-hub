-- Create cases table for organizing investigations
CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create case_items table for storing evidence/findings in cases
CREATE TABLE public.case_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  item_type TEXT NOT NULL, -- 'finding', 'profile', 'platform', 'breach', 'note'
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  source_url TEXT,
  source_investigation_id UUID REFERENCES public.investigations(id) ON DELETE SET NULL,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_items ENABLE ROW LEVEL SECURITY;

-- Cases policies
CREATE POLICY "Users can view their own cases"
ON public.cases FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cases"
ON public.cases FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cases"
ON public.cases FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cases"
ON public.cases FOR DELETE
USING (auth.uid() = user_id);

-- Case items policies
CREATE POLICY "Users can view their own case items"
ON public.case_items FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own case items"
ON public.case_items FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own case items"
ON public.case_items FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own case items"
ON public.case_items FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at on cases
CREATE TRIGGER update_cases_updated_at
BEFORE UPDATE ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();