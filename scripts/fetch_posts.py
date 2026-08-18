import os
import urllib.request
import urllib.error
import json
import re
import time
from urllib.parse import urlparse, unquote

# Set up headers to mimic a browser
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

def make_request(url):
    print(f"Fetching: {url}")
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.URLError as e:
        print(f"Error fetching {url}: {e}")
        return None

def sanitize_filename(url):
    # Extract filename from URL
    path = urlparse(url).path
    filename = os.path.basename(path)
    # Remove query params or trailing formatting
    filename = unquote(filename)
    # Clean up name: keep only letters, numbers, hyphens, underscores and dots
    filename = re.sub(r'[^a-zA-Z0-9\._\-]', '_', filename)
    return filename

def download_image(url, dest_folder):
    if not url:
        return None
    
    # Strip any sizing parameters (like ?w=1024 or &h=600) to get the original image
    clean_url = url.split('?')[0]
    
    filename = sanitize_filename(clean_url)
    dest_path = os.path.join(dest_folder, filename)
    
    if os.path.exists(dest_path):
        # Already downloaded
        return filename
        
    print(f"Downloading image: {clean_url} -> {dest_path}")
    req = urllib.request.Request(clean_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as response:
            with open(dest_path, 'wb') as f:
                f.write(response.read())
        time.sleep(0.1)  # small rate limiting safety delay
        return filename
    except Exception as e:
        print(f"Failed to download {clean_url}: {e}")
        # Try downloading with the original url if the clean one failed
        try:
            print(f"Retrying with original URL: {url}")
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req) as response:
                with open(dest_path, 'wb') as f:
                    f.write(response.read())
            return filename
        except Exception as retry_err:
            print(f"Retry failed: {retry_err}")
            return None

def format_shutter_speed(shutter_speed):
    # Convert shutter speed to standard representation (e.g. "1/30" or "0.3s")
    try:
        val = float(shutter_speed)
        if val <= 0:
            return shutter_speed
        if val >= 1:
            return f"{val:.1f}s" if val % 1 != 0 else f"{int(val)}s"
        # Find fraction
        reciprocal = round(1.0 / val)
        return f"1/{reciprocal}s"
    except ValueError:
        return shutter_speed

def extract_exif(attachments):
    exif_map = {}
    if not attachments:
        return exif_map
        
    for att_id, att in attachments.items():
        url = att.get('URL', '')
        if not url:
            continue
        filename = sanitize_filename(url.split('?')[0])
        
        exif_raw = att.get('exif', {})
        if exif_raw:
            camera = exif_raw.get('camera', '')
            aperture = exif_raw.get('aperture', '')
            iso = exif_raw.get('iso', '')
            shutter_speed = exif_raw.get('shutter_speed', '')
            focal_length = exif_raw.get('focal_length', '')
            
            # Clean up focal length (remove mm or add if missing)
            if focal_length and focal_length != '0':
                if not focal_length.endswith('mm'):
                    focal_length = f"{focal_length}mm"
            else:
                focal_length = ''
                
            # Clean up aperture
            if aperture and aperture != '0':
                if not aperture.startswith('f/'):
                    aperture = f"f/{aperture}"
            else:
                aperture = ''
                
            # Clean up ISO
            if iso == '0':
                iso = ''
                
            # Clean up shutter speed
            if shutter_speed and shutter_speed != '0':
                shutter_speed = format_shutter_speed(shutter_speed)
            else:
                shutter_speed = ''
                
            # Only add if we have some meaningful data
            if camera or aperture or iso or shutter_speed or focal_length:
                exif_map[filename] = {
                    "camera": camera,
                    "aperture": aperture,
                    "iso": iso,
                    "shutter_speed": shutter_speed,
                    "focal_length": focal_length
                }
    return exif_map

def process_posts():
    data_dir = './data'
    images_dir = './images'
    
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(images_dir, exist_ok=True)
    
    # 1. Fetch posts
    posts_url = "https://public-api.wordpress.com/rest/v1.1/sites/thelendingside.com/posts?number=100"
    posts_data = make_request(posts_url)
    
    # 2. Fetch pages
    pages_url = "https://public-api.wordpress.com/rest/v1.1/sites/thelendingside.com/posts?type=page&number=100"
    pages_data = make_request(pages_url)
    
    if not posts_data:
        print("Failed to fetch posts, aborting.")
        return
        
    all_posts = posts_data.get('posts', [])
    all_pages = pages_data.get('posts', []) if pages_data else []
    
    processed_posts = []
    processed_pages = []
    master_exif = {}
    
    # Process helper for rewriting URLs and downloading images
    def process_item(item):
        nonlocal master_exif
        content = item.get('content', '')
        
        # Extract EXIF from item's attachments
        attachments = item.get('attachments', {})
        master_exif.update(extract_exif(attachments))
        
        # Download and replace featured image
        featured_image_url = item.get('featured_image', '')
        local_featured = None
        if featured_image_url:
            local_filename = download_image(featured_image_url, images_dir)
            if local_filename:
                local_featured = f"images/{local_filename}"
                
        # Find all image URLs in content
        # Matches patterns like src="URL" or data-orig-file="URL"
        img_urls = re.findall(r'src=["\'](https?://[^"\']+)["\']', content)
        img_urls += re.findall(r'data-orig-file=["\'](https?://[^"\']+)["\']', content)
        img_urls += re.findall(r'data-large-file=["\'](https?://[^"\']+)["\']', content)
        
        # Filter duplicates
        img_urls = list(set(img_urls))
        
        # Download images and replace their URLs in content
        for img_url in img_urls:
            # Strip query params
            base_img_url = img_url.split('?')[0]
            local_filename = download_image(img_url, images_dir)
            
            if local_filename:
                # Replace original URL (with and without query params)
                content = content.replace(img_url, f"images/{local_filename}")
                content = content.replace(base_img_url, f"images/{local_filename}")
                
        # Format clean post output
        return {
            "id": item.get('ID'),
            "title": item.get('title'),
            "slug": item.get('slug'),
            "date": item.get('date'),
            "modified": item.get('modified'),
            "content": content,
            "excerpt": item.get('excerpt'),
            "featured_image": local_featured,
            "url": item.get('URL')
        }

    print(f"Processing {len(all_posts)} posts...")
    for idx, post in enumerate(all_posts):
        print(f"--- Post {idx+1}/{len(all_posts)}: {post.get('title')} ---")
        processed_posts.append(process_item(post))
        
    print(f"Processing {len(all_pages)} pages...")
    for idx, page in enumerate(all_pages):
        print(f"--- Page {idx+1}/{len(all_pages)}: {page.get('title')} ---")
        processed_pages.append(process_item(page))
        
    # Write output structure
    output_data = {
        "posts": processed_posts,
        "pages": processed_pages,
        "exif": master_exif,
        "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    output_file = os.path.join(data_dir, 'posts.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully processed {len(processed_posts)} posts and {len(processed_pages)} pages.")
    print(f"Saved to {output_file}")
    print(f"Collected EXIF metadata for {len(master_exif)} images.")

if __name__ == "__main__":
    start_time = time.time()
    process_posts()
    print(f"Finished in {time.time() - start_time:.2f} seconds.")
