/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import { ALL_BROWSERS, AccessStorage, UserPreferencesDocument, WebPushUserDocument, SubscriptionDocument } from '../index';
import { Request, QuietTime } from 'afp-apicore-sdk/dist/types';
import { VapidKeys, PushSubscription } from 'web-push';

const DEFAULT_WEBPUSH_COLLECTION = 'afpdeck-webpush';
const DEFAULT_SUBSCRIPTIONS_COLLECTION = 'afpdeck-subscriptions';
const DEFAULT_USERPREFS_COLLECTION = 'afpdeck-preferences';

const UserPreferencesSchema = new mongoose.Schema<UserPreferencesDocument>({
    name: { type: String, required: true, index: true },
    owner: { type: String, required: true, index: true },
    updated: { type: Date, required: true },
    preferences: { type: mongoose.Schema.Types.Mixed, required: true },
});

const RequestSchema = new mongoose.Schema<Request>({
    name: { type: String },
    value: { type: mongoose.Schema.Types.Mixed },
    in: { type: Array<string | number> },
    exclude: { type: Array<string | number> },
    and: { type: mongoose.Schema.Types.Mixed },
    or: { type: mongoose.Schema.Types.Mixed },
});

const QuietTimeSchema = new mongoose.Schema<QuietTime>({
    endTime: { type: String },
    startTime: { type: String },
    tz: { type: String },
});

const SubscriptionSchema = new mongoose.Schema<SubscriptionDocument>({
    name: { type: String, required: true, index: true },
    owner: { type: String, required: true, index: true },
    browserID: { type: String, required: true, index: true },
    uno: { type: String, required: true },
    updated: { type: Date, required: true },
    created: { type: Date, required: true },
    subscription: {
        query: RequestSchema,
        dontDisturb: {
            type: Boolean,
            required: true,
        },
        langues: {
            type: Array<string>,
            required: true,
        },
        quietTime: QuietTimeSchema,
    },
});

const VapidKeysSchema = new mongoose.Schema<VapidKeys>({
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true },
});

const PushSubscriptionSchema = new mongoose.Schema<PushSubscription>({
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
});

const WebPushUserSchema = new mongoose.Schema<WebPushUserDocument>({
    owner: { type: String, required: true, index: true },
    browserID: { type: String, required: true, index: true },
    updated: { type: Date, required: true },
    created: { type: Date, required: true },
    apiKeys: VapidKeysSchema,
    subscription: PushSubscriptionSchema,
});

export class MongoDBAccessStorage implements AccessStorage {
    private mongoURL: string;
    private connection: mongoose.Connection;
    private userPreferencesCollection: string;
    private webPushUserCollection: string;
    private subscriptionCollection: string;
    private webPushUserModel: mongoose.Model<WebPushUserDocument>;
    private subscriptionModel = mongoose.Model<SubscriptionDocument>;
    private userPreferencesModel = mongoose.Model<UserPreferencesDocument>;

    constructor(mongoURL: string, userPreferencesCollection?: string, webPushUserCollection?: string, subscriptionCollection?: string) {
        this.mongoURL = mongoURL;
        this.userPreferencesCollection = userPreferencesCollection ?? DEFAULT_SUBSCRIPTIONS_COLLECTION;
        this.webPushUserCollection = webPushUserCollection ?? DEFAULT_WEBPUSH_COLLECTION;
        this.subscriptionCollection = subscriptionCollection ?? DEFAULT_USERPREFS_COLLECTION;

        this.connection = mongoose.createConnection(this.mongoURL, { autoCreate: true });
        this.webPushUserModel = mongoose.model<WebPushUserDocument>('WebPushUser', WebPushUserSchema, this.webPushUserCollection);
        this.userPreferencesModel = mongoose.model<UserPreferencesDocument>('UserPreferences', UserPreferencesSchema, this.userPreferencesCollection);
        this.subscriptionModel = mongoose.model<SubscriptionDocument>('Subscription', SubscriptionSchema, this.subscriptionCollection);
    }

    public storeUserPreferences(document: UserPreferencesDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const doc = new this.userPreferencesModel(document);

            doc.save()
                .then(() => {
                    resolve();
                })
                .catch((e: any) => {
                    reject(e);
                });
        });
    }

    public getUserPreferences(principalId: string, name: string): Promise<UserPreferencesDocument> {
        return new Promise<UserPreferencesDocument>((resolve, reject) => {
            this.userPreferencesModel
                .findOne({
                    owner: principalId,
                    name: name,
                })
                .exec()
                .then((result) => {
                    resolve(result);
                })
                .catch((e: any) => {
                    reject(e);
                });
        });
    }

    public findPushKeyForIdentity(principalId: string, browserID: string): Promise<WebPushUserDocument[]> {
        return new Promise<WebPushUserDocument[]>((resolve, reject) => {
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
        });
    }

    public storeWebPushUserDocument(document: WebPushUserDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const doc = new this.webPushUserModel(document);

            doc.save()
                .then(() => {
                    resolve();
                })
                .catch((e) => {
                    reject(e);
                });
        });
    }

    public updateWebPushUserDocument(document: WebPushUserDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
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
        });
    }

    public getSubscriptions(owner: string, name: string): Promise<SubscriptionDocument[]> {
        return new Promise<SubscriptionDocument[]>((resolve, reject) => {
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
        });
    }

    public storeSubscription(subscription: SubscriptionDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const doc = new this.subscriptionModel(subscription);

            doc.save()
                .then(() => {
                    resolve();
                })
                .catch((e: any) => {
                    reject(e);
                });
        });
    }

    public deleteSubscription(owner: string, name: string, browserID: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
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
        });
    }
}
