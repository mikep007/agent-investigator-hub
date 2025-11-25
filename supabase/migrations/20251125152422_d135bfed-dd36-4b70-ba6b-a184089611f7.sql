-- Create monitored_subjects table
CREATE TABLE public.monitored_subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('email', 'username', 'phone')),
  subject_value TEXT NOT NULL,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, subject_type, subject_value)
);

-- Enable RLS
ALTER TABLE public.monitored_subjects ENABLE ROW LEVEL SECURITY;

-- RLS policies for monitored_subjects
CREATE POLICY "Users can view their own monitored subjects"
ON public.monitored_subjects
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own monitored subjects"
ON public.monitored_subjects
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own monitored subjects"
ON public.monitored_subjects
FOR DELETE
USING (auth.uid() = user_id);

-- Create breach_alerts table
CREATE TABLE public.breach_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  monitored_subject_id UUID NOT NULL REFERENCES public.monitored_subjects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  breach_source TEXT NOT NULL,
  breach_date TEXT,
  breach_data JSONB NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.breach_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for breach_alerts
CREATE POLICY "Users can view their own breach alerts"
ON public.breach_alerts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own breach alerts"
ON public.breach_alerts
FOR UPDATE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_breach_alerts_user_id ON public.breach_alerts(user_id);
CREATE INDEX idx_breach_alerts_is_read ON public.breach_alerts(is_read);
CREATE INDEX idx_monitored_subjects_user_id ON public.monitored_subjects(user_id);