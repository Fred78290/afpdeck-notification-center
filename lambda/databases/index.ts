/* eslint-disable @typescript-eslint/no-explicit-any */
import { Subscription } from 'afp-apicore-sdk/dist/types';
import { VapidKeys, PushSubscription } from 'web-push';
import { DynamoDBAccessStorage } from './src/dynamodb';
import { MongoDBAccessStorage } from './src/mongo';

export const ALL = 'all';

export const DEFAULT_WEBPUSH_TABLENAME = 'afpdeck-webpush';
export const DEFAULT_SUBSCRIPTIONS_TABLENAME = 'afpdeck-subscriptions';
export const DEFAULT_VISITORID_TABLENAME = 'afpdeck-visitor-id';
export const DEFAULT_USERPREFS_TABLENAME = 'afpdeck-preferences';
export const ERROR_RESOURCE_NOTFOUND = 'Requested resource not found';
export const ERROR_DATABASE_NOTCONNECTED = 'Database not connected';

export class DatabaseError extends Error {
    private _code: number;

    constructor(code: number, reason: string) {
        super(reason);
        this._code = code;
    }

    get code() {
        return this._code;
    }
}

export interface UserPreference {
    name: string;
    preferences: unknown;
}

export interface UserPreferencesDocument extends UserPreference {
    owner: string;
    name: string;
    preferences: unknown;
    updated: Date;
}

export interface SubscriptionDocument {
    owner: string;
    name: string;
    uno: string;
    visitorID: string[];
    subscription: Subscription;
    created: Date;
    updated: Date;
}

export interface WebPushUserDocument {
    owner: string;
    visitorID: string;
    apiKeys: VapidKeys;
    subscription: PushSubscription;
    created: Date;
    updated: Date;
}

export interface DeletedSubscriptionRemainder {
    identifier: string;
    remains: string[];
}

export interface AccessStorage {
    connect(): Promise<AccessStorage>;
    disconnect(): Promise<void>;

    storeUserPreferences(document: UserPreferencesDocument): Promise<void>;
    getUserPreference(principalId: string, name: string): Promise<UserPreferencesDocument | null>;
    getUserPreferences(principalId: string): Promise<UserPreferencesDocument[] | null>;
    deleteUserPreferences(principalId: string, name: string): Promise<void>;

    findPushKeyForIdentity(principalId: string, visitorID: string[]): Promise<WebPushUserDocument[]>;
    storeWebPushUserDocument(document: WebPushUserDocument): Promise<void>;
    updateWebPushUserDocument(document: WebPushUserDocument): Promise<void>;
    deleteWebPushUserDocument(principalId: string, visitorID: string): Promise<void>;

    getSubscriptions(owner: string): Promise<SubscriptionDocument[]>;
    getSubscription(owner: string, name: string): Promise<SubscriptionDocument | null>;
    storeSubscription(subscription: SubscriptionDocument): Promise<void>;
    deleteSubscription(owner: string, name: string, visitorID: string): Promise<DeletedSubscriptionRemainder>;
}

export default async function database(
    useMongoDB: boolean,
    mongoURL?: string,
    userPreferencesTableName?: string,
    webPushUserTableName?: string,
    subscriptionTableName?: string,
    subscriptionByBrowserName?: string,
): Promise<AccessStorage> {
    let db: AccessStorage;

    if (useMongoDB) {
        if (mongoURL) {
            db = new MongoDBAccessStorage(
                mongoURL,
                userPreferencesTableName ?? DEFAULT_USERPREFS_TABLENAME,
                webPushUserTableName ?? DEFAULT_WEBPUSH_TABLENAME,
                subscriptionTableName ?? DEFAULT_SUBSCRIPTIONS_TABLENAME,
            );
        } else {
            throw Error('Mongo URL not defined');
        }
    } else {
        db = new DynamoDBAccessStorage(
            userPreferencesTableName ?? DEFAULT_USERPREFS_TABLENAME,
            webPushUserTableName ?? DEFAULT_WEBPUSH_TABLENAME,
            subscriptionTableName ?? DEFAULT_SUBSCRIPTIONS_TABLENAME,
        );
    }

    return db.connect();
}
