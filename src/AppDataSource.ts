import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

import * as entities from './entities/index.js';
import { CutomTypeORMLogger } from './Logger.js';

const config: DataSourceOptions = process.env.MYSQL_HOST
    ? {
          type: 'mysql',
          host: process.env.MYSQL_HOST,
          username: process.env.MYSQL_USERNAME,
          password: process.env.MYSQL_PASSWORD,
          database: process.env.MYSQL_DATABASE,
      }
    : { type: 'sqlite', database: join(process.cwd(), 'database.db') };

export const AppDataSource = new DataSource({
    ...config,
    entities: Object.values(entities),
    synchronize: true,
    logging: true,
    logger: new CutomTypeORMLogger(),
});
