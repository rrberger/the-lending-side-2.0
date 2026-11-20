#!/bin/bash
# ==============================================================================
# The Lending Side — Authoring Studio CMS Deployment Script for Minilab K3s
# Builds Docker container, imports into K3s containerd namespace, and applies manifest.
# ==============================================================================

# Exit immediately if any command returns a non-zero exit code
set -e

SERVER="mini-lab"
REMOTE_DIR="~/Documents/the-lending-side-cms"
CONTAINER_NAME="k3s"
IMAGE_NAME="tls-cms"

echo "=== 1. Copying Studio CMS Files to Minilab Server ==="
ssh "$SERVER" "mkdir -p $REMOTE_DIR/data"
scp server.py studio.html Dockerfile.cms the-lending-side-cms-k3s.yaml "$SERVER:$REMOTE_DIR/"
scp data/posts.json "$SERVER:$REMOTE_DIR/data/" 2>/dev/null || echo "  (no posts.json to copy, will clone from git)"

# Rename Dockerfile.cms to Dockerfile on remote for the build
ssh "$SERVER" "cp $REMOTE_DIR/Dockerfile.cms $REMOTE_DIR/Dockerfile"

echo "=== 2. Rebuilding & Importing Container on Remote K3s Server ==="
ssh "$SERVER" "cd $REMOTE_DIR && \
  echo '  -> Building TLS-CMS Docker Image...' && \
  docker build -t $IMAGE_NAME:latest . && \
  echo '  -> Saving Image to Tar Archive...' && \
  docker save $IMAGE_NAME:latest -o $IMAGE_NAME.tar && \
  echo '  -> Copying Tar into K3s container...' && \
  docker cp $IMAGE_NAME.tar $CONTAINER_NAME:/tmp/$IMAGE_NAME.tar && \
  echo '  -> Clearing old containerd cache...' && \
  docker exec -i $CONTAINER_NAME ctr -n=k8s.io images remove docker.io/library/$IMAGE_NAME:latest || true && \
  docker exec -i $CONTAINER_NAME ctr -n=k8s.io images remove $IMAGE_NAME:latest || true && \
  echo '  -> Importing image into containerd namespace...' && \
  docker exec -i $CONTAINER_NAME ctr -n=k8s.io images import /tmp/$IMAGE_NAME.tar && \
  docker exec -i $CONTAINER_NAME ctr -n=k8s.io images tag docker.io/library/$IMAGE_NAME:latest $IMAGE_NAME:latest || true && \
  echo '  -> Cleaning up temporary tars...' && \
  rm $IMAGE_NAME.tar && \
  docker exec -i $CONTAINER_NAME rm /tmp/$IMAGE_NAME.tar && \
  echo '  -> Applying the-lending-side-cms-k3s.yaml Kubernetes manifest...' && \
  docker exec -i $CONTAINER_NAME kubectl apply -f - < the-lending-side-cms-k3s.yaml && \
  echo '  -> Rolling out restart to deployment...' && \
  docker exec -i $CONTAINER_NAME kubectl rollout restart deployment/tls-cms && \
  docker exec -i $CONTAINER_NAME kubectl rollout status deployment/tls-cms --timeout=90s"

echo ""
echo "=== 3. Studio CMS successfully deployed! ==="
echo "The Lending Side Authoring Studio is now running on K3s NodePort 30086 (Host Port 8086)."
echo "Studio URL: http://minilab.home:8086/studio"
echo ""
echo "IMPORTANT: Set your auth token in the K8s manifest (CMS_AUTH_TOKEN env var)"
echo "           and optionally GITHUB_PAT for the Deploy button to work."
