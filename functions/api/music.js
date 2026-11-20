// Cloudflare Pages Function: /api/music
// Handles fetching currently spinning vinyl record and recent listening history for the blog's 02_music page.

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

const DEFAULT_FALLBACK_HISTORY = [
  {
    title: "Bloweyelashwish",
    artist: "lovesliescrushing",
    year: 2026,
    genre: "Electronic, Rock",
    format: "Album",
    label: "Numero Group",
    side: "A",
    rpm: 33,
    cover_image_url: "https://i.discogs.com/B3K50gppNxwcStionXN7XSuUIKENxD5CSTMOtQlEl4o/rs:fit/g:sm/q:90/h:562/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTM2Nzc2/MTYxLTE3NzM1Nzgz/NjAtNjY0NC5qcGVn.jpeg",
    thumb_image_url: "https://i.discogs.com/jS4m6TspO6yly6J6d_oiA3V1NQ0lmrGIzI9hkYIwDGw/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTM2Nzc2/MTYxLTE3NzM1Nzgz/NjAtNjY0NC5qcGVn.jpeg",
    played_at: "2026-11-20T03:09:46Z"
  },
  {
    title: "A・I・R (Air In Resort)",
    artist: "Hiroshi Yoshimura",
    year: 2025,
    genre: "Electronic",
    format: "Album",
    label: "Sound Process",
    side: "A",
    rpm: 45,
    cover_image_url: "https://i.discogs.com/swlWk0tYGRBEyMnkizhvWE4SzDX-RLmt8mwOdujy3OY/rs:fit/g:sm/q:90/h:600/w:599/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTMzNzI5/MDMzLTE3NDQ5MTYx/MjUtNTI2My5qcGVn.jpeg",
    thumb_image_url: "https://i.discogs.com/T3zc_Ixo_sty3OqSsHR01rpLiJD45sAtQyaABbwlhnw/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTMzNzI5/MDMzLTE3NDQ5MTYx/MjUtNTI2My5qcGVn.jpeg",
    played_at: "2026-11-19T22:55:15Z"
  },
  {
    title: "The Earth Is Not A Cold Dead Place",
    artist: "Explosions In The Sky",
    year: 2011,
    genre: "Rock",
    format: "LP",
    label: "Temporary Residence Limited",
    side: "A",
    rpm: 33,
    cover_image_url: "https://i.discogs.com/guyWjmZxEANFAUDVbRjQa0spr4mJDYotdxvl4Q3LnZQ/rs:fit/g:sm/q:90/h:598/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTcyNTY2/MzYtMTQzNzMyMDgx/OS00MDYyLmpwZWc.jpeg",
    thumb_image_url: "https://i.discogs.com/tsov7I83MV3r13ozfZ3-E5JHWzGeZr-Hv1D7bM_LN3U/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTcyNTY2/MzYtMTQzNzMyMDgx/OS00MDYyLmpwZWc.jpeg",
    played_at: "2026-11-18T22:54:45Z"
  },
  {
    title: "Happy Songs For Happy People",
    artist: "Mogwai",
    year: 2018,
    genre: "Electronic, Rock",
    format: "Album",
    label: "Play It Again Sam",
    side: "A",
    rpm: 33,
    cover_image_url: "https://i.discogs.com/n0_siJTKrY2v3QNJDF55zU3JwcE4In8G1CVgDHk9Dpc/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTEyMzUy/MzEzLTE2NTk3NzEz/NTEtNzI3OC5qcGVn.jpeg",
    thumb_image_url: "https://i.discogs.com/OmOfQ0XPFqIe618-zO1F5TZJB0tF3wxQ7sP_xi0v-uo/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTEyMzUy/MzEzLTE2NTk3NzEz/NTEtNzI3OC5qcGVn.jpeg",
    played_at: "2026-11-18T22:27:11Z"
  }
];

async function ensureTables(db) {
  try {
    await db.exec(`
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
    `);
  } catch (err) {
    console.error("Failed to ensure music tables:", err);
  }
}

export async function onRequestGet(context) {
  const { env } = context;

  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "public, max-age=10, s-maxage=10"
  };

  if (!env.DB) {
    return new Response(JSON.stringify({
      now_playing: DEFAULT_FALLBACK_HISTORY[0],
      recent_spins: DEFAULT_FALLBACK_HISTORY
    }), { status: 200, headers: corsHeaders });
  }

  await ensureTables(env.DB);

  try {
    const npRow = await env.DB.prepare(
      "SELECT * FROM music_now_playing WHERE id = 1"
    ).first();

    const { results } = await env.DB.prepare(
      "SELECT * FROM music_spins ORDER BY played_at DESC LIMIT 30"
    ).all();

    let recent = results || [];
    if (recent.length === 0) {
      recent = DEFAULT_FALLBACK_HISTORY;
    }

    return new Response(JSON.stringify({
      now_playing: npRow && npRow.active ? npRow : null,
      recent_spins: recent
    }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      now_playing: null,
      recent_spins: DEFAULT_FALLBACK_HISTORY
    }), { status: 200, headers: corsHeaders });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: corsHeaders
    });
  }

  // Security: If ANALOG_WEBHOOK_SECRET is set in Cloudflare env, verify token
  const expectedSecret = env.ANALOG_WEBHOOK_SECRET;
  if (expectedSecret) {
    const authHeader = request.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const secretInBody = body.secret || "";
    if (bearer !== expectedSecret && secretInBody !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders
      });
    }
  }

  if (!env.DB) {
    return new Response(JSON.stringify({
      success: true,
      notice: "D1 database not configured, event accepted in fallback"
    }), { status: 200, headers: corsHeaders });
  }

  await ensureTables(env.DB);

  const action = body.action || "spin";
  const record = body.record || {};
  const session = body.session || {};

  try {
    if (action === "spin" || action === "flip") {
      const active = 1;
      const title = record.title || "Unknown Title";
      const artist = record.artist || "Unknown Artist";
      const year = record.year || null;
      const genre = record.genre || null;
      const label = record.label || null;
      const format = record.format || "LP";
      const side = (session.side || body.side || "A").toUpperCase();
      const rpm = session.rpm || body.rpm || record.rpm || 33;
      const coverUrl = record.cover_image_url || null;
      const thumbUrl = record.thumb_image_url || null;
      const startedAt = session.started_at || body.started_at || new Date().toISOString();

      await env.DB.prepare(`
        INSERT INTO music_now_playing 
          (id, active, title, artist, year, genre, label, format, side, rpm, cover_image_url, thumb_image_url, started_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          active = excluded.active,
          title = excluded.title,
          artist = excluded.artist,
          year = excluded.year,
          genre = excluded.genre,
          label = excluded.label,
          format = excluded.format,
          side = excluded.side,
          rpm = excluded.rpm,
          cover_image_url = excluded.cover_image_url,
          thumb_image_url = excluded.thumb_image_url,
          started_at = excluded.started_at,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        active, title, artist, year, genre, label, format, side, rpm, coverUrl, thumbUrl, startedAt
      ).run();

      if (action === "spin") {
        await env.DB.prepare(`
          INSERT INTO music_spins 
            (record_id, title, artist, year, genre, label, format, side, rpm, cover_image_url, thumb_image_url, played_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          record.id || null, title, artist, year, genre, label, format, side, rpm, coverUrl, thumbUrl
        ).run();
      }

      return new Response(JSON.stringify({ success: true, status: "playing", title, artist, side }), {
        status: 200,
        headers: corsHeaders
      });

    } else if (action === "stop") {
      await env.DB.prepare(`
        UPDATE music_now_playing SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1
      `).run();

      return new Response(JSON.stringify({ success: true, status: "stopped" }), {
        status: 200,
        headers: corsHeaders
      });

    } else if (action === "sync") {
      if (record && record.title) {
        const side = (session.side || "A").toUpperCase();
        const rpm = session.rpm || record.rpm || 33;
        await env.DB.prepare(`
          INSERT INTO music_now_playing 
            (id, active, title, artist, year, genre, label, format, side, rpm, cover_image_url, thumb_image_url, started_at, updated_at)
          VALUES (1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            active = 1,
            title = excluded.title,
            artist = excluded.artist,
            year = excluded.year,
            genre = excluded.genre,
            label = excluded.label,
            format = excluded.format,
            side = excluded.side,
            rpm = excluded.rpm,
            cover_image_url = excluded.cover_image_url,
            thumb_image_url = excluded.thumb_image_url,
            started_at = excluded.started_at,
            updated_at = CURRENT_TIMESTAMP
        `).bind(
          record.title,
          record.artist || "Unknown",
          record.year || null,
          record.genre || null,
          record.label || null,
          record.format || "LP",
          side,
          rpm,
          record.cover_image_url || null,
          record.thumb_image_url || null,
          session.started_at || new Date().toISOString()
        ).run();
      }

      const spins = body.recent_spins || [];
      for (const s of spins) {
        const r = s.record || s;
        await env.DB.prepare(`
          INSERT INTO music_spins 
            (record_id, title, artist, year, genre, label, format, side, rpm, cover_image_url, thumb_image_url, duration_seconds, played_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          r.id || null,
          r.title || "Unknown",
          r.artist || "Unknown",
          r.year || null,
          r.genre || null,
          r.label || null,
          r.format || "LP",
          s.side || "A",
          s.rpm || 33,
          r.cover_image_url || null,
          r.thumb_image_url || null,
          s.duration_seconds || 0,
          s.started_at || s.played_at || new Date().toISOString()
        ).run();
      }

      return new Response(JSON.stringify({ success: true, count: spins.length }), {
        status: 200,
        headers: corsHeaders
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
