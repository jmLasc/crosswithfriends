-- Add preferences JSONB column to users table for persisting game settings
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}';
