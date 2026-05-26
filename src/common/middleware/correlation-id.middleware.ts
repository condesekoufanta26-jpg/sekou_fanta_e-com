// src/common/middleware/correlation-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * ✅ Traçabilité: Génère UUID v4 par requête
 * ✅ 152-ФЗ: Stockage en contexte async pour logs
 */
export const als = new AsyncLocalStorage<Map<string, any>>();

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: FastifyRequest, res: FastifyReply, next: () => void) {
    // Génère ou récupère le correlation ID
    const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
    
    // Injecte dans la réponse
    res.header('X-Correlation-Id', correlationId);
    
    // Stocke dans le contexte async pour propagation
    const store = new Map<string, any>();
    store.set('correlationId', correlationId);
    store.set('startTime', Date.now());
    
    als.run(store, () => {
      (req as any).correlationId = correlationId;
      next();
    });
  }
}

// Utilitaire pour récupérer le correlation ID partout
export function getCorrelationId(): string | undefined {
  return als.getStore()?.get('correlationId');
}