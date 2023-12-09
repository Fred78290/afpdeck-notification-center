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
        subscriptions: RegisteredSubscription[] | undefined;
        status: {
            code: number;
            reason: string;
        };
    };
}

export interface WebPushUserKeyResponse extends CommonResponse {
    response: {
        keys: WebPushUserDocument[] | undefined;
        status: {
            code: number;
            reason: string;
        };
    };
}
