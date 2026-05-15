import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. SÉCURITÉ: Headers HTTP (Helmet)

  app.use(helmet({
    // Cache X-Powered-By (évite de révéler Express)
    hidePoweredBy: true,
    
    // Ajoute X-Content-Type-Options: nosniff
    xContentTypeOptions: true,
    
    // Ajoute X-Frame-Options: SAMEORIGIN
    frameguard: {
      action: 'sameorigin',
    },
    
    // Ajoute X-XSS-Protection: 1; mode=block
    xssFilter: true,
    
    // Ajoute Strict-Transport-Security (HSTS)
    hsts: {
      maxAge: 31536000, // 1 an
      includeSubDomains: true,
      preload: true,
    },
    
    // Ajoute Cross-Origin-Resource-Policy
    crossOriginResourcePolicy: {
      policy: 'same-origin',
    },
    
    // Ajoute Cross-Origin-Opener-Policy
    crossOriginOpenerPolicy: {
      policy: 'same-origin',
    },
  }));


  // 2. TRACABILITÉ: Correlation ID Middleware

  app.use(new CorrelationIdMiddleware().use);


  // 3. CONFIGURATION SWAGGER

  const config = new DocumentBuilder()
    .setTitle('E-commerce API')
    .setDescription('API pour projet académique NestJS')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);


  // 4. VALIDATION GLOBALE

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        return new BadRequestException({
          message: 'Validation failed',
          errors: errors.map(err => ({
            field: err.property,
            constraints: err.constraints,
          })),
        });
      },
    }),
  );


  // 5. CORS (pour le frontend)

  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  });


  // 6. DÉMARRAGE DU SERVEUR

  await app.listen(3000);
  console.log('Server running on http://localhost:3000');
  console.log('Swagger UI: http://localhost:3000/api-docs');
}

bootstrap();