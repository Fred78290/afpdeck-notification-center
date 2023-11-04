
import lambda from './lambda/index';
import express, { Request, Response, NextFunction } from "express";
import { APIGatewayProxyEvent, APIGatewayRequestAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';

console.log(process.env)

const app = express();

const LISTEN_PORT = process.env.LISTEN_PORT || 8080;

interface LambdaRequest extends Request {
	context?: APIGatewayAuthorizerResult;
}

class HttpError extends Error {
	private _status: number

	constructor(msg: string, status: number) {
		super(msg)

		this._status = status
	}

	public get status(): number {
		return this._status
	}
}

function checkAuth(request: LambdaRequest, response: Response, next: NextFunction) {
	const { headers, multiValueHeaders } = buildHeaders(request);
	const event = {
		type: 'REQUEST',
		httpMethod: request.method,
		headers: headers,
		multiValueHeaders: multiValueHeaders,
		path: request.path,
		pathParameters: request.params,
		multiValueQueryStringParameters: null,
		stageVariables: null,
		methodArn: `arn:aws:execute-api:eu-west-1:0123456789ABC:zqrih6yku6/api/${request.method}/${request.path}`
	} as APIGatewayRequestAuthorizerEvent

	lambda.auth(event).then(result => {
		if (result.policyDocument.Statement[0].Effect !== 'Allow') {
			return next(new HttpError('Not authorized! Go back!', 401));
		}

		request.context = result;

		return next()
	}).catch(e => {
		return next(new HttpError(JSON.stringify(e), 500));
	});
}

function handleRequest(request: LambdaRequest, response: Response, next: NextFunction) {
	const event = requestToEvent(request)

	lambda.api(event).then(result => {
		if (result.headers)
			response.set(result.headers);

		response.status(result.statusCode).send(JSON.parse(result.body));
	});
}

function buildHeaders(request: Request) {
	const headers: any = {
	};

	const multiValueHeaders: any = {

	};

	Object.keys(request.headers).forEach(k => {
		const value = request.headers[k];
		headers[k] = value;
		if (multiValueHeaders[k]) {
			multiValueHeaders[k].push(value)
		} else {
			multiValueHeaders[k] = [value];
		}
	});

	return {
		headers,
		multiValueHeaders
	}
}

function requestToEvent(request: LambdaRequest): APIGatewayProxyEvent {
	const { headers, multiValueHeaders } = buildHeaders(request);

	const result = {
		body: request.body ? JSON.stringify(request.body) : null,
		headers: headers,
		multiValueHeaders: multiValueHeaders,
		httpMethod: request.method,
		isBase64Encoded: false,
		path: request.path,
		pathParameters: null,
		queryStringParameters: request.params,
		multiValueQueryStringParameters: null,
		stageVariables: null,
		resource: '',
		requestContext: {
			accountId: '',
			apiId: '',
			authorizer: {
				principalId: request.context?.principalId,
				...request.context?.context,
			},
			protocol: request.protocol,
			httpMethod: request.method,
			path: request.path,
			stage: 'api',
			requestId: '',
			requestTimeEpoch: 0,
			resourceId: '',
			resourcePath: '',
			identity: {
				accessKey: null,
				accountId: null,
				apiKey: null,
				apiKeyId: null,
				caller: null,
				clientCert: null,
				cognitoAuthenticationProvider: null,
				cognitoAuthenticationType: null,
				cognitoIdentityId: null,
				cognitoIdentityPoolId: null,
				principalOrgId: null,
				sourceIp: '83.204.204.98',
				userAgent: 'curl/8.1.2',
				userArn: null,
				user: null
			},
		},
	};

	return result as APIGatewayProxyEvent;
}

app.use(express.text());

app.all('/api/*', checkAuth, handleRequest);

app.listen(LISTEN_PORT, () => {
	console.log(`server is listening on ${LISTEN_PORT}`)
})