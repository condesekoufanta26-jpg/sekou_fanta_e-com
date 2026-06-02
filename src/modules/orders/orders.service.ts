import {
  Injectable, NotFoundException, BadRequestException, Logger, Inject,
} from '@nestjs/common';
import { Pool } from 'pg';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { getCorrelationId } from '../../common/middleware/correlation-id.middleware';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
  ) {}

  private generateOrderNumber(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `ORD-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  }

  async createOrder(userId: number, createOrderDto: CreateOrderDto) {
    const { shippingAddress, paymentMethod } = createOrderDto;

    const cartResult = await this.pool.query(
      `SELECT c.id as cart_id,
              ci.product_id, ci.quantity, ci.price_at_add,
              p.name as product_name, p.stock
       FROM carts c
       JOIN cart_items ci ON c.id = ci.cart_id
       JOIN products p ON ci.product_id = p.id
       WHERE c.user_id = $1`,
      [userId],
    );

    if (cartResult.rows.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    for (const item of cartResult.rows) {
      if (item.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for product: ${item.product_name}`,
        );
      }
    }

    const totalAmount = cartResult.rows.reduce(
      (sum, item) => sum + item.quantity * parseFloat(item.price_at_add),
      0,
    );

    const orderNumber = this.generateOrderNumber();

    const orderResult = await this.pool.query(
      `INSERT INTO orders (user_id, order_number, total_amount, shipping_address, payment_method, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [userId, orderNumber, totalAmount, shippingAddress, paymentMethod],
    );

    const order = orderResult.rows[0];

    for (const item of cartResult.rows) {
      await this.pool.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.product_id, item.product_name, item.quantity,
          item.price_at_add, item.quantity * parseFloat(item.price_at_add)],
      );

      await this.pool.query(
        'UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2',
        [item.quantity, item.product_id],
      );
    }

    await this.pool.query(
      'DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)',
      [userId],
    );

    this.logger.log(JSON.stringify({
      event: 'ORDER_CREATED',
      correlationId: getCorrelationId(),
      orderId: order.id,
      orderNumber,
      userId,
      totalAmount,
    }));

    return this.getOrderById(order.id, userId);
  }

  async getOrderById(orderId: number, userId?: number) {
    const query = userId
      ? 'SELECT * FROM orders WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM orders WHERE id = $1';

    const params = userId ? [orderId, userId] : [orderId];
    const orderResult = await this.pool.query(query, params);

    if (orderResult.rows.length === 0) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    const order = orderResult.rows[0];
    const itemsResult = await this.pool.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [orderId],
    );

    this.logger.log(JSON.stringify({
      event: 'DATA_ACCESS',
      correlationId: getCorrelationId(),
      resource: 'order',
      orderId,
      userId,
    }));

    return {
      ...order,
      total_amount: parseFloat(order.total_amount),
      items: itemsResult.rows.map(item => ({
        ...item,
        unit_price: parseFloat(item.unit_price),
        total_price: parseFloat(item.total_price),
      })),
    };
  }

  async getUserOrders(userId: number) {
    const result = await this.pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );

    return result.rows.map(order => ({
      ...order,
      total_amount: parseFloat(order.total_amount),
    }));
  }

  // ✅ Signature avec 2 arguments — correspond au contrôleur
  async getAllOrders(userId: number, userRole: string) {
    if (userRole !== 'admin') {
      throw new BadRequestException('Only admins can view all orders');
    }

    const result = await this.pool.query(
      `SELECT o.*, u.email as user_email
       FROM orders o
       JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC`,
    );

    return result.rows.map(order => ({
      ...order,
      total_amount: parseFloat(order.total_amount),
    }));
  }

  // ✅ Signature avec 4 arguments — correspond au contrôleur
  async updateOrderStatus(
    orderId: number,
    updateDto: UpdateOrderStatusDto,
    userId: number,
    userRole: string,
  ) {
    if (userRole !== 'admin') {
      throw new BadRequestException('Only admins can update order status');
    }

    const { status, cancellationReason } = updateDto;

    const orderResult = await this.pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId],
    );

    if (orderResult.rows.length === 0) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    const cancelledAt = status === 'cancelled' ? new Date() : null;
    const cancelledBy = status === 'cancelled' ? userId : null;
    const paidAt = status === 'paid' ? new Date() : null;

    const result = await this.pool.query(
      `UPDATE orders
       SET status              = $1,
           cancelled_at        = COALESCE($2, cancelled_at),
           cancelled_by        = COALESCE($3, cancelled_by),
           cancellation_reason = COALESCE($4, cancellation_reason),
           paid_at             = COALESCE($5, paid_at),
           updated_at          = NOW()
       WHERE id = $6
       RETURNING *`,
      [status, cancelledAt, cancelledBy, cancellationReason, paidAt, orderId],
    );

    this.logger.log(JSON.stringify({
      event: 'ORDER_STATUS_UPDATED',
      correlationId: getCorrelationId(),
      orderId,
      newStatus: status,
      updatedBy: userId,
    }));

    return {
      ...result.rows[0],
      total_amount: parseFloat(result.rows[0].total_amount),
    };
  }
}