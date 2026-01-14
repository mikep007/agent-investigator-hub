-- Add missing UPDATE and DELETE policies for the findings table
-- This prevents any authenticated user from modifying or deleting other users' investigation findings

CREATE POLICY "Users can update findings for their investigations"
ON public.findings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.investigations
    WHERE investigations.id = findings.investigation_id
    AND investigations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete findings for their investigations"
ON public.findings FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.investigations
    WHERE investigations.id = findings.investigation_id
    AND investigations.user_id = auth.uid()
  )
);