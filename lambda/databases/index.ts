/* eslint-disable @typescript-eslint/no-explicit-any */
import { Subscription } from 'afp-apicore-sdk/dist/types';
import { VapidKeys, PushSubscription } from 'web-push';
import { DynamoDBAccessStorage } from './src/dynamodb';
import { MongoDBAccessStorage } from './src/mongo';

export const ALL_BROWSERS = 'all';

export interface UserPreferencesDocument {
    owner: string;
    name: string;
    preferences: unknown;
    updated: Date;
}

export interface SubscriptionDocument {
    owner: string;
    name: string;
    uno: string;
    browserID: string;
    subscription: Subscription;
    created: Date;
    updated: Date;
}

export interface WebPushUserDocument {
    owner: string;
    browserID: string;
    apiKeys: VapidKeys;
    subscription: PushSubscription;
    created: Date;
    updated: Date;
}

export interface AccessStorage {
    storeUserPreferences(document: UserPreferencesDocument): Promise<void>;
    getUserPreferences(principalId: string, name: string): Promise<UserPreferencesDocument>;

    findPushKeyForIdentity(principalId: string, browserID: string): Promise<WebPushUserDocument[]>;
    storeWebPushUserDocument(document: WebPushUserDocument): Promise<void>;
    updateWebPushUserDocument(document: WebPushUserDocument): Promise<void>;

    getSubscriptions(owner: string, name: string): Promise<SubscriptionDocument[]>;
    storeSubscription(subscription: SubscriptionDocument): Promise<void>;
    deleteSubscription(owner: string, name: string, browserID: string): Promise<void>;
}

export default function database(useMongoDB: boolean, mongoURL?: string): AccessStorage {
    if (useMongoDB) {
        if (mongoURL) {
            return new MongoDBAccessStorage(mongoURL, process.env.USERPREFS_TABLENAME, process.env.WEBPUSH_TABLE_NAME, process.env.SUBSCRIPTIONS_TABLE_NAME);
        } else {
            throw Error('Mongo URL not defined');
        }
    } else {
        return new DynamoDBAccessStorage(process.env.USERPREFS_TABLENAME, process.env.WEBPUSH_TABLE_NAME, process.env.SUBSCRIPTIONS_TABLE_NAME);
    }
}

export function parseBoolean(value?: string, defaultValue: boolean = false) {
    if (value) {
        return value.toLowerCase() === 'true';
    }

    return defaultValue;
}