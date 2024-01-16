import { existsSync, mkdirSync } from 'fs';
import { MessageEntity } from 'typegram';

import { logger } from '../../Logger.js';
import { JobEntity } from '../../entities/JobEntity.js';
import { DownloadedFile } from '../../types/index.js';
import { downloadsPath } from './Common.js';
import { downloadFilesUsingRevesery } from './Revesery.js';

const allowedHosts = [/.*box.*/];

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

export async function downloadFiles(job: JobEntity): Promise<DownloadedFile[]> {
    const files: DownloadedFile[] = await downloadFilesUsingRevesery(job);

    return files;
}
