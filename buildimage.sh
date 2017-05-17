#!/bin/bash

TAG="$1"
if [ -z "$TAG" ]; then
  TAG="latest"
fi

git rev-parse HEAD > commithash
source ~/.bash_profile
echo building new docker image with tag $TAG...
cp ~/.npmrc .
cp ~/repo-keys/tradle-models ./repo-key
docker build -t "tradle/bot-inviter:$TAG" . && \
  rm -f .npmrc repo-key
