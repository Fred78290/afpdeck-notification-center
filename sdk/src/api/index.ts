import ApiCore from 'afp-apicore-sdk'
import { Subscription, RegisteredSubscription } from 'afp-apicore-sdk/dist/types'
import { WebPushUser, ServiceDefinition } from '../../../lambda/app'
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
        preferences: any
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

export default class AfpDeckNotificationCenter {
    private apicore: ApiCore
    private baseUrl: string
    private browserID: string | undefined

    constructor (baseUrl: string, apicore: ApiCore, browserID?: string) {
        this.baseUrl = baseUrl
        this.apicore = apicore
        if (browserID) {
            this.browserID = browserID
        }
    }

    private async getBrowserID (): Promise<string> {
        if (! this.browserID) {
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
        await this.apicore.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await post(`${this.baseUrl}/api/webpush`, infos, {
            headers: this.apicore.authorizationBearerHeaders,
            params: {
                browserID: browserID
            }
        })

        return data.response
    }

    public async updateWebPushUserKey (infos: WebPushUser) {
        await this.apicore.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await put(`${this.baseUrl}/api/webpush`, infos, {
            headers: this.apicore.authorizationBearerHeaders,
            params: this.buildParams(browserID)
        })

        return data.response
    }

    public async registerNotification (name: string, service: string, notification: Subscription, serviceDefinition?: ServiceDefinition) {
        await this.apicore.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await post(`${this.baseUrl}/api/register/${name}`, notification, {
            headers: this.apicore.authorizationBearerHeaders,
            params: this.buildParams(browserID, serviceDefinition)
        })

        return data.response
    }

    public async deleteNotification (name: string, serviceDefinition?: ServiceDefinition) {
        await this.apicore.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await del(`${this.baseUrl}/api/register/${name}`, {
            headers: this.apicore.authorizationBearerHeaders,
            params: this.buildParams(browserID, serviceDefinition)
        })

        return data.response
    }

    public async listSubscriptions (serviceDefinition?: ServiceDefinition) {
        await this.apicore.authenticate()
        const browserID = await this.getBrowserID()

        const data: ListSubscriptionsResponse = await get(`${this.baseUrl}/api/list`, {
            headers: this.apicore.authorizationBearerHeaders,
            params: this.buildParams(browserID, serviceDefinition)
        })

        return data.response.subscriptions
    }

    public async storeUserPreferences (name: string, prefs: any) {
        await this.apicore.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await post(`${this.baseUrl}/api/preferences/${name}`, prefs, {
            headers: this.apicore.authorizationBearerHeaders,
            params: this.buildParams(browserID)
        })

        return data.response
    }

    public async getUserPreferences (name: string) {
        await this.apicore.authenticate()
        const browserID = await this.getBrowserID()

        const data: UserPreferencesResponse = await get(`${this.baseUrl}/api/preferences/${name}`, {
            headers: this.apicore.authorizationBearerHeaders,
            params: this.buildParams(browserID)
        })

        return data.response.preferences
    }

    public async deleteUserPreferences (name: string) {
        await this.apicore.authenticate()
        const browserID = await this.getBrowserID()

        const data: CommonResponse = await del(`${this.baseUrl}/api/preferences/${name}`, {
            headers: this.apicore.authorizationBearerHeaders,
            params: this.buildParams(browserID)
        })

        return data.response
    }
}
