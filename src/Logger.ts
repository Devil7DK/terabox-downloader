import chalk from 'chalk';
import { Logger } from 'typeorm';
import winston from 'winston';
import 'winston-daily-rotate-file';

import { highlight } from 'cli-highlight';

export const logger = winston.createLogger({
    level:
        process.env.LOG_LEVEL ||
        (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
                winston.format.printf(
                    ({ timestamp, level, message, action, ...info }) => {
                        const levelColor =
                            level === 'info'
                                ? chalk.greenBright
                                : level === 'warn'
                                ? chalk.yellowBright
                                : level === 'error'
                                ? chalk.redBright
                                : chalk.gray;

                        let value = `${chalk.cyanBright(
                            timestamp
                        )} [${levelColor(level.padStart(5, ' '))}] : `;

                        switch (action) {
                            case 'onQuery':
                                value += highlight(message, {
                                    language: 'sql',
                                });
                                break;
                            case 'onQueryError':
                            case 'onQuerySlow':
                                value += `${message} - ${highlight(info.query, {
                                    language: 'sql',
                                })}`;
                                break;
                            default:
                                value += message;
                                if (Object.keys(info).length > 0)
                                    value += ` -- ${highlight(
                                        JSON.stringify(info),
                                        { language: 'json' }
                                    )}`;
                        }

                        if (info.parameters) {
                            value += ` -- ${highlight(
                                JSON.stringify(info.parameters),
                                { language: 'json' }
                            )}`;
                        }

                        return value;
                    }
                )
            ),
        }),
        new winston.transports.DailyRotateFile({
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            filename: 'logs/%DATE%.log',
            datePattern: 'YYYY-MM-DD-HH',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
        }),
    ],
});

export class CutomTypeORMLogger implements Logger {
    logQuery(query: string, parameters?: any[] | undefined) {
        logger.verbose(query, { action: 'onQuery', parameters });
    }
    logQueryError(
        error: string | Error,
        query: string,
        parameters?: any[] | undefined
    ) {
        logger.error(error instanceof Error ? error.message : error, {
            action: 'onQueryError',
            query,
            parameters,
            error,
        });
    }
    logQuerySlow(time: number, query: string, parameters?: any[] | undefined) {
        logger.warn(`Slow query take time ${time}`, {
            actoin: 'onQuerySlow',
            query,
            parameters,
        });
    }
    logSchemaBuild(message: string) {
        logger.verbose(message, { action: 'onSchemaBuild' });
    }
    logMigration(message: string) {
        logger.verbose(message, { action: 'onMigration' });
    }
    log(level: 'info' | 'log' | 'warn', message: any) {
        logger.log(level === 'log' ? 'verbose' : level, message, {
            action: 'onTypeORMLog',
        });
    }
}
