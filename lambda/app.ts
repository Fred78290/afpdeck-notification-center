import ApiCore from 'afp-apicore-sdk';

import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult } from 'aws-lambda';
import { Subscription, AuthType, ServiceType, RegisterService } from 'afp-apicore-sdk/dist/types';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { defineTable, DynamoTypeFrom, TableClient } from '@hexlabs/dynamo-ts';

const debug = process.env.DEBUG_LAMBDA ? process.env.DEBUG_LAMBDA === 'true' : false;
const AFPDECK_NOTIFICATIONCENTER_SERVICE = 'afpdeck';
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'afpdeck-notification-center';

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
const subscriptionsTable = defineTable(
    {
        owner: 'string',
        uno: 'string',
        name: 'string',
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
    },
);

type SubscriptionDynamoDB = DynamoTypeFrom<typeof subscriptionsTable>;

const subscriptionTableClient = TableClient.build(subscriptionsTable, {
    client: client,
    logStatements: true,
    tableName: DYNAMODB_TABLE_NAME,
});

async function storeSubscriptionInDynamoDB(owner: string, name: string, uno: string, notification: Subscription): Promise<SubscriptionDynamoDB | undefined> {
    const now = Date.now();
    const old = await subscriptionTableClient.get({
        owner: owner,
        name: name,
    });

    let created = now;

    if (old.item) {
        created = old.item.created;
    }

    const result = await subscriptionTableClient.put(
        {
            owner: owner,
            uno: uno,
            name: name,
            subscription: JSON.stringify(notification),
            created: created,
            updated: now,
        },
        {
            returnValues: 'ALL_OLD',
        },
    );

    return result.item;
}

export async function deleteSubscriptionInDynamoDB(owner: string, name: string): Promise<SubscriptionDynamoDB | undefined> {
    const result = await subscriptionTableClient.delete(
        {
            owner: owner,
            name: name,
        },
        {
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

async function registerNotification(identifier: string, notification: Subscription, identity: Identify, serviceDefinition: RegisterService): Promise<APIGatewayProxyResult> {
    console.log(notification);
	const notificationCenter = await checkIfServiceIsRegistered(identity, serviceDefinition);
    const notificationIdentifier = await notificationCenter.addSubscription(identifier, serviceDefinition.name, notification);

    await storeSubscriptionInDynamoDB(identity.principalId, identifier, notificationIdentifier, notification);

    return {
        statusCode: 200,
        body: JSON.stringify({
            uno: notificationIdentifier,
        }),
    };
}

async function pushNotification(identifier: string, notification: Subscription): Promise<APIGatewayProxyResult> {
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Afpdeck Notification pushNotification',
        }),
    };
}

async function deleteNotification(identifier: string, identity: Identify, serviceDefinition: RegisterService): Promise<APIGatewayProxyResult> {
    const notificationCenter = getNotificationCenter(identity);
    const notificationIdentifier = await notificationCenter.deleteSubscription(identifier, serviceDefinition.name);

    await deleteSubscriptionInDynamoDB(identity.principalId, identifier);

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

    if (debug) {
        console.log(event);
    }

    try {
        const authorizer = event.requestContext.authorizer;

        if (authorizer?.principalId && authorizer?.accessToken) {
            const serviceIdentifier = getServiceDefinition(event.queryStringParameters);
            const identity = {
                principalId: authorizer?.principalId,
                accessToken: authorizer?.accessToken,
            };

            if (event.resource.startsWith('/register')) {
                if (event.body && event.pathParameters?.identifier) {
                    response = registerNotification(event.pathParameters?.identifier, JSON.parse(event.body), identity, serviceIdentifier);
                } else {
                    throw new HttpError('Missing parameters to register subscription', 400);
                }
            } else if (event.resource.startsWith('/list')) {
                response = listSubscriptions(identity, serviceIdentifier);
            } else if (event.resource.startsWith('/push')) {
                if (event.body && event.pathParameters?.identifier) {
                    response = pushNotification(event.pathParameters?.identifier, JSON.parse(event.body));
                } else {
                    throw new HttpError('Missing parameters to list subscription', 400);
                }
            } else if (event.resource.startsWith('/delete')) {
                if (event.pathParameters?.identifier) {
                    response = deleteNotification(event.pathParameters?.identifier, identity, serviceIdentifier);
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
