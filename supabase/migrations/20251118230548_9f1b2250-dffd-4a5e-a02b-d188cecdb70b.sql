-- Add verification status to findings table
ALTER TABLE findings 
ADD COLUMN verification_status TEXT DEFAULT 'needs_review' 
CHECK (verification_status IN ('verified', 'needs_review', 'inaccurate'));