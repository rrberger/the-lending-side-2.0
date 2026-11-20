import os
import sys
import http.server
import socketserver
import json
import re
import mimetypes
import secrets

PORT = int(os.environ.get('PORT', 8000))
DIRECTORY = os.environ.get('REPO_DIR', os.path.abspath(os.path.dirname(__file__)))

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

# Auth token — required when not running on localhost
CMS_AUTH_TOKEN = os.environ.get('CMS_AUTH_TOKEN', '')

# Git repo config for deploy
GIT_REPO_URL = os.environ.get('GIT_REPO_URL', '')
GIT_BRANCH = os.environ.get('GIT_BRANCH', 'master')
GITHUB_PAT = os.environ.get('GITHUB_PAT', '')

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


def init_repo():
    """Clone the blog repo into DIRECTORY on first boot (K3s PVC will be empty)."""
    posts_path = os.path.join(DIRECTORY, 'data', 'posts.json')
    git_dir = os.path.join(DIRECTORY, '.git')

    if os.path.exists(git_dir):
        print(f"Git repo already exists at {DIRECTORY}")
        # Configure git identity for commits
        _configure_git()
        return

    if not GIT_REPO_URL:
        # No git URL — just ensure directories exist
        os.makedirs(os.path.join(DIRECTORY, 'data'), exist_ok=True)
        if not os.path.exists(posts_path):
            with open(posts_path, 'w', encoding='utf-8') as f:
                json.dump({"posts": [], "pages": [], "exif": {}}, f, indent=2)
        return

    import subprocess
    print(f"Cloning {GIT_REPO_URL} into {DIRECTORY}...")
    os.makedirs(DIRECTORY, exist_ok=True)

    # Build clone URL with PAT for push access if available
    clone_url = GIT_REPO_URL
    if GITHUB_PAT and 'github.com' in GIT_REPO_URL:
        clone_url = GIT_REPO_URL.replace('https://', f'https://x-access-token:{GITHUB_PAT}@')

    try:
        subprocess.run(
            ["git", "clone", "--branch", GIT_BRANCH, "--depth", "1", clone_url, "."],
            check=True, cwd=DIRECTORY
        )
        print(f"Cloned successfully into {DIRECTORY}")
        _configure_git()
    except subprocess.CalledProcessError as e:
        print(f"Git clone failed: {e}")
        # Ensure we at least have a data dir
        os.makedirs(os.path.join(DIRECTORY, 'data'), exist_ok=True)
        if not os.path.exists(posts_path):
            with open(posts_path, 'w', encoding='utf-8') as f:
                json.dump({"posts": [], "pages": [], "exif": {}}, f, indent=2)


def _configure_git():
    """Set up git config inside the container for clean commits."""
    import subprocess
    try:
        subprocess.run(["git", "config", "user.name", "TLS Studio"], check=False, cwd=DIRECTORY)
        subprocess.run(["git", "config", "user.email", "studio@thelendingside.com"], check=False, cwd=DIRECTORY)

        # If we have a PAT, make sure the remote URL includes it for push
        if GITHUB_PAT and GIT_REPO_URL and 'github.com' in GIT_REPO_URL:
            push_url = GIT_REPO_URL.replace('https://', f'https://x-access-token:{GITHUB_PAT}@')
            subprocess.run(["git", "remote", "set-url", "origin", push_url], check=False, cwd=DIRECTORY)

        # Unshallow so we can push
        subprocess.run(["git", "fetch", "--unshallow"], check=False, cwd=DIRECTORY,
                        capture_output=True)
    except Exception as e:
        print(f"Git config warning: {e}")


class CMSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve the repo directory for static files
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def _is_localhost(self):
        """Check if the request is from localhost."""
        host = self.headers.get('Host', '')
        return host.startswith('localhost') or host.startswith('127.0.0.1')

    def _check_auth(self):
        """Verify bearer token on non-localhost requests. Returns True if authorized."""
        # Localhost is always trusted (local dev mode)
        if self._is_localhost():
            return True

        # If no auth token is configured, block remote access entirely
        if not CMS_AUTH_TOKEN:
            self._send_json({"error": "Remote access requires CMS_AUTH_TOKEN"}, 403)
            return False

        # Check Authorization header
        auth_header = self.headers.get('Authorization', '')
        if auth_header == f'Bearer {CMS_AUTH_TOKEN}':
            return True

        # Check X-Auth-Token header (for simpler integrations)
        token_header = self.headers.get('X-Auth-Token', '')
        if token_header == CMS_AUTH_TOKEN:
            return True

        # Check query param (for initial studio.html load)
        if f'token={CMS_AUTH_TOKEN}' in (self.path or ''):
            return True

        self._send_json({"error": "Unauthorized"}, 401)
        return False

    def do_GET(self):
        # Health endpoint — always public (for K8s probes)
        if self.path == '/health':
            self._send_json({"status": "ok", "service": "tls-cms"})
            return

        # Music API endpoint
        if self.path.startswith('/api/music'):
            self._handle_get_music()
            return

        # Studio route — serve studio.html (auth check is done client-side via fetch)
        if self.path.startswith('/studio'):
            self.path = '/studio.html'
            # On non-localhost, serve the file (login screen handles auth)
            super().do_GET()
            return

        super().do_GET()

    def do_HEAD(self):
        if self.path in ('/studio', '/studio/'):
            self.path = '/studio.html'
        super().do_HEAD()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token')
        self.end_headers()

    def do_POST(self):
        # All POST endpoints require auth
        if not self._check_auth():
            return

        # 1. Save / Edit Post Endpoint
        if self.path == '/api/posts':
            self._handle_save_post()
        # 2. Delete Post Endpoint
        elif self.path == '/api/posts/delete':
            self._handle_delete_post()
        # 3. Image Upload Endpoint
        elif self.path == '/api/upload':
            self._handle_upload()
        # 4. Git Deploy Endpoint
        elif self.path == '/api/git-deploy':
            self._handle_git_deploy()
        # 5. Music Now Playing / Scrobbles Webhook
        elif self.path == '/api/music':
            self._handle_post_music()
        # 6. Auth verification endpoint
        elif self.path == '/api/auth/verify':
            self._send_json({"status": "ok", "message": "Token valid"})
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

    def _handle_git_deploy(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            payload = json.loads(body) if body else {}
        except Exception:
            payload = {}

        post_title = payload.get('title', 'blog update')
        commit_msg = f"publish(post): {post_title}"

        import subprocess
        try:
            # 1. Stage posts database
            subprocess.run(["git", "add", "data/posts.json"], check=True, cwd=DIRECTORY)
            # 2. Commit with post title
            commit_res = subprocess.run(["git", "commit", "-m", commit_msg], capture_output=True, text=True, cwd=DIRECTORY)
            # 3. Pull latest first to avoid conflicts
            subprocess.run(["git", "pull", "--rebase", "origin", GIT_BRANCH],
                           capture_output=True, text=True, cwd=DIRECTORY)
            # 4. Attempt push to origin
            push_res = subprocess.run(["git", "push", "origin", GIT_BRANCH], capture_output=True, text=True, cwd=DIRECTORY)
            
            if push_res.returncode == 0:
                self._send_json({
                    "status": "success",
                    "message": "Committed and pushed to GitHub! Cloudflare Pages is now building your new post.",
                    "details": push_res.stdout or push_res.stderr
                })
            else:
                self._send_json({
                    "status": "partial",
                    "message": "Changes committed locally, but push failed. Check GITHUB_PAT configuration.",
                    "terminal_command": f"git push origin {GIT_BRANCH}",
                    "details": push_res.stderr
                })
        except subprocess.CalledProcessError as e:
            self._send_json({"status": "error", "error": f"Git command failed: {str(e)}"}, 500)
        except Exception as e:
            self._send_json({"status": "error", "error": str(e)}, 500)

    def _handle_get_music(self):
        music_path = os.path.join(DIRECTORY, 'data', 'music.json')
        if os.path.exists(music_path):
            try:
                with open(music_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self._send_json(data)
                    return
            except Exception as e:
                print(f"Error reading music.json: {e}")
        self._send_json({"now_playing": None, "recent_spins": []})

    def _handle_post_music(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        try:
            payload = json.loads(post_data)
        except Exception:
            self._send_json({"error": "Invalid JSON"}, 400)
            return

        music_path = os.path.join(DIRECTORY, 'data', 'music.json')
        db = {"now_playing": None, "recent_spins": []}
        if os.path.exists(music_path):
            try:
                with open(music_path, 'r', encoding='utf-8') as f:
                    db = json.load(f)
            except Exception:
                pass

        action = payload.get("action", "spin")
        record = payload.get("record", {})
        session = payload.get("session", {})

        if action in ("spin", "flip"):
            db["now_playing"] = {
                "active": True,
                "title": record.get("title", "Unknown"),
                "artist": record.get("artist", "Unknown"),
                "year": record.get("year"),
                "genre": record.get("genre"),
                "label": record.get("label"),
                "format": record.get("format", "Album"),
                "side": (session.get("side") or payload.get("side") or "A").upper(),
                "rpm": session.get("rpm") or payload.get("rpm") or 33,
                "cover_image_url": record.get("cover_image_url"),
                "thumb_image_url": record.get("thumb_image_url"),
                "started_at": session.get("started_at") or payload.get("timestamp")
            }
            if action == "spin":
                spins = db.get("recent_spins", [])
                new_entry = {
                    "id": len(spins) + 1,
                    "title": record.get("title", "Unknown"),
                    "artist": record.get("artist", "Unknown"),
                    "year": record.get("year"),
                    "genre": record.get("genre"),
                    "label": record.get("label"),
                    "format": record.get("format", "Album"),
                    "side": (session.get("side") or "A").upper(),
                    "rpm": session.get("rpm") or 33,
                    "cover_image_url": record.get("cover_image_url"),
                    "thumb_image_url": record.get("thumb_image_url"),
                    "played_at": payload.get("timestamp")
                }
                # Keep top 30
                db["recent_spins"] = [new_entry] + [s for s in spins if s.get("title") != record.get("title") or s.get("artist") != record.get("artist")][:29]
        elif action == "stop":
            if db.get("now_playing"):
                db["now_playing"]["active"] = False
        elif action == "sync":
            recent = payload.get("recent_spins", [])
            db["recent_spins"] = recent[:30]

        os.makedirs(os.path.dirname(music_path), exist_ok=True)
        with open(music_path, 'w', encoding='utf-8') as f:
            json.dump(db, f, indent=2)

        self._send_json({"success": True, "action": action})

    def _send_json(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

if __name__ == '__main__':
    # Initialize repo on first boot (clone from GitHub if REPO_DIR + GIT_REPO_URL are set)
    init_repo()

    handler = CMSRequestHandler
    # Run the socket server
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    try:
        with socketserver.ThreadingTCPServer(("", PORT), handler) as httpd:
            mode = "MINILAB" if CMS_AUTH_TOKEN else "LOCAL DEV"
            print(f"==================================================")
            print(f" THE LENDING SIDE Authoring Studio [{mode}]")
            print(f" Studio URL : http://localhost:{PORT}/studio      ")
            print(f" Blog Feed  : http://localhost:{PORT}/            ")
            print(f" Repo Dir   : {DIRECTORY}")
            print(f" Auth       : {'Token Required' if CMS_AUTH_TOKEN else 'Localhost Only'}")
            print(f" Press Ctrl+C to terminate                        ")
            print(f"==================================================")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer terminated by user.")
        sys.exit(0)
