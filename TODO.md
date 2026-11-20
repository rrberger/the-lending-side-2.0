# The Lending Side — Project Roadmap & Task List

## ─── ACTIVE & UPCOMING TASKS ───

- [ ] **1. Revisit & Overhaul Film Strip View (`film_strip`)**
  * Current status: Temporarily commented out in navigation and routed to `journal` view by default.
  * Objectives:
    - Re-architect the horizontal presentation so multi-image galleries scroll or paginate cleanly without collision.
    - Ensure fluid trackpad, wheel, and mobile swipe navigation across screen resolutions.
    - Re-enable `film_strip` button in `index.html` and `app.js` once responsive layout tests pass.

- [ ] **2. Cloudflare R2 Studio Upload Credentials Setup**
  * Current status: `boto3` and direct R2 S3 uploading are already implemented in `server.py`, but R2 API token credentials need to be generated and added to `.env`.
  * Objectives:
    - Generate an R2 API Token in Cloudflare Dashboard (Permissions: Object Read & Write on bucket `the-lending-side-media`).
    - Add `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_ENDPOINT_URL` to local `.env`.
    - Test drag-and-drop photo upload in Studio (`http://localhost:8000/studio`) to verify images upload directly to `https://media.thelendingside.com/` and insert seamlessly into markdown prose.

---

## ─── COMPLETED TASKS ───

- [x] **Analog Vinyl Tracker & Telemetry (`02_music`)**: Integrated live turntable needle drop broadcasting from Analog Listener on Minilab K3s to `thelendingside.com/#music`. Includes animated spinning vinyl disc, pulsing amber LED HUD, Cloudflare Pages webhook function (`functions/api/music.js`), and D1 database persistence.

- [x] **Open Source Local Authoring Studio (`EasyMDE`)**: Integrated local Markdown/WYSIWYG editor (`studio.html` & `server.py`) with drag-and-drop Cloudflare R2 uploads, per-post media isolation, Turndown HTML-to-Markdown cleaner, and one-click Git deployment.
- [x] **Spam-Resistant Commenting System**: Implemented Cloudflare Turnstile bot verification, D1 SQLite database (`blog-comments`), and Pages serverless function (`functions/api/comments.js`) with silent honeypot defense.
- [x] **Mobile Experience Overhaul**: Refactored mobile responsive layout for iPhone/Android, centered all content/prose, expanded photos to full width, and permanently eliminated the bottom navigation dock.
- [x] **DNS & Nameservers**: Migrated `thelendingside.com` nameservers to Cloudflare.
- [x] **R2 Custom Media Domain**: Connected `media.thelendingside.com` to Cloudflare R2 bucket `the-lending-side-media`.
- [x] **Database Migration**: Rewrote 3,993 image references in `data/posts.json` from `pub-*.r2.dev` to `https://media.thelendingside.com`.
- [x] **EXIF Stripped**: Removed inline EXIF info cards beneath photos; preserved full clean aesthetic.
- [x] **High-Res Lightbox**: Click-to-enlarge loads full resolution uncompressed assets with keyboard/touch navigation.
- [x] **Admin Security**: Completely purged admin interface and routes from public frontend build.
