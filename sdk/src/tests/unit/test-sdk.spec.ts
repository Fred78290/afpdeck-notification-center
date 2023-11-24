import ApiCore from 'afp-apicore-sdk'
import * as dotenv from 'dotenv'
import AfpDeckNotificationCenter from '../../afpdeck-notification-center'
import testSubscription from './testSubscription.json'
import testWebPushKey from './testWebPushKey.json'
import testUserPreferences from './testUserPreferences.json'
import { ServiceDefinition } from '../../../../lambda/app'
import { createApp, closeApp } from '../../../../src/server'

const DEFAULT_TIMEOUT = 30000;
const LISTEN_PORT = process.env.LISTEN_PORT ?? 8080;
const AFPDECK_NOTIFICATION_URL = `http://localhost:${LISTEN_PORT}`

const serviceName = 'test-afpdeck-notification-center-sdk'
const subscriptionName = 'test-afpdeck-notification-center-sdk'
const browserID = 'B8D59E4D-9C7E-487F-9333-D139739E07F2'
const webPushTableName = 'test-afpdeck-webpush';
const subscriptionsTableName = 'test-afpdeck-subscriptions';
const userPrefrencesTableName = 'test-afpdeck-preferences';

dotenv.config({ path: __dirname + '/../../../../lambda/configs/.env' })

expect(process.env.APICORE_BASE_URL).toBeDefined()
expect(process.env.APICORE_CLIENT_ID).toBeDefined()
expect(process.env.APICORE_CLIENT_SECRET).toBeDefined()
expect(process.env.APICORE_USERNAME).toBeDefined()
expect(process.env.APICORE_PASSWORD).toBeDefined()
expect(process.env.APICORE_EMAIL).toBeDefined()

const options = {
	debug: true,
	apicoreBaseURL: process.env.APICORE_BASE_URL ?? '',
	clientID: process.env.APICORE_CLIENT_ID ?? '',
	clientSecret: process.env.APICORE_CLIENT_SECRET ?? '',
	afpDeckPushURL: `${AFPDECK_NOTIFICATION_URL}/api/push`,
	apicorePushUserName: 'fred78290',
	apicorePushPassword: '1234',
	useSharedService: true,
	serviceUserName: '',
	servicePassword: '',
	userPreferencesTableName: userPrefrencesTableName,
	webPushUserTableName: webPushTableName,
	subscriptionTableName: subscriptionsTableName,
	useMongoDB: true,
	mongoURL: process.env.MONGODB_URL,
}

const serviceDefinition: ServiceDefinition = {
	useSharedService: false,
	definition: {
		name: serviceName,
		type: 'mail',
		datas: {
			address: process.env.APICORE_EMAIL ?? ''
		}
	}
}

const apicore = new ApiCore({
	baseUrl: process.env.APICORE_BASE_URL,
	clientId: process.env.APICORE_CLIENT_ID,
	clientSecret: process.env.APICORE_CLIENT_SECRET,
	saveToken: token => {
		// You can eventually save the token to be used later
		console.log(token)
	}
})

const afpdeck = new AfpDeckNotificationCenter(AFPDECK_NOTIFICATION_URL, apicore, browserID)

beforeAll((done) => {
	console.log('Will authenticate');

	apicore.authenticate({ username: process.env.APICORE_USERNAME, password: process.env.APICORE_PASSWORD }).then((token) => {
		console.log('Did authenticate');
		createApp(options).then((app) => {
			console.log('Will listen server');
			app.listen(LISTEN_PORT, () => {
				console.log(`Did server is listening on ${LISTEN_PORT}`);
				done();
			});
		}).catch((e) => {
			done(e);
		})
	}).catch((e) => {
		done(e);
	})
}, DEFAULT_TIMEOUT)

afterAll((done) => {
	closeApp().finally(() => {
		done();
	})
}, DEFAULT_TIMEOUT)

describe('afpdeck-notification-center sdk', () => {
	it('verifies successful storeWebPushUserKey', async () => {
		const result = await afpdeck.storeWebPushUserKey(testWebPushKey)

		expect(result).toBeDefined()
		expect(result.status.code).toBeGreaterThanOrEqual(0)
	}, DEFAULT_TIMEOUT)

	it('verifies successful updateWebPushUserKey', async () => {
		const result = await afpdeck.updateWebPushUserKey(testWebPushKey)

		expect(result).toBeDefined()
		expect(result.status.code).toBeGreaterThanOrEqual(0)
	}, DEFAULT_TIMEOUT)

	it('verifies successful registerNotification', async () => {
		const result = await afpdeck.registerNotification(subscriptionName, serviceName, testSubscription, serviceDefinition)

		expect(result).toBeDefined()
		expect(result.status.code).toBeGreaterThanOrEqual(0)
	}, DEFAULT_TIMEOUT)

	it('verifies successful listSubscriptions', async () => {
		const result = await afpdeck.listSubscriptions(serviceDefinition)

		expect(result).toBeDefined()
		expect(result?.map(n => n.name)).toContain(subscriptionName)
	}, DEFAULT_TIMEOUT)

	it('verifies successful deleteNotification', async () => {
		const result = await afpdeck.deleteNotification(subscriptionName, serviceDefinition)

		expect(result).toBeDefined()
		expect(result.status.code).toBeGreaterThanOrEqual(0)
	}, DEFAULT_TIMEOUT)

	it('verifies successful storeUserPreferences', async () => {
		const result = await afpdeck.storeUserPreferences(subscriptionName, testUserPreferences)

		expect(result).toBeDefined()
		expect(result.status.code).toBeGreaterThanOrEqual(0)
	}, DEFAULT_TIMEOUT)

	it('verifies successful getUserPreferences', async () => {
		const result = await afpdeck.getUserPreferences(subscriptionName)

		expect(result).toBeDefined()
		expect(result).toEqual(testUserPreferences)
	}, DEFAULT_TIMEOUT)
})
