// Download terabox files using https://teraboxdownloader.net/

import { randomUUID } from 'crypto';
import { HTMLElement, parse } from 'node-html-parser';
import { join } from 'path';
import { logger } from '../../Logger.js';
import { JobEntity } from '../../entities/index.js';
import { DownloadedFile } from '../../types/index.js';
import { axios, downloadFile, downloadsPath } from './Common.js';

const baseUrl = 'https://teraboxdownloader.net/';

async function getToken(): Promise<{ token: string; cookie: string }> {
    const response = await axios.get(baseUrl);

    let document: HTMLElement | undefined;

    try {
        document = parse(response.data);
    } catch (error) {
        logger.error('Failed to parse response!', {
            action: 'onDownload',
            error,
            html: response.data,
        });

        throw new Error('Failed to parse response!');
    }

    const token = document.querySelector('input#token')?.getAttribute('value');

    if (!token) {
        logger.error('Failed to get token!', {
            action: 'onDownload',
            html: response.data,
        });

        throw new Error('Failed to get token!');
    }

    return { token, cookie: response.headers['set-cookie']?.join(';') ?? '' };
}

async function getDownloadURL(
    url: string
): Promise<{ downloadUrl: string; fileName: string }> {
    const { token, cookie } = await getToken();

    const payload = {
        token,
        url,
    };

    const response = await axios.post(baseUrl, payload, {
        headers: {
            Cookie: cookie,
            Referer: baseUrl,
        },
    });

    if (response.data.status !== 'success') {
        logger.error('Failed to get download URL!', {
            action: 'onDownload',
            url: url.toString(),
            response: response.data,
        });

        throw new Error('Failed to get download URL!');
    }

    const html = response.data.message;

    let document: HTMLElement | undefined;

    try {
        document = parse(html);
    } catch (error) {
        logger.error('Failed to parse response!', {
            action: 'onDownload',
            error,
            html,
        });

        throw new Error('Failed to parse response!');
    }

    const downloadUrl = document
        .querySelector('a#download_file')
        ?.getAttribute('href');

    if (!downloadUrl) {
        logger.error('Failed to get download URL!', {
            action: 'onDownload',
            html,
        });

        throw new Error('Failed to get download URL!');
    }

    const fileName =
        document.querySelector('img')?.getAttribute('alt') ?? randomUUID();

    return { downloadUrl, fileName };
}

export async function downloadFilesUsingTeraboxDownloaderDotNet(
    job: JobEntity
): Promise<DownloadedFile[]> {
    const files: DownloadedFile[] = [];

    const { downloadUrl, fileName } = await getDownloadURL(job.url);

    const fid =
        new URLSearchParams(new URL(downloadUrl).search).get('fid') ??
        randomUUID();

    const filePath = join(downloadsPath, fid);

    await downloadFile(job, downloadUrl, filePath, {});

    files.push({ filePath, fileName });

    return files;
}
