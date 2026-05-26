// src/main.ts
import { NestFactory } from '@nestjs/core';
import { 
  FastifyAdapter, 
  NestFastifyApplication 
} from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

/**
 * ✅ Performance: Fastify (30% plus rapide qu'Express)
 * ✅ Sécurité: Helmet + CORS restrictif
 * ✅ Traçabilité: Correlation ID + Logging interceptor
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // Fastify adapter pour performance optimale
  const adapter = new FastifyAdapter({ 
    trustProxy: true,
    bodyLimit: 10_485_760, // 10MB
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true }
  );

  const configService = app.get(ConfigService);

  // ============================================
  // 🛡️ SÉCURITÉ : Helmet (Headers HTTP)
  // ============================================
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  // ============================================
  // 🗜️ PERFORMANCE : Compression GZIP
  // ============================================
  await app.register(compress, { 
    encodings: ['gzip', 'deflate'],
    threshold: 1024,
  });

  // ============================================
  // 🍪 COOKIE Parser pour refresh token
  // ============================================
  await app.register(fastifyCookie, {
    secret: configService.get<string>('COOKIE_SECRET') || 'default-secret-key',
  });

  // ============================================
  // 🔄 CORS restrictif (Sécurité)
  // ============================================
  app.enableCors({
    origin: configService.get('CORS_ORIGINS', 'http://localhost:3000').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    exposedHeaders: ['X-Correlation-Id'],
    maxAge: 86400,
  });

  // ============================================
  // 📝 VALIDATION GLOBALE (OWASP #3, #6)
  // ============================================
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: false,
    },
  }));

  // ============================================
  // 🔍 TRACABILITÉ : Correlation ID Middleware
  // ============================================
  app.use(new CorrelationIdMiddleware().use);

  // ============================================
  // 📊 LOGGING & EXCEPTIONS
  // ============================================
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // ============================================
  // 🔄 API VERSIONING
  // ============================================
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // ============================================
  // 📚 SWAGGER DOCUMENTATION
  // ============================================
  const swaggerConfig = new DocumentBuilder()
    .setTitle('E-commerce API')
    .setDescription('Secure REST API for e-commerce MVP')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Correlation-Id', in: 'header' })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // 🩺 Health check
  app.getHttpAdapter().get('/health', async () => ({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  //Graceful shutdown
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`Swagger UI: http://localhost:${port}/api/docs`);
}

bootstrap();