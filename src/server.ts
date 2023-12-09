import { AfpDeckNotificationCenterHandler, AfpDeckNotificationCenterHandlerOptions } from "../lambda/app";
import database from '../lambda/databases';
import express, { Express, Router, Request, Response, NextFunction } from "express";
import {
	APIGatewayProxyEvent,
	APIGatewayRequestAuthorizerEvent,
	APIGatewayAuthorizerResult,
	APIGatewayProxyEventQueryStringParameters,
	APIGatewayProxyEventMultiValueQueryStringParameters,
} from "aws-lambda";

let handler: AfpDeckNotificationCenterHandler;
let debug: boolean;

interface LambdaRequest extends Request {
	context?: APIGatewayAuthorizerResult;
}

class HttpError extends Error {
	private _status: number;

	constructor(msg: string, status: number) {
		super(msg);

		this._status = status;
	}

	public get status(): number {
		return this._status;
	}
}

function checkAuth(
	request: LambdaRequest,
	response: Response,
	next: NextFunction
) {
	if (request.path.startsWith('/api')) {
		const { headers, multiValueHeaders } = buildHeaders(request);
		const event = {
			type: "REQUEST",
			httpMethod: request.method,
			headers: headers,
			multiValueHeaders: multiValueHeaders,
			path: request.path,
			pathParameters: request.params,
			multiValueQueryStringParameters: null,
			stageVariables: null,
			methodArn: `arn:aws:execute-api:eu-west-1:0123456789ABC:zqrih6yku6/${request.method}/${request.path}`,
		} as APIGatewayRequestAuthorizerEvent;

		handler.authorize(event)
			.then((result) => {
				if (result.policyDocument.Statement[0].Effect !== "Allow") {
					return next(new HttpError("Not authorized! Go back!", 401));
				}

				request.context = result;

				return next();
			})
			.catch((e) => {
				return next(new HttpError(JSON.stringify(e), 500));
			});
	} else {
		return next();
	}
}

function notFound(
	request: LambdaRequest,
	response: Response,
	next: NextFunction
) {
	return next(new HttpError("Not found!", 404));
}

function handleRequest(
	request: LambdaRequest,
	response: Response,
	next: NextFunction
) {
	const event = requestToEvent(request);

	handler.handleEvent(event).then((result) => {
		if (result.headers) response.set(result.headers);

		if (debug) {
			console.log('%s: %s, %s', request.method, request.path, result.body);
		}

		response.status(result.statusCode).send(JSON.parse(result.body));
	});
}

function buildHeaders(request: Request) {
	const headers: any = {};

	const multiValueHeaders: any = {};

	Object.keys(request.headers).forEach((k) => {
		const value = request.headers[k];
		headers[k] = value;
		if (multiValueHeaders[k]) {
			multiValueHeaders[k].push(value);
		} else {
			multiValueHeaders[k] = [value];
		}
	});

	return {
		headers,
		multiValueHeaders,
	};
}

function buildQueryParameters(request: LambdaRequest) {
	const queryStringParameters: APIGatewayProxyEventQueryStringParameters = {};
	const multiValueQueryStringParameters: APIGatewayProxyEventMultiValueQueryStringParameters = {};
	const keys = Object.keys(request.query);

	keys.forEach((k) => {
		const v = request.query[k];

		if (v) {
			if (Array.isArray(v)) {
				multiValueQueryStringParameters[k] = v as string[];
				queryStringParameters[k] = (v as string[]).join(",");
			} else {
				multiValueQueryStringParameters[k] = [v as string];
				queryStringParameters[k] = v as string;
			}
		}
	});

	return {
		queryStringParameters,
		multiValueQueryStringParameters,
	};
}

function requestToEvent(request: LambdaRequest): APIGatewayProxyEvent {
	const { headers, multiValueHeaders } = buildHeaders(request);
	const { queryStringParameters, multiValueQueryStringParameters } =
		buildQueryParameters(request);

	const result = {
		body: request.body ? JSON.stringify(request.body) : null,
		headers: headers,
		multiValueHeaders: multiValueHeaders,
		httpMethod: request.method,
		isBase64Encoded: false,
		path: request.path,
		pathParameters: request.params,
		queryStringParameters: queryStringParameters,
		multiValueQueryStringParameters: multiValueQueryStringParameters,
		stageVariables: null,
		resource: request.path,
		requestContext: {
			accountId: "",
			apiId: "",
			authorizer: {
				principalId: request.context?.principalId,
				...request.context?.context,
			},
			protocol: request.protocol,
			httpMethod: request.method,
			path: request.path,
			stage: "api",
			requestId: "",
			requestTimeEpoch: 0,
			resourceId: "",
			resourcePath: "",
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
				sourceIp: request.ip,
				userAgent: request.headers['user-agent'],
				userArn: null,
				user: null,
			},
		},
	};

	return result as APIGatewayProxyEvent;
}

export async function closeApp(): Promise<void> {
	if (handler) {
		return handler.close()
	}
	return Promise.resolve();
}

export interface AppOptions extends AfpDeckNotificationCenterHandlerOptions {
	useMongoDB: boolean,
	mongoURL?: string,
	userPreferencesTableName?: string,
	webPushUserTableName?: string,
	subscriptionTableName?: string,
}

export interface ServerApp {
	handler: AfpDeckNotificationCenterHandler,
	express: Express,
	router: Router,
}

export async function createApp(options: AppOptions): Promise<ServerApp> {
	debug = options.debug ?? false;

	return new Promise<ServerApp>((resolve, reject) => {
		database(options.useMongoDB, options.mongoURL, options.userPreferencesTableName, options.webPushUserTableName, options.subscriptionTableName)
			.then((db) => {
				handler = new AfpDeckNotificationCenterHandler(db, options);

				const app = express();
				const router = Router();

				router.post("/webpush", handleRequest);
				router.put("/webpush", handleRequest);
				router.get("/webpush", handleRequest);
				router.delete("/webpush", handleRequest);

				router.post("/notification/:identifier", handleRequest);
				router.delete("/notification/:identifier", handleRequest);
				router.get("/notification", handleRequest);

				router.post("/push", handleRequest);

				router.get("/preferences", handleRequest);
				router.post("/preference/:identifier", handleRequest);
				router.get("/preference/:identifier", handleRequest);
				router.delete("/preference/:identifier", handleRequest);

				router.get("/", handleRequest);
				router.all("/*", notFound);

				app.use(express.text());
				app.use(express.json());
				app.use(checkAuth);
				app.use("/api", router);

				app.get("/", (req: Request, res: Response) => {
					res.send("Hello, TypeScript Express!");
				});

				resolve({ handler: handler, express: app, router: router });
			}).catch((e) => {
				reject(e);
			})

	});
}
