#!/bin/bash
CURDIR=$(dirname $0)

source "$CURDIR/../../env.sh"

curl -ksu "${APICORE_SERVICE_USERNAME}:${APICORE_SERVICE_PASSWORD}" \
	-H "Content-Type:application/json" \
	"${APICORE_BASE_URL}/notification/shared/service/list.json?cid=${APICORE_CLIENT_ID}&uid=${APICORE_USERNAME}"