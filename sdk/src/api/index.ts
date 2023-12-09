import ApiCore from 'afp-apicore-sdk'
import { Subscription, ClientCredentials, Token } from 'afp-apicore-sdk/dist/types'
import { WebPushUser, ServiceDefinition } from '../../../lambda/app'
import { CommonResponse, UserPreferenceResponse, UserPreferencesResponse, RegisterSubscriptionsResponse, ListSubscriptionsResponse, DeleteSubscriptionsResponse, WebPushUserKeyResponse } from '../../../lambda/types'
import { RequestParams, get, del, post, put } from '../utils/request'
import fingerprint from '@fingerprintjs/fingerprintjs'

export default class AfpDeckNotificationCenter extends ApiCore {
	private notificationCenterUrl: string
	private visitorID: string | undefined

	constructor(credentials?: ClientCredentials & { baseUrl?: string; notificationCenterUrl?: string; browserID?: string; saveToken?: (token: Token | null) => void }) {
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
		this.visitorID = credentials?.browserID
	}

	/**
	 * Create finger print for the current browser
	 * @returns browser identifier
	 */
	private async getVisitorID(): Promise<string> {
		if (!this.visitorID) {
			const agent = await fingerprint.load()
			const result = await agent.get()

			this.visitorID = result.visitorId
		}

		return this.visitorID
	}

	private buildParams(browserID: string, serviceDefinition?: ServiceDefinition): RequestParams {
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

	/**
	 * Save the web push key for this browser to allow notification
	 * @param webPushKey The web push key to save
	 * @param browserID Optional allow to override the visitor id
	 * @returns standard response for success
	 */
	public async storeWebPushUserKey(webPushKey: WebPushUser, browserID?: string) {
		await this.authenticate()

		const data: CommonResponse = await post(`${this.notificationCenterUrl}/api/webpush`, webPushKey, {
			headers: this.authorizationBearerHeaders,
			params: {
				browserID: browserID ?? await this.getVisitorID()
			}
		})

		return data.response
	}

	/**
	 * Update the web push key for this browser
	 * @param webPushKey The web push key to update
	 * @param browserID Optional allow to override the visitor id
	 * @returns standard response for success
	 */
	public async updateWebPushUserKey(webPushKey: WebPushUser, browserID?: string) {
		await this.authenticate()

		const data: CommonResponse = await put(`${this.notificationCenterUrl}/api/webpush`, webPushKey, {
			headers: this.authorizationBearerHeaders,
			params: {
				browserID: browserID ?? await this.getVisitorID()
			}
		})

		return data.response
	}

	/**
	 * Retrieve the web push for this browser
	 * @param browserID Optional allow to override the visitor id
	 * @returns web push key
	 */
	public async getWebPushUserKey(browserID?: string) {
		await this.authenticate()

		const data: WebPushUserKeyResponse = await get(`${this.notificationCenterUrl}/api/webpush`, {
			headers: this.authorizationBearerHeaders,
			params: {
				browserID: browserID ?? await this.getVisitorID()
			}
		})

		return data.response
	}

	/**
	 * Delete web push key for this browser
	 * @param browserID Optional allow to override the visitor id
	 * @returns standard response for success
	 */
	public async deleteWebPushUserKey(browserID?: string) {
		await this.authenticate()

		const data: CommonResponse = await del(`${this.notificationCenterUrl}/api/webpush`, {
			headers: this.authorizationBearerHeaders,
			params: {
				browserID: browserID ?? await this.getVisitorID()
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
	 * @param browserID Optional allow to override the visitor id
	 * @returns The uno of the subscription
	 */
	public async registerNotification(name: string, service: string, notification: Subscription, serviceDefinition?: ServiceDefinition, browserID?: string) {
		await this.authenticate()
		const visitorID = browserID ?? await this.getVisitorID()

		const data: RegisterSubscriptionsResponse = await post(`${this.notificationCenterUrl}/api/notification/${name}`, notification, {
			headers: this.authorizationBearerHeaders,
			params: this.buildParams(visitorID, serviceDefinition)
		})

		return data.response
	}

	/**
	 * Delete a subscription from apicore notification center
	 * @param name The name of the subscription
	 * @param browserID Optional allow to override the visitor id
	 * @returns 
	 */
	public async deleteNotification(name: string, browserID?: string) {
		await this.authenticate()

		const data: DeleteSubscriptionsResponse = await del(`${this.notificationCenterUrl}/api/notification/${name}`, {
			headers: this.authorizationBearerHeaders,
			params: {
				browserID: browserID ?? await this.getVisitorID()
			}
		})

		return data.response
	}

	/**
	 * List all registered subscription from apicore notification center for the authenticated user
	 * @param browserID Optional allow to override the visitor id
	 * @returns The list of registered subscription
	 */
	public async listSubscriptions(browserID?: string) {
		await this.authenticate()

		const data: ListSubscriptionsResponse = await get(`${this.notificationCenterUrl}/api/notification`, {
			headers: this.authorizationBearerHeaders,
			params: {
				browserID: browserID ?? await this.getVisitorID()
			}
		})

		return data.response.subscriptions
	}

	/**
	 * Save a user resource into database
	 * @param name The name of the user resource preference
	 * @param prefs The user resource preference
	 * @param browserID Optional allow to override the visitor id
	 * @returns standard response for success
	 */
	public async storeUserPreference(name: string, prefs: any, browserID?: string) {
		await this.authenticate()

		const data: CommonResponse = await post(`${this.notificationCenterUrl}/api/preference/${name}`, prefs, {
			headers: this.authorizationBearerHeaders,
			params: {
				browserID: browserID ?? await this.getVisitorID()
			}
		})

		return data.response
	}

	/**
	 * Retrieve user resource from database
	 * @param browserID Optional allow to override the visitor id
	 * @returns return the preference or throw error
	 */
	public async getUserPreferences(browserID?: string) {
		await this.authenticate()

		const data: UserPreferencesResponse = await get(`${this.notificationCenterUrl}/api/preferences`, {
			headers: this.authorizationBearerHeaders,
			params: {
				browserID: browserID ?? await this.getVisitorID()
			}
		})

		return data.response.preferences
	}


	/**
	 * Retrieve user resource from database
	 * @param name The name of user preference to return
	 * @param browserID Optional allow to override the visitor id
	 * @returns return the preference or throw error
	 */
	public async getUserPreference(name: string, browserID?: string) {
		await this.authenticate()

		const data: UserPreferenceResponse = await get(`${this.notificationCenterUrl}/api/preference/${name}`, {
			headers: this.authorizationBearerHeaders,
			params: {
				browserID: browserID ?? await this.getVisitorID()
			}
		})

		return data.response.preferences
	}

	/**
	 * Delete user resource from database
	 * @param name The name of user preference to delete
	 * @param browserID Optional allow to override the visitor id
	 * @returns standard response for success
	 */
	public async deleteUserPreference(name: string, browserID?: string) {
		await this.authenticate()

		const data: CommonResponse = await del(`${this.notificationCenterUrl}/api/preference/${name}`, {
			headers: this.authorizationBearerHeaders,
			params: {
				browserID: browserID ?? await this.getVisitorID()
			}
		})

		return data.response
	}
}
