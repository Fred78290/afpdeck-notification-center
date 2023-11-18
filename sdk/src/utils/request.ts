/* eslint-disable @typescript-eslint/naming-convention */
import fetch, { Headers } from 'cross-fetch'
import FormData from 'form-data'
import status from 'statuses'
import { AuthorizationHeaders } from '../types'

export type HttpHeaders = AuthorizationHeaders | { [key: string]: string | number }

function buildUrl (url: string, params: Object): string {
    const builtUrl = new URL(url)
    Object.entries(params).forEach(([key, value]) => builtUrl.searchParams.append(key, value))
    return builtUrl.toString()
}

function buildHeaders (headers: Object) {
    const builtHeaders = new Headers()
    Object.entries(headers).forEach(([key, value]) => builtHeaders.append(key, value))
    return builtHeaders
}

function buildForm (form: Object) {
    const builtForm = new FormData()
    Object.entries(form).forEach(([key, value]) => builtForm.append(key, value))
    return builtForm
}

function apiError (code: number, message?: string) {
    const error: any = new Error(message ?? (status(code) || `Request rejected with status ${code}`))
    error.code = code
    return error
}

async function fetchText (url: string, method: string, headers: object = {}, body?: any) {
    const response = await fetch(url, {
        method,
        headers: buildHeaders({ ...headers, Accept: 'text/*' }),
        body
    })

    let text = ''
    let httpStatus: { code: number; message?: string } = {
        code: response.status,
        message: response.statusText
    }

    try {
        text = await response.text()
    } catch (e) {
        if (response.ok) {
            httpStatus = {
                code: 520
            }
        }
    }

    if (httpStatus.code < 300) {
        return text
    } else {
        throw apiError(httpStatus.code, httpStatus.message)
    }
}

async function fetchJson (url: string, method: string, headers: object = {}, body?: any) {
    const response = await fetch(url, {
        method,
        headers: buildHeaders({ ...headers, Accept: 'application/json' }),
        body
    })

    let json
    let httpStatus: { code: number; message?: string } = {
        code: response.status,
        message: response.statusText
    }

    try {
        if (response.status !== 204) {
            json = await response.json()

            if (json.error) {
                httpStatus = {
                    code: json.error.code,
                    message: json.error.message
                }
            }
        } else {
            json = {
                response: {
                    status: {
                        code: 204,
                        reason: response.statusText
                    }
                }
            }
        }
    } catch (e) {
        if (response.ok) {
            httpStatus = {
                code: 520,
                message: 'JSON invalid'
            }
        }
    }

    if (httpStatus.code < 300) {
        return json
    } else {
        throw apiError(httpStatus.code, httpStatus.message)
    }
}

export async function get (
    url: string,
    {
        headers,
        params
    }: {
        params?: {
            [key: string]: string | number
        }
        headers?: HttpHeaders
    }) {
    return fetchJson(params ? buildUrl(url, params) : url, 'GET', headers)
}

export async function gettext (
    url: string,
    {
        headers,
        params
    }: {
        params?: {
            [key: string]: string | number
        }
        headers?: HttpHeaders
    }) {
    return fetchText(params ? buildUrl(url, params) : url, 'GET', headers)
}

export async function post (
    url: string,
    data: any,
    {
        headers,
        params
    }: {
        params?: {
            [key: string]: string | number | boolean
        }
        headers?: HttpHeaders
    }) {
    headers = Object.assign({}, headers, { 'Content-Type': 'application/json' })

    return fetchJson(params ? buildUrl(url, params) : url, 'POST', headers, JSON.stringify(data))
}

export async function put (
    url: string,
    data: any,
    {
        headers,
        params
    }: {
        params?: {
            [key: string]: string | number | boolean
        }
        headers?: HttpHeaders
    }) {
    headers = Object.assign({}, headers, { 'Content-Type': 'application/json' })

    return fetchJson(params ? buildUrl(url, params) : url, 'PUT', headers, JSON.stringify(data))
}

export async function del (
    url: string,
    {
        headers,
        params
    }: {
        params?: {
            [key: string]: string | number
        }
        headers?: HttpHeaders
    }, body?: unknown) {
    headers = Object.assign({}, headers, { 'Content-Type': 'application/json' })

    return fetchJson(params ? buildUrl(url, params) : url, 'DELETE', headers, body ? JSON.stringify(body) : undefined)
}
