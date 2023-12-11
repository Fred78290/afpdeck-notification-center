import minimist from 'minimist'
import AfpDeckNotificationCenter from '@fred78290/afpdeck-notification-center'
import { Token, ClientCredentials } from 'afp-apicore-sdk/dist/types'
import usage from './usage'
import missing from './missing'
import fs from 'fs'

function loadData (path: string): any {
    if (fs.existsSync(path)) {
        return fs.readFileSync(path, 'utf8')
    }

    console.error(`File not found ${path}`)

    process.exit(1)
}

export default class AfpDeckNotificationCenterCli extends AfpDeckNotificationCenter {
    private opts: minimist.ParsedArgs

    constructor (credentials: ClientCredentials & {
        baseUrl?: string
        notificationCenterUrl?: string
        visitorID?: string
		opts: minimist.ParsedArgs
        saveToken?: (token: Token | null) => void
	}) {
        super(credentials)
        this.opts = credentials.opts
    }

    private mandatory (key: string) {
        return this.opts[key] ?? missing(key)
    }

    public async run (action: string, command: string) {
        switch (action) {
        case 'webpush':
            return this.cliWebPush(command)
        case 'preferences':
            return this.cliPreferences(command)
        case 'subscription':
            return this.cliSubscription(command)
        default:
            usage()
        }
    }

    async cliWebPush (command: string) {
        switch (command) {
        case 'get':
            return this.getWebPushUserKey(this.opts['visitor-id'])
        case 'store':
            return this.storeWebPushUserKey({
                apiKeys: {
                    privateKey: this.mandatory('vapid-private-key'),
                    publicKey: this.mandatory('vapid-public-key')
                },
                subscription: {
                    endpoint: this.mandatory('endpoint'),
                    keys: {
                        auth: this.mandatory('auth'),
                        p256dh: this.mandatory('p256dh')
                    }
                }
            })
        case 'delete':
            return this.deleteWebPushUserKey(this.opts['visitor-id'])
        default:
            usage(1, 'webpush')
        }
    }

    async cliPreferences (command: string) {
        switch (command) {
        case 'get':
            return this.getUserPreference(this.mandatory('name'), this.opts['visitor-id'])
        case 'list':
            return this.getUserPreferences(this.opts['visitor-id'])
        case 'store':
            return this.storeUserPreference(this.mandatory('name'), loadData(this.mandatory('data')), this.opts['visitor-id'])
        case 'delete':
            return this.deleteUserPreference(this.mandatory('name'), this.opts['visitor-id'])
        default:
            usage(1, 'preferences')
        }

    }

    async cliSubscription (command: string) {
        switch (command) {
        case 'get':
            return this.getSubscription(this.mandatory('name'), this.opts['visitor-id'])
        case 'list':
            return this.listSubscriptions(this.opts['visitor-id'])
        case 'store':
            break
        case 'delete':
            break
        default:
            usage(1, 'subscription')
        }
    }
}

