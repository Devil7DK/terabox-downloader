HOSTNAME=gcr.io
PROJECT=devil7softwares
IMAGE=terabox-downloader

COMMIT_ID=$(git log --format="%H" -n 1)
DATE=$(date +%Y%m%d)

REPOSITORY="${HOSTNAME}/${PROJECT}/${IMAGE}"
TAG="${DATE}-${COMMIT_ID}"

docker build . -t "${REPOSITORY}:${TAG}"