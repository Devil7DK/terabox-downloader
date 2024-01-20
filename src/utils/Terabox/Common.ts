import Axios, {
    AxiosInstance,
    AxiosProgressEvent,
    AxiosRequestConfig,
    CreateAxiosDefaults,
} from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { createWriteStream } from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import humanizeDuration from 'humanize-duration';
import { join } from 'path';
import { throttle } from 'throttle-debounce';

import { Config } from '../../Config.js';
import { logger } from '../../Logger.js';
import { store } from '../../Store.js';
import { JobEntity } from '../../entities/JobEntity.js';
import { TeraboxMirror } from '../../types/index.js';
import { formatBytes, round } from '../Common.js';

export const downloadsPath = join(process.cwd(), 'downloads');

export const axios = wrapper(
    Axios.create({
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.5',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        },
    } as CreateAxiosDefaults<any>) as any
) as AxiosInstance;

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

export async function downloadFile(
    job: JobEntity,
    downloadUrl: string,
    filePath: string,
    additionalLogParams: Record<string, unknown>
): Promise<void> {
    if (job.chat.config.mirror !== TeraboxMirror.TERABOX) {
        downloadUrl = downloadUrl.replace(
            'terabox.com',
            job.chat.config.mirror.toLowerCase()
        );
    }

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
                            job,
                            error,
                            ...additionalLogParams,
                        }
                    );
                });
        }
    );

    const status = { completed: false };
    const abortController = new AbortController();

    logger.info(`Starting download for url ${job.url}`, {
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
                job.chat.config.useProxy && Config.PROXY_URL
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
                url: job.url,
                downloadUrl,
                error,
                ...additionalLogParams,
            });

            throw new Error('Failed to download file!');
        })
        .finally(() => {
            status.completed = true;
        });
}
