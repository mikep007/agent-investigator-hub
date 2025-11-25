-- Enable realtime for breach monitoring tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.monitored_subjects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.breach_alerts;