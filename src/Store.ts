import { Telegraf } from 'telegraf';

const _store: { bot: Telegraf | null } = {
    bot: null,
};

export const store = _store;
