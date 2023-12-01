import ApiCore from 'afp-apicore-sdk'
import { AppOptions, createApp } from '../../src/server'
import { Request, Response, NextFunction } from "express";
import * as http from 'http'

const LISTEN_PORT = process.env.LISTEN_PORT ?? 8080
const AFPDECK_NOTIFICATION_URL = `http://localhost:${LISTEN_PORT}`

const apicore = new ApiCore({
	baseUrl: process.env.APICORE_TEST_URL,
	clientId: process.env.APICORE_CLIENT_ID,
	clientSecret: process.env.APICORE_CLIENT_SECRET,
	saveToken: (token) => {
		console.log(token)
	}
});

const options: AppOptions = {
	debug: true,
	apicoreBaseURL: process.env.APICORE_TEST_URL ?? '',
	clientID: process.env.APICORE_CLIENT_ID ?? '',
	clientSecret: process.env.APICORE_CLIENT_SECRET ?? '',
	afpDeckPushURL: `${AFPDECK_NOTIFICATION_URL}/api/push`,
	apicorePushUserName: 'fred78290',
	apicorePushPassword: '1234',
	useMongoDB: true,
	mongoURL: process.env.MONGODB_URL,
	registerService: false,
}

let server: http.Server

function mockupPush(
	request: Request,
	response: Response,
	next: NextFunction
) {

}

function startMockup(): void {
	// Start mockup
	console.log('Will authenticate')

	apicore.authenticate({
		username: process.env.APICORE_USERNAME,
		password: process.env.APICORE_PASSWORD,
	}).then((token) => {
		console.log('Did authenticate')
		createApp(options).then((serverApp) => {
			console.log('Will listen server');

			const server = serverApp.express.listen(LISTEN_PORT, () => {
				console.log(`Did server is listening on ${LISTEN_PORT}`)

				serverApp.express.get('/mockup', mockupPush);

				process.on('SIGTERM', () => {
					server.close(() => {
						serverApp.handler.close().finally(() => {
							process.exit(0);
						});
					});
				});
			});
		}).catch((e) => {
			console.error(e);
		});
	}).catch((e) => {
		console.log('Failed to authenticate', e);
	});
}


startMockup();
