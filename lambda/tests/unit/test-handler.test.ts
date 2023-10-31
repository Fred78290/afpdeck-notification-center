import { APIGatewayProxyEvent, APIGatewayProxyResult, APIGatewayRequestAuthorizerEvent, APIGatewayAuthorizerWithContextResult, APIGatewayAuthorizerResult, APIGatewayAuthorizerResultContext } from 'aws-lambda';
import { apiHandler } from '../../app';
import { authHandler } from '../../authorizer';
import { expect, describe, it } from '@jest/globals';
import * as dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/../../configs/.env' });

describe('Unit test for app handler', function () {
    it('verifies successful auth', async () => {
        const authorization: string = 'Basic YWZwZGVjazpBQUQxOEQxMi1DQUYxLTRERkItOTBBMS00OUM2Q0IyRkI4MkM=';
        const event: APIGatewayRequestAuthorizerEvent = {
            type: 'REQUEST',
            httpMethod: 'get',
            methodArn: '',
            resource: 'abcdef',
            path: '/hello',
            headers: {
                Authorization: 'Basic YWZwZGVjazpBQUQxOEQxMi1DQUYxLTRERkItOTBBMS00OUM2Q0IyRkI4MkM=',
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
        const context: APIGatewayAuthorizerWithContextResult<APIGatewayAuthorizerResultContext> = {
            principalId: '1234567',
            policyDocument: {
                Version: '2012-10-17',
                Statement: [],
            },
            context: {
                stringKey: '1234',
            },
        };

        const result: APIGatewayAuthorizerResult = await authHandler(event, context);

        expect(result).toEqual({
            principalId: context.principalId,
            context: context.context,
            policyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Action: 'execute-api:Invoke',
                        Effect: 'Allow',
                        Resource: event.resource,
                    },
                ],
            },
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
