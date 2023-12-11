import usage from './usage'

export default function missing (what: string): string {
    console.log(`Missing ${what}`)

    usage(1)

    return what
}

