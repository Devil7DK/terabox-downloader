import { TeraBoxFile } from './TeraBoxFile.js';

export type TeraBoxShareInfo = {
    shareId: number;
    uk: number;
    sign: string;
    timestamp: number;
    list: TeraBoxFile[];
};
