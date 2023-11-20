import { APIGatewayRequestAuthorizerEvent, Context, APIGatewayAuthorizerResult } from 'aws-lambda';
import ApiCore from 'afp-apicore-sdk';
import { parse } from 'auth-header';
import { base64decode } from 'nodejs-base64';

function findAuthorization(req: APIGatewayRequestAuthorizerEvent): string | undefined {
    if (req.headers) {
        const keys = Object.keys(req.headers);
        const key = keys.find((k) => k.toLowerCase() === 'authorization');

        if (key) {
            return req.headers[key];
        }
    }

    return undefined;
}

export const authHandler = async (event: APIGatewayRequestAuthorizerEvent, context?: Context): Promise<APIGatewayAuthorizerResult> => {
    const debug = process.env.DEBUG_LAMBDA ? process.env.DEBUG_LAMBDA === 'true' : false;
    const methodArn = event.methodArn.substring(0, event.methodArn.indexOf('/')) + '/*/*/*';

    if (debug) {
        console.log(event);
        console.log(context);
    }

    const result: APIGatewayAuthorizerResult = {
        principalId: 'unknown',
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: 'Deny',
                    Resource: methodArn,
                },
            ],
        },
    };

    try {
        const authorization = findAuthorization(event);

        if (authorization) {
            const token = parse(authorization);
            const apicore = new ApiCore({
                baseUrl: process.env.APICORE_BASE_URL,
                clientId: process.env.APICORE_CLIENT_ID,
                clientSecret: process.env.APICORE_CLIENT_SECRET,
            });

            if (token.scheme.toLowerCase() === 'basic' && token.token) {
                const encode: string = Array.isArray(token.token) ? token.token[0] : token.token;
                const [username, password] = base64decode(encode).split(':', 2);

                if (event.resource.startsWith('/push')) {
                    if (username === process.env.APICORE_PUSH_USERNAME && password === process.env.APICORE_PUSH_PASSWORD) {
                        result.principalId = username;
                        result.policyDocument.Statement[0].Effect = 'Allow';
                        result.context = {
                            username: username,
                            authToken: encode,
                        };
                    } else {
                        console.log(`Not authorized: ${username}`);
                    }
                } else {
                    const authToken = await apicore.authenticate({ username, password });

                    if (authToken.authType === 'credentials') {
                        result.principalId = username;
                        result.policyDocument.Statement[0].Effect = 'Allow';
                        result.context = {
                            username: username,
                            ...authToken,
                        };
                    } else if (debug) {
                        console.log(`Not authorized: ${username}`);
                    }
                }
            } else if (token.scheme.toLowerCase() === 'bearer' && token.token) {
                const encode: string = Array.isArray(token.token) ? token.token[0] : token.token;
                const { username } = await apicore.checkToken(encode);

                result.principalId = username;
                result.policyDocument.Statement[0].Effect = 'Allow';
                result.context = {
                    username: username,
                    accessToken: encode,
                };
            } else if (debug) {
                console.debug(`Unsupported scheme: ${token.scheme} or token is undefined`);
            }
        } else if (debug) {
            console.debug('authorization header not found');
        }
    } catch (err) {
        console.error(err);
    }

    if (debug) {
        console.log(JSON.stringify(result));
    }

    return result;
};
