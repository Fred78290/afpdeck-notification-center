#!/bin/bash
CURDIR=$(dirname $0)

source "$CURDIR/../../env.sh"

NOTIFICATION_FILTER=test-afpdeck-notification-center-sdk

curl -ks -XDELETE \
	-H "Content-Type:application/json" \
	-H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "${APICORE_TEST_URL}/notification/api/subscription/delete.json?name=${NOTIFICATION_FILTER}&service=${NOTIFICATION_SERVICE}"