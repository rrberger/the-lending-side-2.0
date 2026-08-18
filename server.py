import os
import sys
import http.server
import socketserver
import json
import re
import mimetypes

PORT = 8000
DIRECTORY = os.path.abspath(os.path.dirname(__file__))

# Load .env file manually to keep zero-dependency core
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

# Try to initialize Cloudflare R2 S3 Client
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_ENDPOINT_URL = os.environ.get('R2_ENDPOINT_URL')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'the-lending-side-media')
R2_PUBLIC_CUSTOM_DOMAIN = os.environ.get('R2_PUBLIC_CUSTOM_DOMAIN', '')

s3_client = None
if R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_ENDPOINT_URL:
    try:
        import boto3
        # Create S3 client pointing to Cloudflare R2 with connection timeouts
        from botocore.config import Config
        config = Config(
            connect_timeout=12,
            read_timeout=12,
            retries={'max_attempts': 3}
        )
        s3_client = boto3.client(
            's3',
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name='auto',
            config=config
        )
        print("Cloudflare R2 Client Initialized Successfully.")
    except ImportError:
        print("Notice: R2 credentials found, but 'boto3' is not installed.")
        print("Run: pip install boto3 to enable direct Cloudflare R2 uploads.")
    except Exception as e:
        print(f"Error initializing R2 client: {e}")


class CMSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve the current directory
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_POST(self):
        # 1. Save / Edit Post Endpoint
        if self.path == '/api/posts':
            self._handle_save_post()
        # 2. Delete Post Endpoint
        elif self.path == '/api/posts/delete':
            self._handle_delete_post()
        # 3. Image Upload Endpoint
        elif self.path == '/api/upload':
            self._handle_upload()
        else:
            self.send_error(404, "Endpoint not found")

    def _handle_save_post(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            post_payload = json.loads(post_data)
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, 400)
            return

        db_path = os.path.join(DIRECTORY, 'data', 'posts.json')
        db = {"posts": [], "pages": [], "exif": {}}
        
        if os.path.exists(db_path):
            try:
                with open(db_path, 'r', encoding='utf-8') as f:
                    db = json.load(f)
            except Exception as e:
                print(f"Error reading DB: {e}")

        post = post_payload.get('post')
        exif = post_payload.get('exif', {})

        if not post or 'title' not in post or 'slug' not in post:
            self._send_json({"error": "Missing title or slug"}, 400)
            return

        # Assign an ID if new
        if not post.get('id'):
            existing_ids = [p.get('id') for p in db.get('posts', []) if p.get('id')]
            post['id'] = max(existing_ids) + 1 if existing_ids else 1000

        # Update or Append post
        posts_list = db.setdefault('posts', [])
        existing_index = -1
        for idx, p in enumerate(posts_list):
            if p.get('id') == post['id'] or p.get('slug') == post['slug']:
                existing_index = idx
                break

        if existing_index != -1:
            posts_list[existing_index] = post
            print(f"Updated post: {post['title']}")
        else:
            posts_list.insert(0, post)
            print(f"Created new post: {post['title']}")

        # Merge EXIF data
        db_exif = db.setdefault('exif', {})
        for img_name, img_exif in exif.items():
            db_exif[img_name] = img_exif

        # Save back to database file
        try:
            with open(db_path, 'w', encoding='utf-8') as f:
                json.dump(db, f, indent=2, ensure_ascii=False)
            self._send_json({"status": "success", "post": post})
        except Exception as e:
            self._send_json({"error": f"Failed to write database: {str(e)}"}, 500)

    def _handle_delete_post(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            post_id = payload.get('id')
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, 400)
            return

        if not post_id:
            self._send_json({"error": "Missing post ID"}, 400)
            return

        db_path = os.path.join(DIRECTORY, 'data', 'posts.json')
        if not os.path.exists(db_path):
            self._send_json({"error": "Database not found"}, 404)
            return

        try:
            with open(db_path, 'r', encoding='utf-8') as f:
                db = json.load(f)
            
            posts_list = db.get('posts', [])
            filtered_posts = [p for p in posts_list if p.get('id') != post_id]
            
            if len(posts_list) == len(filtered_posts):
                self._send_json({"error": "Post not found"}, 404)
                return

            db['posts'] = filtered_posts
            
            with open(db_path, 'w', encoding='utf-8') as f:
                json.dump(db, f, indent=2, ensure_ascii=False)
                
            self._send_json({"status": "success", "message": "Post deleted"})
        except Exception as e:
            self._send_json({"error": f"Failed to delete post: {str(e)}"}, 500)

    def _handle_upload(self):
        content_type = self.headers.get('Content-Type')
        if not content_type or 'multipart/form-data' not in content_type:
            self._send_json({"error": "Must be multipart/form-data"}, 400)
            return

        # Extract boundary string
        match = re.search(r'boundary=([^;]+)', content_type)
        if not match:
            self._send_json({"error": "Boundary not found in header"}, 400)
            return
            
        boundary = match.group(1).encode('utf-8')
        content_length = int(self.headers.get('Content-Length'))
        
        # Read raw body bytes
        raw_body = self.rfile.read(content_length)
        
        # Split body parts by boundary
        parts = raw_body.split(b'--' + boundary)
        
        uploaded_files = []
        images_dir = os.path.join(DIRECTORY, 'images')
        os.makedirs(images_dir, exist_ok=True)

        for part in parts:
            if not part or part == b'--\r\n' or part == b'\r\n' or part == b'--':
                continue
                
            # Split headers and body content inside the boundary block
            header_body_split = part.split(b'\r\n\r\n', 1)
            if len(header_body_split) < 2:
                continue
                
            headers_part, body_part = header_body_split
            headers_str = headers_part.decode('utf-8', errors='ignore')
            
            # Find Content-Disposition to extract file details
            cd_match = re.search(r'Content-Disposition:\s*form-data;[^\r\n]*filename="([^"]+)"', headers_str, re.IGNORECASE)
            if cd_match:
                filename = cd_match.group(1)
                # Clean filename
                filename = os.path.basename(filename)
                # Strip trailing \r\n from binary body part
                if body_part.endswith(b'\r\n'):
                    body_part = body_part[:-2]
                    
                # Upload to Cloudflare R2 if client is configured
                if s3_client is not None:
                    try:
                        content_type, _ = mimetypes.guess_type(filename)
                        if not content_type:
                            content_type = 'image/jpeg'
                            
                        s3_client.put_object(
                            Bucket=R2_BUCKET_NAME,
                            Key=filename,
                            Body=body_part,
                            ContentType=content_type
                        )
                        
                        # Resolve public image URL
                        if R2_PUBLIC_CUSTOM_DOMAIN:
                            public_url = f"{R2_PUBLIC_CUSTOM_DOMAIN.rstrip('/')}/{filename}"
                        else:
                            public_url = f"{R2_ENDPOINT_URL.rstrip('/')}/{R2_BUCKET_NAME}/{filename}"
                            
                        uploaded_files.append(public_url)
                        print(f"Uploaded to Cloudflare R2: {filename} -> {public_url}")
                    except Exception as e:
                        print(f"R2 upload failed, saving locally: {e}")
                        file_path = os.path.join(images_dir, filename)
                        with open(file_path, 'wb') as f:
                            f.write(body_part)
                        uploaded_files.append(filename)
                else:
                    # Save locally
                    file_path = os.path.join(images_dir, filename)
                    try:
                        with open(file_path, 'wb') as f:
                            f.write(body_part)
                        uploaded_files.append(filename)
                        print(f"Saved uploaded image locally: {filename}")
                    except Exception as e:
                        print(f"Error saving uploaded image locally: {e}")

        if uploaded_files:
            self._send_json({"status": "success", "filenames": uploaded_files})
        else:
            self._send_json({"error": "No file uploaded"}, 400)

    def _send_json(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

if __name__ == '__main__':
    handler = CMSRequestHandler
    # Run the socket server
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    try:
        with socketserver.ThreadingTCPServer(("", PORT), handler) as httpd:
            print(f"==================================================")
            print(f" THE LENDING SIDE CMS Local API Server Running    ")
            print(f" Server active at: http://localhost:{PORT}       ")
            print(f" CMS Dashboard at: http://localhost:{PORT}/#admin ")
            print(f" Press Ctrl+C to terminate                        ")
            print(f"==================================================")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer terminated by user.")
        sys.exit(0)
