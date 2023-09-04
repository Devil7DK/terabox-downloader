import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

import { Config } from './Config.js';
import { CutomTypeORMLogger } from './Logger.js';
import * as entities from './entities/index.js';

const config: DataSourceOptions = Config.MYSQL_HOST
    ? {
          type: 'mysql',
          host: Config.MYSQL_HOST,
          username: Config.MYSQL_USERNAME,
          password: Config.MYSQL_PASSWORD,
          database: Config.MYSQL_DATABASE,
          port: Number(Config.MYSQL_PORT),
      }
    : { type: 'sqlite', database: join(process.cwd(), 'database.db') };

export const AppDataSource = new DataSource({
    ...config,
    entities: Object.values(entities),
    synchronize: true,
    logging: true,
    logger: new CutomTypeORMLogger(),
});
