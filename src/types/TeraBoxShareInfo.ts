import { TeraBoxFile } from './TeraBoxFile.js';

export type TeraBoxShareInfo = {
    shareId: number;
    ok: boolean;
    uk: number;
    sign: string;
    timestamp: number;
    list: TeraBoxFile[];
};
