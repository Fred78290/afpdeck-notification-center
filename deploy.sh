#!/bin/bash
DOCUMENTS_STACK=afpdeck-notification-center
TEMPLATE=.aws-sam/build/template.yaml
TEMPLATE=template.yaml
LAMBDA_BUCKET=aldunelabs-lambdaInfo
SAM_PROFILE=aldune
SAM_REGION=eu-west-1
SAM_OPTIONS="--profile ${SAM_PROFILE} --region ${SAM_REGION}"
DOMAIN_NAME=aldunelabs.fr
AUTHPASSWORD=$(uuidgen)

ACM_CERTIFICATE_ARN=$(aws acm list-certificates ${SAM_OPTIONS} --include keyTypes=RSA_1024,RSA_2048,EC_secp384r1,EC_prime256v1,EC_secp521r1,RSA_3072,RSA_4096 | jq -r --arg DOMAIN_NAME "${DOMAIN_NAME}" '.CertificateSummaryList[]|select(.DomainName == $DOMAIN_NAME)|.CertificateArn // ""')
ROUTE53_ZONEID="$(aws route53 list-hosted-zones-by-name ${SAM_OPTIONS} | jq -r  --arg NAME "${DOMAIN_NAME}." '.HostedZones[]|select(.Name == $NAME)|.Id' | cut -d / -f 3)"

if [ -z "${ACM_CERTIFICATE_ARN}" ] || [ -z "${ROUTE53_ZONEID}" ]; then
  echo "ACM_CERTIFICATE_ARN=${ACM_CERTIFICATE_ARN} ROUTE53_ZONEID=${ROUTE53_ZONEID}, not qualified"
  exit 1
fi

PARAMETERS=$(cat <<EOF
ParameterKey=ACMCertificatARN,ParameterValue=${ACM_CERTIFICATE_ARN}
ParameterKey=Route53ZoneID,ParameterValue=${ROUTE53_ZONEID}
ParameterKey=ApiDomainName,ParameterValue=afpdeck-notification-center.${DOMAIN_NAME}
ParameterKey=AuthPassword,ParameterValue=${AUTHPASSWORD}
EOF
)

pushd lambda
npm install
npm run test
popd

echo "Build lambda"
sam build ${SAM_OPTIONS} \
	--template-file template.yaml \
	--parameter-overrides ${PARAMETERS} \

cp samconfig.toml .aws-sam/build

pushd .aws-sam/build

echo "Package lambda"
sam package ${SAM_OPTIONS} \
	--template-file ${TEMPLATE} \
	--output-template-file ${TEMPLATE}.out

echo "Deploy lambda"
sam deploy ${SAM_OPTIONS} \
	--template-file ${TEMPLATE}.out \
	--stack-name ${DOCUMENTS_STACK} \
	--parameter-overrides ${PARAMETERS} \
	--capabilities CAPABILITY_NAMED_IAM CAPABILITY_IAM \
	--no-confirm-changeset \
	--no-fail-on-empty-changeset

popd
