source "$CURDIR/../../../.env"

ACCESS_TOKEN=$(curl -ksu $APICORE_CLIENT_ID:$APICORE_CLIENT_SECRET -H "Accept: application/json" "$APICORE_TEST_URL/oauth/token?username=$APICORE_USERNAME&password=$APICORE_PASSWORD&grant_type=password" | tee /dev/stderr | jq -r '.access_token')

NOTIFICATION_FILTER=test-afpdeck-notification-center-sdk
NOTIFICATION_SERVICE=test-afpdeck-notification-center-sdk
