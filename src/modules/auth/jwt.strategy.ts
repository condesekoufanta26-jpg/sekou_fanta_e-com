import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    
    // Vérifier que le secret existe
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,  // ← Maintenant garanti d'être string
    });
  }

  async validate(payload: any) {
    console.log('=== JWT STRATEGY DEBUG ===');
    console.log('Payload reçu:', payload);
    
    const user = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    
    console.log('User retourné:', user);
    return user;
  }
}