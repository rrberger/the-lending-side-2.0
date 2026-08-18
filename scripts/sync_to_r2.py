import os
import sys
import mimetypes

# Set base directory path
DIRECTORY = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

# Load .env file manually
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

R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_ENDPOINT_URL = os.environ.get('R2_ENDPOINT_URL')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'the-lending-side-media')

if not (R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_ENDPOINT_URL):
    print("Error: R2 credentials missing in .env file.")
    print("Please copy .env.example to .env and fill out your credentials first.")
    sys.exit(1)

try:
    import boto3
except ImportError:
    print("Error: 'boto3' is not installed.")
    print("Run: pip install boto3")
    sys.exit(1)

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

images_dir = os.path.join(DIRECTORY, 'images')
if not os.path.exists(images_dir):
    print(f"Error: Local 'images' directory not found at {images_dir}")
    sys.exit(1)

local_files = [f for f in os.listdir(images_dir) if os.path.isfile(os.path.join(images_dir, f))]
print(f"Found {len(local_files)} images in local directory.")

uploaded_count = 0
for idx, filename in enumerate(local_files, 1):
    file_path = os.path.join(images_dir, filename)
    content_type, _ = mimetypes.guess_type(filename)
    if not content_type:
        content_type = 'image/jpeg'
        
    print(f"[{idx}/{len(local_files)}] Uploading {filename} ({content_type})...")
    try:
        with open(file_path, 'rb') as f:
            s3_client.put_object(
                Bucket=R2_BUCKET_NAME,
                Key=filename,
                Body=f,
                ContentType=content_type
            )
        uploaded_count += 1
    except Exception as e:
        print(f"  Error uploading {filename}: {e}")

print(f"\nUpload complete! Successfully synced {uploaded_count}/{len(local_files)} images to Cloudflare R2.")
