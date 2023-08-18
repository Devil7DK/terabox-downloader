echo "Enter Hostname:"
read HOSTNAME

IMAGE=terabox-downloader

COMMIT_ID=$(git log --format="%H" -n 1)
DATE=$(date +%Y%m%d)

REPOSITORY="${HOSTNAME}/${IMAGE}"
TAG="${REPOSITORY}:latest"

docker build . -t "${TAG}"
docker push "${TAG}"