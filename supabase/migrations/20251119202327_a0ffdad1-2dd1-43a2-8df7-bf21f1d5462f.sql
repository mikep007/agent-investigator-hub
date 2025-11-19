-- Fix confidence_score column to allow 0-100 values
ALTER TABLE findings 
ALTER COLUMN confidence_score TYPE numeric(5,2);