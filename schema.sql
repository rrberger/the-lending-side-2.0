-- Cloudflare D1 Database Schema for Blog Comments
-- Database name: blog-comments

CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_slug TEXT NOT NULL,
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'approved',
    ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_comments_slug_status 
ON comments(post_slug, status, created_at ASC);
