# The Lending Side — Project Roadmap & Task List

## ─── ACTIVE & UPCOMING TASKS ───

- [ ] **1. Revisit & Overhaul Film Strip View (`film_strip`)**
  * Current status: Temporarily commented out in navigation and routed to `journal` view by default.
  * Objectives:
    - Re-architect the horizontal presentation so multi-image galleries scroll or paginate cleanly without collision.
    - Ensure fluid trackpad, wheel, and mobile swipe navigation across screen resolutions.
    - Re-enable `film_strip` button in `index.html` and `app.js` once responsive layout tests pass.

- [ ] **2. Open Source CMS Tool Integration for Local Post Authoring**
  * Current status: Designing & implementing local workflow.
  * Objectives:
    - Provide a modern, intuitive editor for writing articles and inserting images.
    - Upload images directly to Cloudflare R2 (`the-lending-side-media` / `media.thelendingside.com`).
    - Output new posts into `data/posts.json` (or Markdown files) so git commit + push automatically deploys them to Cloudflare Pages.
    - Zero exposure to public web (runs locally on `localhost`).

- [ ] **3. Implement Spam-Resistant Commenting System**
  * Current status: Architecture proposal.
  * Objectives:
    - Enable visitors to comment on posts without running heavy PHP/WordPress backends.
    - Spam mitigation strategies (Cloudflare Turnstile, GitHub Discussions / Giscus, Cusdis with moderation queue, or Cloudflare Worker + D1).

---

## ─── COMPLETED TASKS ───

- [x] **DNS & Nameservers**: Migrated `thelendingside.com` nameservers to Cloudflare.
- [x] **R2 Custom Media Domain**: Connected `media.thelendingside.com` to Cloudflare R2 bucket `the-lending-side-media`.
- [x] **Database Migration**: Rewrote 3,993 image references in `data/posts.json` from `pub-*.r2.dev` to `https://media.thelendingside.com`.
- [x] **EXIF Stripped**: Removed inline EXIF info cards beneath photos; preserved full clean aesthetic.
- [x] **High-Res Lightbox**: Click-to-enlarge loads full resolution uncompressed assets with keyboard/touch navigation.
- [x] **Admin Security**: Completely purged admin interface and routes from public frontend build.
