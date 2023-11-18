/* eslint-disable prettier/prettier */
import { APIGatewayProxyEvent, APIGatewayProxyResult, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyEventPathParameters } from 'aws-lambda';
import { apiHandler } from '../../app';
import { DynamoDB, CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import testSubscription from './testSubscription.json';
import testPush from './testPush.json';
import * as dotenv from 'dotenv';
import ApiCore from 'afp-apicore-sdk';

const serviceName = 'test-notification-center';
const DEFAULT_TIMEOUT = 30000;

dotenv.config({ path: __dirname + '/../../configs/.env' });

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));
const testPrefs = {
	sample: 'my preference'
}

async function createDynamoDBTable(args: CreateTableCommandInput) {
	const dynamo = new DynamoDB();

	try {
		await dynamo.describeTable({
			TableName: args.TableName,
		});
	} catch(e) {
        await dynamo.createTable(args);
		await sleep(2000);
	}
}

async function createDynamoDBTables() {
	const webPushTableName = process.env.WEBPUSH_TABLE_NAME ?? 'test-afpdeck-webpush';
    const subscriptionsTableName = process.env.SUBSCRIPTIONS_TABLE_NAME ?? 'test-afpdeck-subscriptions';
    const userPrefrencesTableName = process.env.USERPREFS_TABLENAME ?? 'test-afpdeck-preferences';

	await createDynamoDBTable({
		TableName: userPrefrencesTableName,
		BillingMode: 'PAY_PER_REQUEST',
		KeySchema: [
			{ AttributeName: 'owner', KeyType: 'HASH' },
			{ AttributeName: 'name', KeyType: 'RANGE' },
		],
		AttributeDefinitions: [
			{ AttributeName: 'owner', AttributeType: 'S' },
			{ AttributeName: 'name', AttributeType: 'S' },
		],
	});

	await createDynamoDBTable({
		TableName: webPushTableName,
		BillingMode: 'PAY_PER_REQUEST',
		KeySchema: [
			{ AttributeName: 'owner', KeyType: 'HASH' },
			{ AttributeName: 'browserID', KeyType: 'RANGE' },
		],
		AttributeDefinitions: [
			{ AttributeName: 'owner', AttributeType: 'S' },
			{ AttributeName: 'browserID', AttributeType: 'S' },
		],
	});

	await createDynamoDBTable({
		TableName: subscriptionsTableName,
		BillingMode: 'PAY_PER_REQUEST',
		KeySchema: [
			{ AttributeName: 'owner', KeyType: 'HASH' },
			{ AttributeName: 'name', KeyType: 'RANGE' },
		],
		AttributeDefinitions: [
			{ AttributeName: 'owner', AttributeType: 'S' },
			{ AttributeName: 'name', AttributeType: 'S' },
		],
	});

}

async function deleteDynamoDBTables() {
	const dynamo = new DynamoDB();
	const webPushTableName = process.env.WEBPUSH_TABLE_NAME ?? 'test-afpdeck-webpush';
    const subscriptionsTableName = process.env.SUBSCRIPTIONS_TABLE_NAME ?? 'test-afpdeck-subscriptions';

	try {
		await dynamo.deleteTable({TableName: webPushTableName});
	} catch(e) {
		console.error(e);
	}

	try {
		await dynamo.deleteTable({TableName: subscriptionsTableName});
	} catch(e) {
		console.error(e);
	}
}

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

beforeAll(async () => {
	await createDynamoDBTables();
	console.log("Create dynamodb tables")
}, 10000);

/*
afterAll(async () => {
	await deleteDynamoDBTables();
	console.log("Delete dynamodb tables")
});
*/

describe('Unit test for api', function () {
	const servicePathParameters = {
		identifier: serviceName,
	};

	const serviceDefinition = {
		serviceName: serviceName,
		serviceType: 'mail',
		serviceData: JSON.stringify({ address: process.env.APICORE_EMAIL }),
	};

	it('verifies successful register', async () => {
		await createDynamoDBTables();

		const event = await buildEvent('POST', `/register/${serviceName}`, servicePathParameters, serviceDefinition, testSubscription);
		const result = await apiHandler(event);

		console.log(result);

		expect(result.statusCode).toEqual(200);
	}, DEFAULT_TIMEOUT);

	it('verifies successful list', async () => {
		await createDynamoDBTables();

		const event = await buildEvent('GET', '/list', null, serviceDefinition, null);
		const result = await apiHandler(event);

		console.log(result);

		expect(result.statusCode).toEqual(200);
	}, DEFAULT_TIMEOUT);

	it('verifies successful push', async () => {
		await createDynamoDBTables();

		const event = await buildEvent('POST', `/push/${serviceName}`, servicePathParameters, serviceDefinition, testPush);
		const result = await apiHandler(event);

		console.log(result);

		expect(result.statusCode).toEqual(200);
	}, DEFAULT_TIMEOUT);

	it('verifies successful delete', async () => {
		await createDynamoDBTables();

		const event = await buildEvent('DELETE', `/delete/${serviceName}`, servicePathParameters, serviceDefinition, null);
		const result = await apiHandler(event);

		await deleteDynamoDBTables();

		console.log(result);

		expect(result.statusCode).toEqual(200);
	}, DEFAULT_TIMEOUT);

	it('verifies successful store user preferences', async () => {
		await createDynamoDBTables();

		const event = await buildEvent('POST', `/preferences/${serviceName}`, servicePathParameters, null, testPrefs);
		const result = await apiHandler(event);

		console.log(result);

		expect(result.statusCode).toEqual(200);
	}, DEFAULT_TIMEOUT);

	it('verifies successful get user preferences', async () => {
		await createDynamoDBTables();

		const event = await buildEvent('GET', `/preferences/${serviceName}`, servicePathParameters, null, null);
		const result = await apiHandler(event);

		console.log(result);

		expect(result.statusCode).toEqual(200);
	}, DEFAULT_TIMEOUT);
});
