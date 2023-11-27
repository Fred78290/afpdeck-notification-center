#!/bin/bash
CURDIR=$(dirname $0)

source "$CURDIR/../../env.sh"

curl -ks -XDELETE \
	-H "Content-Type:application/json" \
	-H "Authorization: Bearer ${ACCESS_TOKEN}" \
	"${APICORE_BASE_URL}/notification/api/service/delete.json?service=${NOTIFICATION_SERVICE}"