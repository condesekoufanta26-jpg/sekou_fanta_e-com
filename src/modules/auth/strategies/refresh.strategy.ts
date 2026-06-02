  // src/modules/auth/strategies/refresh.strategy.ts
  import { Injectable } from '@nestjs/common';
  import { PassportStrategy } from '@nestjs/passport';
  import { ExtractJwt, Strategy } from 'passport-jwt';
  import { ConfigService } from '@nestjs/config';
  import { Request } from 'express';
  import { JwtPayload } from '../interfaces/jwt-payload.interface';

  @Injectable()
  export class RefreshStrategy extends PassportStrategy(Strategy, 'refresh') {
    constructor(private configService: ConfigService) {
      const secret = configService.get<string>('JWT_REFRESH_SECRET') || configService.get<string>('JWT_SECRET');
      if (!secret) {
        throw new Error('JWT_REFRESH_SECRET is not defined');
      }

      super({
        jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
        ignoreExpiration: false,
        secretOrKey: secret,
        passReqToCallback: true,
      });
    }

    async validate(req: Request, payload: JwtPayload) {
      return {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    }
  }