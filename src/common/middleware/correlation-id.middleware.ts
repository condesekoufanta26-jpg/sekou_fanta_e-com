import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Récupérer ou générer le correlation ID
    const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
    
    // Injecter dans les headers de réponse
    res.setHeader('X-Correlation-Id', correlationId);
    
    // Stocker dans la requête pour utilisation ultérieure
    req['correlationId'] = correlationId;
    
    next();
  }
}