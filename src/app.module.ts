// src/app.module.ts
import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, APP_GUARD } from '@nestjs/core';

// Configuration
import configuration from './common/config/configuration';
import validationSchema from './common/config/validation.schema';

// Middleware Global
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';

// Filters, Interceptors, Pipes, Guards
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { ValidationPipe } from './common/pipes/validation.pipe';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

// Modules
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { LoggingModule } from './infrastructure/logging/logging.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Configuration Globale
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      envFilePath: ['.env', '.env.local'],
    }),

    // Rate Limiting avec Redis (OWASP API4)
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ttl: config.get('THROTTLE_TTL', 60),
        limit: config.get('THROTTLE_LIMIT', 100),
      }),
    }),

    // Job Scheduling
    ScheduleModule.forRoot(),

    // Infrastructure
    DatabaseModule,
    RedisModule,
    LoggingModule,

    // Domain Modules
    AuthModule,
    UsersModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    HealthModule,
  ],

  controllers: [],

  providers: [
    // Guards globaux (OWASP API5)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Appliqué globalement, utiliser @Public() pour les routes publiques
    },
    // Filters globaux
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Interceptors globaux (traçabilité, logs)
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
    // Pipe global de validation (OWASP API3, API6)
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Configure les middleware globaux appliqués à toutes les routes
   * Ordre d'exécution :
   * 1. CorrelationIdMiddleware (génère UUID pour traçabilité 152-ФЗ)
   * 2. SecurityHeadersMiddleware (ajoute headers de sécurité OWASP API8)
   * 3. LoggerMiddleware (log structuré des requêtes)
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        CorrelationIdMiddleware,   // Génère et injecte correlationId
        SecurityHeadersMiddleware, // Ajoute headers de sécurité (HSTS, CSP, etc.)
        LoggerMiddleware,          // Log structuré de la requête
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}