import minimist from 'minimist'

interface UsageInfo {
	[arg: string]: UsageInfo | string | string[] | undefined,
	name?: string,
	description: string,
	options?: string[]
}

function describeCommand(name: string, usage: UsageInfo, level: number = 0) {
	const filler = level > 0 ? ' '.repeat(level * 2) : ''
	const indent = filler + '  '
	let result = filler + name + indent + usage.description + '\n'

	if (usage.options) {
		usage.options.forEach(options => {
			result += filler + indent + indent + options + '\n'
		})
	}

	Object.keys(usage).forEach((key) => {
		const value = usage[key]

		if (key !== 'description' && key !== 'options' && key !== 'name' && typeof value === 'object') {
			result += describeCommand(key, value as UsageInfo, level + 1)
		}
	})

	return result
}

function usage(exitCode: number = 0, action?: string, command?: string) {
	let describe: UsageInfo

	const infos: UsageInfo = {
		description: 'action command [options]',
		webpush: {
			description: 'manage web-push keys',
			options: [
				'--username=<username>',
				'--password=<password>'
			],
			get: {
				description: 'Get web-push key',
				options: [
					'--browser-identifier=<browser-id>'
				],
			},
			store: {
				description: 'Store web-push key',
				options: [
					'--browser-identifier=<browser-id>',
					'--endpoint=<url>',
					'--key=<browser key>]',
					'--auth=<auth secret>',
					'--vapid-subject=<vapid subject>',
					'--vapid-pubkey=<public key url base64>',
					'--vapid-pvtkey=<private key url base64>',
					'--gcm-api-key=<api key>'
				],
			},
			delete: {
				description: 'Delete web-push key',
				options: [
					'--browser-identifier=<browser-id>'
				],
			}
		},
		preferences: {
			description: 'manage user preferences',
			options: [
				'--username=<username>',
				'--password=<password>'
			],
			get: {
				description: 'Get user preferences',
				options: [
					'--name=<name>'
				],
			},
			store: {
				description: 'Store user preference',
				options: [
					'--name=<name>',
					'--data'
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
			options: [
				'--username=<username>',
				'--password=<password>'
			],
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
		describe = infos[action] as UsageInfo

		if (command) {
			describe = describe[command] as UsageInfo
		}
	} else {
		describe = infos
	}

	describeCommand(action ?? 'afpdeck-notification-center', describe, 0)

	process.exit(exitCode)
}

function cliWebPush(command: string, argv: minimist.ParsedArgs) {
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

function cliPreferences(command: string, argv: minimist.ParsedArgs) {
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

function cliSubscription(command: string, argv: minimist.ParsedArgs) {
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

const argv = process.argv.slice(2);
const action = argv.shift();
const command = argv.shift();

if (action && command) {
	switch (action) {
		case 'webpush':
			cliWebPush(command, minimist(argv));
			break
		case 'preferences':
			cliPreferences(command, minimist(argv));
			break
		case 'subscription':
			cliSubscription(command, minimist(argv));
			break
		default:
			usage();
	}
} else {
	usage(1)
}
