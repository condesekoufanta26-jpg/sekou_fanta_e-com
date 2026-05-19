// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded } from 'express';

import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggerService } from './infrastructure/logging/logging.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer les logs jusqu'à initialisation complète
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
      exposedHeaders: ['X-Correlation-Id'],
    },
  });

  // 📋 Configuration du logger structuré (152-ФЗ)
  app.useLogger(app.get(LoggerService));

  // 🛡️ Headers de sécurité (OWASP API8, Helmet)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 an
      includeSubDomains: true,
      preload: true,
    },
  }));

  // 🗜️ Compression gzip (Performance)
  app.use(compression());

  // 📦 Limite de payload (protection contre DoS)
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // 🔄 Versionnage API (OWASP API9)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // ✅ Validation globale (OWASP API3, API6)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,               // Supprime les champs non whitelistés
    forbidNonWhitelisted: true,    // Rejette les champs non déclarés
    transform: true,               // Transforme les types automatiquement
    transformOptions: {
      enableImplicitConversion: false, // Évite conversions dangereuses
    },
  }));

  // 📝 Middleware global de traçabilité (152-ФЗ)
  app.use(new CorrelationIdMiddleware().use);

  // 📖 Documentation OpenAPI (Swagger)
  const config = new DocumentBuilder()
    .setTitle('E-commerce API')
    .setDescription('Secure REST API for e-commerce MVP')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Correlation-Id', in: 'header' }, 'correlation-id')
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('products', 'Product catalog')
    .addTag('cart', 'Shopping cart')
    .addTag('orders', 'Order management')
    .addTag('payments', 'Payment processing')
    .addTag('health', 'Health checks')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });

  // 🩺 Health check endpoint
  app.getHttpAdapter().get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 🔌 Graceful shutdown (SIGTERM handler)
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const host = configService.get<string>('HOST', '0.0.0.0');

  const server = await app.listen(port, host);
  logger.log(`🚀 Server running on http://${host}:${port}`);
  logger.log(`📚 Swagger UI: http://${host}:${port}/api/docs`);

  // Gestion des signaux d'arrêt
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM signal received: closing HTTP server...');
    await app.close();
    logger.log('HTTP server closed');
    process.exit(0);
  });
}

bootstrap();