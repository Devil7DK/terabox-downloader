import Axios, { CreateAxiosDefaults } from 'axios';

import { wrapper } from 'axios-cookiejar-support';
import { join } from 'path';

import { logger } from '../../Logger.js';

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
