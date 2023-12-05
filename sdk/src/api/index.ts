import ApiCore from 'afp-apicore-sdk'
import { Subscription, RegisteredSubscription, ClientCredentials, Token } from 'afp-apicore-sdk/dist/types'
import { WebPushUser, ServiceDefinition } from '../../../lambda/app'
import { UserPreferences } from '../../../lambda/databases'
import { RequestParams, get, del, post, put } from '../utils/request'
import fingerprint from '@fingerprintjs/fingerprintjs'

interface CommonResponse {
    response: {
        status: {
            code: number
            reason: string
        }
    }
}

interface UserPreferencesResponse {
    response: {
        preferences: UserPreferences | UserPreferences[] | undefined
        status: {
            code: number
            reason: string
        }
    }
}

interface ListSubscriptionsResponse {
    response: {
        subscriptions: RegisteredSubscription[] | undefined
        status: {
            code: number
            reason: string
        }
    }
}

export default class AfpDeckNotificationCenter extends ApiCore {
    private notificationCenterUrl: string
    private browserID: string | undefined

    constructor (credentials?: ClientCredentials & { baseUrl?: string; notificationCenterUrl?: string; browserID?: string; saveToken?: (token: Token | null) => void }) {
        super({
            baseUrl: credentials?.baseUrl,
            apiKey: credentials?.apiKey,
            clientId: credentials?.clientId,
            clientSecret: credentials?.clientSecret,
            customAuthUrl: credentials?.customAuthUrl,
            saveToken: (token) => {
                if (credentials?.saveToken) {
                    credentials?.saveToken(token)
                }

            }
        })

        this.notificationCenterUrl = credentials?.notificationCenterUrl ?? 'https://afpdeck-notification-center.aldunelabs.fr'
        this.browserID = credentials?.browserID
    }

    private async getBrowserID (): Promise<string> {
        if (!this.browserID) {
            const agent = await fingerprint.load()
            const result = await agent.get()

            this.browserID = result.visitorId
        }

        return this.browserID
    }

    private buildParams (browserID: string, serviceDefinition?: ServiceDefinition): RequestParams {
        if (serviceDefinition) {
            return {
                browserID: browserID,
                shared: serviceDefinition.useSharedService,
                serviceName: serviceDefinition.definition.name,
                serviceType: serviceDefinition.definition.type,
                serviceData: JSON.stringify(serviceDefinition.definition.datas)
            }
        }

        return {
            browserID: browserID
        }
    }

    public async storeWebPushUserKey (infos: WebPushUser) {
        await this.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await post(`${this.notificationCenterUrl}/api/webpush`, infos, {
            headers: this.authorizationBearerHeaders,
            params: {
                browserID: browserID
            }
        })

        return data.response
    }

    public async updateWebPushUserKey (infos: WebPushUser) {
        await this.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await put(`${this.notificationCenterUrl}/api/webpush`, infos, {
            headers: this.authorizationBearerHeaders,
            params: this.buildParams(browserID)
        })

        return data.response
    }

    public async getWebPushUserKey () {
        await this.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await get(`${this.notificationCenterUrl}/api/webpush`, {
            headers: this.authorizationBearerHeaders,
            params: this.buildParams(browserID)
        })

        return data.response
    }

    public async deleteWebPushUserKey () {
        await this.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await del(`${this.notificationCenterUrl}/api/webpush`, {
            headers: this.authorizationBearerHeaders,
            params: this.buildParams(browserID)
        })

        return data.response
    }

    public async registerNotification (name: string, service: string, notification: Subscription, serviceDefinition?: ServiceDefinition) {
        await this.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await post(`${this.notificationCenterUrl}/api/notification/${name}`, notification, {
            headers: this.authorizationBearerHeaders,
            params: this.buildParams(browserID, serviceDefinition)
        })

        return data.response
    }

    public async deleteNotification (name: string, serviceDefinition?: ServiceDefinition) {
        await this.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await del(`${this.notificationCenterUrl}/api/notification/${name}`, {
            headers: this.authorizationBearerHeaders,
            params: this.buildParams(browserID, serviceDefinition)
        })

        return data.response
    }

    public async listSubscriptions (serviceDefinition?: ServiceDefinition) {
        await this.authenticate()
        const browserID = await this.getBrowserID()

        const data: ListSubscriptionsResponse = await get(`${this.notificationCenterUrl}/api/notification`, {
            headers: this.authorizationBearerHeaders,
            params: this.buildParams(browserID, serviceDefinition)
        })

        return data.response.subscriptions
    }

    public async storeUserPreferences (name: string, prefs: any) {
        await this.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await post(`${this.notificationCenterUrl}/api/preferences/${name}`, prefs, {
            headers: this.authorizationBearerHeaders,
            params: this.buildParams(browserID)
        })

        return data.response
    }

    public async getUserPreferences (name: string) {
        await this.authenticate()
        const browserID = await this.getBrowserID()

        const data: UserPreferencesResponse = await get(`${this.notificationCenterUrl}/api/preferences/${name}`, {
            headers: this.authorizationBearerHeaders,
            params: this.buildParams(browserID)
        })

        return data.response.preferences
    }

    public async deleteUserPreferences (name: string) {
        await this.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await del(`${this.notificationCenterUrl}/api/preferences/${name}`, {
            headers: this.authorizationBearerHeaders,
            params: this.buildParams(browserID)
        })

        return data.response
    }
}
