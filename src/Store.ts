import { Telegraf } from 'telegraf';

const _store: { bot: Telegraf | null; useProxy: boolean } = {
    bot: null,
    useProxy: false,
};

export const store = _store;
