import ApiCore from 'afp-apicore-sdk'
import { RegisteredSubscription, Subscription, ClientCredentials, Token } from 'afp-apicore-sdk/dist/types'
import { WebPushUser, ServiceDefinition } from '../../../lambda/app'
import { CommonResponse, UserPreferenceResponse, UserPreferencesResponse, RegisterSubscriptionsResponse, ListSubscriptionsResponse, GetSubscriptionResponse, DeleteSubscriptionsResponse, WebPushUserKeyResponse } from '../../../lambda/types'
import { RequestParams, get, del, post, put } from '../utils/request'
import fingerprint from '@fingerprintjs/fingerprintjs'

export default class AfpDeckNotificationCenter extends ApiCore {
    private notificationCenterUrl: string
    private visitorID: string | undefined

    constructor (credentials?: ClientCredentials & { baseUrl?: string; notificationCenterUrl?: string; visitorID?: string; saveToken?: (token: Token | null) => void }) {
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
        this.visitorID = credentials?.visitorID
    }

    /**
     * Create finger print for the current browser
     * @returns browser identifier
     */
    private async getVisitorID (): Promise<string> {
        if (!this.visitorID) {
            const agent = await fingerprint.load()
            const result = await agent.get()

            this.visitorID = result.visitorId
        }

        return this.visitorID
    }

    private buildParams (visitorID: string, serviceDefinition?: ServiceDefinition): RequestParams {
        if (serviceDefinition) {
            return {
                visitorID: visitorID,
                shared: serviceDefinition.useSharedService,
                serviceName: serviceDefinition.definition.name,
                serviceType: serviceDefinition.definition.type,
                serviceData: JSON.stringify(serviceDefinition.definition.datas)
            }
        }

        return {
            visitorID: visitorID
        }
    }

    /**
     * Save the web push key for this browser to allow notification
     * @param webPushKey The web push key to save
     * @param visitorID Optional allow to override the visitor id
     * @returns standard response for success
     */
    public async storeWebPushUserKey (webPushKey: WebPushUser, visitorID?: string) {
        await this.authenticate()

        const data: CommonResponse = await post(`${this.notificationCenterUrl}/api/webpush`, webPushKey, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response
    }

    /**
     * Update the web push key for this browser
     * @param webPushKey The web push key to update
     * @param visitorID Optional allow to override the visitor id
     * @returns standard response for success
     */
    public async updateWebPushUserKey (webPushKey: WebPushUser, visitorID?: string) {
        await this.authenticate()

        const data: CommonResponse = await put(`${this.notificationCenterUrl}/api/webpush`, webPushKey, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response
    }

    /**
     * Retrieve the web push for this browser
     * @param visitorID Optional allow to override the visitor id
     * @returns web push key
     */
    public async getWebPushUserKey (visitorID?: string) {
        await this.authenticate()

        const data: WebPushUserKeyResponse = await get(`${this.notificationCenterUrl}/api/webpush`, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response
    }

    /**
     * Delete web push key for this browser
     * @param visitorID Optional allow to override the visitor id
     * @returns standard response for success
     */
    public async deleteWebPushUserKey (visitorID?: string) {
        await this.authenticate()

        const data: CommonResponse = await del(`${this.notificationCenterUrl}/api/webpush`, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response
    }

    /**
     *
     * @param name Register a subscription into apicore notification center
     * @param service The service name
     * @param notification The subscription definition
     * @param serviceDefinition Optional, allow to create a custom notification service
     * @param visitorID Optional allow to override the visitor id
     * @returns The uno of the subscription
     */
    public async registerSubscription (name: string, service: string, notification: Subscription, serviceDefinition?: ServiceDefinition, visitorID?: string) {
        await this.authenticate()

        const data: RegisterSubscriptionsResponse = await post(`${this.notificationCenterUrl}/api/subscription/${name}`, notification, {
            headers: this.authorizationBearerHeaders,
            params: this.buildParams(visitorID ?? await this.getVisitorID(), serviceDefinition)
        })

        return data.response
    }

    /**
     * Delete a subscription from apicore notification center
     * @param name The name of the subscription
     * @param visitorID Optional allow to override the visitor id
     * @returns The name of deleted subscription
     */
    public async deleteSubscription (name: string, visitorID?: string) {
        await this.authenticate()

        const data: DeleteSubscriptionsResponse = await del(`${this.notificationCenterUrl}/api/subscription/${name}`, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response
    }

    public async getSubscription (name: string, visitorID?: string): Promise<RegisteredSubscription | undefined | null> {
        await this.authenticate()

        const data: GetSubscriptionResponse = await get(`${this.notificationCenterUrl}/api/subscription/${name}`, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response.subscription
    }

    /**
     * List all registered subscription from apicore notification center for the authenticated user
     * @param visitorID Optional allow to override the visitor id
     * @returns The list of registered subscription
     */
    public async listSubscriptions (visitorID?: string): Promise<RegisteredSubscription[] | undefined | null> {
        await this.authenticate()

        const data: ListSubscriptionsResponse = await get(`${this.notificationCenterUrl}/api/subscriptions`, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response.subscriptions
    }

    /**
     * Save a user resource into database
     * @param name The name of the user resource preference
     * @param prefs The user resource preference
     * @param visitorID Optional allow to override the visitor id
     * @returns standard response for success
     */
    public async storeUserPreference (name: string, prefs: any, visitorID?: string) {
        await this.authenticate()

        const data: CommonResponse = await post(`${this.notificationCenterUrl}/api/preference/${name}`, prefs, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response
    }

    /**
     * Retrieve user resource from database
     * @param visitorID Optional allow to override the visitor id
     * @returns return the preference or throw error
     */
    public async getUserPreferences (visitorID?: string) {
        await this.authenticate()

        const data: UserPreferencesResponse = await get(`${this.notificationCenterUrl}/api/preferences`, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response.preferences
    }


    /**
     * Retrieve user resource from database
     * @param name The name of user preference to return
     * @param visitorID Optional allow to override the visitor id
     * @returns return the preference or throw error
     */
    public async getUserPreference (name: string, visitorID?: string) {
        await this.authenticate()

        const data: UserPreferenceResponse = await get(`${this.notificationCenterUrl}/api/preference/${name}`, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response.preferences
    }

    /**
     * Delete user resource from database
     * @param name The name of user preference to delete
     * @param visitorID Optional allow to override the visitor id
     * @returns standard response for success
     */
    public async deleteUserPreference (name: string, visitorID?: string) {
        await this.authenticate()

        const data: CommonResponse = await del(`${this.notificationCenterUrl}/api/preference/${name}`, {
            headers: this.authorizationBearerHeaders,
            params: {
                visitorID: visitorID ?? await this.getVisitorID()
            }
        })

        return data.response
    }
}
