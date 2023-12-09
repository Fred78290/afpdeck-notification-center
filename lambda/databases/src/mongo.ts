/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { ConnectOptions } from 'mongoose';
import url from 'url';
import {
    ALL,
    AccessStorage,
    UserPreferencesDocument,
    WebPushUserDocument,
    SubscriptionDocument,
    DeletedSubscriptionRemainder,
    DatabaseError,
    ERROR_RESOURCE_NOTFOUND,
    ERROR_DATABASE_NOTCONNECTED,
} from '../index';

interface SubscriptionByBrowser {
    name: string;
    owner: string;
    browserID: string;
}

const UserPreferencesSchema = new mongoose.Schema<UserPreferencesDocument>({
    name: { type: String, required: true, index: true },
    owner: { type: String, required: true, index: true },
    updated: { type: Date, required: true },
    preferences: { type: mongoose.Schema.Types.Mixed, required: true },
});

const SubscriptionSchema = new mongoose.Schema<SubscriptionDocument>({
    name: { type: String, required: true, index: true },
    owner: { type: String, required: true, index: true },
    uno: { type: String, required: true },
    browserID: { type: [String], required: true },
    updated: { type: Date, required: true },
    created: { type: Date, required: true },
    subscription: {
        query: { type: mongoose.Schema.Types.Mixed },
        dontDisturb: {
            type: Boolean,
            required: true,
        },
        langues: {
            type: Array<string>,
            required: true,
        },
        quietTime: {
            endTime: { type: String },
            startTime: { type: String },
            tz: { type: String },
        },
    },
});

const WebPushUserSchema = new mongoose.Schema<WebPushUserDocument>({
    owner: { type: String, required: true, index: true },
    browserID: { type: String, required: true, index: true },
    updated: { type: Date, required: true },
    created: { type: Date, required: true },
    apiKeys: {
        publicKey: { type: String, required: true },
        privateKey: { type: String, required: true },
    },
    subscription: {
        endpoint: { type: String, required: true },
        keys: {
            p256dh: {
                type: String,
                required: true,
            },
            auth: {
                type: String,
                required: true,
            },
        },
    },
});

export class MongoDBAccessStorage implements AccessStorage {
    private mongoURL: string;
    private connection: mongoose.Connection | undefined;
    private userPreferencesCollection: string;
    private webPushUserCollection: string;
    private subscriptionCollection: string;
    private webPushUserModel: mongoose.Model<WebPushUserDocument> | undefined;
    private subscriptionModel: mongoose.Model<SubscriptionDocument> | undefined;
    private userPreferencesModel: mongoose.Model<UserPreferencesDocument> | undefined;

    constructor(mongoURL: string, userPreferencesCollection: string, webPushUserCollection: string, subscriptionCollection: string) {
        this.mongoURL = mongoURL;
        this.userPreferencesCollection = userPreferencesCollection;
        this.webPushUserCollection = webPushUserCollection;
        this.subscriptionCollection = subscriptionCollection;
    }

    disconnect(): Promise<void> {
        if (this.connection) {
            return this.connection?.close(true);
        }

        return Promise.resolve();
    }

    connect(): Promise<AccessStorage> {
        return new Promise<AccessStorage>((resolve, reject) => {
            const mongodbURL = new url.URL(this.mongoURL);
            const options: ConnectOptions = {
                autoCreate: true,
            };

            if (mongodbURL.protocol === 'mongodb:') {
                const dbName = mongodbURL.searchParams.get('dbname');

                if (dbName) {
                    options.dbName = dbName;
                    mongodbURL.searchParams.delete('dbname');
                }
            }

            mongoose
                .createConnection(mongodbURL.toString(), options)
                .asPromise()
                .then((m) => {
                    this.connection = m;
                    this.webPushUserModel = m.model<WebPushUserDocument>('WebPushUser', WebPushUserSchema, this.webPushUserCollection);
                    this.userPreferencesModel = m.model<UserPreferencesDocument>('UserPreferences', UserPreferencesSchema, this.userPreferencesCollection);
                    this.subscriptionModel = m.model<SubscriptionDocument>('Subscription', SubscriptionSchema, this.subscriptionCollection);
                    resolve(this);
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public storeUserPreferences(document: UserPreferencesDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.userPreferencesModel) {
                const doc = new this.userPreferencesModel(document);

                this.userPreferencesModel
                    .findOneAndUpdate(
                        {
                            owner: document.owner,
                            name: document.name,
                        },
                        {
                            preferences: document.preferences,
                            updated: new Date(),
                        },
                    )
                    .exec()
                    .then((updated) => {
                        if (updated) {
                            resolve();
                        } else {
                            doc.save()
                                .then(() => {
                                    resolve();
                                })
                                .catch((e: any) => {
                                    reject(e);
                                });
                        }
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public getUserPreferences(principalId: string): Promise<UserPreferencesDocument[] | null> {
        return new Promise<UserPreferencesDocument[] | null>((resolve, reject) => {
            if (this.userPreferencesModel) {
                this.userPreferencesModel
                    .find(
                        {
                            owner: principalId,
                        },
                        {
                            _id: 0,
                            __v: 0,
                        },
                    )
                    .exec()
                    .then((found) => {
                        resolve(found);
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public getUserPreference(principalId: string, name: string): Promise<UserPreferencesDocument | null> {
        return new Promise<UserPreferencesDocument | null>((resolve, reject) => {
            if (this.userPreferencesModel) {
                this.userPreferencesModel
                    .findOne(
                        {
                            owner: principalId,
                            name: name,
                        },
                        {
                            _id: 0,
                            __v: 0,
                        },
                    )
                    .exec()
                    .then((found) => {
                        resolve(found);
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public deleteUserPreferences(principalId: string, name: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.userPreferencesModel) {
                this.userPreferencesModel
                    .deleteMany(
                        name === ALL
                            ? {
                                  owner: principalId,
                              }
                            : {
                                  owner: principalId,
                                  name: name,
                              },
                    )
                    .exec()
                    .then((result) => {
                        if (result.acknowledged) {
                            resolve();
                        } else {
                            reject(new DatabaseError(404, ERROR_RESOURCE_NOTFOUND));
                        }
                    })
                    .catch((e: any) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public findPushKeyForIdentity(principalId: string, browserID: string[]): Promise<WebPushUserDocument[]> {
        return new Promise<WebPushUserDocument[]>((resolve, reject) => {
            if (this.webPushUserModel) {
                const filter = browserID.includes(ALL)
                    ? {
                          owner: principalId,
                      }
                    : {
                          owner: principalId,
                          browserID: browserID,
                      };

                this.webPushUserModel
                    .find(filter, { _id: 0, __v: 0 })
                    .exec()
                    .then((results) => {
                        if (results) {
                            resolve(results);
                        } else {
                            resolve([]);
                        }
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public storeWebPushUserDocument(document: WebPushUserDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.webPushUserModel) {
                const doc = new this.webPushUserModel(document);

                doc.save()
                    .then(() => {
                        resolve();
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public updateWebPushUserDocument(document: WebPushUserDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.webPushUserModel) {
                this.webPushUserModel
                    .findOneAndUpdate(
                        {
                            owner: document.owner,
                            browserID: document.browserID,
                        },
                        {
                            apiKeys: document.apiKeys,
                            subscription: document.subscription,
                            updated: new Date(),
                        },
                        {
                            new: true,
                        },
                    )
                    .exec()
                    .then(() => {
                        resolve();
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public deleteWebPushUserDocument(principalId: string, browserID: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.webPushUserModel) {
                this.webPushUserModel
                    .deleteMany(
                        browserID === ALL
                            ? {
                                  owner: principalId,
                              }
                            : {
                                  owner: principalId,
                                  browserID: browserID,
                              },
                    )
                    .exec()
                    .then((results) => {
                        resolve();
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public getSubscriptions(owner: string): Promise<SubscriptionDocument[]> {
        return new Promise<SubscriptionDocument[]>((resolve, reject) => {
            if (this.subscriptionModel) {
                this.subscriptionModel
                    .find(
                        {
                            owner: owner,
                        },
                        {
                            _id: 0,
                            __v: 0,
                        },
                    )
                    .exec()
                    .then((results) => {
                        resolve(results);
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public getSubscription(owner: string, name: string): Promise<SubscriptionDocument | null> {
        return new Promise<SubscriptionDocument | null>((resolve, reject) => {
            if (this.subscriptionModel) {
                this.subscriptionModel
                    .findOne(
                        {
                            owner: owner,
                            name: name,
                        },
                        {
                            _id: 0,
                            __v: 0,
                        },
                    )
                    .exec()
                    .then((item) => {
                        resolve(item);
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public storeSubscription(subscription: SubscriptionDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.subscriptionModel) {
                this.subscriptionModel
                    .findOne({
                        owner: subscription.owner,
                        name: subscription.name,
                    })
                    .exec()
                    .then((item) => {
                        if (this.subscriptionModel) {
                            let saveIt = false;

                            if (item) {
                                const browserIDs = item.browserID;

                                for (const id of subscription.browserID) {
                                    if (!browserIDs.includes(id)) {
                                        browserIDs.push(id);
                                        saveIt = true;
                                    }
                                }
                            } else {
                                item = new this.subscriptionModel(subscription);
                                saveIt = true;
                            }

                            if (saveIt) {
                                item.save()
                                    .then(() => {
                                        resolve();
                                    })
                                    .catch((e: any) => {
                                        reject(e);
                                    });
                            } else {
                                resolve();
                            }
                        }
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }

    public deleteSubscription(owner: string, name: string, browserID: string): Promise<DeletedSubscriptionRemainder> {
        return new Promise<DeletedSubscriptionRemainder>((resolve, reject) => {
            if (this.subscriptionModel) {
                this.subscriptionModel
                    .findOne({
                        owner: owner,
                        name: name,
                    })
                    .exec()
                    .then((item) => {
                        if (item && this.subscriptionModel) {
                            item.browserID = item.browserID.filter((value) => value !== browserID);

                            if (item.browserID.length > 0) {
                                item.updateOne()
                                    .then(() => {
                                        resolve({
                                            identifier: name,
                                            remains: item.browserID,
                                        });
                                    })
                                    .catch((e: any) => {
                                        reject(e);
                                    });
                            } else {
                                this.subscriptionModel
                                    ?.deleteOne({
                                        owner: owner,
                                        name: name,
                                    })
                                    .exec()
                                    .then(() => {
                                        resolve({
                                            identifier: name,
                                            remains: [],
                                        });
                                    })
                                    .catch((e) => {
                                        reject(e);
                                    });
                            }
                        } else {
                            reject(new DatabaseError(404, ERROR_DATABASE_NOTCONNECTED));
                        }
                    })
                    .catch((e: any) => {
                        reject(e);
                    });
            } else {
                reject(new DatabaseError(500, ERROR_DATABASE_NOTCONNECTED));
            }
        });
    }
}
