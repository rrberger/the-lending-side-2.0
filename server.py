import os
import sys
import http.server
import socketserver
import json
import re
import mimetypes

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
    except Exception as e:
        print(f"Error initializing R2 client: {e}")


def init_repo():
    """Clone the blog repo into DIRECTORY on first boot (K3s PVC will be empty)."""
    posts_path = os.path.join(DIRECTORY, 'data', 'posts.json')
    git_dir = os.path.join(DIRECTORY, '.git')

    if os.path.exists(git_dir):
        print(f"Git repo already exists at {DIRECTORY}")
        _configure_git()
        return

    if not GIT_REPO_URL:
        os.makedirs(os.path.join(DIRECTORY, 'data'), exist_ok=True)
        if not os.path.exists(posts_path):
            with open(posts_path, 'w', encoding='utf-8') as f:
                json.dump({"posts": [], "pages": [], "exif": {}}, f, indent=2)
        return

    import subprocess
    print(f"Cloning {GIT_REPO_URL} into {DIRECTORY}...")
    os.makedirs(DIRECTORY, exist_ok=True)

    clone_url = GIT_REPO_URL
    if GITHUB_PAT and 'github.com' in GIT_REPO_URL:
        clean_url = re.sub(r'https://[^@]+@', 'https://', GIT_REPO_URL)
        clone_url = clean_url.replace('https://', f'https://x-access-token:{GITHUB_PAT}@')

    try:
        subprocess.run(
            ["git", "clone", "--branch", GIT_BRANCH, clone_url, "."],
            check=True, cwd=DIRECTORY
        )
        print(f"Cloned successfully into {DIRECTORY}")
        _configure_git()
    except subprocess.CalledProcessError as e:
        print(f"Git clone failed: {e}")
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

        if GITHUB_PAT and GIT_REPO_URL and 'github.com' in GIT_REPO_URL:
            clean_url = re.sub(r'https://[^@]+@', 'https://', GIT_REPO_URL)
            push_url = clean_url.replace('https://', f'https://x-access-token:{GITHUB_PAT}@')
            subprocess.run(["git", "remote", "set-url", "origin", push_url], check=False, cwd=DIRECTORY)
    except Exception as e:
        print(f"Git config warning: {e}")


class CMSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token')
        super().end_headers()

    def _is_localhost(self):
        host = self.headers.get('Host', '')
        return host.startswith('localhost') or host.startswith('127.0.0.1')

    def _check_auth(self):
        if self._is_localhost():
            return True

        if not CMS_AUTH_TOKEN:
            self._send_json({"error": "Remote access requires CMS_AUTH_TOKEN"}, 403)
            return False

        auth_header = self.headers.get('Authorization', '')
        if auth_header == f'Bearer {CMS_AUTH_TOKEN}':
            return True

        token_header = self.headers.get('X-Auth-Token', '')
        if token_header == CMS_AUTH_TOKEN:
            return True

        if f'token={CMS_AUTH_TOKEN}' in (self.path or ''):
            return True

        self._send_json({"error": "Unauthorized"}, 401)
        return False

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self._send_json({"status": "ok", "service": "tls-cms"})
            return

        if self.path.startswith('/api/music'):
            self._handle_get_music()
            return

        # Clean route alias for the authoring studio
        if self.path in ('/studio', '/studio/', '/studio.html'):
            local_studio = os.path.join(DIRECTORY, 'studio.html')
            fallback_studio = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'studio.html')
            target_path = local_studio if os.path.exists(local_studio) else fallback_studio
            if os.path.exists(target_path):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                with open(target_path, 'rb') as f:
                    self.wfile.write(f.read())
                return

        super().do_GET()

    def do_HEAD(self):
        if self.path in ('/studio', '/studio/', '/studio.html'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            return
        super().do_HEAD()

    def do_POST(self):
        if not self._check_auth():
            return

        if self.path == '/api/posts':
            self._handle_save_post()
        elif self.path == '/api/posts/delete':
            self._handle_delete_post()
        elif self.path == '/api/upload':
            self._handle_upload()
        elif self.path == '/api/git-deploy':
            self._handle_git_deploy()
        elif self.path == '/api/music':
            self._handle_post_music()
        elif self.path == '/api/auth/verify':
            self._send_json({"status": "ok", "message": "Token valid"})
        else:
            self.send_error(404, "Endpoint not found")

    def _handle_save_post(self):
        content_length = int(self.headers.get('Content-Length', 0))
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

        if not post.get('id'):
            existing_ids = [p.get('id') for p in db.get('posts', []) if p.get('id')]
            post['id'] = max(existing_ids) + 1 if existing_ids else 1000

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

        db_exif = db.setdefault('exif', {})
        for img_name, img_exif in exif.items():
            db_exif[img_name] = img_exif

        try:
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            with open(db_path, 'w', encoding='utf-8') as f:
                json.dump(db, f, indent=2, ensure_ascii=False)
            self._send_json({"status": "success", "post": post})
        except Exception as e:
            self._send_json({"error": f"Failed to write database: {str(e)}"}, 500)

    def _handle_delete_post(self):
        content_length = int(self.headers.get('Content-Length', 0))
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

        match = re.search(r'boundary=([^;]+)', content_type)
        if not match:
            self._send_json({"error": "Boundary not found in header"}, 400)
            return
            
        boundary = match.group(1).encode('utf-8')
        content_length = int(self.headers.get('Content-Length', 0))
        
        raw_body = self.rfile.read(content_length)
        parts = raw_body.split(b'--' + boundary)
        
        uploaded_files = []
        images_dir = os.path.join(DIRECTORY, 'images')
        os.makedirs(images_dir, exist_ok=True)

        for part in parts:
            if not part or part == b'--\r\n' or part == b'\r\n' or part == b'--':
                continue
                
            header_body_split = part.split(b'\r\n\r\n', 1)
            if len(header_body_split) < 2:
                continue
                
            headers_part, body_part = header_body_split
            headers_str = headers_part.decode('utf-8', errors='ignore')
            
            cd_match = re.search(r'Content-Disposition:\s*form-data;[^\r\n]*filename="([^"]+)"', headers_str, re.IGNORECASE)
            if cd_match:
                filename = os.path.basename(cd_match.group(1))
                if body_part.endswith(b'\r\n'):
                    body_part = body_part[:-2]
                    
                if s3_client is not None:
                    try:
                        c_type, _ = mimetypes.guess_type(filename)
                        if not c_type:
                            c_type = 'image/jpeg'
                            
                        s3_client.put_object(
                            Bucket=R2_BUCKET_NAME,
                            Key=filename,
                            Body=body_part,
                            ContentType=c_type
                        )
                        
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
            subprocess.run(["git", "add", "data/posts.json"], check=False, cwd=DIRECTORY)
            if os.path.exists(os.path.join(DIRECTORY, "data", "music.json")):
                subprocess.run(["git", "add", "data/music.json"], check=False, cwd=DIRECTORY)

            commit_res = subprocess.run(["git", "commit", "-m", commit_msg], capture_output=True, text=True, cwd=DIRECTORY)
            print(f"Git commit: {commit_res.stdout or commit_res.stderr}")

            pull_res = subprocess.run(["git", "pull", "--rebase", "origin", GIT_BRANCH],
                                      capture_output=True, text=True, cwd=DIRECTORY)
            print(f"Git pull: {pull_res.stdout or pull_res.stderr}")

            push_res = subprocess.run(["git", "push", "origin", GIT_BRANCH], capture_output=True, text=True, cwd=DIRECTORY)
            print(f"Git push: {push_res.stdout or push_res.stderr}")
            
            if push_res.returncode == 0:
                self._send_json({
                    "status": "success",
                    "message": "Committed and pushed to GitHub! Cloudflare Pages is now building your new post.",
                    "details": push_res.stdout or push_res.stderr
                })
            else:
                self._send_json({
                    "status": "partial",
                    "message": "Changes committed locally, but push failed. See details below.",
                    "terminal_command": f"git push origin {GIT_BRANCH}",
                    "details": push_res.stderr or push_res.stdout
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
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

if __name__ == '__main__':
    init_repo()

    handler = CMSRequestHandler
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
