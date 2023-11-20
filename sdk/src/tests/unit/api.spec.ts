import ApiCore from 'afp-apicore-sdk'
import * as dotenv from 'dotenv'
import AfpDeckNotificationCenter from '../../afpdeck-notification-center'
import testSubscription from './testSubscription.json'
import testWebPushKey from './testWebPushKey.json'
import testUserPreferences from './testUserPreferences.json'
import { ServiceDefinition } from '../../../../lambda'
const serviceName = 'test-afpdeck-notification-center-sdk'
const subscriptionName = 'test-afpdeck-notification-center-sdk'
const browserID = 'B8D59E4D-9C7E-487F-9333-D139739E07F2'

dotenv.config({ path: __dirname + '../../configs/.env' })

describe('afpdeck-notification-center sdk', () => {

    expect(process.env.APICORE_BASE_URL).toBeDefined()
    expect(process.env.APICORE_CLIENT_ID).toBeDefined()
    expect(process.env.APICORE_CLIENT_SECRET).toBeDefined()
    expect(process.env.APICORE_USERNAME).toBeDefined()
    expect(process.env.APICORE_PASSWORD).toBeDefined()
    expect(process.env.AFPDECK_NOTIFICATION_URL).toBeDefined()

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
        clientSecret: process.env.APICORE_CLIENT_SECRET
    })

    const afpdeck = new AfpDeckNotificationCenter(process.env.AFPDECK_NOTIFICATION_URL ?? '', apicore, browserID)

    beforeAll(async () => {
        await apicore.authenticate({username: process.env.APICORE_USERNAME, password: process.env.APICORE_PASSWORD})
    })

    it('verifies successful storeWebPushUserKey', async () => {
        const result = await afpdeck.storeWebPushUserKey(testWebPushKey)

        expect(result).toBeDefined()
        expect(result.status).toBeGreaterThanOrEqual(0)
    })

    it('verifies successful updateWebPushUserKey', async () => {
        const result = await afpdeck.updateWebPushUserKey(testWebPushKey)

        expect(result).toBeDefined()
        expect(result.status).toBeGreaterThanOrEqual(0)
    })

    it('verifies successful registerNotification', async () => {
        const result = await afpdeck.registerNotification(subscriptionName, serviceName, testSubscription, serviceDefinition)

        expect(result).toBeDefined()
        expect(result.status).toBeGreaterThanOrEqual(0)
    })

    it('verifies successful listSubscriptions', async () => {
        const result = await afpdeck.listSubscriptions(serviceDefinition)

        expect(result).toBeDefined()
        expect(result?.map(n => n.name)).toContain(subscriptionName)
    })

    it('verifies successful deleteNotification', async () => {
        const result = await afpdeck.deleteNotification(subscriptionName, serviceDefinition)

        expect(result).toBeDefined()
        expect(result.status).toBeGreaterThanOrEqual(0)
    })

    it('verifies successful storeUserPreferences', async () => {
        const result = await afpdeck.storeUserPreferences(subscriptionName, testUserPreferences)

        expect(result).toBeDefined()
        expect(result.status).toBeGreaterThanOrEqual(0)
    })

    it('verifies successful getUserPreferences', async () => {
        const result = await afpdeck.getUserPreferences(subscriptionName)

        expect(result).toBeDefined()
        expect(result).toEqual(testUserPreferences)
    })
})
