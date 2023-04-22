import FileCookieStore from '@root/file-cookie-store';
import Axios, { AxiosProgressEvent, CreateAxiosDefaults } from 'axios';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import qs from 'qs';
import { MessageEntity } from 'typegram';

import { wrapper } from 'axios-cookiejar-support';
import humanizeDuration from 'humanize-duration';
import { throttle } from 'throttle-debounce';
import { CookieJar } from 'tough-cookie';
import { logger } from '../Logger.js';
import { store } from '../Store.js';
import { JobEntity } from '../entities/JobEntity.js';
import {
    DownloadedFile,
    TeraBoxFile,
    TeraBoxShareInfo,
} from '../types/index.js';
import { formatBytes, round } from './Common.js';

const allowedHosts = [
    'www.terabox.com',
    'terabox.com',
    'www.teraboxapp.com',
    'teraboxapp.com',
];

const dpLogId = process.env.TERABOX_DP_LOGID || '';
const jsToken = process.env.TERABOX_JS_TOKEN || '';
const appId = process.env.TERABOX_APPID || '';

const cookies_store = new FileCookieStore(
    process.env.TERABOX_COOKIES_TXT || join(process.cwd(), 'cookie.txt'),
    {
        auto_sync: false,
        lockfile: true,
    }
);
const jar = new CookieJar(cookies_store);

const axios = wrapper(
    Axios.create({
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.5',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        },
        jar,
    } as CreateAxiosDefaults<any>)
);

const downloadsPath = join(process.cwd(), 'downloads');

if (!existsSync(downloadsPath)) {
    logger.info(
        `Downloads directory at "${downloadsPath}" doesn't exist! Creating now...`,
        { action: 'onInit' }
    );
    mkdirSync(downloadsPath);
} else {
    logger.info(`Downloads directory already exists at "${downloadsPath}"`, {
        action: 'onInit',
    });
}

function filterTeraboxUrls(values: string[]): string[] {
    return values.filter((item) => {
        try {
            return allowedHosts.includes(new URL(item).host);
        } catch (error) {
            return false;
        }
    });
}

export function parseUrl(value: string): string[];
export function parseUrl(value: string, entities: MessageEntity[]): string[];
export function parseUrl(value: string, entities?: MessageEntity[]): string[] {
    let urls: string[] = [];

    if (typeof value === 'string') {
        if (Array.isArray(entities)) {
            urls = entities
                .map((entity) => {
                    if (entity.type === 'url') {
                        return value.substring(
                            entity.offset,
                            entity.offset + entity.length
                        );
                    }
                    return '';
                })
                .filter((item) => !!item);
        } else {
            const matches = value.matchAll(
                /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])/gm
            );

            urls = Array.from(matches).map((match) => match[0]);
        }
    }

    return filterTeraboxUrls(urls).filter(
        (item, index, arr) => arr.indexOf(item) === index
    );
}

function getShareCode(url: URL): string {
    if (url.searchParams.has('surl')) {
        return `1${url.searchParams.get('surl')}`;
    } else {
        const paths = url.pathname.split('/');
        if (paths.length > 1 && paths[paths.length - 1][0] === '1') {
            return paths[paths.length - 1];
        }
    }

    throw new Error('Failed to get share id from URL!');
}

async function getShareInfo(url: URL): Promise<TeraBoxShareInfo> {
    const shareCode = getShareCode(url);

    logger.debug(`Fetching share info for "${url}"`, {
        action: 'onDownload',
        url: url.toString(),
    });

    const response = await axios.get(
        `https://www.terabox.com/api/shorturlinfo?app_id=${appId}&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dp-logid=${dpLogId}&shorturl=${shareCode}&root=1`,
        {
            headers: {
                Referer: `https://www.terabox.com/sharing/link?surl=${shareCode.slice(
                    1
                )}`,
            },
        }
    );

    logger.debug(`Fetched share info for "${url}"`, {
        action: 'onDownload',
        url: url.toString(),
    });

    return {
        shareId: response.data.shareid,
        uk: response.data.uk,
        sign: response.data.sign,
        timestamp: response.data.timestamp,
        list: response.data.list.map((fid: Record<string, string>) => ({
            fs_id: fid.fs_id,
            filename: fid.server_filename,
            size: fid.size,
        })),
    };
}

async function getDownloadURL(
    info: Omit<TeraBoxShareInfo, 'list'> & TeraBoxFile
) {
    logger.debug(`Fetching download URL for ${info.fs_id}`, {
        action: 'onDownload',
        info,
    });
    const response = await axios.post(
        `https://www.terabox.com/share/download` +
            `?app_id=${appId}` +
            `&web=1` +
            `&channel=dubox` +
            `&clienttype=0` +
            `&jsToken=${jsToken}` +
            `&dp-logid=${dpLogId}` +
            `&shareid=${info.shareId}` +
            `&sign=${info.sign}` +
            `&timestamp=${info.timestamp}`,
        qs.stringify({
            product: 'share',
            nozip: 0,
            fid_list: `[${info.fs_id}]`,
            uk: info.uk,
            primaryid: info.shareId,
        }),
        { headers: { 'content-type': 'application/x-www-form-urlencoded' } }
    );
    logger.debug(`Fetched download URL for ${info.fs_id}`, {
        action: 'onDownload',
        info,
    });

    const dlink = response.data.dlink as string;

    const linkResponse = await axios.get(dlink, {
        validateStatus: function (status) {
            return status == 302 || (status >= 200 && status < 300);
        },
    });

    if (linkResponse.status == 302) {
        logger.info(`Got download url from redirection for ${info.fs_id}`, {
            action: 'onDownload',
            info,
            headers: linkResponse.headers,
        });
        return linkResponse.headers.location;
    } else if (response.data && response.data && response.data.dlink) {
        logger.info(`Got download url from response for ${info.fs_id}`, {
            action: 'onDownload',
            info,
            data: response.data,
        });
        return response.data.dlink;
    } else {
        throw new Error('Failed get url download');
    }
}

export async function downloadFiles(job: JobEntity): Promise<DownloadedFile[]> {
    const files: DownloadedFile[] = [];

    const url = new URL(job.url);

    const { list, ...shareInfo } = await getShareInfo(url).catch((error) => {
        console.error('Failed to get share info for URL!', url, error);
        throw new Error('Failed to get share info!');
    });

    for (const file of list) {
        const downloadUrl = await getDownloadURL({
            ...shareInfo,
            ...file,
        }).catch((error) => {
            console.error(
                'Failed to get download URL!',
                url,
                shareInfo,
                file,
                error
            );

            throw new Error('Failed to get download URL!');
        });

        const filePath = join(downloadsPath, file.fs_id);

        const reportProgress = throttle(
            500,
            ({ loaded, total, rate, estimated }: AxiosProgressEvent) => {
                let progress = total
                    ? `${round((loaded / total) * 100, 2).toFixed(
                          2
                      )}% (${formatBytes(loaded)} / ${formatBytes(total)})`
                    : formatBytes(loaded);

                if (rate) {
                    progress += ` ${formatBytes(rate)}/s`;
                }

                if (estimated) {
                    progress += ` ${humanizeDuration(estimated * 1000, {
                        units: ['h', 'm', 's'],
                        maxDecimalPoints: 0,
                    })} remaining`;
                }

                store.bot?.telegram.editMessageText(
                    job.chatId,
                    job.statusMessageId,
                    undefined,
                    `URL: ${job.url}\nStatus: ${job.status}\nProgress: ${progress}`
                );
            }
        );

        const status = { completed: false };
        const abortController = new AbortController();

        process.once('SIGINT', () => {
            if (!status.completed) {
                status.completed = true;
                abortController.abort();
            }
        });
        process.once('SIGTERM', () => {
            if (!status.completed) {
                status.completed = true;
                abortController.abort();
            }
        });

        logger.info(`Starting download for url ${url.toString()}`, {
            action: 'onDownload',
            downloadUrl,
            job,
        });
        const writer = createWriteStream(filePath);
        await axios
            .get(downloadUrl, {
                responseType: 'stream',
                onDownloadProgress: reportProgress,
                signal: abortController.signal,
            })
            .then((response) => {
                return new Promise<boolean>((resolve, reject) => {
                    response.data.pipe(writer);

                    let error: Error | null = null;

                    writer.on('error', (err) => {
                        error = err;
                        writer.close();
                        reject(err);
                    });

                    writer.on('close', () => {
                        if (!error) {
                            resolve(true);
                        }
                    });
                });
            })
            .catch((error) => {
                logger.error('Failed to download file!', {
                    url,
                    shareInfo,
                    file,
                    downloadUrl,
                    error,
                });

                throw new Error('Failed to download file!');
            })
            .finally(() => {
                status.completed = true;
            });

        files.push({ filePath, fileName: file.filename });
    }

    return files;
}
