import { APIGatewayProxyEvent, APIGatewayProxyResult, APIGatewayRequestAuthorizerEvent, Context, APIGatewayAuthorizerResult } from 'aws-lambda';
import { apiHandler } from '../../app';
import { authHandler } from '../../authorizer';
import { expect, describe, it } from '@jest/globals';
import * as dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/../../configs/.env' });

function btoa(str: string) {
    return Buffer.from(str).toString('base64');
}

describe('Unit test for app handler', function () {
    it('verifies successful auth', async () => {
        const base64 = btoa(`${process.env.APICORE_USERNAME}:${process.env.APICORE_PASSWORD}`);
        const authorization: string = `Basic ${base64}`;
        const methodArn = 'arn:aws:execute-api:eu-west-1:0123456789ABC:zqrih6yku6/api/GET/hello';
        const event: APIGatewayRequestAuthorizerEvent = {
            type: 'REQUEST',
            httpMethod: 'get',
            methodArn: methodArn,
            resource: 'abcdef',
            path: '/hello',
            headers: {
                Authorization: authorization,
            },
            multiValueHeaders: {
                Authorization: [authorization],
            },
            multiValueQueryStringParameters: {},
            pathParameters: {},
            queryStringParameters: {},
            stageVariables: {},
            requestContext: {
                accountId: '123456789012',
                apiId: '1234',
                authorizer: undefined,
                httpMethod: 'get',
                identity: {
                    accessKey: '',
                    accountId: '',
                    apiKey: '',
                    apiKeyId: '',
                    caller: '',
                    clientCert: {
                        clientCertPem: '',
                        issuerDN: '',
                        serialNumber: '',
                        subjectDN: '',
                        validity: { notAfter: '', notBefore: '' },
                    },
                    cognitoAuthenticationProvider: '',
                    cognitoAuthenticationType: '',
                    cognitoIdentityId: '',
                    cognitoIdentityPoolId: '',
                    principalOrgId: '',
                    sourceIp: '',
                    user: '',
                    userAgent: '',
                    userArn: '',
                },
                path: '/hello',
                protocol: 'HTTP/1.1',
                requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
                requestTimeEpoch: 1428582896000,
                resourceId: '123456',
                resourcePath: '/hello',
                stage: 'dev',
            },
        };

        const result: APIGatewayAuthorizerResult = await authHandler(event);

        expect(result.principalId).toEqual(process.env.APICORE_USERNAME);
        expect(result.context).toBeDefined();
        expect(result.context?.accessToken).toBeDefined();
        expect(result.context?.authType).toEqual('credentials');
        expect(result.context?.refreshToken).toBeDefined();
        expect(result.context?.tokenExpires).toBeDefined();
        expect(result.policyDocument).toEqual({
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: 'Allow',
                    Resource: methodArn.substring(0, methodArn.indexOf('/')) + '/*/*/*',
                },
            ],
        });
    });

    it('verifies successful response', async () => {
        const event: APIGatewayProxyEvent = {
            httpMethod: 'get',
            body: '',
            headers: {},
            isBase64Encoded: false,
            multiValueHeaders: {},
            multiValueQueryStringParameters: {},
            path: '/hello',
            pathParameters: {},
            queryStringParameters: {},
            requestContext: {
                accountId: '123456789012',
                apiId: '1234',
                authorizer: {},
                httpMethod: 'get',
                identity: {
                    accessKey: '',
                    accountId: '',
                    apiKey: '',
                    apiKeyId: '',
                    caller: '',
                    clientCert: {
                        clientCertPem: '',
                        issuerDN: '',
                        serialNumber: '',
                        subjectDN: '',
                        validity: { notAfter: '', notBefore: '' },
                    },
                    cognitoAuthenticationProvider: '',
                    cognitoAuthenticationType: '',
                    cognitoIdentityId: '',
                    cognitoIdentityPoolId: '',
                    principalOrgId: '',
                    sourceIp: '',
                    user: '',
                    userAgent: '',
                    userArn: '',
                },
                path: '/hello',
                protocol: 'HTTP/1.1',
                requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
                requestTimeEpoch: 1428582896000,
                resourceId: '123456',
                resourcePath: '/hello',
                stage: 'dev',
            },
            resource: '',
            stageVariables: {},
        };
        const result: APIGatewayProxyResult = await apiHandler(event);

        expect(result.statusCode).toEqual(200);
        expect(result.body).toEqual(
            JSON.stringify({
                message: 'Afpdeck Notification Center',
            }),
        );
    });
});
