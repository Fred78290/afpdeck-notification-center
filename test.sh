#!/bin/bash
set -e
set -x
source .env

SERVICE=$(cat <<EOF
serviceName=test-notification-center&serviceType=mail&serviceData=\{\"address\":\"$APICORE_EMAIL\"\}
EOF
)

curl -v -XPOST -H 'Content-Type: application/json' -H 'Accept: application/json' \
	"http://localhost:8080/api/register/test-notification-center?${SERVICE}" \
	 -d @./lambda/tests/unit/testSubscription.json

curl -XGET -H 'Content-Type: application/json' -H 'Accept: application/json' \
	"http://localhost:8080/api/list?serviceName=test-notification-center&${SERVICE}"

curl -H 'Content-Type: application/json' -H 'Accept: application/json' \
	"http://localhost:8080/api/push/test-notification-center?${SERVICE}" \
	 -d @./lambda/tests/unit/testPush.json

curl -H 'Content-Type: application/json' -H 'Accept: application/json' \
	"http://localhost:8080/api/delete/test-notification-center?${SERVICE}"