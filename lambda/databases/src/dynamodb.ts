/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { defineTable, TableClient } from '@hexlabs/dynamo-ts';
import { ALL, AccessStorage, UserPreferencesDocument, WebPushUserDocument, SubscriptionDocument, DeletedSubscriptionRemainder } from '../index';

const userPreferencesTable = defineTable(
    {
        owner: 'string',
        name: 'string',
        preferences: 'string',
        updated: 'number',
    },
    'owner',
    'name',
);

const webPushUserTable = defineTable(
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
    {
        'browserID-index': {
            partitionKey: 'browserID',
            sortKey: 'created',
        },
    },
);

const subscriptionsTable = defineTable(
    {
        owner: 'string',
        name: 'string',
        uno: 'string',
        browserID: 'string set',
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

type UserPreferencesTable = typeof userPreferencesTable;
type SubscriptionsTable = typeof subscriptionsTable;
type WebPushUserTable = typeof webPushUserTable;

export class DynamoDBAccessStorage implements AccessStorage {
    private userPreferencesTableClient: TableClient<UserPreferencesTable>;
    private subscriptionTableClient: TableClient<SubscriptionsTable>;
    private webPushUserTableClient: TableClient<WebPushUserTable>;

    constructor(userPreferencesTableName: string, webPushUserTableName: string, subscriptionTableName: string) {
        const dynamo = new DynamoDB();
        const client = DynamoDBDocument.from(dynamo);

        this.userPreferencesTableClient = TableClient.build(userPreferencesTable, {
            client: client,
            logStatements: true,
            tableName: userPreferencesTableName,
        });

        this.webPushUserTableClient = TableClient.build(webPushUserTable, {
            client: client,
            logStatements: true,
            tableName: webPushUserTableName,
        });

        this.subscriptionTableClient = TableClient.build(subscriptionsTable, {
            client: client,
            logStatements: true,
            tableName: subscriptionTableName,
        });
    }

    public disconnect(): Promise<void> {
        return Promise.resolve();
    }

    public connect(): Promise<AccessStorage> {
        return Promise.resolve(this);
    }

    public storeUserPreferences(document: UserPreferencesDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.userPreferencesTableClient
                .put(
                    {
                        owner: document.owner,
                        name: document.name,
                        preferences: JSON.stringify(document.preferences),
                        updated: Date.now(),
                    },
                    {
                        returnValues: 'NONE',
                    },
                )
                .then((result) => {
                    resolve();
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public getUserPreferences(principalId: string, name: string): Promise<UserPreferencesDocument[]> {
        return new Promise<UserPreferencesDocument[]>((resolve, reject) => {
            if (name === ALL) {
                this.userPreferencesTableClient
                    .queryAll({
                        owner: principalId,
                    })
                    .then((results) => {
                        const alls: UserPreferencesDocument[] = [];

                        results.member.forEach((item) => {
                            alls.push({
                                name: item.name,
                                owner: item.owner,
                                preferences: JSON.parse(item.preferences),
                                updated: new Date(item.updated),
                            });
                        });

                        resolve(alls);
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                this.userPreferencesTableClient
                    .get({
                        owner: principalId,
                        name: name,
                    })
                    .then((result) => {
                        if (result.item) {
                            resolve([
                                {
                                    name: result.item?.name,
                                    owner: result.item?.owner,
                                    preferences: JSON.parse(result.item?.preferences),
                                    updated: new Date(result.item?.updated),
                                },
                            ]);
                        } else {
                            reject(new Error('Not found'));
                        }
                    })
                    .catch((e) => {
                        reject(e);
                    });
            }
        });
    }

    public deleteUserPreferences(principalId: string, name: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (name === ALL) {
                this.userPreferencesTableClient
                    .queryAll({
                        owner: principalId,
                    })
                    .then((results) => {
                        const keys: { owner: string; name: string }[] = [];

                        results.member.forEach((item) => {
                            keys.push({
                                owner: item.owner,
                                name: item.name,
                            });
                        });

                        this.userPreferencesTableClient
                            .batchDelete(keys)
                            .execute()
                            .then((results) => {
                                resolve();
                            })
                            .catch((e) => {
                                reject(e);
                            });
                    })
                    .catch((e) => {
                        reject(e);
                    });
            }
            this.userPreferencesTableClient
                .delete({
                    owner: principalId,
                    name: name,
                })
                .then(() => {
                    resolve();
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public findPushKeyForIdentity(principalId: string, browserID: string[]): Promise<WebPushUserDocument[]> {
        return new Promise<WebPushUserDocument[]>((resolve, reject) => {
            this.webPushUserTableClient
                .queryAll({ owner: principalId })
                .then((result) => {
                    const docs: WebPushUserDocument[] = [];

                    result.member.forEach((item) => {
                        if (browserID.includes(ALL) || browserID.includes(item.browserID)) {
                            docs.push({
                                owner: item.owner,
                                browserID: item.browserID,
                                created: new Date(item.created),
                                updated: new Date(item.updated),
                                apiKeys: {
                                    publicKey: item.publicKey,
                                    privateKey: item.privateKey,
                                },
                                subscription: {
                                    endpoint: item.endpoint,
                                    keys: {
                                        auth: item.auth,
                                        p256dh: item.p256dh,
                                    },
                                },
                            });
                        }
                    });

                    resolve(docs);
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public storeWebPushUserDocument(document: WebPushUserDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.webPushUserTableClient
                .put({
                    owner: document.owner,
                    browserID: document.browserID,
                    publicKey: document.apiKeys.publicKey,
                    privateKey: document.apiKeys.privateKey,
                    endpoint: document.subscription.endpoint,
                    p256dh: document.subscription.keys.p256dh,
                    auth: document.subscription.keys.auth,
                    created: document.created.getTime(),
                    updated: document.updated.getTime(),
                })
                .then((result) => {
                    resolve();
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public updateWebPushUserDocument(document: WebPushUserDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.webPushUserTableClient
                .update({
                    key: {
                        owner: document.owner,
                        browserID: document.browserID,
                    },
                    updates: {
                        publicKey: document.apiKeys.publicKey,
                        privateKey: document.apiKeys.privateKey,
                        endpoint: document.subscription.endpoint,
                        p256dh: document.subscription.keys.p256dh,
                        auth: document.subscription.keys.auth,
                        updated: Date.now(),
                    },
                })
                .then((result) => {
                    resolve();
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public deleteWebPushUserDocument(principalId: string, browserID: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (browserID === ALL) {
                this.webPushUserTableClient
                    .queryAll({
                        owner: principalId,
                    })
                    .then((results) => {
                        const keys: { owner: string; browserID: string }[] = [];

                        results.member.forEach((doc) => {
                            keys.push({
                                owner: doc.owner,
                                browserID: doc.browserID,
                            });
                        });

                        this.webPushUserTableClient
                            .batchDelete(keys)
                            .execute()
                            .then(() => {
                                resolve();
                            })
                            .catch((e) => {
                                reject(e);
                            });
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                this.webPushUserTableClient
                    .delete({
                        owner: principalId,
                        browserID: browserID,
                    })
                    .then((result) => {
                        resolve();
                    })
                    .catch((e) => {
                        reject(e);
                    });
            }
        });
    }

    public getSubscriptions(owner: string): Promise<SubscriptionDocument[]> {
        return new Promise<SubscriptionDocument[]>((resolve, reject) => {
            this.subscriptionTableClient
                .queryAll({
                    owner: owner,
                })
                .then((subscriptions) => {
                    const docs: SubscriptionDocument[] = [];

                    subscriptions.member.forEach((item) => {
                        docs.push({
                            name: item.name,
                            owner: item.owner,
                            browserID: Array.from(item.browserID.values()),
                            uno: item.uno,
                            created: new Date(item.created),
                            updated: new Date(item.updated),
                            subscription: JSON.parse(item.subscription),
                        });
                    });

                    resolve(docs);
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public getSubscription(owner: string, name: string): Promise<SubscriptionDocument | null> {
        return new Promise<SubscriptionDocument | null>((resolve, reject) => {
            this.subscriptionTableClient
                .get({
                    owner: owner,
                    name: name,
                })
                .then((results) => {
                    if (results.item) {
                        const item = results.item;

                        resolve({
                            owner: item.owner,
                            name: item.name,
                            browserID: Array.from(item.browserID.values()),
                            subscription: JSON.parse(item.subscription),
                            uno: item.uno,
                            created: new Date(item.created),
                            updated: new Date(item.updated),
                        });
                    } else {
                        resolve(null);
                    }
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public storeSubscription(subscription: SubscriptionDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.subscriptionTableClient
                .get({
                    owner: subscription.owner,
                    name: subscription.name,
                })
                .then((result) => {
                    if (result.item) {
                        const item = result.item;
                        const browserID = item.browserID;

                        subscription.browserID.forEach((item) => {
                            if (!browserID.has(item)) {
                                browserID.add(item);
                            }
                        });

                        this.subscriptionTableClient
                            .update({
                                key: {
                                    name: subscription.name,
                                    owner: subscription.owner,
                                },
                                updates: {
                                    uno: subscription.uno,
                                    subscription: JSON.stringify(subscription.subscription),
                                    browserID: browserID,
                                    updated: Date.now(),
                                },
                            })
                            .then((result) => {
                                resolve();
                            })
                            .catch((e) => {
                                reject(e);
                            });
                    } else {
                        const now = Date.now();

                        this.subscriptionTableClient
                            .put(
                                {
                                    owner: subscription.owner,
                                    uno: subscription.uno,
                                    name: subscription.name,
                                    browserID: new Set<string>(subscription.browserID),
                                    subscription: JSON.stringify(subscription.subscription),
                                    created: now,
                                    updated: now,
                                },
                                {
                                    returnValues: 'NONE',
                                },
                            )
                            .then((result) => {
                                resolve();
                            })
                            .catch((e) => {
                                reject(e);
                            });
                    }
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public deleteSubscription(owner: string, name: string, browserID: string): Promise<DeletedSubscriptionRemainder> {
        return new Promise<DeletedSubscriptionRemainder>((resolve, reject) => {
            if (browserID === ALL) {
                this.subscriptionTableClient
                    .delete({
                        name: name,
                        owner: owner,
                    })
                    .then(() => {
                        resolve({
                            identifier: name,
                        });
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                this.subscriptionTableClient
                    .get({
                        owner: owner,
                        name: name,
                    })
                    .then((result) => {
                        if (result.item) {
                            const item = result.item;
                            const browserIDs = item.browserID;

                            if (browserIDs.has(browserID)) {
                                browserIDs.delete(browserID);

                                if (browserIDs.size > 0) {
                                    this.subscriptionTableClient
                                        .update({
                                            key: {
                                                name: name,
                                                owner: owner,
                                            },
                                            updates: {
                                                browserID: browserIDs,
                                                updated: Date.now(),
                                            },
                                        })
                                        .then((result) => {
                                            resolve({
                                                identifier: item.uno,
                                                remains: Array.from(browserIDs.values()),
                                            });
                                        })
                                        .catch((e) => {
                                            reject(e);
                                        });
                                } else {
                                    this.subscriptionTableClient
                                        .delete({
                                            name: name,
                                            owner: owner,
                                        })
                                        .then(() => {
                                            resolve({
                                                identifier: item.uno,
                                            });
                                        })
                                        .catch((e) => {
                                            reject(e);
                                        });
                                }
                            } else {
                                resolve({
                                    identifier: item.uno,
                                    remains: Array.from(browserIDs.values()),
                                });
                            }
                        } else {
                            resolve({
                                identifier: name,
                            });
                        }
                    })
                    .catch((e) => {
                        reject(e);
                    });
            }
        });
    }
}
