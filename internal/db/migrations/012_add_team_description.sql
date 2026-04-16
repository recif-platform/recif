-- +goose Up
ALTER TABLE teams ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

UPDATE teams SET description = 'Default platform team' WHERE id = 'tk_DEFAULT000000000000000000';

-- +goose Down
ALTER TABLE teams DROP COLUMN IF EXISTS description;
