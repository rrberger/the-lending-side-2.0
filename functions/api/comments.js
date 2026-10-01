// Cloudflare Pages Function: /api/comments
// Handles fetching and posting comments with Cloudflare Turnstile anti-spam verification

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing post slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Fallback if D1 is not bound yet
  if (!env.DB) {
    return new Response(JSON.stringify({ comments: [], notice: "D1 database binding 'DB' not configured" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, author_name, content, created_at 
       FROM comments 
       WHERE post_slug = ? AND status = 'approved' 
       ORDER BY created_at ASC`
    ).bind(slug).all();

    return new Response(JSON.stringify({ comments: results || [] }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=15"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, comments: [] }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { post_slug, author_name, content, turnstile_token, honeypot } = body;

  // 1. Bot Honeypot Defense: Bots fill this hidden input; humans don't
  if (honeypot && honeypot.trim().length > 0) {
    // Pretend success so bots don't adapt, but discard immediately
    return new Response(JSON.stringify({ status: "success", notice: "Comment accepted" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 2. Input Validation
  if (!post_slug || !author_name || !content) {
    return new Response(JSON.stringify({ error: "Name and comment text are required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const cleanName = escapeHtml(author_name.trim().slice(0, 60));
  const cleanContent = escapeHtml(content.trim().slice(0, 2000));

  if (cleanName.length < 1 || cleanContent.length < 2) {
    return new Response(JSON.stringify({ error: "Please enter a valid name and comment." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 3. Cloudflare Turnstile Verification
  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    if (!turnstile_token) {
      return new Response(JSON.stringify({ error: "Missing spam verification token." }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    try {
      const verifyFormData = new FormData();
      verifyFormData.append('secret', turnstileSecret);
      verifyFormData.append('response', turnstile_token);
      verifyFormData.append('remoteip', request.headers.get('CF-Connecting-IP') || '');

      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: verifyFormData
      });

      const outcome = await verifyRes.json();
      if (!outcome.success) {
        return new Response(JSON.stringify({ error: "Spam check failed. Please refresh and try again." }), {
          status: 403,
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: "Turnstile verification service error." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  // 4. Insert into D1 Database
  if (!env.DB) {
    return new Response(JSON.stringify({ error: "D1 Database binding 'DB' not configured on Cloudflare Pages." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO comments (post_slug, author_name, content, status, created_at)
       VALUES (?, ?, ?, 'approved', ?)`
    ).bind(post_slug, cleanName, cleanContent, now).run();

    return new Response(JSON.stringify({
      status: "success",
      comment: {
        author_name: cleanName,
        content: cleanContent,
        created_at: now
      }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to save comment: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Minimal HTML Escaper to prevent XSS injection
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
