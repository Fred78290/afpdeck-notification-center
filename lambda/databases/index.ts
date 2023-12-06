/* eslint-disable @typescript-eslint/no-explicit-any */
import { Subscription } from 'afp-apicore-sdk/dist/types';
import { VapidKeys, PushSubscription } from 'web-push';
import { DynamoDBAccessStorage } from './src/dynamodb';
import { MongoDBAccessStorage } from './src/mongo';

export const ALL = 'all';

const DEFAULT_WEBPUSH_TABLENAME = 'afpdeck-webpush';
const DEFAULT_SUBSCRIPTIONS_TABLENAME = 'afpdeck-subscriptions';
const DEFAULT_BROWSERID_TABLENAME = 'afpdeck-browserid';
const DEFAULT_USERPREFS_TABLENAME = 'afpdeck-preferences';

export interface UserPreferences {
    name: string;
    preferences: unknown;
}

export interface UserPreferencesDocument extends UserPreferences {
    owner: string;
    name: string;
    preferences: unknown;
    updated: Date;
}

export interface SubscriptionDocument {
    owner: string;
    name: string;
    uno: string;
    subscription: Subscription;
    created: Date;
    updated: Date;
}

export interface RegisterSubscriptionDocument extends SubscriptionDocument {
    browserID: string;
}

export interface RegisteredSubscriptionDocument extends SubscriptionDocument {
    browserID: string[];
}

export interface WebPushUserDocument {
    owner: string;
    browserID: string;
    apiKeys: VapidKeys;
    subscription: PushSubscription;
    created: Date;
    updated: Date;
}

export interface DeletedSubscriptionRemainder {
    identifier: string;
    remains?: string[];
}

export interface AccessStorage {
    connect(): Promise<AccessStorage>;
    disconnect(): Promise<void>;

    storeUserPreferences(document: UserPreferencesDocument): Promise<void>;
    getUserPreferences(principalId: string, name: string): Promise<UserPreferencesDocument[]>;
    deleteUserPreferences(principalId: string, name: string): Promise<void>;

    findPushKeyForIdentity(principalId: string, browserID: string): Promise<WebPushUserDocument[]>;
    storeWebPushUserDocument(document: WebPushUserDocument): Promise<void>;
    updateWebPushUserDocument(document: WebPushUserDocument): Promise<void>;
    deleteWebPushUserDocument(principalId: string, browserID: string): Promise<void>;

    getSubscriptions(owner: string): Promise<RegisteredSubscriptionDocument[]>;
    getSubscription(owner: string, name: string): Promise<RegisteredSubscriptionDocument | null>;
    storeSubscription(subscription: RegisterSubscriptionDocument): Promise<void>;
    deleteSubscription(owner: string, name: string, browserID: string): Promise<DeletedSubscriptionRemainder>;
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
            subscriptionByBrowserName ?? DEFAULT_BROWSERID_TABLENAME,
        );
    }

    return db.connect();
}

export function parseBoolean(value?: string, defaultValue: boolean = false) {
    if (value) {
        return value.toLowerCase() === 'true';
    }

    return defaultValue;
}
