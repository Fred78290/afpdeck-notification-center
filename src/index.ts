import { createApp } from './server';
import { parseBoolean } from '../lambda/databases/index';
import * as dotenv from "dotenv";

dotenv.config();

console.log(process.env);

const LISTEN_PORT = process.env.LISTEN_PORT ?? 8080;

const options = {
	debug: parseBoolean(process.env.DEBUG),
	apicoreBaseURL: process.env.APICORE_BASE_URL ?? '',
	clientID: process.env.APICORE_CLIENT_ID ?? '',
	clientSecret: process.env.APICORE_CLIENT_SECRET ?? '',
	afpDeckPushURL: process.env.AFPDECK_PUSH_URL ?? '',
	apicorePushUserName: process.env.APICORE_PUSH_USERNAME ?? '',
	apicorePushPassword: process.env.APICORE_PUSH_PASSWORD ?? '',
	useSharedService: parseBoolean(process.env.APICORE_USE_SHAREDSERVICE),
	serviceUserName: process.env.APICORE_SERVICE_USERNAME ?? '',
	servicePassword: process.env.APICORE_SERVICE_PASSWORD ?? '',
	userPreferencesTableName: process.env.USERPREFS_TABLENAME,
	webPushUserTableName: process.env.WEBPUSH_TABLE_NAME,
	subscriptionTableName: process.env.SUBSCRIPTIONS_TABLE_NAME,
	useMongoDB: parseBoolean(process.env.USE_MONGODB),
	mongoURL: process.env.MONGODB_URL,
}

if (
	process.env.APICORE_BASE_URL &&
	process.env.APICORE_CLIENT_ID &&
	process.env.APICORE_CLIENT_SECRET &&
	process.env.APICORE_SERVICE_USERNAME &&
	process.env.APICORE_SERVICE_PASSWORD &&
	process.env.AFPDECK_PUSH_URL &&
	process.env.APICORE_PUSH_USERNAME &&
	process.env.APICORE_PUSH_PASSWORD &&
	process.env.AFPDECK_PUSH_URL &&
	process.env.APICORE_PUSH_USERNAME && process.env.APICORE_PUSH_PASSWORD
) {
	createApp(options)
		.then((serverApp) => {
			serverApp.express.listen(LISTEN_PORT, () => {
				console.log(`server is listening on ${LISTEN_PORT}`);
			})
		}).catch((e) => {
			console.error(e);
			process.exit(1);
		});
} else {
	console.error('AFPDECK_PUSH_URL or APICORE_PUSH_USERNAME or APICORE_PUSH_PASSWORD undefined');
	process.exit(1);
}