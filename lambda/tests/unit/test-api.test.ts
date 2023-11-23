/* eslint-disable prettier/prettier */
import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyEventPathParameters } from 'aws-lambda';
import { AfpDeckNotificationCenterHandler } from '../../app';
import database from '../../databases';
import { DynamoDB, DeleteTableCommandOutput, CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import testSubscription from './testSubscription.json';
import testPush from './testPush.json';
import * as dotenv from 'dotenv';
import ApiCore from 'afp-apicore-sdk';
import { Token } from 'afp-apicore-sdk/dist/types';

const serviceName = 'test-notification-center';
const DEFAULT_TIMEOUT = 30000;

dotenv.config({ path: __dirname + '/../../configs/.env' });

const webPushTableName = 'test-afpdeck-webpush';
const subscriptionsTableName = 'test-afpdeck-subscriptions';
const userPrefrencesTableName = 'test-afpdeck-preferences';
const sleep = (waitTimeInMs) => new Promise((resolve) => setTimeout(resolve, waitTimeInMs));

const testPrefs = {
    sample: 'my preference',
};

const servicePathParameters = {
    identifier: serviceName,
};

const serviceDefinition = {
    serviceName: serviceName,
    serviceType: 'mail',
    serviceData: JSON.stringify({ address: process.env.APICORE_EMAIL }),
};

const apicore = new ApiCore({
    baseUrl: process.env.APICORE_BASE_URL,
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
            } catch (e) {}
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
                { AttributeName: 'browserID', KeyType: 'RANGE' },
            ],
            AttributeDefinitions: [
                { AttributeName: 'owner', AttributeType: 'S' },
                { AttributeName: 'browserID', AttributeType: 'S' },
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
            ],
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

function buildEvent(
    method: string,
    path: string,
    pathParameters: APIGatewayProxyEventPathParameters | null,
    queryStringParameters: APIGatewayProxyEventQueryStringParameters | null,
    body: unknown | null,
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

async function register(handler: AfpDeckNotificationCenterHandler) {
    const event = buildEvent('POST', `/register/${serviceName}`, servicePathParameters, serviceDefinition, testSubscription);
    const result = await handler.handleEvent(event);

    console.log(result);

    expect(result.statusCode).toEqual(200);
}

async function list(handler: AfpDeckNotificationCenterHandler) {
    const event = buildEvent('GET', '/list', null, serviceDefinition, null);
    const result = await handler.handleEvent(event);

    console.log(result);

    expect(result.statusCode).toEqual(200);
}

async function push(handler: AfpDeckNotificationCenterHandler) {
    const event = buildEvent('POST', `/push/${serviceName}`, servicePathParameters, serviceDefinition, testPush);
    const result = await handler.handleEvent(event);

    console.log(result);

    expect(result.statusCode).toEqual(200);
}

async function deleteService(handler: AfpDeckNotificationCenterHandler) {
    const event = buildEvent('DELETE', `/delete/${serviceName}`, servicePathParameters, serviceDefinition, null);
    const result = await handler.handleEvent(event);

    await deleteDynamoDBTables();

    console.log(result);

    expect(result.statusCode).toEqual(200);
}

async function storeUserPreferences(handler: AfpDeckNotificationCenterHandler) {
    const event = buildEvent('POST', `/preferences/${serviceName}`, servicePathParameters, null, testPrefs);
    const result = await handler.handleEvent(event);

    console.log(result);

    expect(result.statusCode).toEqual(200);
}

async function getUserPreferences(handler: AfpDeckNotificationCenterHandler) {
    const event = buildEvent('GET', `/preferences/${serviceName}`, servicePathParameters, null, null);
    const result = await handler.handleEvent(event);

    console.log(result);

    expect(result.statusCode).toEqual(200);
}

describe('Unit test for api with DynamoDB', function () {
    let handler: AfpDeckNotificationCenterHandler;

    beforeAll((done) => {
        console.log('Will authenticate');

        database(false, process.env.MONGODB_URL, userPrefrencesTableName, webPushTableName, subscriptionsTableName)
            .then((db) => {
                handler = new AfpDeckNotificationCenterHandler(db, true);

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
                                values.forEach((v) => {
                                    let reason;

                                    if (v.status === 'rejected') {
                                        console.error(v.reason);
                                    }
                                });

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
        'verifies successful register with DynamoDB',
        async () => {
            await register(handler);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'verifies successful list with DynamoDB',
        async () => {
            await list(handler);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'verifies successful push with DynamoDB',
        async () => {
            await push(handler);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'verifies successful delete with DynamoDB',
        async () => {
            await deleteService(handler);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'verifies successful store user preferences with DynamoDB',
        async () => {
            await storeUserPreferences(handler);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'verifies successful get user preferences with DynamoDB',
        async () => {
            await getUserPreferences(handler);
        },
        DEFAULT_TIMEOUT,
    );
});

describe('Unit test for api with MongoDB', function () {
    expect(process.env.MONGODB_URL).toBeDefined();

    let handler: AfpDeckNotificationCenterHandler;

    beforeAll((done) => {
        database(true, process.env.MONGODB_URL, userPrefrencesTableName, webPushTableName, subscriptionsTableName)
            .then((db) => {
                handler = new AfpDeckNotificationCenterHandler(db, true);

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
        'verifies successful register with MongoDB',
        async () => {
            await register(handler);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'verifies successful list with MongoDB',
        async () => {
            return list(handler);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'verifies successful push with MongoDB',
        async () => {
            await push(handler);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'verifies successful delete with MongoDB',
        async () => {
            await deleteService(handler);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'verifies successful store user preferences with MongoDB',
        async () => {
            await storeUserPreferences(handler);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'verifies successful get user preferences with MongoDB',
        async () => {
            await getUserPreferences(handler);
        },
        DEFAULT_TIMEOUT,
    );
});
