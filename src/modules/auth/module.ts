// modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controller';
import { AuthService } from './service';
import { JwtStrategy } from './jwt.strategy';
import { RefreshStrategy } from './refresh.strategy';
import { RolesGuard } from '../guards/roles';  // ← Vérifiez ce chemin
import { JwtAuthGuard } from '../guards/jwt-auth';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService, 
    JwtStrategy, 
    RefreshStrategy, 
    RolesGuard,
    JwtAuthGuard,
  ],
  exports: [
    JwtModule, 
    PassportModule, 
    RolesGuard,
    JwtAuthGuard,
  ],
})
export class AuthModule {}