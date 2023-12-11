#!/bin/bash
CURDIR=$(dirname $0)

source "$CURDIR/../../env.sh"

echo

SERVICES=$(curl -ks -XGET \
	-H "Content-Type:application/json" \
	-H "Authorization: Bearer ${ACCESS_TOKEN}" \
	"${APICORE_TEST_URL}/notification/api/service/list.json" | jq -r '.response.services[].serviceName')

for NOTIFICATION_SERVICE in ${SERVICES}
do
	echo "Delete service: ${NOTIFICATION_SERVICE}"
	curl -ks -XDELETE \
		-H "Content-Type:application/json" \
		-H "Authorization: Bearer ${ACCESS_TOKEN}" \
		"${APICORE_TEST_URL}/notification/api/service/delete.json?service=${NOTIFICATION_SERVICE}"
	echo
done