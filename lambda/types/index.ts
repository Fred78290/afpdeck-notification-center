import { RegisteredSubscription } from 'afp-apicore-sdk/dist/types';
import { UserPreference, WebPushUserDocument } from '../databases';

export interface CommonResponse {
    response: {
        status: {
            code: number;
            reason: string;
        };
    };
}

export interface UserPreferenceResponse {
    response: {
        preferences: UserPreference | undefined;
        status: {
            code: number;
            reason: string;
        };
    };
}

export interface UserPreferencesResponse {
    response: {
        preferences: UserPreference[] | undefined;
        status: {
            code: number;
            reason: string;
        };
    };
}

export interface RegisterSubscriptionsResponse extends CommonResponse {
    response: {
        uno: string;
        status: {
            code: number;
            reason: string;
        };
    };
}

export interface DeleteSubscriptionsResponse extends CommonResponse {
    response: {
        name: string;
        status: {
            code: number;
            reason: string;
        };
    };
}

export interface ListSubscriptionsResponse extends CommonResponse {
    response: {
        subscriptions: RegisteredSubscription[] | undefined | null;
        status: {
            code: number;
            reason: string;
        };
    };
}

export interface GetSubscriptionResponse extends CommonResponse {
    response: {
        subscription: RegisteredSubscription | undefined | null;
        status: {
            code: number;
            reason: string;
        };
    };
}

export interface WebPushUserKeyResponse extends CommonResponse {
    response: {
        keys: WebPushUserDocument[] | undefined | null;
        status: {
            code: number;
            reason: string;
        };
    };
}

export interface WebPushNoticationData {
    name: string;
    uno: string;
    isFree: boolean;
    title: string | undefined;
    text: string | undefined;
    headline: string | undefined;
    urgency: string | number;
    class: string;
    contentCreated: string;
    providerid: string;
    lang: string;
    genreid: string | undefined;
    wordCount: string | number | undefined;
    guid: string;
    abstract: string | undefined;
    documentURL: string | undefined;
    thumbnailURL: string | undefined;
    thumbnail: string | undefined;
}

export interface WebPushNotication {
    visitorID: string;
    userName: string;
    payload: WebPushNoticationData[];
}
