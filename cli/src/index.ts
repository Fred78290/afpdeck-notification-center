import minimist from 'minimist'
import { Token } from 'afp-apicore-sdk/dist/types'
import usage from './usage'
import Client from './cli'
import missing from './missing'

async function createNotificationCenter (argv: minimist.ParsedArgs) {
    const afpdeck = new Client({
        opts: argv,
        baseUrl: argv['apicore-url'] ?? process.env.APICORE_BASE_URL ?? 'https://afp-apicore-prod.afp.com',
        clientId: argv['client-id-url'] ?? process.env.APICORE_CLIENT_ID ?? missing('client id'),
        clientSecret: argv['client-secret'] ?? process.env.APICORE_CLIENT_SECRET ?? missing('client secret'),
        notificationCenterUrl: argv['afpdeck-notification-url'] ?? process.env.AFPDECK_NOTIFICATION_URL ?? 'https://afpdeck-notification-center.aldunelabs.fr',
        saveToken: (token: Token | null) => {
            console.log(token)
        }
    })

    await afpdeck.authenticate({username: argv['username'] ?? missing('username'), password: argv['password'] ?? missing('password')})

    return afpdeck
}

const argv = process.argv.slice(2)
const action = argv.shift()
const command = argv.shift()
const options = minimist(argv)

if (action && command) {
    createNotificationCenter(options).then((afpdeck) => {
        afpdeck.run(action, command).then(() => {
            process.exit(0)
        }).catch((e) => {
            console.error(e)
            process.exit(1)
        })
    }).catch((e) => {
        console.error(e)
        process.exit(1)
    })
} else {
    usage(1)
}
