import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
    req['correlationId'] = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);

    const startTime = Date.now();

    res.on('finish', () => {
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
