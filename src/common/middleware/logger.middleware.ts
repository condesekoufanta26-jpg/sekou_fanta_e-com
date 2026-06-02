// src/common/middleware/logger.middleware.ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getCorrelationId } from './correlation-id.middleware';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: FastifyRequest, res: FastifyReply, next: () => void) {
    const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
    (req as any).correlationId = correlationId;
    
    // ✅ Fastify utilise header() au lieu de setHeader()
    res.header('X-Correlation-Id', correlationId);

    const startTime = Date.now();

    // ✅ Fastify utilise res.raw.on('finish')
    res.raw.on('finish', () => {
      const duration = Date.now() - startTime;
      this.logger.log({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        correlationId,
        method: req.method,
        path: req.url,
        statusCode: res.statusCode,
        durationMs: duration,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    });

    next();
  }
}