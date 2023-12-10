import minimist from 'minimist'

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

function usage (exitCode: number = 0, action?: string, command?: string) {
    let describe: UsageInfo

    const infos: UsageInfo = {
        description: 'action command [options]',
        webpush: {
            description: 'manage web-push keys',
            get: {
                description: 'Get web-push key',
                options: [
                    '--username=<username>',
                    '--password=<password>',
                    '--visitor-id=<browser-id>'
                ]
            },
            store: {
                description: 'Store web-push key',
                options: [
                    '--username=<username>',
                    '--password=<password>',
                    '--visitor-id=<browser-id>',
                    '--endpoint=<url>',
                    '--key=<browser key>]',
                    '--auth=<auth secret>',
                    '--vapid-subject=<vapid subject>',
                    '--vapid-pubkey=<public key url base64>',
                    '--vapid-pvtkey=<private key url base64>',
                    '--gcm-api-key=<api key>'
                ]
            },
            delete: {
                description: 'Delete web-push key',
                options: [
                    '--username=<username>',
                    '--password=<password>',
                    '--visitor-id=<browser-id>'
                ]
            }
        },
        preferences: {
            description: 'manage user preferences',
            get: {
                description: 'Get user preferences',
                options: [
                    '--username=<username>',
                    '--password=<password>',
                    '--name=<name>'
                ]
            },
            store: {
                description: 'Store user preference',
                options: [
                    '--username=<username>',
                    '--password=<password>',
                    '--name=<name>',
                    '--data=<path to user pref>'
                ]
            },
            delete: {
                description: 'Delete user preference',
                options: [
                    '--username=<username>',
                    '--password=<password>',
                    '--name=<name>'
                ]
            }
        },
        subscription: {
            description: 'manage subscriptions',
            get: {
                description: 'Get subscription',
                options: [
                    '--username=<username>',
                    '--password=<password>',
                    '--name=<name>'
                ]
            },
            store: {
                description: 'Store subscription',
                options: [
                    '--username=<username>',
                    '--password=<password>',
                    '--name=<name>',
                    '--data=<path to json>'
                ]
            },
            delete: {
                description: 'Delete subscription',
                options: [
                    '--username=<username>',
                    '--password=<password>',
                    '--name=<name>'
                ]
            }
        }
    }

    if (action) {
        describe = infos[action] as UsageInfo

        if (command) {
            describe = describe[command] as UsageInfo
        }
    } else {
        describe = infos
    }

    console.log(describeCommand(action ?? 'afpdeck-cli', describe, 0))

    process.exit(exitCode)
}

function cliWebPush (command: string, argv: minimist.ParsedArgs) {
    switch (command) {
    case 'get':
        break
    case 'store':
        break
    case 'delete':
        break
    default:
        usage(1, 'webpush')
    }
}

function cliPreferences (command: string, argv: minimist.ParsedArgs) {
    switch (command) {
    case 'get':
        break
    case 'store':
        break
    case 'delete':
        break
    default:
        usage(1, 'preferences')
    }

}

function cliSubscription (command: string, argv: minimist.ParsedArgs) {
    switch (command) {
    case 'get':
        break
    case 'store':
        break
    case 'delete':
        break
    default:
        usage(1, 'subscription')
    }
}

const argv = process.argv.slice(2)
const action = argv.shift()
const command = argv.shift()

console.log('OK')

if (action && command) {
    switch (action) {
    case 'webpush':
        cliWebPush(command, minimist(argv))
        break
    case 'preferences':
        cliPreferences(command, minimist(argv))
        break
    case 'subscription':
        cliSubscription(command, minimist(argv))
        break
    default:
        usage()
    }
} else {
    usage(1)
}
