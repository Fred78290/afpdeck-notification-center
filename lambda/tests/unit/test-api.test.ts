/* eslint-disable prettier/prettier */
import { APIGatewayProxyEvent, APIGatewayProxyResult, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyEventPathParameters } from 'aws-lambda';
import { apiHandler } from '../../app';
import testSubscription from './testSubscription.json';
import testPush from './testPush.json';
import * as dotenv from 'dotenv';
import ApiCore from 'afp-apicore-sdk';

const serviceName = 'test-notification-center';

dotenv.config({ path: __dirname + '/../../configs/.env' });

async function buildEvent(method: string, path: string, pathParameters: APIGatewayProxyEventPathParameters | null, queryStringParameters: APIGatewayProxyEventQueryStringParameters | null, body: unknown | null) {
	const apicore = new ApiCore({
		baseUrl: process.env.APICORE_BASE_URL,
		clientId: process.env.APICORE_CLIENT_ID,
		clientSecret: process.env.APICORE_CLIENT_SECRET,
	});

	const token = await apicore.authenticate({
		username: process.env.APICORE_USERNAME,
		password: process.env.APICORE_PASSWORD,
	});

	const event: APIGatewayProxyEvent = {
		httpMethod: method,
		body: body ? JSON.stringify(body) : null,
		headers: {},
		isBase64Encoded: false,
		multiValueHeaders: {},
		multiValueQueryStringParameters: {},
		path: path,
		pathParameters: pathParameters,
		queryStringParameters: queryStringParameters,
		requestContext: {
			accountId: '123456789012',
			apiId: '1234',
			authorizer: {
				principalId: process.env.APICORE_USERNAME,
				username: process.env.APICORE_USERNAME,
				...token,
			},
			httpMethod: 'get',
			identity: {
				accessKey: '',
				accountId: '',
				apiKey: '',
				apiKeyId: '',
				caller: '',
				clientCert: {
					clientCertPem: '',
					issuerDN: '',
					serialNumber: '',
					subjectDN: '',
					validity: { notAfter: '', notBefore: '' },
				},
				cognitoAuthenticationProvider: '',
				cognitoAuthenticationType: '',
				cognitoIdentityId: '',
				cognitoIdentityPoolId: '',
				principalOrgId: '',
				sourceIp: '',
				user: '',
				userAgent: '',
				userArn: '',
			},
			path: path,
			protocol: 'HTTP/1.1',
			requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
			requestTimeEpoch: 1428582896000,
			resourceId: '123456',
			resourcePath: '/hello',
			stage: 'dev',
		},
		resource: path,
		stageVariables: {},
	};

	return event;
}

describe('Unit test for api', function () {
	it('verifies successful register', async () => {
		const event = await buildEvent('POST', '/register', {
			identifier: serviceName
		}, {
			serviceName: serviceName,
			serviceType: 'mail',
			serviceData: JSON.stringify({ address: process.env.APICORE_EMAIL }),
		}, testSubscription);

		const result = await apiHandler(event);

		console.log(result);

		expect(result.statusCode).toEqual(200);
	});

	it('verifies successful list', async () => {
		const event = await buildEvent('GET', '/list', null, null, null);

		const result = await apiHandler(event);

		console.log(result);

		expect(result.statusCode).toEqual(200);
	});

	it('verifies successful push', async () => {
		const event = await buildEvent('POST', '/push', {
			identifier: serviceName
		}, null, testPush);

		const result: APIGatewayProxyResult = await apiHandler(event);

		console.log(result);

		expect(result.statusCode).toEqual(200);
	});

	it('verifies successful delete', async () => {
		const event = await buildEvent('DELETE', '/delete', {
			identifier: serviceName,
		}, null, null);

		const result = await apiHandler(event);

		console.log(result);

		expect(result.statusCode).toEqual(200);
	});
});
