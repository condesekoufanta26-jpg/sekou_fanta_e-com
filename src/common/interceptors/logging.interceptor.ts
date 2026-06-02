// ✅ IMPORTS FASTIFY (pas Express !)
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
// ❌ SUPPRIMER : import { Request, Response } from 'express';
// ✅ AJOUTER :
import { FastifyRequest, FastifyReply } from 'fastify';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    // ✅ TYPES FASTIFY
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    
    const { method, url } = request;
    const userAgent = request.headers['user-agent'] || '';
    // ✅ Utiliser la fonction utilitaire pour récupérer le correlationId
    const correlationId = getCorrelationId() || (request.headers['x-correlation-id'] as string) || 'unknown';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = reply.statusCode || 200;
          
          // ✅ Log structuré JSON (compatible Loki/Promtail)
          this.logger.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            correlationId,
            method,
            path: url,
            statusCode,
            durationMs: duration,
            ip: request.ip || request.headers['x-forwarded-for'],
            userAgent,
            userId: (request as any).user?.sub || null,
            event: this.getEventType(url, method),
          }));
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            correlationId,
            method,
            path: url,
            statusCode: error.status || 500,
            durationMs: duration,
            ip: request.ip || request.headers['x-forwarded-for'],
            userAgent,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          }));
        },
      }),
    );
  }

  private getEventType(path: string, method: string): string {
    if (path.includes('/auth/login')) return 'AUTH_LOGIN';
    if (path.includes('/auth/logout')) return 'AUTH_LOGOUT';
    if (path.includes('/auth/register')) return 'AUTH_REGISTER';
    if (path.includes('/orders')) return `ORDER_${method}`;
    if (path.includes('/payments')) return `PAYMENT_${method}`;
    if (path.includes('/products')) return `PRODUCT_${method}`;
    return 'API_REQUEST';
  }
}