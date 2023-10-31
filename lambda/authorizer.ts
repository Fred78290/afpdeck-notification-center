import {
    APIGatewayRequestAuthorizerEvent,
    APIGatewayAuthorizerWithContextResult,
    APIGatewayAuthorizerResult,
    APIGatewayAuthorizerResultContext,
} from 'aws-lambda';
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

export const authHandler = async (
    event: APIGatewayRequestAuthorizerEvent,
    context: APIGatewayAuthorizerWithContextResult<APIGatewayAuthorizerResultContext>,
): Promise<APIGatewayAuthorizerResult> => {
    const USERNAME = process.env.USERNAME;
    const PASSWORD = process.env.PASSWORD;

    console.log(event);
    console.log(context);

    const result: APIGatewayAuthorizerResult = {
        principalId: context.principalId,
        context: context.context,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: 'Deny',
                    Resource: event.methodArn,
                },
            ],
        },
    };

    try {
        const authorization = findAuthorization(event);

        if (authorization) {
            const token = parse(authorization);

            if (token.scheme.toLowerCase() === 'basic' && token.token) {
                const encode: string = Array.isArray(token.token) ? token.token[0] : token.token;
                const [username, password] = base64decode(encode).split(':', 2);

                if (username === USERNAME && password === PASSWORD) {
                    result.policyDocument.Statement[0].Effect = 'Allow';
                }
            }
        }
    } catch (err) {
        console.log(err);
    }

    return result;
};
