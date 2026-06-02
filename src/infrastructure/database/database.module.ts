import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useFactory: (configService: ConfigService) => {
        const pool = new Pool({
          connectionString: configService.get<string>('DATABASE_URL'),
          max: configService.get<number>('DB_MAX_CONNECTIONS', 20),
          idleTimeoutMillis: 10000,       // ✅ Fermer les connexions inactives après 10s
          connectionTimeoutMillis: 5000,
          // ✅ Keepalive TCP — empêche VirtualBox de couper les connexions idle
          keepAlive: true,
          keepAliveInitialDelayMillis: 5000,
        });

        // ✅ Reconnecter silencieusement en cas d'erreur réseau
        pool.on('error', (err) => {
          console.error('PostgreSQL pool error:', err.message);
        });

        return pool;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['DATABASE_POOL'],
})
export class DatabaseModule {}