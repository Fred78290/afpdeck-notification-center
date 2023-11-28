#!/bin/bash
CURDIR=$(dirname $0)

source "$CURDIR/../../env.sh"

curl -ks -XGET \
	-H "Content-Type:application/json" \
	-H "Authorization: Bearer ${ACCESS_TOKEN}" \
	"$APICORE_TEST_URL/notification/api/subscription/list.json" 