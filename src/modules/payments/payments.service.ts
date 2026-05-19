import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { WebhookPaymentDto } from './dto/webhook-payment.dto';

@Injectable()
export class PaymentsService {
  private pool: Pool;

  constructor(private configService: ConfigService) {
    this.pool = new Pool({
      connectionString: this.configService.get<string>('DATABASE_URL'),
    });
  }

  private async logPaymentEvent(
    paymentId: number | null,
    action: string,
    status: string,
    requestData?: any,
    responseData?: any,
    errorMessage?: string,
  ) {
    await this.pool.query(
      `INSERT INTO payment_logs (payment_id, action, status, request_data, response_data, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [paymentId, action, status, requestData, responseData, errorMessage]
    );
  }

  private generateTransactionId(): string {
    return `txn_${Date.now()}_${uuidv4().substring(0, 8)}`;
  }

  private simulatePaymentProcessing(amount: number): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // Simuler un dГ©lai de traitement
      setTimeout(() => {
        // 95% de succГЁs pour la simulation
        const isSuccess = Math.random() < 0.95;
        
        if (isSuccess) {
          resolve({ success: true });
        } else {
          resolve({ 
            success: false, 
            error: 'Payment processing failed: insufficient funds or card declined' 
          });
        }
      }, 500);
    });
  }

  async processPayment(userId: number, orderId: number, processPaymentDto: ProcessPaymentDto) {
    const { paymentMethod, cardNumber, cardExpiry, cardCvc } = processPaymentDto;

    // 1. VГ©rifier que la commande existe et appartient Г  l'utilisateur
    const orderResult = await this.pool.query(
      `SELECT id, order_number, total_amount, status 
       FROM orders 
       WHERE id = $1 AND user_id = $2`,
      [orderId, userId]
    );

    if (orderResult.rows.length === 0) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    const order = orderResult.rows[0];

    if (order.status === 'cancelled') {
      throw new BadRequestException('Cannot pay for a cancelled order');
    }

    if (order.status === 'paid') {
      throw new BadRequestException('Order already paid');
    }

    // 2. VГ©rifier qu'il n'y a pas dГ©jГ  un paiement en cours
    const existingPayment = await this.pool.query(
      `SELECT id, status FROM payments 
       WHERE order_id = $1 AND status IN ('pending', 'processing', 'succeeded')
       LIMIT 1`,
      [orderId]
    );

    if (existingPayment.rows.length > 0) {
      throw new BadRequestException('A payment is already being processed for this order');
    }

    // 3. Extraire les infos de carte (si carte)
   let cardLast4: string | null = null;
   let cardBrand: string | null = null;

    if (paymentMethod === 'card' && cardNumber) {
      cardLast4 = cardNumber.slice(-4);
      // DГ©tection basique du type de carte
      if (cardNumber.startsWith('4')) cardBrand = 'visa';
      else if (cardNumber.startsWith('5')) cardBrand = 'mastercard';
      else if (cardNumber.startsWith('3')) cardBrand = 'amex';
      else cardBrand = 'unknown';
    }

    // 4. CrГ©er l'enregistrement de paiement
    const transactionId = this.generateTransactionId();
    const amount = parseFloat(order.total_amount);

    const paymentResult = await this.pool.query(
      `INSERT INTO payments 
       (order_id, user_id, payment_method, amount, status, transaction_id, card_last4, card_brand)
       VALUES ($1, $2, $3, $4, 'processing', $5, $6, $7)
       RETURNING *`,
      [orderId, userId, paymentMethod, amount, transactionId, cardLast4, cardBrand]
    );

    const payment = paymentResult.rows[0];

    await this.logPaymentEvent(payment.id, 'process_payment', 'processing', processPaymentDto);

    // 5. Simuler le traitement du paiement
    const paymentResult_sim = await this.simulatePaymentProcessing(amount);

    if (paymentResult_sim.success) {
      // Paiement rГ©ussi
      await this.pool.query(
        `UPDATE payments 
         SET status = 'succeeded', paid_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [payment.id]
      );

      // Mettre Г  jour le statut de la commande
      await this.pool.query(
        `UPDATE orders 
         SET status = 'paid', paid_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [orderId]
      );

      await this.logPaymentEvent(payment.id, 'payment_success', 'succeeded', null, { transactionId });

      return {
        id: payment.id,
        orderId: payment.order_id,
        orderNumber: order.order_number,
        transactionId: payment.transaction_id,
        amount: parseFloat(payment.amount),
        status: 'succeeded',
        paymentMethod: payment.payment_method,
        cardLast4: payment.card_last4,
        cardBrand: payment.card_brand,
        paidAt: new Date(),
        message: 'Payment successful',
      };
    } else {
      // Paiement Г©chouГ©
      await this.pool.query(
        `UPDATE payments 
         SET status = 'failed', error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [paymentResult_sim.error, payment.id]
      );

      await this.logPaymentEvent(
        payment.id, 
        'payment_failed', 
        'failed', 
        null, 
        null, 
        paymentResult_sim.error
      );

      throw new BadRequestException(paymentResult_sim.error);
    }
  }

  async getPaymentStatus(paymentId: number, userId: number) {
    const result = await this.pool.query(
      `SELECT p.*, o.order_number 
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.id = $1 AND p.user_id = $2`,
      [paymentId, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Payment with ID ${paymentId} not found`);
    }

    const payment = result.rows[0];

    return {
      id: payment.id,
      orderId: payment.order_id,
      orderNumber: payment.order_number,
      transactionId: payment.transaction_id,
      amount: parseFloat(payment.amount),
      status: payment.status,
      paymentMethod: payment.payment_method,
      cardLast4: payment.card_last4,
      cardBrand: payment.card_brand,
      paidAt: payment.paid_at,
      errorMessage: payment.error_message,
      createdAt: payment.created_at,
    };
  }

  async getUserPayments(userId: number) {
    const result = await this.pool.query(
      `SELECT p.*, o.order_number 
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );

    return result.rows.map(payment => ({
      id: payment.id,
      orderId: payment.order_id,
      orderNumber: payment.order_number,
      transactionId: payment.transaction_id,
      amount: parseFloat(payment.amount),
      status: payment.status,
      paymentMethod: payment.payment_method,
      paidAt: payment.paid_at,
      createdAt: payment.created_at,
    }));
  }

  async getAllPayments(userId: number, userRole: string) {
    if (userRole !== 'admin') {
      throw new BadRequestException('Only admins can view all payments');
    }

    const result = await this.pool.query(
      `SELECT p.*, o.order_number, u.email as user_email
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC`
    );

    return result.rows.map(payment => ({
      id: payment.id,
      orderId: payment.order_id,
      orderNumber: payment.order_number,
      userEmail: payment.user_email,
      transactionId: payment.transaction_id,
      amount: parseFloat(payment.amount),
      status: payment.status,
      paymentMethod: payment.payment_method,
      paidAt: payment.paid_at,
      createdAt: payment.created_at,
      errorMessage: payment.error_message,
    }));
  }

  async webhook(webhookDto: WebhookPaymentDto) {
    const { eventType, transactionId, status, amount, errorMessage } = webhookDto;

    // Trouver le paiement par transaction_id
    const paymentResult = await this.pool.query(
      'SELECT id, order_id FROM payments WHERE transaction_id = $1',
      [transactionId]
    );

    if (paymentResult.rows.length === 0) {
      throw new NotFoundException(`Payment with transaction ID ${transactionId} not found`);
    }

    const payment = paymentResult.rows[0];

    await this.logPaymentEvent(payment.id, eventType, status, webhookDto);

    if (status === 'succeeded') {
      await this.pool.query(
        `UPDATE payments 
         SET status = 'succeeded', paid_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [payment.id]
      );

      await this.pool.query(
        `UPDATE orders 
         SET status = 'paid', paid_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [payment.order_id]
      );
    } else if (status === 'failed') {
      await this.pool.query(
        `UPDATE payments 
         SET status = 'failed', error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [errorMessage, payment.id]
      );
    }

    return { received: true, status };
  }
}
