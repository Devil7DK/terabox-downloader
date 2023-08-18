export function formatBytes(bytes: number, decimals: number = 2) {
    if (!+bytes) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = [
        'Bytes',
        'KiB',
        'MiB',
        'GiB',
        'TiB',
        'PiB',
        'EiB',
        'ZiB',
        'YiB',
    ];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function round(value: number, decimals: number = 0) {
    return decimals
        ? Math.round((value + Number.EPSILON) * (10 ^ decimals)) /
              (10 ^ decimals)
        : Math.round(value);
}

export function ordinalSuffixOf(value: number) {
    var j = value % 10,
        k = value % 100;
    if (j == 1 && k != 11) {
        return value + 'st';
    }
    if (j == 2 && k != 12) {
        return value + 'nd';
    }
    if (j == 3 && k != 13) {
        return value + 'rd';
    }
    return value + 'th';
}
