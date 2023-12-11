interface UsageInfo {
    [arg: string]: UsageInfo | string | string[] | undefined
    name?: string
    description: string
    options?: string[]
}

function describeCommand (name: string, usage: UsageInfo, level: number = 0) {
    const filler = level > 0 ? ' '.repeat(level * 2) : ''
    const indent = filler + '    '
    let result = filler + '# - ' + usage.description + '\n' + filler + name + indent + '\n'

    if (usage.options) {
        usage.options.forEach(options => {
            result += filler + indent + options + '\n'
        })
    }

    result += '\n'

    Object.keys(usage).forEach((key) => {
        const value = usage[key]

        if (key !== 'description' && key !== 'options' && key !== 'name' && typeof value === 'object') {
            result += describeCommand(key, value as UsageInfo, level + 1)
        }
    })

    return result
}

export default function usage (exitCode: number = 0, action?: string, command?: string) {
    let usageInfos: UsageInfo

    const infos: UsageInfo = {
        description: 'afpdeck-cli action command [options]',
        options: [
            '--apicore-url=<apicore url> | $APICORE_BASE_URL | https://afp-apicore-prod.afp.com',
            '--afpdeck-notification-url=<afpdeck notification url> | $AFPDECK_NOTIFICATION_URL | https://afpdeck-notification-center.aldunelabs.fr',
            '--client-id=<client id> | $APICORE_CLIENT_ID',
            '--client-secret=<client secret> | $APICORE_CLIENT_SECRET',
            '--username=<username>',
            '--password=<password>'
        ],
        webpush: {
            description: 'manage web-push keys',
            get: {
                description: 'Get web-push key',
                options: [
                    '--visitor-id=<browser-id> | ALL'
                ]
            },
            store: {
                description: 'Store web-push key',
                options: [
                    '--visitor-id=<browser-id>',
                    '--endpoint=<url>',
                    '--p256dh=<browser key>]',
                    '--auth=<auth secret>',
                    '--vapid-public-key=<public key url base64>',
                    '--vapid-private-key=<private key url base64>'
                ]
            },
            delete: {
                description: 'Delete web-push key',
                options: [
                    '--visitor-id=<browser-id>'
                ]
            }
        },
        preferences: {
            description: 'manage user preferences',
            get: {
                description: 'Get user preferences',
                options: [
                    '--visitor-id=<browser-id>',
                    '--name=<name>'
                ]
            },
            list: {
                description: 'List user preferences'
            },
            store: {
                description: 'Store user preference',
                options: [
                    '--visitor-id=<browser-id>',
                    '--name=<name>',
                    '--data=<path to user pref>'
                ]
            },
            delete: {
                description: 'Delete user preference',
                options: [
                    '--name=<name>'
                ]
            }
        },
        subscription: {
            description: 'manage subscriptions',
            get: {
                description: 'Get subscription',
                options: [
                    '--name=<name>'
                ]
            },
            store: {
                description: 'Store subscription',
                options: [
                    '--name=<name>',
                    '--data=<path to json>'
                ]
            },
            delete: {
                description: 'Delete subscription',
                options: [
                    '--name=<name>'
                ]
            }
        }
    }

    if (action) {
        const actionInfos = infos[action] as UsageInfo
        const commandInfos: UsageInfo = {
            description: actionInfos.description,
            options: actionInfos.options
        }

        usageInfos = {
            description: infos.description,
            options: infos.options
        }

        usageInfos[action] = commandInfos

        if (command) {
            commandInfos[command] = actionInfos[command] as UsageInfo
        }
    } else {
        usageInfos = infos
    }

    console.log(describeCommand(action ?? 'global options', usageInfos, 0))

    process.exit(exitCode)
}

