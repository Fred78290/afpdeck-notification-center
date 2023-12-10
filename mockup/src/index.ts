/* eslint-disable @typescript-eslint/naming-convention */

import ApiCore from 'afp-apicore-sdk'
import { ApiCoreDocument, NoticationData, PostedPushNoticationData } from 'afp-apicore-sdk/dist/types'
import { ServerApp, AppOptions, createApp } from '../../src/server'
import { SubscriptionDocument } from '../../lambda/databases'
import { Request, Response, NextFunction } from 'express'
import * as dotenv from 'dotenv'
import { randomUUID } from 'crypto'
import fetch from 'cross-fetch'

dotenv.config({ path: __dirname + '/../.env' })

console.log(process.env)

const LISTEN_PORT = process.env.LISTEN_PORT ?? 8080
const AFPDECK_NOTIFICATION_URL = `http://localhost:${LISTEN_PORT}`

const mandatories = [
    'APICORE_TEST_URL',
    'APICORE_CLIENT_ID',
    'APICORE_CLIENT_SECRET',
    'APICORE_USERNAME',
    'APICORE_PASSWORD'
]

const apicore = new ApiCore({
    baseUrl: process.env.APICORE_TEST_URL,
    clientId: process.env.APICORE_CLIENT_ID,
    clientSecret: process.env.APICORE_CLIENT_SECRET,
    saveToken: (token) => {
        console.log(token)
    }
})

const options: AppOptions = {
    debug: true,
    apicoreBaseURL: process.env.APICORE_TEST_URL ?? '',
    clientID: process.env.APICORE_CLIENT_ID ?? '',
    clientSecret: process.env.APICORE_CLIENT_SECRET ?? '',
    afpDeckPushURL: `${AFPDECK_NOTIFICATION_URL}/api/push`,
    apicorePushUserName: 'fred78290',
    apicorePushPassword: '1234',
    useMongoDB: true,
    mongoURL: process.env.MONGODB_URL,
    registerService: false
}

function btoa (str: string, encoding?: BufferEncoding) {
    return Buffer.from(str, encoding).toString('base64')
}

function queryParams (request: Request, params: string): string | undefined {
    const value = request.query[params]

    if (value) {
        if (Array.isArray(value)) {
            return value[0] as string
        } else {
            return value as string
        }
    }
}

async function fetchImage (url: string): Promise<string | undefined> {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'image/*'
        }
    })

    if (response.status > 200 && response.status < 300) {
        const body = Buffer.from(await response.arrayBuffer())

        return body.toString('base64')
    }
}

async function findThumbnail (doc: ApiCoreDocument) {
    let thumbnailURL: string | undefined
    let thumbnail: string | undefined

    if (doc.bagItem && doc.bagItem.length > 0) {
        for (let bagItem of doc.bagItem) {
            for (let mediaItem of bagItem.medias) {
                if (mediaItem.role.toLowerCase() === 'thumbnail') {
                    return {
                        thumbnailURL: mediaItem.href,
                        thumbnail: await fetchImage(mediaItem.href)
                    }
                }
            }
        }
    }

    return {
        thumbnailURL: undefined,
        thumbnail: undefined
    }
}

function authorizationHeader (username?: string, password?: string) {
    if (username && password) {
        return `Basic ${btoa(username)}:${btoa(password)}`
    } else {
        return ''
    }
}

interface NoticationStatus {
    uno: string
    result: boolean
    reason?: string
}

function sendPush (serverApp: ServerApp, notications: NoticationData[]): Promise<NoticationStatus[]> {
    return new Promise<NoticationStatus[]>((resolve, reject) => {
        const alls: Promise<NoticationStatus>[] = []
        const authHeader = authorizationHeader(process.env.APICORE_PUSH_USERNAME, process.env.APICORE_PUSH_PASSWORD)

        for (let notication of notications) {
            alls.push(new Promise<NoticationStatus>((resolve) => {
                const pushData: PostedPushNoticationData = {
                    type: 'notification',
                    emitter: 'Core API',
                    version: '1.0.0',
                    uuid: randomUUID(),
                    payload: [
                        notication
                    ]
                }

                const response = fetch(process.env.AFPDECK_PUSH_URL ?? 'http://localhost:8080/api/push', {
                    method: 'POST',
                    body: JSON.stringify(pushData),
                    headers: {
                        Authorization: authHeader,
                        Accept: 'application/json',
                        'Content-Type': 'application/json'
                    }
                })

                response.then((result) => {
                    if (result.status >= 200 && result.status < 300) {
                        result.json().then((body) => {
                            console.log(body)

                            resolve({
                                uno: notication.uno,
                                result: true
                            })
                        }).catch((e) => {
                            console.error(e)

                            resolve({
                                uno: notication.uno,
                                result: false,
                                reason: e
                            })
                        })
                    } else {
                        result.text().then((body) => {
                            console.log(body)

                            resolve({
                                uno: notication.uno,
                                result: false,
                                reason: body
                            })
                        }).catch((e) => {
                            console.error(e)

                            resolve({
                                uno: notication.uno,
                                result: false,
                                reason: e
                            })
                        })
                    }
                }).catch((e) => {
                    resolve({
                        uno: notication.uno,
                        result: false,
                        reason: e
                    })
                })
            }))
        }

        Promise.allSettled(alls).then((result) => {
            const values: NoticationStatus[] = []

            result.forEach(v => {
                if (v.status === 'fulfilled') {
                    values.push(v.value)
                }
            })

            resolve(values)
        }).catch((e) => {
            reject(e)
        })
    })
}

async function mockupPush (
    serverApp: ServerApp,
    request: Request,
    response: Response,
    next: NextFunction
) {
    const userName = queryParams(request, 'username')

    if (userName) {
        const subscriptions: SubscriptionDocument[] = await serverApp.handler.storage.getSubscriptions(userName)
        const notications: NoticationData[] = []

        for (const element of subscriptions) {
            const subscription = element
            const results = await apicore.execute({
                maxRows: 1,
                query: subscription.subscription.query,
                sortField: 'published',
                sortOrder: 'desc',
                dateRange: {
                    from: 'now-1h',
                    to: 'now'
                }
            })

            if (results.count > 0) {
                const doc = results.documents[0]
                const { thumbnailURL, thumbnail } = await findThumbnail(doc)
                const notication: NoticationData = {
                    uno: doc.uno,
                    url: doc.href,
                    title: doc.title,
                    text: doc.summary.join('\n'),
                    headline: doc.headline,
                    urgency: doc.urgency,
                    class: doc.class,
                    contentCreated: doc.contentCreated,
                    providerid: doc.providerid.name,
                    lang: doc.lang,
                    genreid: doc.genreid ? doc.genreid[0] : undefined,
                    wordCount: doc.wordCount,
                    guid: doc.guid,
                    abstract: doc.summary.join('\n'),
                    thumbnailURL: thumbnailURL,
                    thumbnail: thumbnail,
                    subscriptions: [
                        {
                            name: subscription.name,
                            clientID: process.env.APICORE_CLIENT_ID ?? '',
                            userID: userName,
                            identifier: subscription.uno,
                            isFree: true,
                            documentUrl: doc.href,
                            thumbnailUrl: thumbnail
                        }
                    ]
                }

                notications.push(notication)
            }
        }

        if (notications.length > 0) {
            sendPush(serverApp, notications).then((result) => {
                console.log('Succesful push:', notications)
            }).catch((e) => {
                console.error('Failed push:', e)
            })
        }

        response.status(200).json({
            response: {
                notications: notications,
                status: {
                    code: 0,
                    message: 'OK'
                }
            }
        })
    } else {
        response.status(406).json({
            error: {
                code: 406,
                reason: 'UserName is not defined'
            }
        })
    }
}

function checkMandatories () {
    mandatories.forEach(name => {
        if (!process.env[name]) {
            console.error('env: %s is not defined')
            process.exit(1)
        }
    })
}

function startMockup (): void {
    checkMandatories()

    console.log('Will authenticate')

    apicore.authenticate({
        username: process.env.APICORE_USERNAME,
        password: process.env.APICORE_PASSWORD
    }).then((token) => {
        console.log('Did authenticate')
        createApp(options).then((serverApp) => {
            console.log('Will listen server')

            const server = serverApp.express.listen(LISTEN_PORT, () => {
                console.log(`Did server is listening on ${LISTEN_PORT}`)

                serverApp.express.get('/mockup', (req, resp, next) => {
                    mockupPush(serverApp, req, resp, next).then(() => {
                        console.log('Successful')
                    }).catch((e) => {
                        console.error(e)
                    })
                })

                process.on('SIGTERM', () => {
                    server.close(() => {
                        serverApp.handler.close()
                            .then(() => {
                                console.log('Handler closed')
                            }).catch((e) => {
                                console.error(e)
                            }).finally(() => {
                                process.exit(0)
                            })
                    })
                })
            })
        }).catch((e) => {
            console.error(e)
        })
    }).catch((e) => {
        console.log('Failed to authenticate', e)
    })
}

startMockup()
