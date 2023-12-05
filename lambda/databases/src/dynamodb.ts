/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { defineTable, TableClient, QueryKeys } from '@hexlabs/dynamo-ts';
import {
    ALL,
    AccessStorage,
    UserPreferencesDocument,
    WebPushUserDocument,
    SubscriptionDocument,
    RegisterSubscriptionDocument,
    RegisteredSubscriptionDocument,
    DeletedSubscriptionRemainder,
} from '../index';

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

const subscriptionByBrowserTable = defineTable(
    {
        owner: 'string',
        browserID: 'string',
        name: 'string',
    },
    'name',
    'browserID',
    {
        owner: {
            partitionKey: 'owner',
            sortKey: 'name',
        },
    },
);

const subscriptionsTable = defineTable(
    {
        owner: 'string',
        name: 'string',
        uno: 'string',
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
type SubscriptionByBrowserTable = typeof subscriptionByBrowserTable;
type SubscriptionsTable = typeof subscriptionsTable;
type WebPushUserTable = typeof webPushUserTable;

export class DynamoDBAccessStorage implements AccessStorage {
    private userPreferencesTableClient: TableClient<UserPreferencesTable>;
    private subscriptionTableClient: TableClient<SubscriptionsTable>;
    private subscriptionByBrowserTableClient: TableClient<SubscriptionByBrowserTable>;
    private webPushUserTableClient: TableClient<WebPushUserTable>;

    constructor(userPreferencesTableName: string, webPushUserTableName: string, subscriptionTableName: string, subscriptionByBrowserName: string) {
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

        this.subscriptionByBrowserTableClient = TableClient.build(subscriptionByBrowserTable, {
            client: client,
            logStatements: true,
            tableName: subscriptionByBrowserName,
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

    public findPushKeyForIdentity(principalId: string, browserID: string): Promise<WebPushUserDocument[]> {
        return new Promise<WebPushUserDocument[]>((resolve, reject) => {
            let query: QueryKeys<WebPushUserTable>;

            if (browserID === ALL) {
                query = {
                    owner: principalId,
                };
            } else {
                query = {
                    owner: principalId,
                    browserID: (sortKeys) => sortKeys.eq(browserID),
                };
            }

            this.webPushUserTableClient
                .queryAll(query)
                .then((result) => {
                    const docs: WebPushUserDocument[] = [];

                    result.member.forEach((item) => {
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

    public getSubscriptions(owner: string): Promise<RegisteredSubscriptionDocument[]> {
        return new Promise<RegisteredSubscriptionDocument[]>((resolve, reject) => {
            this.subscriptionTableClient
                .queryAll({
                    owner: owner,
                })
                .then((subscriptions) => {
                    const docs: RegisteredSubscriptionDocument[] = [];
                    const alls: Promise<RegisteredSubscriptionDocument>[] = [];

                    alls.push(
                        new Promise<RegisteredSubscriptionDocument>((resolve, reject) => {
                            subscriptions.member.forEach((item) => {
                                this.subscriptionByBrowserTableClient
                                    .queryAll(
                                        {
                                            name: item.name,
                                        },
                                        {
                                            filter: (filter) => filter().owner.eq(item.owner),
                                        },
                                    )
                                    .then((browsers) => {
                                        const doc: RegisteredSubscriptionDocument = {
                                            owner: item.owner,
                                            name: item.name,
                                            browserID: browsers.member.map((browser) => browser.browserID),
                                            subscription: JSON.parse(item.subscription),
                                            uno: item.uno,
                                            created: new Date(item.created),
                                            updated: new Date(item.updated),
                                        };
                                        resolve(doc);
                                    })
                                    .catch((e) => {
                                        reject(e);
                                    });
                            });
                        }),
                    );

                    Promise.allSettled(alls)
                        .then((results) => {
                            results.forEach((item) => {
                                if (item.status === 'fulfilled') {
                                    docs.push(item.value);
                                }
                            });
                        })
                        .catch((e) => {
                            reject(e);
                        });
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public getSubscription(owner: string, name: string): Promise<RegisteredSubscriptionDocument | null> {
        return new Promise<RegisteredSubscriptionDocument | null>((resolve, reject) => {
            this.subscriptionTableClient
                .get({
                    owner: owner,
                    name: name,
                })
                .then((results) => {
                    if (results.item) {
                        const item = results.item;

                        new Promise<string[]>((resolve, reject) => {
                            this.subscriptionByBrowserTableClient
                                .queryAll(
                                    {
                                        name: item.name,
                                    },
                                    {
                                        filter: (filter) => filter().owner.eq(item.owner),
                                    },
                                )
                                .then((browsers) => {
                                    resolve(browsers.member.map((browser) => browser.browserID));
                                })
                                .catch((e) => {
                                    reject(e);
                                });
                        })
                            .then((results) => {
                                resolve({
                                    owner: item.owner,
                                    name: item.name,
                                    browserID: results,
                                    subscription: JSON.parse(item.subscription),
                                    uno: item.uno,
                                    created: new Date(item.created),
                                    updated: new Date(item.updated),
                                });
                            })
                            .catch((e) => {
                                reject(e);
                            });
                    }

                    resolve(null);
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public storeSubscription(subscription: RegisterSubscriptionDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.subscriptionTableClient
                .get({
                    owner: subscription.owner,
                    name: subscription.name,
                })
                .then((result) => {
                    this.subscriptionTableClient
                        .update({
                            key: {
                                name: subscription.name,
                                owner: subscription.owner,
                            },
                            updates: {
                                uno: subscription.uno,
                                subscription: JSON.stringify(subscription.subscription),
                                updated: Date.now(),
                            },
                        })
                        .then((result) => {
                            this.subscriptionByBrowserTableClient
                                .query(
                                    {
                                        browserID: (sortKey) => sortKey.eq(subscription.browserID),
                                        name: subscription.name,
                                    },
                                    {
                                        filter: (compare) => compare().owner.eq(subscription.owner),
                                    },
                                )
                                .then((found) => {
                                    if (found.member.length == 0) {
                                        this.subscriptionByBrowserTableClient
                                            .put({
                                                browserID: subscription.browserID,
                                                name: subscription.name,
                                                owner: subscription.owner,
                                            })
                                            .then(() => {
                                                resolve();
                                            })
                                            .catch((e) => {
                                                reject(e);
                                            });
                                    } else {
                                        resolve();
                                    }
                                })
                                .catch((e) => {
                                    reject(e);
                                });
                        })
                        .catch((e) => {
                            reject(e);
                        });
                })
                .catch((e) => {
                    const now = Date.now();

                    this.subscriptionTableClient
                        .put(
                            {
                                owner: subscription.owner,
                                uno: subscription.uno,
                                name: subscription.name,
                                subscription: JSON.stringify(subscription.subscription),
                                created: now,
                                updated: now,
                            },
                            {
                                returnValues: 'NONE',
                            },
                        )
                        .then((result) => {
                            this.subscriptionByBrowserTableClient
                                .put({
                                    owner: subscription.owner,
                                    name: subscription.name,
                                    browserID: subscription.browserID,
                                })
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
                });
        });
    }

    public deleteSubscription(owner: string, name: string, browserID: string): Promise<DeletedSubscriptionRemainder> {
        return new Promise<DeletedSubscriptionRemainder>((resolve, reject) => {
            if (browserID === ALL) {
                // TODO
            } else {
                this.subscriptionByBrowserTableClient
                    .delete(
                        {
                            browserID: browserID,
                            name: name,
                        },
                        {
                            condition: browserID === ALL ? undefined : (condition) => condition().owner.eq(owner),
                            returnValues: 'ALL_OLD',
                        },
                    )
                    .then((result) => {
                        // TODO
                    })
                    .catch((e) => {
                        reject(e);
                    });
            }

            this.subscriptionTableClient
                .delete(
                    {
                        owner: owner,
                        name: name,
                    },
                    {
                        condition: browserID === ALL ? undefined : (condition) => condition().browserID.eq(browserID),
                        returnValues: 'ALL_OLD',
                    },
                )
                .then((result) => {
                    if (result.item) {
                        const remains: DeletedSubscriptionRemainder = {
                            identifier: name,
                            remains: [],
                        };

                        if (browserID !== ALL) {
                            resolve(remains);
                        } else {
                            this.subscriptionTableClient
                                .queryAll({
                                    owner: owner,
                                    name: (sort) => sort.eq(name),
                                })
                                .then((values) => {
                                    values.member.forEach((item) => {
                                        remains.remains?.push(item.browserID);
                                    });

                                    resolve(remains);
                                })
                                .catch((e) => {
                                    reject(e);
                                });
                        }
                    } else {
                        reject(new Error('Not found'));
                    }
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }
}
