#!/bin/bash
CURDIR=$(dirname $0)

source "$CURDIR/../../env.sh"

curl -ksu "${APICORE_SERVICE_USERNAME}:${APICORE_SERVICE_PASSWORD}" \
	-XDELETE \
	-H "Content-Type:application/json" \
	"${APICORE_BASE_URL}/notification/shared/service/delete.json?service=shared"