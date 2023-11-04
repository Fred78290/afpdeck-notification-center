#!/bin/bash

npm ci
npm run build

VERSION=$(jq -r .version package.json)
REGISTRY=${REGISTRY:=fred78290}

docker buildx build --push --platform linux/amd64,linux/arm64 --pull \
    -t ${REGISTRY}/afpdeck-notification-center:v${VERSION} \
    -t ${REGISTRY}/afpdeck-notification-center:latest .
