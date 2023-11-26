import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import database, { parseBoolean } from './databases';
import { handleError, HttpError, AfpDeckNotificationCenterHandler } from './app';

let handler: AfpDeckNotificationCenterHandler;

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */
export const apiHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        if (!handler) {
            if (
                process.env.APICORE_BASE_URL &&
                process.env.APICORE_CLIENT_ID &&
                process.env.APICORE_CLIENT_SECRET &&
                process.env.APICORE_SERVICE_USERNAME &&
                process.env.APICORE_SERVICE_PASSWORD &&
                process.env.AFPDECK_PUSH_URL &&
                process.env.APICORE_PUSH_USERNAME &&
                process.env.APICORE_PUSH_PASSWORD
            ) {
                handler = new AfpDeckNotificationCenterHandler(
                    await database(
                        parseBoolean(process.env.USE_MONGODB),
                        process.env.MONGODB_URL,
                        process.env.USERPREFS_TABLENAME,
                        process.env.WEBPUSH_TABLE_NAME,
                        process.env.SUBSCRIPTIONS_TABLE_NAME,
                    ),
                    {
                        debug: parseBoolean(event.queryStringParameters?.debug) || parseBoolean(process.env.DEBUG),
                        apicoreBaseURL: process.env.APICORE_BASE_URL,
                        clientID: process.env.APICORE_CLIENT_ID,
                        clientSecret: process.env.APICORE_CLIENT_SECRET,
                        afpDeckPushURL: process.env.AFPDECK_PUSH_URL,
                        apicorePushUserName: process.env.APICORE_PUSH_USERNAME,
                        apicorePushPassword: process.env.APICORE_PUSH_PASSWORD,
                        useSharedService: parseBoolean(process.env.APICORE_USE_SHAREDSERVICE),
                        serviceUserName: process.env.APICORE_SERVICE_USERNAME,
                        servicePassword: process.env.APICORE_SERVICE_PASSWORD,
                    },
                );
            } else {
                throw new HttpError('Missing AFPDECK_PUSH_URL or APICORE_PUSH_USERNAME or APICORE_PUSH_PASSWORD... env vars', 500);
            }
        }

        return handler.handleEvent(event);
    } catch (e) {
        return handleError(e);
    }
};
