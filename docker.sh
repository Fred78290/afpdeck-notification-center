#!/bin/bash

npm ci
npm run build

if [ -z "$1" ]; then
	VERSION=$(jq -r .version package.json)
else
	VERSION=$1
fi

REGISTRY=${REGISTRY:=fred78290}

docker buildx build --push --platform linux/amd64,linux/arm64 --pull \
    -t ${REGISTRY}/afpdeck-notification-center:v${VERSION} \
    -t ${REGISTRY}/afpdeck-notification-center:latest .
