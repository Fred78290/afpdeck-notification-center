/* eslint-disable @typescript-eslint/no-explicit-any */
import ApiCore from 'afp-apicore-sdk';

import { APIGatewayRequestAuthorizerEvent, Context, APIGatewayAuthorizerResult, APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult } from 'aws-lambda';
import { Subscription, AuthType, ServiceType, RegisterService, PostedPushNoticationData, NoticationData, NoticationUserPayload } from 'afp-apicore-sdk/dist/types';
import { ApiCoreNotificationCenter } from 'afp-apicore-sdk/dist/apicore/notification';
import webpush, { VapidKeys, PushSubscription, SendResult } from 'web-push';
import { ALL, AccessStorage } from './databases';
import { parseBoolean, parseNumber } from './utils';
import { WebPushNotication, WebPushNoticationData } from './types';
import { parse } from 'auth-header';
import { base64decode } from 'nodejs-base64';
import { randomUUID } from 'crypto';

const AFPDECK_NOTIFICATIONCENTER_SERVICE = 'afpdeck-user-service';
const AFPDECK_NOTIFICATIONCENTER_SHARED_SERVICE = 'afpdeck-shared-service';

const OK = {
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

export class HttpError extends Error {
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
export function handleError(err: any) {
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

function findAuthorization(req: APIGatewayRequestAuthorizerEvent): string | undefined {
    if (req.headers) {
        const keys = Object.keys(req.headers);
        const key = keys.find((k) => k.toLowerCase() === 'authorization');

        if (key) {
            return req.headers[key];
        }
    }

    return undefined;
}

export interface AuthorizerOptions {
    debug?: boolean;
    apicoreBaseURL: string;
    clientID: string;
    clientSecret: string;
    apicorePushUserName: string;
    apicorePushPassword: string;
}

export class Authorizer {
    protected debug: boolean;
    protected apicoreBaseURL: string;
    protected clientID: string;
    protected clientSecret: string;
    protected pushUserName: string;
    protected pushPassword: string;

    constructor(options: AuthorizerOptions) {
        this.debug = options.debug ?? false;
        this.apicoreBaseURL = options.apicoreBaseURL;
        this.clientID = options.clientID;
        this.clientSecret = options.clientSecret;
        this.pushUserName = options.apicorePushUserName;
        this.pushPassword = options.apicorePushPassword;
    }

    public async authorize(event: APIGatewayRequestAuthorizerEvent, context?: Context): Promise<APIGatewayAuthorizerResult> {
        const methodArn = event.methodArn.substring(0, event.methodArn.indexOf('/')) + '/*/*/*';

        if (this.debug) {
            console.log(event);
            console.log(context);
        }

        const result: APIGatewayAuthorizerResult = {
            principalId: 'unknown',
            policyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Action: 'execute-api:Invoke',
                        Effect: 'Deny',
                        Resource: methodArn,
                    },
                ],
            },
        };

        try {
            const authorization = findAuthorization(event);

            if (authorization) {
                const token = parse(authorization);
                const apicore = new ApiCore({
                    baseUrl: this.apicoreBaseURL,
                    clientId: this.clientID,
                    clientSecret: this.clientSecret,
                });

                if (token.scheme.toLowerCase() === 'basic' && token.token) {
                    const encode: string = Array.isArray(token.token) ? token.token[0] : token.token;
                    const [username, password] = base64decode(encode).split(':', 2);

                    if (event.resource.startsWith('/push')) {
                        if (username === this.pushUserName && password === this.pushPassword) {
                            result.principalId = username;
                            result.policyDocument.Statement[0].Effect = 'Allow';
                            result.context = {
                                username: username,
                                authToken: encode,
                            };
                        } else {
                            console.log(`Not authorized: ${username}`);
                        }
                    } else {
                        const authToken = await apicore.authenticate({ username, password });

                        if (authToken.authType === 'credentials') {
                            result.principalId = username;
                            result.policyDocument.Statement[0].Effect = 'Allow';
                            result.context = {
                                username: username,
                                ...authToken,
                            };
                        } else if (this.debug) {
                            console.log(`Not authorized: ${username}`);
                        }
                    }
                } else if (token.scheme.toLowerCase() === 'bearer' && token.token) {
                    const encode: string = Array.isArray(token.token) ? token.token[0] : token.token;
                    const { username } = await apicore.checkToken(encode);

                    result.principalId = username;
                    result.policyDocument.Statement[0].Effect = 'Allow';
                    result.context = {
                        username: username,
                        accessToken: encode,
                    };
                } else if (this.debug) {
                    console.debug(`Unsupported scheme: ${token.scheme} or token is undefined`);
                }
            } else if (this.debug) {
                console.debug('authorization header not found');
            }
        } catch (err) {
            console.error(err);
        }

        if (this.debug) {
            console.log(JSON.stringify(result));
        }

        return result;
    }
}

export interface AfpDeckNotificationCenterHandlerOptions extends AuthorizerOptions {
    afpDeckPushURL: string;
    serviceUserName?: string;
    servicePassword?: string;
    useSharedService?: boolean;
    registerService?: boolean;
}
export class AfpDeckNotificationCenterHandler extends Authorizer {
    protected closed: boolean;
    protected registerService: boolean;
    protected accessStorage: AccessStorage;
    protected afpDeckPushURL: string;
    protected useSharedService: boolean;
    protected serviceUserName: string;
    protected servicePassword: string;

    constructor(accessStorage: AccessStorage, options: AfpDeckNotificationCenterHandlerOptions) {
        super(options);

        this.accessStorage = accessStorage;
        this.debug = options.debug ?? false;
        this.afpDeckPushURL = options.afpDeckPushURL;
        this.closed = false;
        this.serviceUserName = options.serviceUserName ?? '';
        this.servicePassword = options.servicePassword ?? '';
        this.registerService = options.registerService ?? true;
        this.useSharedService = options.useSharedService ?? false;

        process.on('SIGTERM', () => {
            this.close().finally(() => {
                process.exit(0);
            });
        });
    }

    public get storage() {
        return this.accessStorage;
    }

    private getNotificationCenter(identity: Identify) {
        const apicore = new ApiCore({
            baseUrl: this.apicoreBaseURL,
            clientId: this.clientID,
            clientSecret: this.clientSecret,
        });

        apicore.token = {
            accessToken: identity.accessToken,
            refreshToken: identity.refreshToken ? identity.refreshToken : '',
            authType: identity.authType ? identity.authType : 'credentials',
            tokenExpires: identity.tokenExpires ? identity.tokenExpires : Date.now() + 1000 * 3600,
        };

        return apicore.createNotificationCenter(this.serviceUserName, this.servicePassword);
    }

    private async checkIfServiceIsRegistered(identity: Identify, serviceDefinition: ServiceDefinition) {
        const notificationCenter = this.getNotificationCenter(identity);

        if (this.registerService) {
            if (serviceDefinition.useSharedService) {
                const services = await notificationCenter.listSharedServices(this.clientID, identity.principalId);
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
        }

        return notificationCenter;
    }

    private async listSubscriptions(identity: Identify, visitorID: string): Promise<APIGatewayProxyResult> {
        const notificationCenter = this.getNotificationCenter(identity);
        let subscriptions = await notificationCenter.listSubscriptions();

        if (visitorID !== ALL && subscriptions) {
            const alls = await Promise.all(
                subscriptions.map(async (subscription) => {
                    return new Promise<boolean>((resolve, reject) => {
                        this.accessStorage
                            .getSubscription(identity.principalId, subscription.name)
                            .then((found) => {
                                resolve(found ? found.visitorID.includes(visitorID) : false);
                            })
                            .catch((e) => {
                                resolve(false);
                            });
                    });
                }),
            );

            subscriptions = subscriptions.filter((_v, index) => alls[index]);
        }

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

    private async getSubscription(identifier: string, identity: Identify, visitorID: string): Promise<APIGatewayProxyResult> {
        const notificationCenter = this.getNotificationCenter(identity);

        if (visitorID !== ALL) {
            const found = await this.accessStorage.getSubscription(identity.principalId, identifier);

            if (found) {
                if (!found.visitorID.includes(visitorID)) {
                    return OK;
                }
            } else {
                return NOT_FOUND;
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                response: {
                    subscription: await notificationCenter.getSubscription(identifier),
                    status: {
                        code: 0,
                        reason: 'OK',
                    },
                },
            }),
        };
    }

    private async addSubscriptionIfNotExists(notificationCenter: ApiCoreNotificationCenter, identifier: string, notification: Subscription, serviceDefinition: ServiceDefinition): Promise<string> {
        if (this.registerService) {
            return new Promise<string>((resolve, reject) => {
                notificationCenter
                    .getSubscription(identifier)
                    .then((found) => {
                        resolve(found.identifier);
                    })
                    .catch((e) => {
                        notificationCenter
                            .addSubscription(identifier, serviceDefinition.definition.name, notification)
                            .then((created) => {
                                resolve(created);
                            })
                            .catch((e) => {
                                reject(e);
                            });
                    });
            });
        } else {
            return randomUUID();
        }
    }

    private async registerSubscription(identifier: string, notification: Subscription, identity: Identify, serviceDefinition: ServiceDefinition, visitorID: string): Promise<APIGatewayProxyResult> {
        const now = new Date();
        const notificationCenter = await this.checkIfServiceIsRegistered(identity, serviceDefinition);
        const notificationIdentifier = await this.addSubscriptionIfNotExists(notificationCenter, identifier, notification, serviceDefinition);

        await this.accessStorage.storeSubscription({
            uno: notificationIdentifier,
            visitorID: [visitorID],
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

    private async sendNotificationToClient(notication: NoticationData, subscription: NoticationUserPayload): Promise<Promise<SendResult>[]> {
        const result: Promise<SendResult>[] = [];
        const subItem = await this.accessStorage.getSubscription(subscription.userID, subscription.name);

        if (subItem != null) {
            try {
                const userPushKey = await this.accessStorage.findPushKeyForIdentity(subscription.userID, subItem.visitorID);

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
                                subject: m.visitorID,
                                ...m.apiKeys,
                            },
                        });

                        result.push(push);
                    });
                }
            } catch (e) {
                console.error('Browser registration: %s not found for user: %s, reason: %s', subItem.visitorID, subscription.userID, e);
            }
        }

        return result;
    }

    private async collectSubscriptions(pushData: PostedPushNoticationData) {
        const collect: Map<
            string,
            {
                owner: string;
                apiKeys: VapidKeys;
                subscription: PushSubscription;
                notifications: WebPushNoticationData[];
            }
        > = new Map();

        for (const payload of pushData.payload) {
            for (const subscription of payload.subscriptions) {
                const subItem = await this.accessStorage.getSubscription(subscription.userID, subscription.name);
                const datas: WebPushNoticationData = {
                    name: subscription.name,
                    uno: subscription.identifier,
                    isFree: subscription.isFree,
                    title: payload.title,
                    text: payload.text,
                    headline: payload.headline,
                    urgency: payload.urgency,
                    class: payload.class,
                    contentCreated: payload.contentCreated,
                    providerid: payload.providerid,
                    lang: payload.lang,
                    genreid: payload.genreid,
                    wordCount: payload.wordCount,
                    guid: payload.guid,
                    abstract: payload.abstract,
                    documentURL: subscription.documentUrl,
                    thumbnailURL: subscription.thumbnailUrl,
                    thumbnail: payload.thumbnail,
                };

                if (subItem != null) {
                    const userPushKeys = await this.accessStorage.findPushKeyForIdentity(subscription.userID, subItem.visitorID);

                    for (const userPushKey of userPushKeys) {
                        if (!collect.has(userPushKey.visitorID)) {
                            collect.set(userPushKey.visitorID, {
                                owner: subscription.userID,
                                apiKeys: userPushKey.apiKeys,
                                subscription: userPushKey.subscription,
                                notifications: [],
                            });
                        }

                        collect.get(userPushKey.visitorID)?.notifications.push(datas);
                    }
                }
            }
        }

        return collect;
    }

    private async pushNotification(pushData: PostedPushNoticationData): Promise<APIGatewayProxyResult> {
        if (this.debug) {
            console.log(pushData);
        }

        interface NotificationSendResult {
            owner: string;
            visitorID: string;
            success: boolean;
            result: any;
        }

        this.collectSubscriptions(pushData).then((collect) => {
            const sendResults: Promise<NotificationSendResult>[] = [];

            collect.forEach((push, visitorID) => {
                sendResults.push(
                    new Promise<NotificationSendResult>((resolve, reject) => {
                        // Send webpush
                        const notication: WebPushNotication = {
                            visitorID: visitorID,
                            userName: push.owner,
                            payload: push.notifications,
                        };

                        webpush
                            .sendNotification(push.subscription, JSON.stringify(notication), {
                                gcmAPIKey: process.env.AFPDECK_GCM_KEY,
                                TTL: parseNumber(process.env.AFPDECK_NOTIFICATION_TTL, 3600),
                                vapidDetails: {
                                    subject: `${visitorID}@acme.com`,
                                    ...push.apiKeys,
                                },
                            })
                            .then((result) => {
                                resolve({
                                    visitorID: visitorID,
                                    owner: push.owner,
                                    success: result.statusCode < 300,
                                    result: result,
                                });
                            })
                            .catch((e) => {
                                resolve({
                                    visitorID: visitorID,
                                    owner: push.owner,
                                    success: false,
                                    result: e,
                                });
                            });
                    }),
                );
            });

            Promise.allSettled(sendResults).then((results) => {
                results.forEach((result) => {
                    if (result.status === 'fulfilled') {
                        if (result.value.success) {
                            console.info(`Web push succesful for user: ${result.value.owner} target: ${result.value.visitorID}`);
                        } else if (result.value.result.statusCode) {
                            const send: SendResult = result.value.result;
                            console.error(`Web push failed for user: ${result.value.owner} target: ${result.value.visitorID}, code: ${send.statusCode}, reason: ${send.body}`, send.body);
                        } else {
                            console.error(`Web push error for user: ${result.value.owner} target: ${result.value.visitorID}, reason: ${result.value.result}`);
                        }
                    } else {
                        console.error(`Unexpected Web push error: ${result.reason}`);
                    }
                });
            });
        });

        return OK;
    }

    private async deleteSubscription(identifier: string, identity: Identify, visitorID: string): Promise<APIGatewayProxyResult> {
        const notificationCenter = this.getNotificationCenter(identity);

        try {
            const result = await this.accessStorage.deleteSubscription(identity.principalId, identifier, visitorID);

            // Delete subscription in apicore if all or any browser remains
            if (this.registerService && (visitorID === ALL || result.remains.length === 0)) {
                await notificationCenter.deleteSubscription(identifier);
            }

            return {
                statusCode: 200,
                body: JSON.stringify({
                    response: {
                        name: identifier,
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

        return {
            useSharedService: this.useSharedService,
            definition: {
                name: this.useSharedService ? AFPDECK_NOTIFICATIONCENTER_SHARED_SERVICE : AFPDECK_NOTIFICATIONCENTER_SERVICE,
                type: 'rest',
                datas: {
                    href: this.afpDeckPushURL,
                    user: this.pushUserName,
                    password: this.pushPassword,
                },
            },
        };
    }

    private async storeWebPushUserKey(principalId: string, visitorID: string, data: WebPushUser): Promise<APIGatewayProxyResult> {
        const now = new Date();

        await this.accessStorage.storeWebPushUserDocument({
            owner: principalId,
            visitorID: visitorID,
            apiKeys: data.apiKeys,
            subscription: data.subscription,
            created: now,
            updated: now,
        });

        return OK;
    }

    private async updateWebPushUserKey(principalId: string, visitorID: string, data: WebPushUser): Promise<APIGatewayProxyResult> {
        try {
            const now = new Date();

            await this.accessStorage.updateWebPushUserDocument({
                owner: principalId,
                visitorID: visitorID,
                apiKeys: data.apiKeys,
                subscription: data.subscription,
                created: now,
                updated: now,
            });

            return OK;
        } catch (e: any) {
            return NOT_FOUND;
        }
    }

    private async deleteWebPushUserKey(principalId: string, visitorID: string): Promise<APIGatewayProxyResult> {
        await this.accessStorage.deleteWebPushUserDocument(principalId, visitorID);

        return OK;
    }

    private async getWebPushUserKey(principalId: string, visitorID: string): Promise<APIGatewayProxyResult> {
        const webPushKeys = await this.accessStorage.findPushKeyForIdentity(principalId, [visitorID]);

        return {
            statusCode: 200,
            body: JSON.stringify({
                response: {
                    keys: webPushKeys,
                    status: {
                        code: 0,
                        reason: 'OK',
                    },
                },
            }),
        };
    }

    private async storeUserPreferences(principalId: string, name: string, prefs: any): Promise<APIGatewayProxyResult> {
        await this.accessStorage.storeUserPreferences({
            name: name,
            owner: principalId,
            preferences: prefs,
            updated: new Date(),
        });

        return OK;
    }

    private async getUserPreferences(principalId: string): Promise<APIGatewayProxyResult> {
        try {
            const prefs = await this.accessStorage.getUserPreferences(principalId);

            if (prefs) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        response: {
                            preferences: prefs,
                            status: {
                                status: 0,
                                message: 'OK',
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

    private async getUserPreference(principalId: string, name: string): Promise<APIGatewayProxyResult> {
        try {
            const prefs = await this.accessStorage.getUserPreference(principalId, name);

            if (prefs) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        response: {
                            preferences: prefs,
                            status: {
                                status: 0,
                                message: 'OK',
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

    private async deleteUserPreferences(principalId: string, name: string): Promise<APIGatewayProxyResult> {
        try {
            await this.accessStorage.deleteUserPreferences(principalId, name);

            return OK;
        } catch (e: any) {
            return NOT_FOUND;
        }
    }

    public close(): Promise<void> {
        if (this.closed) {
            return Promise.resolve();
        }

        this.closed = true;
        return this.accessStorage.disconnect();
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
                    const visitorID = event.queryStringParameters?.visitorID ?? ALL;
                    const identity = {
                        principalId: authorizer?.principalId,
                        accessToken: authorizer?.accessToken,
                        refreshToken: authorizer?.refreshToken,
                        tokenExpires: authorizer?.tokenExpires,
                        authType: authorizer?.authType,
                    };

                    if (event.resource.startsWith('/webpush')) {
                        // WebPush keys API
                        if (method === 'POST' || method === 'PUT') {
                            if (event.body) {
                                if (method === 'POST') {
                                    response = this.storeWebPushUserKey(identity.principalId, visitorID, JSON.parse(event.body));
                                } else {
                                    response = this.updateWebPushUserKey(identity.principalId, visitorID, JSON.parse(event.body));
                                }
                            } else {
                                throw new HttpError('Missing parameters to register webpush user key', 400);
                            }
                        } else if (method === 'GET') {
                            response = this.getWebPushUserKey(identity.principalId, visitorID);
                        } else if (method === 'DELETE') {
                            response = this.deleteWebPushUserKey(identity.principalId, visitorID);
                        } else {
                            throw new HttpError('Method Not Allowed', 406);
                        }
                    } else if (event.resource.startsWith('/subscriptions')) {
                        // Notification API
                        if (method === 'GET') {
                            response = this.listSubscriptions(identity, visitorID);
                        } else {
                            throw new HttpError('Method Not Allowed', 406);
                        }
                    } else if (event.resource.startsWith('/subscription')) {
                        // Notification API
                        if (method === 'GET') {
                            if (event.pathParameters?.identifier) {
                                response = this.getSubscription(event.pathParameters?.identifier, identity, visitorID);
                            } else {
                                throw new HttpError('Missing parameters to get subscription', 400);
                            }
                        } else if (method === 'DELETE') {
                            if (event.pathParameters?.identifier) {
                                response = this.deleteSubscription(event.pathParameters?.identifier, identity, visitorID);
                            } else {
                                throw new HttpError('Missing parameters to delete subscription', 400);
                            }
                        } else if (method === 'POST') {
                            if (event.body && event.pathParameters?.identifier) {
                                response = this.registerSubscription(
                                    event.pathParameters?.identifier,
                                    JSON.parse(event.body),
                                    identity,
                                    this.getServiceDefinition(event.queryStringParameters),
                                    visitorID,
                                );
                            } else {
                                throw new HttpError('Missing parameters to register subscription', 400);
                            }
                        } else {
                            throw new HttpError('Method Not Allowed', 406);
                        }
                    } else if (event.resource.startsWith('/preferences')) {
                        // Preferences API
                        if (method === 'GET') {
                            response = this.getUserPreferences(identity.principalId);
                        } else {
                            throw new HttpError('Method Not Allowed', 406);
                        }
                    } else if (event.resource.startsWith('/preference/')) {
                        // Preferences API
                        if (event.pathParameters?.identifier) {
                            if (method === 'GET') {
                                response = this.getUserPreference(identity.principalId, event.pathParameters?.identifier);
                            } else if (method === 'DELETE') {
                                response = this.deleteUserPreferences(identity.principalId, event.pathParameters?.identifier);
                            } else if (method === 'POST') {
                                if (event.body) {
                                    response = this.storeUserPreferences(identity.principalId, event.pathParameters?.identifier, JSON.parse(event.body));
                                } else {
                                    throw new HttpError('Missing parameters', 400);
                                }
                            } else {
                                throw new HttpError('Method Not Allowed', 406);
                            }
                        } else {
                            throw new HttpError('Missing parameters', 400);
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
