# The Lending Side — Custom Domain Task List (Tomorrow)

You have successfully uploaded all 471 images to Cloudflare R2 and migrated your database references. Tomorrow, complete the DNS custom domain setup to remove Cloudflare's development subdomain rate limits (`429` errors).

---

## ─── TASK LIST ───

- [ ] **1. Choose and Configure Your Custom Domain Routing**
  
  *   **Option A (Recommended: Move DNS to Cloudflare)**
      1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com/).
      2. Click **Add a Site** and add `thelendingside.com`.
      3. Change your nameservers at your domain registrar (GoDaddy, Namecheap, etc.) to point to Cloudflare's nameservers.
      4. Once active, go to **R2 > images bucket > Settings > Custom Domains** and connect `media.thelendingside.com`.
  
  *   **Option B (Keep DNS Elsewhere: BunnyCDN Proxy)**
      1. Create a pull zone in Bunny.net pointing to `https://pub-52f53ff9fc907fb66a04d74c5de34a55.r2.dev`.
      2. Connect `media.thelendingside.com` as a custom domain in Bunny.
      3. Log in to your external DNS provider and add a CNAME record:
         *   **Name**: `media`
         *   **Target**: `<your-bunny-pull-zone>.b-cdn.net`

- [ ] **2. Update Environment Configuration**
  1. Open `.env` in the repository root.
  2. Set `R2_PUBLIC_CUSTOM_DOMAIN` to your custom domain:
     ```ini
     R2_PUBLIC_CUSTOM_DOMAIN=https://media.thelendingside.com
     ```

- [ ] **3. Re-run Database Path Migration**
  1. Open your terminal in the repository root.
  2. Run the migration script to rewrite the 3,991 image URLs to use your new custom domain:
     ```powershell
     python scripts/migrate_posts_to_r2.py
     ```
  3. Verify the site renders photos successfully.
