/* eslint-disable @typescript-eslint/no-explicit-any */
import ApiCore from 'afp-apicore-sdk';

import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult } from 'aws-lambda';
import { Subscription, AuthType, ServiceType, RegisterService, PostedPushNoticationData, NoticationData, NoticationUserPayload } from 'afp-apicore-sdk/dist/types';
import webpush, { VapidKeys, PushSubscription, SendResult } from 'web-push';
import database, { ALL_BROWSERS, AccessStorage, WebPushUserDocument, parseBoolean } from './databases';

const AFPDECK_NOTIFICATIONCENTER_SERVICE = 'afpdeck-user-service';
const AFPDECK_NOTIFICATIONCENTER_SHARED_SERVICE = 'afpdeck-shared-service';

const OK = {
    statusCode: 200,
    body: JSON.stringify({
        response: {
            message: 'OK',
            status: 0,
        },
    }),
};

const NOT_FOUND = {
    statusCode: 404,
    body: JSON.stringify({
        error: {
            message: 'Not found',
            code: 404,
        },
    }),
};

let handler: AfpDeckNotificationCenterHandler;

export interface ServiceDefinition {
    definition: RegisterService;
    useSharedService: boolean;
}

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

export interface WebPushUser {
    apiKeys: VapidKeys;
    subscription: PushSubscription;
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

export class AfpDeckNotificationCenterHandler {
    private debug: boolean;
    private accessStorage: AccessStorage;

    constructor(accessStorage: AccessStorage, debug: boolean) {
        this.accessStorage = accessStorage;
        this.debug = debug;
    }

    private getNotificationCenter(identity: Identify) {
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

    private async checkIfServiceIsRegistered(identity: Identify, serviceDefinition: ServiceDefinition) {
        const notificationCenter = this.getNotificationCenter(identity);

        if (serviceDefinition.useSharedService) {
            if (process.env.APICORE_CLIENT_ID) {
                const services = await notificationCenter.listSharedServices(process.env.APICORE_CLIENT_ID, identity.principalId);
                const service = services?.find((s) => s.serviceName === serviceDefinition.definition.name);

                if (!service) {
                    try {
                        const serviceName = await notificationCenter.registerSharedService(serviceDefinition.definition);

                        if (this.debug) {
                            console.info(`Created shared service: ${serviceDefinition.definition.name}, uno: ${serviceName}`);
                        }
                    } catch (e) {
                        console.info(`Shared service: ${serviceDefinition.definition.name}, already exists`);
                    }
                }
            }
        } else {
            const services = await notificationCenter.listServices();
            const service = services?.find((s) => s.serviceName === serviceDefinition.definition.name);

            if (!service) {
                const serviceName = await notificationCenter.registerService(serviceDefinition.definition);

                if (this.debug) {
                    console.info(`Created service: ${serviceDefinition.definition.name}, uno: ${serviceName}, for user: ${identity.principalId}`);
                }
            } else if (this.debug) {
                console.info(`Created service: ${serviceDefinition.definition.name}, uno: ${service.serviceIdentifier}, for user: ${identity.principalId}`);
            }
        }

        return notificationCenter;
    }

    private async listSubscriptions(identity: Identify, serviceDefinition: ServiceDefinition): Promise<APIGatewayProxyResult> {
        const notificationCenter = await this.checkIfServiceIsRegistered(identity, serviceDefinition);
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

    private async registerNotification(identifier: string, notification: Subscription, identity: Identify, serviceDefinition: ServiceDefinition, browserID: string): Promise<APIGatewayProxyResult> {
        const now = new Date();
        const notificationCenter = await this.checkIfServiceIsRegistered(identity, serviceDefinition);
        const notificationIdentifier = await notificationCenter.addSubscription(identifier, serviceDefinition.definition.name, notification);

        await this.accessStorage.storeSubscription({
            uno: notificationIdentifier,
            browserID: browserID,
            name: identifier,
            owner: identity.principalId,
            subscription: notification,
            created: now,
            updated: now,
        });

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

    private sendNotificationToClientSync(notication: NoticationData, subscription: NoticationUserPayload): Promise<Promise<SendResult>[]> {
        return new Promise((resolve, reject) => {
            this.accessStorage.getSubscriptions(subscription.userID, subscription.name).then((subItems) => {
                const result: Promise<SendResult>[] = [];
                const userPushKeys: Promise<WebPushUserDocument[]>[] = [];

                for (const subItem of subItems) {
                    userPushKeys.push(this.accessStorage.findPushKeyForIdentity(subscription.userID, subItem.browserID));
                }

                Promise.allSettled(userPushKeys).then((settlements) => {
                    settlements.forEach((settlement) => {
                        if (settlement.status === 'fulfilled') {
                            const userPushKey = settlement.value;

                            if (userPushKey.length > 0) {
                                const datas = {
                                    name: subscription.name,
                                    uno: subscription.identifier,
                                    isFree: subscription.isFree,
                                    documentUrl: subscription.documentUrl,
                                    thumbnailUrl: subscription.thumbnailUrl,
                                    payload: notication,
                                };

                                userPushKey.forEach((m) => {
                                    const push = webpush.sendNotification(m.subscription, JSON.stringify(datas), {
                                        vapidDetails: {
                                            subject: m.browserID,
                                            ...m.apiKeys,
                                        },
                                    });

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

    private async sendNotificationToClient(notication: NoticationData, subscription: NoticationUserPayload): Promise<Promise<SendResult>[]> {
        const subItems = await this.accessStorage.getSubscriptions(subscription.userID, subscription.name);
        const result: Promise<SendResult>[] = [];

        for (const subItem of subItems) {
            try {
                const userPushKey = await this.accessStorage.findPushKeyForIdentity(subscription.userID, subItem.browserID);

                if (userPushKey.length > 0) {
                    const datas = {
                        name: subscription.name,
                        uno: subscription.identifier,
                        isFree: subscription.isFree,
                        documentUrl: subscription.documentUrl,
                        thumbnailUrl: subscription.thumbnailUrl,
                        payload: notication,
                    };

                    userPushKey.forEach((m) => {
                        const push = webpush.sendNotification(m.subscription, JSON.stringify(datas), {
                            vapidDetails: {
                                subject: m.browserID,
                                ...m.apiKeys,
                            },
                        });

                        result.push(push);
                    });
                }
            } catch (e) {
                console.error('Browser registration: %s not found for user: %s, reason: %s', subItem.browserID, subscription.userID, e);
            }
        }

        return result;
    }

    private async collectSubscriptions(pushData: PostedPushNoticationData) {
        return new Promise((resolve) => {
            let all: Promise<Promise<SendResult>[]>[] = [];

            for (const payload of pushData.payload) {
                const datas: any = {};
                const notif: any = payload;

                Object.keys(payload).forEach((key) => {
                    if (key !== 'subscriptions') datas[key] = notif[key];
                });

                for (const subscription of payload.subscriptions) {
                    all = all.concat(this.sendNotificationToClient(datas, subscription));
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

    private async pushNotification(pushData: PostedPushNoticationData): Promise<APIGatewayProxyResult> {
        if (this.debug) {
            console.log(pushData);
        }

        this.collectSubscriptions(pushData).then(() => {
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

    private async deleteNotification(identifier: string, identity: Identify, serviceDefinition: ServiceDefinition, browserID: string): Promise<APIGatewayProxyResult> {
        const notificationCenter = this.getNotificationCenter(identity);
        const notificationIdentifier = await notificationCenter.deleteSubscription(identifier);

        try {
            await this.accessStorage.deleteSubscription(identity.principalId, identifier, browserID);

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
            return NOT_FOUND;
        }
    }

    private async defaultHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Afpdeck Notification Center',
            }),
        };
    }

    private getServiceDefinition(queryStringParameters: APIGatewayProxyEventQueryStringParameters | null): ServiceDefinition {
        if (queryStringParameters) {
            if (queryStringParameters.serviceName && queryStringParameters.serviceType && queryStringParameters.serviceData) {
                return {
                    useSharedService: parseBoolean(queryStringParameters.shared),
                    definition: {
                        name: queryStringParameters.serviceName,
                        type: queryStringParameters.serviceType as ServiceType,
                        datas: JSON.parse(queryStringParameters.serviceData),
                    },
                };
            }
        }

        if (process.env.AFPDECK_PUSH_URL && process.env.APICORE_PUSH_USERNAME && process.env.APICORE_PUSH_PASSWORD) {
            const useSharedService = parseBoolean(process.env.APICORE_USE_SHAREDSERVICE);

            return {
                useSharedService: useSharedService,
                definition: {
                    name: useSharedService ? AFPDECK_NOTIFICATIONCENTER_SHARED_SERVICE : AFPDECK_NOTIFICATIONCENTER_SERVICE,
                    type: 'rest',
                    datas: {
                        href: process.env.AFPDECK_PUSH_URL,
                        user: process.env.APICORE_PUSH_USERNAME,
                        password: process.env.APICORE_PUSH_PASSWORD,
                    },
                },
            };
        }

        throw new HttpError('Missing envars', 500);
    }

    private async storeWebPushUserKey(principalId: string, browserID: string, data: WebPushUser): Promise<APIGatewayProxyResult> {
        const now = new Date();

        await this.accessStorage.storeWebPushUserDocument({
            owner: principalId,
            browserID: browserID,
            apiKeys: data.apiKeys,
            subscription: data.subscription,
            created: now,
            updated: now,
        });

        return OK;
    }

    private async updateWebPushUserKey(principalId: string, browserID: string, data: WebPushUser): Promise<APIGatewayProxyResult> {
        try {
            const now = new Date();

            await this.accessStorage.updateWebPushUserDocument({
                owner: principalId,
                browserID: browserID,
                apiKeys: data.apiKeys,
                subscription: data.subscription,
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
        } catch (e: any) {
            return NOT_FOUND;
        }
    }

    private async storeUserPreferences(principalId: string, name: string, prefs: any): Promise<APIGatewayProxyResult> {
        await this.accessStorage.storeUserPreferences({
            name: name,
            owner: principalId,
            preferences: prefs,
            updated: new Date(),
        });

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
    }

    private async getUserPreferences(principalId: string, name: string): Promise<APIGatewayProxyResult> {
        try {
            const prefs = await this.accessStorage.getUserPreferences(principalId, name);

            if (prefs) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        response: {
                            preferences: prefs.preferences,
                            status: {
                                code: 0,
                                reason: 'OK',
                            },
                        },
                    }),
                };
            }

            return NOT_FOUND;
        } catch (e: any) {
            return NOT_FOUND;
        }
    }

    public async handleEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
        let response: Promise<APIGatewayProxyResult>;

        if (this.debug) {
            console.log(event);
        }

        try {
            const authorizer = event.requestContext.authorizer;

            if (authorizer?.principalId && authorizer?.accessToken) {
                const method = event.httpMethod.toUpperCase();

                if (event.resource.startsWith('/push')) {
                    if (method !== 'POST') {
                        throw new HttpError('Method Not Allowed', 406);
                    } else if (event.body) {
                        response = this.pushNotification(JSON.parse(event.body));
                    } else {
                        throw new HttpError('Missing parameters to push subscription', 400);
                    }
                } else {
                    const serviceIdentifier = this.getServiceDefinition(event.queryStringParameters);
                    const browserID = event.queryStringParameters?.browserID ?? ALL_BROWSERS;
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
                                response = this.storeWebPushUserKey(identity.principalId, browserID, JSON.parse(event.body));
                            } else if (method === 'PUT') {
                                response = this.updateWebPushUserKey(identity.principalId, browserID, JSON.parse(event.body));
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
                            response = this.registerNotification(event.pathParameters?.identifier, JSON.parse(event.body), identity, serviceIdentifier, browserID);
                        } else {
                            throw new HttpError('Missing parameters to register subscription', 400);
                        }
                    } else if (event.resource.startsWith('/list')) {
                        if (method !== 'GET') {
                            throw new HttpError('Method Not Allowed', 406);
                        } else {
                            response = this.listSubscriptions(identity, serviceIdentifier);
                        }
                    } else if (event.resource.startsWith('/delete')) {
                        if (method !== 'DELETE') {
                            throw new HttpError('Method Not Allowed', 406);
                        } else if (event.pathParameters?.identifier) {
                            response = this.deleteNotification(event.pathParameters?.identifier, identity, serviceIdentifier, browserID);
                        } else {
                            throw new HttpError('Missing parameters to delete subscription', 400);
                        }
                    } else if (event.resource.startsWith('/preferences')) {
                        if (method === 'POST') {
                            if (event.body && event.pathParameters?.identifier) {
                                response = this.storeUserPreferences(identity.principalId, event.pathParameters?.identifier, JSON.parse(event.body));
                            } else {
                                throw new HttpError('Missing parameters', 400);
                            }
                        } else if (method === 'GET') {
                            if (event.pathParameters?.identifier) {
                                response = this.getUserPreferences(identity.principalId, event.pathParameters?.identifier);
                            } else {
                                throw new HttpError('Missing parameters', 400);
                            }
                        } else {
                            throw new HttpError('Method Not Allowed', 406);
                        }
                    } else {
                        response = this.defaultHandler(event);
                    }
                }
            } else {
                throw new HttpError('Unauthorized', 401);
            }

            return response;
        } catch (err) {
            return handleError(err);
        }
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
    try {
        if (!handler) {
            handler = new AfpDeckNotificationCenterHandler(
                await database(parseBoolean(process.env.USE_MONGODB), process.env.MONGODB_URL),
                parseBoolean(event.queryStringParameters?.debug) || parseBoolean(process.env.DEBUG_LAMBDA),
            );
        }

        return handler.handleEvent(event);
    } catch (e) {
        return handleError(e);
    }
};
