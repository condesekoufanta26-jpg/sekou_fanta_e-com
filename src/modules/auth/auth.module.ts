// src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshStrategy } from './strategies/refresh.strategy';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SmsModule } from '../../common/services/sms/sms.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ttl: config.get('AUTH_THROTTLE_TTL', 60),
        limit: config.get('AUTH_THROTTLE_LIMIT', 5), // 5 requêtes par minute sur /auth/*
      }),
    }),
    SmsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshStrategy, RolesGuard, JwtAuthGuard],
  exports: [JwtModule, PassportModule, RolesGuard, JwtAuthGuard],
})
export class AuthModule {}