import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useFactory: (configService: ConfigService) => {
        return new Pool({
          connectionString: configService.get<string>('DATABASE_URL'),
          max: configService.get<number>('DB_MAX_CONNECTIONS', 20),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['DATABASE_POOL'],
})
export class DatabaseModule {}
