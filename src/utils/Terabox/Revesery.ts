// Download terabox files using https://www.revesery.com/p/terabox-downloader.html

import { existsSync, statSync } from 'fs';
import { join } from 'path';

import { HttpsProxyAgent } from 'https-proxy-agent';
import { Config } from '../../Config.js';
import { logger } from '../../Logger.js';
import { JobEntity } from '../../entities/JobEntity.js';
import { ConfigEntity } from '../../entities/index.js';
import {
    DownloadedFile,
    TeraBoxFile,
    TeraBoxShareInfo,
} from '../../types/index.js';
import { axios, downloadFile, downloadsPath } from './Common.js';

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

async function getShareInfo(
    url: URL,
    config: ConfigEntity
): Promise<TeraBoxShareInfo> {
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
                config.useProxy && Config.PROXY_URL
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
    info: Omit<TeraBoxShareInfo, 'list'> & TeraBoxFile,
    config: ConfigEntity
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
                config.useProxy && Config.PROXY_URL
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

export async function downloadFilesUsingRevesery(
    job: JobEntity
): Promise<DownloadedFile[]> {
    const files: DownloadedFile[] = [];

    const url = new URL(job.url);

    const { list, ...shareInfo } = await getShareInfo(
        url,
        job.chat.config
    ).catch((error) => {
        logger.error('Failed to get share info!', {
            action: 'onDownload',
            url,
            error,
        });

        throw new Error('Failed to get share info!');
    });

    for (const file of list) {
        const downloadUrl = await getDownloadURL(
            {
                ...shareInfo,
                ...file,
            },
            job.chat.config
        ).catch((error) => {
            logger.error('Failed to get download URL!', {
                action: 'onDownload',
                url,
                shareInfo,
                file,
                error,
            });

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
            await downloadFile(job, downloadUrl, filePath, {
                file,
                shareInfo,
            });
        }

        files.push({ filePath, fileName: file.filename });
    }

    return files;
}
