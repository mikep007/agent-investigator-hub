-- Make case-screenshots bucket private for defense-in-depth
UPDATE storage.buckets 
SET public = false 
WHERE id = 'case-screenshots';