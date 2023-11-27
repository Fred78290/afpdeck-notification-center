#!/bin/bash
CURDIR=$(dirname $0)

source "$CURDIR/../../env.sh"

NOTIFICATION_FILTER=test-afpdeck-notification-center-sdk

curl -ks -XGET \
	-H "Content-Type:application/json" \
	-H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "$APICORE_BASE_URL/notification/api/subscription/get.json?name=$NOTIFICATION_FILTER"