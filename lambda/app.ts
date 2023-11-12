/* eslint-disable @typescript-eslint/no-explicit-any */
import ApiCore from 'afp-apicore-sdk';

import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult } from 'aws-lambda';
import { Subscription, AuthType, ServiceType, RegisterService, PostedPushNoticationData, NoticationData, NoticationUserPayload } from 'afp-apicore-sdk/dist/types';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { defineTable, DynamoTypeFrom, TableClient } from '@hexlabs/dynamo-ts';
import webpush, { VapidKeys, PushSubscription, SendResult } from 'web-push';

let debug = process.env.DEBUG_LAMBDA ? process.env.DEBUG_LAMBDA === 'true' : false;
const AFPDECK_NOTIFICATIONCENTER_SERVICE = 'afpdeck';
const ALL_BROWSERS = 'all';
const DEFAULT_WEBPUSH_TABLENAME = 'afpdeck-webpush';
const DEFAULT_SUBSCRIPTIONS_TABLENAME = 'afpdeck-subscriptions';

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

type SubscriptionsTable = typeof subscriptionsTable;
type WebPushUserTable = typeof webPushUserTable;
type SubscriptionDynamoDB = DynamoTypeFrom<typeof subscriptionsTable>;

let subscriptionTableClient: TableClient<SubscriptionsTable>;
let webPushUserTableClient: TableClient<WebPushUserTable>;

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
    const old = await getSubscriptionTableClient(process.env.SUBSCRIPTIONS_TABLE_NAME).query(
        {
            owner: owner,
            name: (sortKey) => sortKey.eq(name),
        },
        {
            filter: (compare) => compare().browserID.eq(browserID),
        },
    );

    if (old.member.length > 0) {
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

    return apicore.createNotificationCenter();
}

async function checkIfServiceIsRegistered(identity: Identify, serviceDefinition: RegisterService) {
    const notificationCenter = getNotificationCenter(identity);
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

    return notificationCenter;
}

async function listSubscriptions(identity: Identify, serviceDefinition: RegisterService): Promise<APIGatewayProxyResult> {
    const notificationCenter = await checkIfServiceIsRegistered(identity, serviceDefinition);
    const subscriptions = await notificationCenter.listSubscriptions();

    return {
        statusCode: 200,
        body: JSON.stringify({
            subscriptions: subscriptions,
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
            uno: notificationIdentifier,
        }),
    };
}

async function sendNotificationToClient(notication: NoticationData, subscription: NoticationUserPayload): Promise<Promise<webpush.SendResult>[]> {
    const subItems = await getSubscriptionsInDynamoDB(subscription.userID, subscription.name);
    const result: Promise<SendResult>[] = [];

    for (const subItem of subItems) {
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
    }

    return result;
}

async function pushNotification(identifier: string, pushData: PostedPushNoticationData): Promise<APIGatewayProxyResult> {
    console.log(pushData);

    let all: Promise<SendResult>[] = [];

    for (const payload of pushData.payload) {
        const datas: any = {};
        const notif: any = payload;

        Object.keys(payload).forEach((key) => {
            if (key !== 'subscriptions') datas[key] = notif[key];
        });

        for (const subscription of payload.subscriptions) {
            all = all.concat(await sendNotificationToClient(datas, subscription));
        }
    }

    Promise.all(all)
        .then(() => {
            console.info(`done: ${JSON.stringify(pushData)}`);
        })
        .catch((e) => {
            console.error(`${e}: ${JSON.stringify(pushData)}`);
        });

    return {
        statusCode: 200,
        body: JSON.stringify({
            response: {
                status: 0,
                message: 'processing',
            },
        }),
    };
}

async function deleteNotification(identifier: string, identity: Identify, serviceDefinition: RegisterService, browserID: string): Promise<APIGatewayProxyResult> {
    const notificationCenter = getNotificationCenter(identity);
    const notificationIdentifier = await notificationCenter.deleteSubscription(identifier, serviceDefinition.name);

    await deleteSubscriptionInDynamoDB(identity.principalId, identifier, browserID);

    return {
        statusCode: 200,
        body: JSON.stringify({
            uno: notificationIdentifier,
        }),
    };
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
                message: err.message,
            }),
        };
    } else if (err instanceof HttpError) {
        return {
            statusCode: err.statusCode,
            body: JSON.stringify({
                message: err.message,
            }),
        };
    } else {
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: err.message ? err.message : err.toString(),
            }),
        };
    }
}

function getServiceDefinition(queryStringParameters: APIGatewayProxyEventQueryStringParameters | null): RegisterService {
    if (queryStringParameters) {
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
            name: AFPDECK_NOTIFICATIONCENTER_SERVICE,
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

    if (debug) {
        console.log(event);
    }

    try {
        const authorizer = event.requestContext.authorizer;

        if (authorizer?.principalId && authorizer?.accessToken) {
            const serviceIdentifier = getServiceDefinition(event.queryStringParameters);
            const browserID = event.queryStringParameters?.browserID ?? ALL_BROWSERS;
            const identity = {
                principalId: authorizer?.principalId,
                accessToken: authorizer?.accessToken,
            };

            if (event.resource.startsWith('/webpush')) {
                if (event.body) {
                    if (event.httpMethod.toUpperCase() === 'POST') {
                        response = storeWebPushUserKey(identity.principalId, browserID, JSON.parse(event.body));
                    } else {
                        response = updateWebPushUserKey(identity.principalId, browserID, JSON.parse(event.body));
                    }
                } else {
                    throw new HttpError('Missing parameters to register webpush user key', 400);
                }
            } else if (event.resource.startsWith('/register')) {
                if (event.body && event.pathParameters?.identifier) {
                    response = registerNotification(event.pathParameters?.identifier, JSON.parse(event.body), identity, serviceIdentifier, browserID);
                } else {
                    throw new HttpError('Missing parameters to register subscription', 400);
                }
            } else if (event.resource.startsWith('/list')) {
                response = listSubscriptions(identity, serviceIdentifier);
            } else if (event.resource.startsWith('/push')) {
                if (event.body && event.pathParameters?.identifier) {
                    response = pushNotification(event.pathParameters?.identifier, JSON.parse(event.body));
                } else {
                    throw new HttpError('Missing parameters to push subscription', 400);
                }
            } else if (event.resource.startsWith('/delete')) {
                if (event.pathParameters?.identifier) {
                    response = deleteNotification(event.pathParameters?.identifier, identity, serviceIdentifier, browserID);
                } else {
                    throw new HttpError('Missing parameters to delete subscription', 400);
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
