-- Add username column to users table
ALTER TABLE users
ADD COLUMN username VARCHAR(255) UNIQUE;

-- Create index for faster lookup
CREATE INDEX idx_users_username ON users(username);
