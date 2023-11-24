/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import { ALL_BROWSERS, AccessStorage, UserPreferencesDocument, WebPushUserDocument, SubscriptionDocument } from '../index';

const UserPreferencesSchema = new mongoose.Schema<UserPreferencesDocument>({
    name: { type: String, required: true, index: true },
    owner: { type: String, required: true, index: true },
    updated: { type: Date, required: true },
    preferences: { type: mongoose.Schema.Types.Mixed, required: true },
});

const SubscriptionSchema = new mongoose.Schema<SubscriptionDocument>({
    name: { type: String, required: true, index: true },
    owner: { type: String, required: true, index: true },
    browserID: { type: String, required: true, index: true },
    uno: { type: String, required: true },
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
            mongoose
                .createConnection(this.mongoURL, { autoCreate: true })
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

                doc.save()
                    .then(() => {
                        resolve();
                    })
                    .catch((e: any) => {
                        reject(e);
                    });
            } else {
                reject(new Error('Not connected'));
            }
        });
    }

    public getUserPreferences(principalId: string, name: string): Promise<UserPreferencesDocument> {
        return new Promise<UserPreferencesDocument>((resolve, reject) => {
            if (this.userPreferencesModel) {
                this.userPreferencesModel
                    .findOne({
                        owner: principalId,
                        name: name,
                    })
                    .exec()
                    .then((result) => {
                        if (result != null) {
                            resolve(result);
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

    public findPushKeyForIdentity(principalId: string, browserID: string): Promise<WebPushUserDocument[]> {
        return new Promise<WebPushUserDocument[]>((resolve, reject) => {
            if (this.webPushUserModel) {
                const filter =
                    browserID === ALL_BROWSERS
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
                const doc = new this.webPushUserModel(document);

                this.webPushUserModel
                    .findOneAndUpdate(
                        {
                            owner: document.owner,
                            browserID: document.browserID,
                        },
                        doc,
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

    public getSubscriptions(owner: string, name: string): Promise<SubscriptionDocument[]> {
        return new Promise<SubscriptionDocument[]>((resolve, reject) => {
            if (this.subscriptionModel) {
                this.subscriptionModel
                    .find({
                        owner: owner,
                        name: name,
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

    public storeSubscription(subscription: SubscriptionDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.subscriptionModel) {
                const doc = new this.subscriptionModel(subscription);

                doc.save()
                    .then(() => {
                        resolve();
                    })
                    .catch((e: any) => {
                        reject(e);
                    });
            } else {
                reject(new Error('Not connected'));
            }
        });
    }

    public deleteSubscription(owner: string, name: string, browserID: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.subscriptionModel) {
                this.subscriptionModel
                    .findOneAndDelete({
                        owner: owner,
                        name: String,
                        browserID: browserID,
                    })
                    .exec()
                    .then(() => {
                        resolve();
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
