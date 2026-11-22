# Rule: Cache Busting for Site Updates

Whenever making modifications to `app.js`, `style.css`, or frontend assets:
- Always bump the query parameter version string (`?v=X.Y`) in `index.html` (and any other HTML files referencing them).
- For example, if `index.html` references `style.css?v=2.5` and `app.js?v=2.5`, bump it to `?v=2.6` (or higher) so browsers and CDNs (Cloudflare / edge caches) immediately serve the new changes without serving stale cached assets.
