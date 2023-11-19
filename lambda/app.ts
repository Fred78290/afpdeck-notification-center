/* eslint-disable @typescript-eslint/no-explicit-any */
import ApiCore from 'afp-apicore-sdk';

import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult } from 'aws-lambda';
import { Subscription, AuthType, ServiceType, RegisterService, PostedPushNoticationData, NoticationData, NoticationUserPayload } from 'afp-apicore-sdk/dist/types';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { defineTable, DynamoTypeFrom, TableClient, QuerierReturn } from '@hexlabs/dynamo-ts';
import webpush, { VapidKeys, PushSubscription, SendResult } from 'web-push';

const AFPDECK_NOTIFICATIONCENTER_SERVICE = 'afpdeck-user-service';
const AFPDECK_NOTIFICATIONCENTER_SHARED_SERVICE = 'afpdeck-shared-service';
const ALL_BROWSERS = 'all';
const DEFAULT_WEBPUSH_TABLENAME = 'afpdeck-webpush';
const DEFAULT_SUBSCRIPTIONS_TABLENAME = 'afpdeck-subscriptions';
const DEFAULT_USERPREFS_TABLENAME = 'afpdeck-preferences';

let debug = process.env.DEBUG_LAMBDA ? process.env.DEBUG_LAMBDA === 'true' : false;
let useSharedService = process.env.APICORE_USE_SHAREDSERVICE ? process.env.APICORE_USE_SHAREDSERVICE === 'true' : false;

interface Identify {
    principalId: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpires?: number;
    authType?: AuthType;
}

class HttpError extends Error {
    private _statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this._statusCode = statusCode;
    }

    public get statusCode(): number {
        return this._statusCode;
    }
}

const dynamo = new DynamoDB();
const client = DynamoDBDocument.from(dynamo);

export interface WebPushUser {
    apiKeys: VapidKeys;
    subscription: PushSubscription;
}

export const userPreferencesTable = defineTable(
    {
        owner: 'string',
        name: 'string',
        preferences: 'string',
        updated: 'number',
    },
    'owner',
    'name',
);

export const webPushUserTable = defineTable(
    {
        owner: 'string',
        browserID: 'string',
        publicKey: 'string',
        privateKey: 'string',
        endpoint: 'string',
        p256dh: 'string',
        auth: 'string',
        created: 'number',
        updated: 'number',
    },
    'owner',
    'browserID',
);

export const subscriptionsTable = defineTable(
    {
        owner: 'string',
        name: 'string',
        uno: 'string',
        browserID: 'string',
        subscription: 'string',
        created: 'number',
        updated: 'number',
    },
    'owner',
    'name',
    {
        'uno-index': {
            partitionKey: 'uno',
            sortKey: 'created',
        },
        'browserID-index': {
            partitionKey: 'browserID',
            sortKey: 'created',
        },
    },
);

type UserPreferencesTable = typeof userPreferencesTable;
type SubscriptionsTable = typeof subscriptionsTable;
type WebPushUserTable = typeof webPushUserTable;
type SubscriptionDynamoDB = DynamoTypeFrom<typeof subscriptionsTable>;

let userPreferencesTableClient: TableClient<UserPreferencesTable>;
let subscriptionTableClient: TableClient<SubscriptionsTable>;
let webPushUserTableClient: TableClient<WebPushUserTable>;

function getUserPreferencesTableClient(tableName?: string): TableClient<UserPreferencesTable> {
    if (!userPreferencesTableClient) {
        userPreferencesTableClient = TableClient.build(userPreferencesTable, {
            client: client,
            logStatements: true,
            tableName: tableName ?? DEFAULT_USERPREFS_TABLENAME,
        });
    }

    return userPreferencesTableClient;
}

function getWebPushUserTableClient(tableName?: string): TableClient<WebPushUserTable> {
    if (!webPushUserTableClient) {
        webPushUserTableClient = TableClient.build(webPushUserTable, {
            client: client,
            logStatements: true,
            tableName: tableName ?? DEFAULT_WEBPUSH_TABLENAME,
        });
    }

    return webPushUserTableClient;
}

function getSubscriptionTableClient(tableName?: string): TableClient<SubscriptionsTable> {
    if (!subscriptionTableClient) {
        tableName = tableName ?? DEFAULT_SUBSCRIPTIONS_TABLENAME;

        subscriptionTableClient = TableClient.build(subscriptionsTable, {
            client: client,
            logStatements: true,
            tableName: tableName,
        });
    }

    return subscriptionTableClient;
}

async function getSubscriptionsInDynamoDB(owner: string, name: string) {
    const subscription = await getSubscriptionTableClient(process.env.SUBSCRIPTIONS_TABLE_NAME).query({
        owner: owner,
        name: (subKey) => subKey.eq(name),
    });

    return subscription.member;
}

async function storeSubscriptionInDynamoDB(owner: string, name: string, uno: string, notification: Subscription, browserID: string): Promise<SubscriptionDynamoDB | undefined> {
    const now = Date.now();
    let found = false;

    try {
        await getSubscriptionTableClient(process.env.SUBSCRIPTIONS_TABLE_NAME).query(
            {
                owner: owner,
                name: (sortKey) => sortKey.eq(name),
            },
            {
                filter: (compare) => compare().browserID.eq(browserID),
            },
        );

        found = true;
    } catch {
        found = false;
    }

    if (found) {
        const result = await getSubscriptionTableClient(process.env.SUBSCRIPTIONS_TABLE_NAME).update({
            key: {
                name: name,
                owner: owner,
            },
            updates: {
                uno: uno,
                browserID: browserID,
                subscription: JSON.stringify(notification),
                updated: now,
            },
        });

        return result.item;
    } else {
        const result = await getSubscriptionTableClient(process.env.SUBSCRIPTIONS_TABLE_NAME).put(
            {
                owner: owner,
                uno: uno,
                name: name,
                browserID: browserID,
                subscription: JSON.stringify(notification),
                created: now,
                updated: now,
            },
            {
                returnValues: 'ALL_OLD',
            },
        );

        return result.item;
    }
}

export async function deleteSubscriptionInDynamoDB(owner: string, name: string, browserID: string): Promise<SubscriptionDynamoDB | undefined> {
    const result = await getSubscriptionTableClient(process.env.SUBSCRIPTIONS_TABLE_NAME).delete(
        {
            owner: owner,
            name: name,
        },
        {
            condition: (condition) => condition().browserID.eq(browserID),
            returnValues: 'ALL_OLD',
        },
    );

    return result.item;
}

function getNotificationCenter(identity: Identify) {
    const apicore = new ApiCore({
        baseUrl: process.env.APICORE_BASE_URL,
        clientId: process.env.APICORE_CLIENT_ID,
        clientSecret: process.env.APICORE_CLIENT_SECRET,
    });

    apicore.token = {
        accessToken: identity.accessToken,
        refreshToken: identity.refreshToken ? identity.refreshToken : '',
        authType: identity.authType ? identity.authType : 'credentials',
        tokenExpires: identity.tokenExpires ? identity.tokenExpires : Date.now() + 1000 * 3600,
    };

    return apicore.createNotificationCenter(process.env.APICORE_SERVICE_USERNAME, process.env.APICORE_SERVICE_PASSWORD);
}

async function checkIfServiceIsRegistered(identity: Identify, serviceDefinition: RegisterService) {
    const notificationCenter = getNotificationCenter(identity);

    if (useSharedService) {
        if (process.env.APICORE_CLIENT_ID) {
            const services = await notificationCenter.listSharedServices(process.env.APICORE_CLIENT_ID, identity.principalId);
            const service = services?.find((s) => s.serviceName === serviceDefinition.name);

            if (!service) {
                try {
                    const serviceName = await notificationCenter.registerSharedService(serviceDefinition);

                    if (debug) {
                        console.info(`Created shared service: ${serviceDefinition.name}, uno: ${serviceName}`);
                    }
                } catch (e) {
                    console.info(`Shared service: ${serviceDefinition.name}, already exists`);
                }
            }
        }
    } else {
        const services = await notificationCenter.listServices();
        const service = services?.find((s) => s.serviceName === serviceDefinition.name);

        if (!service) {
            const serviceName = await notificationCenter.registerService(serviceDefinition);

            if (debug) {
                console.info(`Created service: ${serviceDefinition.name}, uno: ${serviceName}, for user: ${identity.principalId}`);
            }
        } else if (debug) {
            console.info(`Created service: ${serviceDefinition.name}, uno: ${service.serviceIdentifier}, for user: ${identity.principalId}`);
        }
    }

    return notificationCenter;
}

async function listSubscriptions(identity: Identify, serviceDefinition: RegisterService): Promise<APIGatewayProxyResult> {
    const notificationCenter = await checkIfServiceIsRegistered(identity, serviceDefinition);
    const subscriptions = await notificationCenter.listSubscriptions();

    return {
        statusCode: 200,
        body: JSON.stringify({
            response: {
                subscriptions: subscriptions,
                status: {
                    code: 0,
                    reason: 'OK',
                },
            },
        }),
    };
}

async function registerNotification(identifier: string, notification: Subscription, identity: Identify, serviceDefinition: RegisterService, browserID: string): Promise<APIGatewayProxyResult> {
    const notificationCenter = await checkIfServiceIsRegistered(identity, serviceDefinition);
    const notificationIdentifier = await notificationCenter.addSubscription(identifier, serviceDefinition.name, notification);

    await storeSubscriptionInDynamoDB(identity.principalId, identifier, notificationIdentifier, notification, browserID);

    return {
        statusCode: 200,
        body: JSON.stringify({
            response: {
                uno: notificationIdentifier,
                status: {
                    code: 0,
                    reason: 'OK',
                },
            },
        }),
    };
}

function sendNotificationToClientSync(notication: NoticationData, subscription: NoticationUserPayload): Promise<Promise<SendResult>[]> {
    return new Promise((resolve, reject) => {
        getSubscriptionsInDynamoDB(subscription.userID, subscription.name).then((subItems) => {
            const result: Promise<SendResult>[] = [];
            const userPushKeys: Promise<QuerierReturn<WebPushUserTable>>[] = [];

            for (const subItem of subItems) {
                userPushKeys.push(findPushKeyForIdentity(subscription.userID, subItem.browserID));
            }

            Promise.allSettled(userPushKeys).then((settlements) => {
                settlements.forEach((settlement) => {
                    if (settlement.status === 'fulfilled') {
                        const userPushKey = settlement.value;

                        if (userPushKey.count && userPushKey.count > 0) {
                            const datas = {
                                name: subscription.name,
                                uno: subscription.identifier,
                                isFree: subscription.isFree,
                                documentUrl: subscription.documentUrl,
                                thumbnailUrl: subscription.thumbnailUrl,
                                payload: notication,
                            };

                            userPushKey.member.forEach((m) => {
                                const push = webpush.sendNotification(
                                    {
                                        endpoint: m.endpoint,
                                        keys: {
                                            auth: m.auth,
                                            p256dh: m.p256dh,
                                        },
                                    },
                                    JSON.stringify(datas),
                                    {
                                        vapidDetails: {
                                            subject: m.browserID,
                                            privateKey: m.privateKey,
                                            publicKey: m.publicKey,
                                        },
                                    },
                                );

                                result.push(push);
                            });
                        }
                    } else {
                        console.error(settlement.reason);
                    }
                });

                resolve(result);
            });
        });
    });
}

async function sendNotificationToClient(notication: NoticationData, subscription: NoticationUserPayload): Promise<Promise<SendResult>[]> {
    const subItems = await getSubscriptionsInDynamoDB(subscription.userID, subscription.name);
    const result: Promise<SendResult>[] = [];

    for (const subItem of subItems) {
        try {
            const userPushKey = await findPushKeyForIdentity(subscription.userID, subItem.browserID);

            if (userPushKey.count && userPushKey.count > 0) {
                const datas = {
                    name: subscription.name,
                    uno: subscription.identifier,
                    isFree: subscription.isFree,
                    documentUrl: subscription.documentUrl,
                    thumbnailUrl: subscription.thumbnailUrl,
                    payload: notication,
                };

                userPushKey.member.forEach((m) => {
                    const push = webpush.sendNotification(
                        {
                            endpoint: m.endpoint,
                            keys: {
                                auth: m.auth,
                                p256dh: m.p256dh,
                            },
                        },
                        JSON.stringify(datas),
                        {
                            vapidDetails: {
                                subject: m.browserID,
                                privateKey: m.privateKey,
                                publicKey: m.publicKey,
                            },
                        },
                    );

                    result.push(push);
                });
            }
        } catch (e) {
            console.error('Browser registration: %s not found for user: %s, reason: %s', subItem.browserID, subscription.userID, e);
        }
    }

    return result;
}

async function collectSubscriptions(identifier: string, pushData: PostedPushNoticationData) {
    return new Promise((resolve) => {
        let all: Promise<Promise<SendResult>[]>[] = [];

        for (const payload of pushData.payload) {
            const datas: any = {};
            const notif: any = payload;

            Object.keys(payload).forEach((key) => {
                if (key !== 'subscriptions') datas[key] = notif[key];
            });

            for (const subscription of payload.subscriptions) {
                all = all.concat(sendNotificationToClient(datas, subscription));
            }
        }

        Promise.allSettled(all).then((returnValues) => {
            const all: Promise<SendResult>[] = [];

            returnValues.forEach((value) => {
                if (value.status === 'fulfilled') {
                    value.value.forEach((v) => {
                        all.push(v);
                    });
                }
            });

            Promise.allSettled(all).then((returnValues) => {
                resolve(returnValues);
            });
        });
    });
}

async function pushNotification(identifier: string, pushData: PostedPushNoticationData): Promise<APIGatewayProxyResult> {
    if (debug) {
        console.log(pushData);
    }

    collectSubscriptions(identifier, pushData).then(() => {
        console.info(`done: ${JSON.stringify(pushData)}`);
    });

    return {
        statusCode: 200,
        body: JSON.stringify({
            response: {
                status: {
                    code: 0,
                    reason: 'Processing',
                },
            },
        }),
    };
}

async function deleteNotification(identifier: string, identity: Identify, serviceDefinition: RegisterService, browserID: string): Promise<APIGatewayProxyResult> {
    const notificationCenter = getNotificationCenter(identity);
    const notificationIdentifier = await notificationCenter.deleteSubscription(identifier);

    try {
        await deleteSubscriptionInDynamoDB(identity.principalId, identifier, browserID);

        return {
            statusCode: 200,
            body: JSON.stringify({
                response: {
                    uno: notificationIdentifier,
                    status: {
                        code: 0,
                        reason: 'OK',
                    },
                },
            }),
        };
    } catch (e) {
        return {
            statusCode: 404,
            body: 'Subscription not found',
        };
    }
}

async function defaultHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Afpdeck Notification Center',
        }),
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleError(err: any) {
    console.error(err);

    if (err.code && err.message) {
        return {
            statusCode: err.code,
            body: JSON.stringify({
                error: {
                    message: err.message,
                    code: err.code,
                },
            }),
        };
    } else if (err instanceof HttpError) {
        return {
            statusCode: err.statusCode,
            body: JSON.stringify({
                error: {
                    message: err.message,
                    code: err.statusCode,
                },
            }),
        };
    } else {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: {
                    message: err.message ? err.message : err.toString(),
                    code: 500,
                },
            }),
        };
    }
}

function getServiceDefinition(queryStringParameters: APIGatewayProxyEventQueryStringParameters | null): RegisterService {
    if (!useSharedService && queryStringParameters) {
        if (queryStringParameters.serviceName && queryStringParameters.serviceType && queryStringParameters.serviceData) {
            return {
                name: queryStringParameters.serviceName,
                type: queryStringParameters.serviceType as ServiceType,
                datas: JSON.parse(queryStringParameters.serviceData),
            };
        }
    }

    if (process.env.AFPDECK_PUSH_URL && process.env.APICORE_PUSH_USERNAME && process.env.APICORE_PUSH_PASSWORD) {
        return {
            name: useSharedService ? AFPDECK_NOTIFICATIONCENTER_SHARED_SERVICE : AFPDECK_NOTIFICATIONCENTER_SERVICE,
            type: 'rest',
            datas: {
                href: process.env.AFPDECK_PUSH_URL,
                user: process.env.APICORE_PUSH_USERNAME,
                password: process.env.APICORE_PUSH_PASSWORD,
            },
        };
    }

    throw new HttpError('Missing envars', 500);
}

async function findPushKeyForIdentity(principalId: string, browserID: string) {
    const webpushTable = getWebPushUserTableClient(process.env.WEBPUSH_TABLE_NAME);

    return webpushTable.query({ owner: principalId }, { filter: (compare) => compare().browserID.eq(browserID) || browserID === ALL_BROWSERS });
}

async function storeWebPushUserKey(principalId: string, browserID: string, data: WebPushUser): Promise<APIGatewayProxyResult> {
    const now = Date.now();
    const webpushTable = getWebPushUserTableClient(process.env.WEBPUSH_TABLE_NAME);

    await webpushTable.put({
        owner: principalId,
        browserID: browserID,
        publicKey: data.apiKeys.publicKey,
        privateKey: data.apiKeys.privateKey,
        endpoint: data.subscription.endpoint,
        p256dh: data.subscription.keys.p256dh,
        auth: data.subscription.keys.auth,
        created: now,
        updated: now,
    });

    return {
        statusCode: 200,
        body: JSON.stringify({
            response: {
                message: 'OK',
                status: 0,
            },
        }),
    };
}

async function updateWebPushUserKey(principalId: string, browserID: string, data: WebPushUser): Promise<APIGatewayProxyResult> {
    const now = Date.now();
    const webpushTable = getWebPushUserTableClient(process.env.WEBPUSH_TABLE_NAME);

    try {
        await webpushTable.update({
            key: {
                owner: principalId,
                browserID: browserID,
            },
            updates: {
                publicKey: data.apiKeys.publicKey,
                privateKey: data.apiKeys.privateKey,
                endpoint: data.subscription.endpoint,
                p256dh: data.subscription.keys.p256dh,
                auth: data.subscription.keys.auth,
                updated: now,
            },
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                response: {
                    message: 'OK',
                    status: 0,
                },
            }),
        };
    } catch (e: any) {
        return {
            statusCode: 404,
            body: JSON.stringify({
                error: {
                    message: e?.message ?? 'Not found',
                    code: 404,
                },
            }),
        };
    }
}

async function storeUserPreferences(principalId: string, name: string, prefs: any): Promise<APIGatewayProxyResult> {
    const userPreferencesTable = getUserPreferencesTableClient(process.env.USERPREFS_TABLENAME);

    try {
        await userPreferencesTable.put(
            {
                owner: principalId,
                name: name,
                preferences: JSON.stringify(prefs),
                updated: Date.now(),
            },
            {
                returnValues: 'ALL_OLD',
            },
        );

        return {
            statusCode: 200,
            body: JSON.stringify({
                response: {
                    status: {
                        code: 0,
                        reason: 'OK',
                    },
                },
            }),
        };
    } catch (e: any) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: {
                    message: e?.message ?? 'Internal error',
                    code: e?.statusCode ?? 500,
                },
            }),
        };
    }
}

async function getUserPreferences(principalId: string, name: string): Promise<APIGatewayProxyResult> {
    const userPreferencesTable = getUserPreferencesTableClient(process.env.USERPREFS_TABLENAME);

    try {
        const prefs = await userPreferencesTable.get({
            owner: principalId,
            name: name,
        });

        if (prefs.item) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    response: {
                        preferences: JSON.parse(prefs.item.preferences),
                        status: {
                            code: 0,
                            reason: 'OK',
                        },
                    },
                }),
            };
        }

        return {
            statusCode: 404,
            body: JSON.stringify({
                error: {
                    message: 'Not found',
                    code: 404,
                },
            }),
        };
    } catch (e: any) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: {
                    message: e?.message ?? 'Internal error',
                    code: e?.statusCode ?? 500,
                },
            }),
        };
    }
}

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */
export const apiHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    let response: Promise<APIGatewayProxyResult>;

    debug = process.env.DEBUG_LAMBDA ? process.env.DEBUG_LAMBDA === 'true' : false;
    useSharedService = process.env.APICORE_USE_SHAREDSERVICE ? process.env.APICORE_USE_SHAREDSERVICE === 'true' : false;

    if (debug) {
        console.log(event);
    }

    try {
        const authorizer = event.requestContext.authorizer;

        if (authorizer?.principalId && authorizer?.accessToken) {
            const serviceIdentifier = getServiceDefinition(event.queryStringParameters);
            const browserID = event.queryStringParameters?.browserID ?? ALL_BROWSERS;
            const method = event.httpMethod.toUpperCase();
            const identity = {
                principalId: authorizer?.principalId,
                accessToken: authorizer?.accessToken,
                refreshToken: authorizer?.refreshToken,
                tokenExpires: authorizer?.tokenExpires,
                authType: authorizer?.authType,
            };

            if (event.resource.startsWith('/webpush')) {
                if (event.body) {
                    if (method === 'POST') {
                        response = storeWebPushUserKey(identity.principalId, browserID, JSON.parse(event.body));
                    } else if (method === 'PUT') {
                        response = updateWebPushUserKey(identity.principalId, browserID, JSON.parse(event.body));
                    } else {
                        throw new HttpError('Method Not Allowed', 406);
                    }
                } else {
                    throw new HttpError('Missing parameters to register webpush user key', 400);
                }
            } else if (event.resource.startsWith('/register')) {
                if (method !== 'POST') {
                    throw new HttpError('Method Not Allowed', 406);
                } else if (event.body && event.pathParameters?.identifier) {
                    response = registerNotification(event.pathParameters?.identifier, JSON.parse(event.body), identity, serviceIdentifier, browserID);
                } else {
                    throw new HttpError('Missing parameters to register subscription', 400);
                }
            } else if (event.resource.startsWith('/list')) {
                if (method !== 'GET') {
                    throw new HttpError('Method Not Allowed', 406);
                } else {
                    response = listSubscriptions(identity, serviceIdentifier);
                }
            } else if (event.resource.startsWith('/push')) {
                if (method !== 'POST') {
                    throw new HttpError('Method Not Allowed', 406);
                } else if (event.body && event.pathParameters?.identifier) {
                    response = pushNotification(event.pathParameters?.identifier, JSON.parse(event.body));
                } else {
                    throw new HttpError('Missing parameters to push subscription', 400);
                }
            } else if (event.resource.startsWith('/delete')) {
                if (method !== 'DELETE') {
                    throw new HttpError('Method Not Allowed', 406);
                } else if (event.pathParameters?.identifier) {
                    response = deleteNotification(event.pathParameters?.identifier, identity, serviceIdentifier, browserID);
                } else {
                    throw new HttpError('Missing parameters to delete subscription', 400);
                }
            } else if (event.resource.startsWith('/preferences')) {
                if (method === 'POST') {
                    if (event.body && event.pathParameters?.identifier) {
                        response = storeUserPreferences(identity.principalId, event.pathParameters?.identifier, JSON.parse(event.body));
                    } else {
                        throw new HttpError('Missing parameters', 400);
                    }
                } else if (method === 'GET') {
                    if (event.pathParameters?.identifier) {
                        response = getUserPreferences(identity.principalId, event.pathParameters?.identifier);
                    } else {
                        throw new HttpError('Missing parameters', 400);
                    }
                } else {
                    throw new HttpError('Method Not Allowed', 406);
                }
            } else {
                response = defaultHandler(event);
            }
        } else {
            throw new HttpError('Unauthorized', 401);
        }

        return response;
    } catch (err) {
        return handleError(err);
    }
};
