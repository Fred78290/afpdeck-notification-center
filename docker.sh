#!/bin/bash

npm ci
npm build

VERSION=$(jq -r .version package.json)

docker buildx build --push --platform linux/amd64,linux/arm64 --pull \
    -t ${REGISTRY}/afpdeck-notification-center:v${VERSION} \
    -t ${REGISTRY}/afpdeck-notification-center:latest .
