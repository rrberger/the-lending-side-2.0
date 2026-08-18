import os
import sys
import json
import re

# Set base directory path
DIRECTORY = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

# Load .env file
def load_env():
    env_path = os.path.join(DIRECTORY, '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split('=', 1)
                if len(parts) == 2:
                    key = parts[0].strip()
                    val = parts[1].strip().strip('"').strip("'")
                    os.environ[key] = val

load_env()

R2_ENDPOINT_URL = os.environ.get('R2_ENDPOINT_URL')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'the-lending-side-media')
R2_PUBLIC_CUSTOM_DOMAIN = os.environ.get('R2_PUBLIC_CUSTOM_DOMAIN', '')

if not (R2_ENDPOINT_URL):
    print("Error: R2_ENDPOINT_URL missing in .env file.")
    sys.exit(1)

# Determine public bucket domain URL
if R2_PUBLIC_CUSTOM_DOMAIN:
    r2_prefix = R2_PUBLIC_CUSTOM_DOMAIN.rstrip('/')
else:
    r2_prefix = f"{R2_ENDPOINT_URL.rstrip('/')}/{R2_BUCKET_NAME}"

print(f"Migrating image paths to public prefix: {r2_prefix}")

posts_path = os.path.join(DIRECTORY, 'data', 'posts.json')
if not os.path.exists(posts_path):
    print("Error: data/posts.json not found!")
    sys.exit(1)

with open(posts_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Handle posts wrapped in {"posts": [...]}
post_list = data.get('posts', []) if isinstance(data, dict) else data

migrated_count = 0

def replace_image_url(url):
    global migrated_count
    if not url:
        return url
    # Match relative images/ paths
    if url.startswith('images/'):
        filename = os.path.basename(url)
        migrated_count += 1
        return f"{r2_prefix}/{filename}"
    return url

for post in post_list:
    # 1. Update featured_image metadata field
    if 'featured_image' in post:
        post['featured_image'] = replace_image_url(post['featured_image'])
        
    # 2. Update embedded img tags inside HTML content (including src, srcset, data-orig-file, etc.)
    if 'content' in post and post['content']:
        content = post['content']
        
        def regex_replace(match):
            global migrated_count
            filename = match.group(1)
            migrated_count += 1
            return f"{r2_prefix}/{filename}"
            
        # Matches word boundary images/ followed by name, extension, and optional parameters
        new_content = re.sub(
            r'\bimages/([^"\s\',>]+?\.(?:jpg|jpeg|png|webp|gif|svg)(?:\?[^"\s\',>]*)?)', 
            regex_replace, 
            content
        )
        post['content'] = new_content

with open(posts_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"\nMigration complete! Replaced {migrated_count} image references inside data/posts.json.")
print("Your database now points fully to Cloudflare R2.")
