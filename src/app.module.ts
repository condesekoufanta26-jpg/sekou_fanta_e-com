import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './modules/auth/jwt.strategy';
import { RefreshStrategy } from './modules/auth/refresh.strategy';
import { AuthController } from './modules/auth/controller';
import { AuthService } from './modules/auth/service';
import { ProductsModule } from './modules/products/products.module';
import { CartModule } from './modules/Cart/Cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    PassportModule.register({ defaultStrategy: 'jwt' }),
    
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService): Promise<JwtModuleOptions> => {
        const secret = configService.get<string>('JWT_SECRET');
        
        if (!secret) {
          throw new Error('JWT_SECRET is not defined');
        }
        
        return {
          secret: secret,
          signOptions: { 
            expiresIn: configService.get<string>('JWT_EXPIRES_IN', '60m'),
          } as JwtModuleOptions['signOptions'],
        };
      },
      inject: [ConfigService],
    }),
    
    ProductsModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
  ],
  
  controllers: [AuthController],
  
  providers: [
    AuthService,
    JwtStrategy,
    RefreshStrategy,
  ],
  
  exports: [JwtModule, PassportModule],
})
export class AppModule {}