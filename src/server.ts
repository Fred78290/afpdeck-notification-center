import lambda from "../lambda/index";
import express, { Router, Request, Response, NextFunction } from "express";
import {
  APIGatewayProxyEvent,
  APIGatewayRequestAuthorizerEvent,
  APIGatewayAuthorizerResult,
  APIGatewayProxyEventQueryStringParameters,
  APIGatewayProxyEventMultiValueQueryStringParameters,
} from "aws-lambda";
import * as dotenv from "dotenv";

dotenv.config();

console.log(process.env);

const app = express();
const router = Router();

const LISTEN_PORT = process.env.LISTEN_PORT ?? 8080;

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

    lambda
      .auth(event)
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

  lambda.api(event).then((result) => {
    if (result.headers) response.set(result.headers);

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
  const multiValueQueryStringParameters: APIGatewayProxyEventMultiValueQueryStringParameters =
    {};
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
    resource: "",
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

router.post("/webpush", handleRequest);
router.put("/webpush", handleRequest);
router.post("/register/:identifier", handleRequest);
router.get("/list", handleRequest);
router.post("/push", handleRequest);
router.delete("/delete/:identifier", handleRequest);
router.post("/preferences/:identifier", handleRequest);
router.get("/preferences/:identifier", handleRequest);
router.get("/", handleRequest);
router.all("/*", notFound);

app.use(express.text());
app.use(express.json());
app.use(checkAuth);
app.use("/api", router);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello, TypeScript Express!");
});

app.listen(LISTEN_PORT, () => {
  console.log(`server is listening on ${LISTEN_PORT}`);
});
