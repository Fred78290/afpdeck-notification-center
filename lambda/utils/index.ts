export function parseBoolean(value?: string, defaultValue: boolean = false) {
    if (value) {
        return value.toLowerCase() === 'true';
    }

    return defaultValue;
}

export function parseNumber(value?: string, defaultValue: number = 0) {
    if (value) {
        return parseInt(value);
    }

    return defaultValue;
}
