/* eslint-disable prettier/prettier */
import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyEventPathParameters } from 'aws-lambda';
import { AfpDeckNotificationCenterHandler } from '../../app';
import database, { ALL } from '../../databases';
import { parseBoolean } from '../../utils';
import { CommonResponse, RegisterSubscriptionsResponse, GetSubscriptionResponse, ListSubscriptionsResponse, DeleteSubscriptionsResponse, WebPushUserKeyResponse, UserPreferenceResponse } from '../../types';
import { DynamoDB, DeleteTableCommandOutput, CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import testSubscription from './testSubscription.json';
import testPush from './testPush.json';
import testWebPushKey from './testWebPushKey.json';
import * as dotenv from 'dotenv';
import ApiCore from 'afp-apicore-sdk';
import { Token } from 'afp-apicore-sdk/dist/types';

const serviceName = 'test-notification-center';
const DEFAULT_TIMEOUT = 30000;

dotenv.config({ path: __dirname + '/../../configs/.env' });

const visitorID = 'B46FBAE9-C6A7-4FFC-AB72-C59D30613B49';
const altVisitorID = '5A5DBDB3-3F38-4844-8EA8-7E14BE9AFED6';
const webPushTableName = 'test-afpdeck-webpush';
const subscriptionsTableName = 'test-afpdeck-subscriptions';
const userPrefrencesTableName = 'test-afpdeck-preferences';
const sleep = (waitTimeInMs) => new Promise((resolve) => setTimeout(resolve, waitTimeInMs));

const testPrefs = {
	sample: 'my preference',
};

const serviceDefinition = {
	serviceName: serviceName,
	serviceType: 'mail',
	serviceData: JSON.stringify({ address: process.env.APICORE_EMAIL }),
};

const options = {
	debug: true,
	apicoreBaseURL: process.env.APICORE_TEST_URL ?? '',
	clientID: process.env.APICORE_CLIENT_ID ?? '',
	clientSecret: process.env.APICORE_CLIENT_SECRET ?? '',
	afpDeckPushURL: process.env.AFPDECK_PUSH_URL ?? '',
	apicorePushUserName: process.env.APICORE_PUSH_USERNAME ?? '',
	apicorePushPassword: process.env.APICORE_PUSH_PASSWORD ?? '',
	useSharedService: parseBoolean(process.env.APICORE_USE_SHAREDSERVICE),
	serviceUserName: process.env.APICORE_SERVICE_USERNAME ?? '',
	servicePassword: process.env.APICORE_SERVICE_PASSWORD ?? '',
}

const apicore = new ApiCore({
	baseUrl: process.env.APICORE_TEST_URL,
	clientId: process.env.APICORE_CLIENT_ID,
	clientSecret: process.env.APICORE_CLIENT_SECRET,
});

let authenticationToken: Token;

async function createDynamoDBTable(args: CreateTableCommandInput) {
	const dynamo = new DynamoDB();

	try {
		await dynamo.describeTable({
			TableName: args.TableName,
		});
		console.log('DynamoDB table: %s, alredy exists', args.TableName);
	} catch (e) {
		console.log('Create dynamoDB table: %s', args.TableName);
		await dynamo.createTable(args);

		let tableStatus: string | undefined = 'NOTFOUND';

		do {
			await sleep(100);

			try {
				const table = await dynamo.describeTable({ TableName: args.TableName });

				tableStatus = table.Table?.TableStatus;
			} catch (e) { }
		} while (tableStatus !== 'ACTIVE');

		console.log('DynamoDB table: %s is ready', args.TableName);
	}
}

function createDynamoDBTables() {
	const alls: Promise<void>[] = [];
	const tables: CreateTableCommandInput[] = [
		{
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
		},
		{
			TableName: webPushTableName,
			BillingMode: 'PAY_PER_REQUEST',
			KeySchema: [
				{ AttributeName: 'owner', KeyType: 'HASH' },
				{ AttributeName: 'visitorID', KeyType: 'RANGE' },
			],
			AttributeDefinitions: [
				{ AttributeName: 'owner', AttributeType: 'S' },
				{ AttributeName: 'visitorID', AttributeType: 'S' },
			],
		},
		{
			TableName: subscriptionsTableName,
			BillingMode: 'PAY_PER_REQUEST',
			KeySchema: [
				{ AttributeName: 'owner', KeyType: 'HASH' },
				{ AttributeName: 'name', KeyType: 'RANGE' },
			],
			AttributeDefinitions: [
				{ AttributeName: 'owner', AttributeType: 'S' },
				{ AttributeName: 'name', AttributeType: 'S' },
				{ AttributeName: 'uno', AttributeType: 'S' },
				{ AttributeName: 'created', AttributeType: 'N' },
			],
			GlobalSecondaryIndexes: [
				{
					IndexName: 'uno-index',
					Projection: {
						ProjectionType: 'INCLUDE',
						NonKeyAttributes: [
							'owner',
							'name',
						],
					},
					KeySchema: [
						{ AttributeName: 'uno', KeyType: 'HASH' },
						{ AttributeName: 'created', KeyType: 'RANGE' },
					]
				},
			]
		},
	];

	tables.forEach((table) => alls.push(createDynamoDBTable(table)));

	return Promise.allSettled(alls);
}

function deleteDynamoDBTables() {
	const dynamo = new DynamoDB();
	const names = [webPushTableName, subscriptionsTableName, userPrefrencesTableName];
	const alls: Promise<DeleteTableCommandOutput>[] = [];

	names.forEach((name) => alls.push(dynamo.deleteTable({ TableName: name })));

	return Promise.allSettled(alls);
}

class TestAfpDeckNotificationCenterHandler extends AfpDeckNotificationCenterHandler {

	buildEvent(
		method: string,
		path: string,
		pathParameters: APIGatewayProxyEventPathParameters | null,
		queryStringParameters: APIGatewayProxyEventQueryStringParameters | null,
		body: object | null,
	) {
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
					...authenticationToken,
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

	async processEvent(event: APIGatewayProxyEvent): Promise<CommonResponse> {
		const result = await this.handleEvent(event);

		console.log(result);

		expect(result.statusCode).toEqual(200);

		return JSON.parse(result.body);
	}

	async testRegisterSubscription(id: string = visitorID, name: string = serviceName, subscription: object = testSubscription) {
		const service = {
			visitorID: id,
			...serviceDefinition,
		};
				
		return await this.processEvent(this.buildEvent('POST', `/subscription/${name}`, { identifier: name }, service, subscription)) as RegisterSubscriptionsResponse;
	}

	async testGetSubscription(name: string = serviceName, id: string = visitorID) {
		return await this.processEvent(this.buildEvent('GET', `/subscription/${name}`, { identifier: name }, { visitorID: id }, null)) as GetSubscriptionResponse;
	}

	async testListSubscriptions(id: string = visitorID) {
		return await this.processEvent(this.buildEvent('GET', '/subscriptions', null, { visitorID: id }, null)) as ListSubscriptionsResponse;
	}

	async testDeleteSubscription(id: string = visitorID, name: string = serviceName) {
		const service = {
			visitorID: id,
			...serviceDefinition,
		};
				
		return await this.processEvent(this.buildEvent('DELETE', `/subscription/${name}`, { identifier: name }, service, null)) as DeleteSubscriptionsResponse;
	}

	async testPushSubscription(name: string = serviceName, pushData: object = testPush) {
		return await this.processEvent(this.buildEvent('POST', `/push/${name}`, { identifier: name }, serviceDefinition, pushData));
	}

	async testStoreWebPushUserKey(id: string = visitorID, pushKey: object = testWebPushKey) {
		return await this.processEvent(this.buildEvent('POST', '/webpush', null, { visitorID: id }, pushKey));
	}

	async testUpdateWebPushUserKey(id: string = visitorID, pushKey: object = testWebPushKey) {
		return await this.processEvent(this.buildEvent('PUT', '/webpush', null, { visitorID: id }, pushKey));
	}

	async testGetWebPushUserKey(id: string = visitorID) {
		return await this.processEvent(this.buildEvent('GET', '/webpush', null, { visitorID: id }, null)) as WebPushUserKeyResponse;
	}

	async testDeleteWebPushUserKey(id: string = visitorID) {
		return await this.processEvent(this.buildEvent('DELETE', '/webpush', null, { visitorID: id }, null));
	}

	async testStoreUserPreference(name: string = serviceName, preferences: object = testPrefs) {
		return await this.processEvent(this.buildEvent('POST', `/preference/${name}`, { identifier: name }, null, preferences));
	}

	async testGetUserPreferences() {
		return await this.processEvent(this.buildEvent('GET', `/preferences`, null, null, null)) as UserPreferenceResponse;
	}

	async testGetUserPreference(name: string = serviceName) {
		return await this.processEvent(this.buildEvent('GET', `/preference/${name}`, { identifier: name }, null, null)) as UserPreferenceResponse;
	}

	async testDeleteUserPreference(name: string = serviceName) {
		return await this.processEvent(this.buildEvent('DELETE', `/preference/${name}`, { identifier: name }, null, null));
	}
}

expect(process.env.APICORE_TEST_URL).toBeDefined();
expect(process.env.APICORE_CLIENT_ID).toBeDefined();
expect(process.env.APICORE_CLIENT_SECRET).toBeDefined();
expect(process.env.APICORE_SERVICE_USERNAME).toBeDefined();
expect(process.env.APICORE_SERVICE_PASSWORD).toBeDefined();
expect(process.env.AFPDECK_PUSH_URL).toBeDefined();
expect(process.env.APICORE_PUSH_USERNAME).toBeDefined();
expect(process.env.APICORE_PUSH_PASSWORD).toBeDefined();

describe('Unit test for api with DynamoDB', function () {
	let handler: TestAfpDeckNotificationCenterHandler;

	beforeAll((done) => {
		console.log('Will authenticate');

		database(false, process.env.MONGODB_URL, userPrefrencesTableName, webPushTableName, subscriptionsTableName)
			.then((db) => {
				handler = new TestAfpDeckNotificationCenterHandler(db, options);

				apicore
					.authenticate({
						username: process.env.APICORE_USERNAME,
						password: process.env.APICORE_PASSWORD,
					})
					.then((token) => {
						authenticationToken = token;

						console.log('Will create dynamodb tables');

						createDynamoDBTables()
							.then((values) => {
								for (const v of values) {
									if (v.status === 'rejected') {
										console.error(v.reason);
										done(new Error(v.reason));
										return;
									}
								}

								console.log('Did create dynamodb tables');
								done();
							})
							.catch((e) => {
								console.error(e);
								done(e);
							});
					})
					.catch((e) => {
						console.error(e);
						done(e);
					});
			})
			.catch((e) => {
				console.error(e);
				done(e);
			});
	}, DEFAULT_TIMEOUT);

	afterAll((done) => {
		handler.close().finally(() => {
			deleteDynamoDBTables()
				.then(() => {
					console.log('Delete dynamodb tables');
					done();
				})
				.catch((e) => {
					console.error(e);
					done(e);
				});
		});
	}, DEFAULT_TIMEOUT);

	it(
		'verifies successful register subscription with DynamoDB',
		async () => {
			await handler.testRegisterSubscription();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful register subscription another visitor-id with DynamoDB',
		async () => {
			await handler.testRegisterSubscription(altVisitorID);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful register another subscription another visitor-id with DynamoDB',
		async () => {
			await handler.testRegisterSubscription(altVisitorID, `${serviceName}-another`);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful get subscription with DynamoDB',
		async () => {
			const result = await handler.testGetSubscription();

			expect(result.response.subscription).toBeDefined();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful list all subscriptions with DynamoDB',
		async () => {
			const result = await handler.testListSubscriptions(ALL);

			expect(result.response.subscriptions?.length).toEqual(2);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful list subscriptions another browser with DynamoDB',
		async () => {
			const result = await handler.testListSubscriptions(altVisitorID);
			const names = [serviceName, `${serviceName}-another`];

			expect(result.response.subscriptions?.length).toEqual(2);
			expect(result.response.subscriptions?.map((s) => s.name)).toEqual(expect.arrayContaining(names));
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful push subscription with DynamoDB',
		async () => {
			const result = await handler.testPushSubscription();

			console.log(result);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful delete one subscription another browser with DynamoDB',
		async () => {
			await handler.testDeleteSubscription(altVisitorID, `${serviceName}-another`);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful get subscription with DynamoDB',
		async () => {
			const result = await handler.testGetSubscription();

			expect(result.response.subscription).toBeDefined();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful delete all subscription with DynamoDB',
		async () => {
			await handler.testDeleteSubscription(ALL);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful list all subscriptions after delete with DynamoDB',
		async () => {
			const result = await handler.testListSubscriptions(ALL);

			expect(result.response.subscriptions ? result.response.subscriptions.length : 0).toEqual(0);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful store webpush keys with DynamoDB',
		async () => {
			await handler.testStoreWebPushUserKey();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful get webpush keys with DynamoDB',
		async () => {
			await handler.testGetWebPushUserKey();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful update webpush keys with DynamoDB',
		async () => {
			await handler.testUpdateWebPushUserKey();
		},
		DEFAULT_TIMEOUT,
	);


	it(
		'verifies successful delete webpush keys with DynamoDB',
		async () => {
			await handler.testDeleteWebPushUserKey();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful store user preferences with DynamoDB',
		async () => {
			await handler.testStoreUserPreference();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful get user preferences with DynamoDB',
		async () => {
			await handler.testGetUserPreference();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful delete user preferences with DynamoDB',
		async () => {
			await handler.testDeleteUserPreference();
		},
		DEFAULT_TIMEOUT,
	);
});

describe('Unit test for api with MongoDB', function () {
	let handler: TestAfpDeckNotificationCenterHandler;

	beforeAll((done) => {
		database(true, process.env.MONGODB_URL, userPrefrencesTableName, webPushTableName, subscriptionsTableName)
			.then((db) => {
				handler = new TestAfpDeckNotificationCenterHandler(db, options);

				apicore
					.authenticate({
						username: process.env.APICORE_USERNAME,
						password: process.env.APICORE_PASSWORD,
					})
					.then((token) => {
						authenticationToken = token;
						done();
					})
					.catch((e) => {
						console.error(e);
						done(e);
					});
			})
			.catch((e) => {
				console.error(e);
				done(e);
			});
	}, DEFAULT_TIMEOUT);

	afterAll((done) => {
		if (handler) {
			handler.close().finally(() => {
				done();
			});
		} else {
			done();
		}
	}, DEFAULT_TIMEOUT)

	it(
		'verifies successful register subscription with MongoDB',
		async () => {
			await handler.testRegisterSubscription();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful register subscription another visitor-id with MongoDB',
		async () => {
			await handler.testRegisterSubscription(altVisitorID);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful register another subscription another visitor-id with MongoDB',
		async () => {
			await handler.testRegisterSubscription(altVisitorID, `${serviceName}-another`);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful get subscription with MongoDB',
		async () => {
			const result = await handler.testGetSubscription();

			expect(result.response.subscription).toBeDefined();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful list all subscriptions with MongoDB',
		async () => {
			const result = await handler.testListSubscriptions(ALL);

			expect(result.response.subscriptions?.length).toEqual(2);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful list subscriptions another browser with MongoDB',
		async () => {
			const result = await handler.testListSubscriptions(altVisitorID);
			const names = [serviceName, `${serviceName}-another`];

			expect(result.response.subscriptions?.length).toEqual(2);
			expect(result.response.subscriptions?.map((s) => s.name)).toEqual(expect.arrayContaining(names));
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful push subscription with MongoDB',
		async () => {
			const result = await handler.testPushSubscription();

			console.log(result);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful delete one subscription another browser with MongoDB',
		async () => {
			await handler.testDeleteSubscription(altVisitorID, `${serviceName}-another`);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful get subscription with MongoDB',
		async () => {
			const result = await handler.testGetSubscription();

			expect(result.response.subscription).toBeDefined();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful delete all subscription with MongoDB',
		async () => {
			await handler.testDeleteSubscription(ALL);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful list all subscriptions after delete with MongoDB',
		async () => {
			const result = await handler.testListSubscriptions(ALL);

			expect(result.response.subscriptions ? result.response.subscriptions.length : 0).toEqual(0);
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful store webpush keys with MongoDB',
		async () => {
			await handler.testStoreWebPushUserKey();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful get webpush keys with MongoDB',
		async () => {
			await handler.testGetWebPushUserKey();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful update webpush keys with MongoDB',
		async () => {
			await handler.testUpdateWebPushUserKey();
		},
		DEFAULT_TIMEOUT,
	);


	it(
		'verifies successful delete webpush keys with MongoDB',
		async () => {
			await handler.testDeleteWebPushUserKey();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful store user preferences with MongoDB',
		async () => {
			await handler.testStoreUserPreference();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful get user preferences with MongoDB',
		async () => {
			await handler.testGetUserPreference();
		},
		DEFAULT_TIMEOUT,
	);

	it(
		'verifies successful delete user preferences with MongoDB',
		async () => {
			await handler.testDeleteUserPreference();
		},
		DEFAULT_TIMEOUT,
	);
});
