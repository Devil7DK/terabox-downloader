import Axios, {
    AxiosProgressEvent,
    AxiosRequestConfig,
    CreateAxiosDefaults,
} from 'axios';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { MessageEntity } from 'typegram';

import { wrapper } from 'axios-cookiejar-support';
import { HttpsProxyAgent } from 'https-proxy-agent';
import humanizeDuration from 'humanize-duration';
import { throttle } from 'throttle-debounce';
import { Config } from '../Config.js';
import { logger } from '../Logger.js';
import { store } from '../Store.js';
import { JobEntity } from '../entities/JobEntity.js';
import {
    DownloadedFile,
    TeraBoxFile,
    TeraBoxShareInfo,
} from '../types/index.js';
import { formatBytes, round } from './Common.js';

const allowedHosts = [/.*box.*/];

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
    } as CreateAxiosDefaults<any>)
);

// Retry the download requests 3 times if the error message is `ECONNRESET` (Only when responseType is stream)
axios.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (
            error.code === 'ECONNRESET' &&
            error.config?.responseType === 'stream' &&
            error.config?.method === 'get' &&
            error.config?.retryCount < 3
        ) {
            error.config.retryCount = (error.config.retryCount || 0) + 1;

            logger.warn(
                `Request to ${error.config.url} failed with ECONNRESET. Retrying...`,
                {
                    action: 'onDownload',
                    error,
                }
            );

            // Wait for 5 seconds before retrying
            await new Promise((resolve) => setTimeout(resolve, 5000));

            return axios.request(error.config);
        }

        return Promise.reject(error);
    }
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
            return allowedHosts.some((regex) => regex.test(new URL(item).host));
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
        `https://terabox-dl.qtcloud.workers.dev/api/get-info?shorturl=${shareCode}&pwd=`,
        {
            headers: {
                Referer: 'https://terabox-dl.qtcloud.workers.dev/',
            },
            httpsAgent:
                store.useProxy && Config.PROXY_URL
                    ? new HttpsProxyAgent(Config.PROXY_URL)
                    : undefined,
        }
    );

    logger.debug(`Fetched share info for "${url}"`, {
        action: 'onDownload',
        url: url.toString(),
    });

    return {
        ok: response.data.ok,
        shareId: response.data.shareid,
        uk: response.data.uk,
        sign: response.data.sign,
        timestamp: response.data.timestamp,
        list: response.data.list,
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
        'https://terabox-dl.qtcloud.workers.dev/api/get-download',
        {
            shareid: info.shareId,
            uk: info.uk,
            sign: info.sign,
            timestamp: info.timestamp,
            fs_id: info.fs_id,
        },
        {
            httpsAgent:
                store.useProxy && Config.PROXY_URL
                    ? new HttpsProxyAgent(Config.PROXY_URL)
                    : undefined,
        }
    );
    logger.debug(`Fetched download URL for ${info.fs_id}`, {
        action: 'onDownload',
        info,
        dlink: response.data.downloadLink,
        response: response.data,
    });

    const dlink = response.data.downloadLink as string;

    if (!dlink) {
        logger.debug(`Failed to get download url for ${info.fs_id}`, {
            action: 'onDownload',
            info,
            response: response.data,
        });

        throw new Error('Failed to get download url');
    }

    return dlink;
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

        if (
            existsSync(filePath) &&
            statSync(filePath).size >= Number(file.size)
        ) {
            logger.info(`File ${file.fs_id} is already downloaded for ${url}`, {
                action: 'onDownload',
                file,
                url,
            });
        } else {
            const reportProgress = throttle(
                1000,
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

                    store.bot?.telegram
                        .editMessageText(
                            job.chatId,
                            job.statusMessageId,
                            undefined,
                            `URL: ${job.url}\nStatus: ${job.status}\nProgress: ${progress}`
                        )
                        .catch((error) => {
                            logger.error(
                                `Failed to update message ${job.statusMessageId} for download progress!`,
                                {
                                    action: 'onDownload',
                                    file,
                                    job,
                                    error,
                                }
                            );
                        });
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
                    retryCount: 0,
                    httpsAgent:
                        store.useProxy && Config.PROXY_URL
                            ? new HttpsProxyAgent(Config.PROXY_URL)
                            : undefined,
                } as AxiosRequestConfig)
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
        }

        files.push({ filePath, fileName: file.filename });
    }

    return files;
}
