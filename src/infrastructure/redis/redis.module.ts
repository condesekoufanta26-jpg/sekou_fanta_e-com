import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const redis = new Redis({
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get('REDIS_DB', 0),
          keyPrefix: 'nestjs:',
          // ✅ Ne pas connecter au démarrage — connexion à la demande
          lazyConnect: true,
          // ✅ Arrêter les tentatives de reconnexion après 3 essais
          retryStrategy: (times) => {
            if (times > 3) return null; // stop retry
            return Math.min(times * 200, 1000);
          },
          // ✅ Supprimer les erreurs non gérées
          enableOfflineQueue: false,
        });

        // ✅ Absorber les erreurs au niveau du client
        redis.on('error', () => {});

        return redis;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}