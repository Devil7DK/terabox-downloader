HOSTNAME=gcr.io
PROJECT=devil7softwares
IMAGE=terabox-downloader

COMMIT_ID=$(git log --format="%H" -n 1)
DATE=$(date +%Y%m%d)

REPOSITORY="${HOSTNAME}/${PROJECT}/${IMAGE}"
TAG="${REPOSITORY}:latest"

docker build . -t "${TAG}"
docker push "${TAG}"