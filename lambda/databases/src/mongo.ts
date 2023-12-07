/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { ConnectOptions } from 'mongoose';
import url from 'url';
import { ALL, AccessStorage, UserPreferencesDocument, WebPushUserDocument, SubscriptionDocument, DeletedSubscriptionRemainder } from '../index';

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
                reject(new Error('Not connected'));
            }
        });
    }

    public getUserPreferences(principalId: string, name: string): Promise<UserPreferencesDocument[]> {
        return new Promise<UserPreferencesDocument[]>((resolve, reject) => {
            if (this.userPreferencesModel) {
                this.userPreferencesModel
                    .find(
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
                    .then((results) => {
                        resolve(results);
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new Error('Not connected'));
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
                            reject(new Error('Not found'));
                        }
                    })
                    .catch((e: any) => {
                        reject(e);
                    });
            } else {
                reject(new Error('Not connected'));
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
                    .find(filter)
                    .exec()
                    .then((results) => {
                        resolve(results);
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new Error('Not connected'));
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
                reject(new Error('Not connected'));
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
                reject(new Error('Not connected'));
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
                reject(new Error('Not connected'));
            }
        });
    }

    public getSubscriptions(owner: string): Promise<SubscriptionDocument[]> {
        return new Promise<SubscriptionDocument[]>((resolve, reject) => {
            if (this.subscriptionModel) {
                this.subscriptionModel
                    .find({
                        owner: owner,
                    })
                    .exec()
                    .then((results) => {
                        resolve(results);
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new Error('Not connected'));
            }
        });
    }

    public getSubscription(owner: string, name: string): Promise<SubscriptionDocument | null> {
        return new Promise<SubscriptionDocument | null>((resolve, reject) => {
            if (this.subscriptionModel) {
                this.subscriptionModel
                    .findOne({
                        owner: owner,
                        name: name,
                    })
                    .exec()
                    .then((results) => {
                        if (results) {
                            resolve(results);
                        } else {
                            reject(new Error('Requested resource not found'));
                        }
                    })
                    .catch((e) => {
                        reject(e);
                    });
            } else {
                reject(new Error('Not connected'));
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
                            if (item) {
                                const browserIDs = item.browserID;

                                browserIDs.forEach((id) => {
                                    if (!subscription.browserID.includes(id)) {
                                        subscription.browserID.push(id);
                                    }
                                });
                            }

                            const doc = new this.subscriptionModel(subscription);

                            doc.isNew = item === null || item === undefined;

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
                reject(new Error('Not connected'));
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
                    .then((found) => {
                        const remains: DeletedSubscriptionRemainder = {
                            identifier: name,
                        };

                        if (found && this.subscriptionModel) {
                            found.browserID = found.browserID.filter((value) => value !== browserID);

                            if (found.browserID.length > 0) {
                                const doc = new this.subscriptionModel(found);

                                doc.updateOne()
                                    .then(() => {
                                        resolve({
                                            identifier: name,
                                            remains: found.browserID,
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
                                        });
                                    })
                                    .catch((e) => {
                                        reject(e);
                                    });
                            }
                        }

                        resolve(remains);
                    })
                    .catch((e: any) => {
                        reject(e);
                    });
            } else {
                reject(new Error('Not connected'));
            }
        });
    }
}
