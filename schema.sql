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

-- Cloudflare D1 Database Schema for Analog Vinyl Music Tracker (02_music)
CREATE TABLE IF NOT EXISTS music_now_playing (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active INTEGER DEFAULT 0,
    title TEXT,
    artist TEXT,
    year INTEGER,
    genre TEXT,
    label TEXT,
    format TEXT,
    side TEXT,
    rpm INTEGER,
    cover_image_url TEXT,
    thumb_image_url TEXT,
    started_at TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS music_spins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    year INTEGER,
    genre TEXT,
    label TEXT,
    format TEXT,
    side TEXT,
    rpm INTEGER,
    cover_image_url TEXT,
    thumb_image_url TEXT,
    duration_seconds INTEGER DEFAULT 0,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_music_spins_played_at 
ON music_spins(played_at DESC);
