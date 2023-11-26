import { APIGatewayRequestAuthorizerEvent, Context, APIGatewayAuthorizerResult } from 'aws-lambda';
import { Authorizer } from './app';
import { parseBoolean } from './databases/index';

let handler: Authorizer;

export const authHandler = async (event: APIGatewayRequestAuthorizerEvent, context?: Context): Promise<APIGatewayAuthorizerResult> => {
    if (!handler) {
        if (process.env.APICORE_BASE_URL && process.env.APICORE_CLIENT_ID && process.env.APICORE_CLIENT_SECRET && process.env.APICORE_PUSH_USERNAME && process.env.APICORE_PUSH_PASSWORD) {
            handler = new Authorizer({
                debug: parseBoolean(process.env.DEBUG),
                apicoreBaseURL: process.env.APICORE_BASE_URL,
                clientID: process.env.APICORE_CLIENT_ID,
                clientSecret: process.env.APICORE_CLIENT_SECRET,
                pushUserName: process.env.APICORE_PUSH_USERNAME,
                pushPassword: process.env.APICORE_PUSH_PASSWORD,
            });
        } else {
            throw new Error('Missing env vars');
        }
    }

    return handler.authorize(event, context);
};
