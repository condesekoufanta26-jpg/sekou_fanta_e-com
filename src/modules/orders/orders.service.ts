import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  private pool: Pool;

  constructor(private configService: ConfigService) {
    this.pool = new Pool({
      connectionString: this.configService.get<string>('DATABASE_URL'),
    });
  }

  private generateOrderNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `ORD-${year}${month}${day}-${random}`;
  }

  async createOrder(userId: number, createOrderDto: CreateOrderDto) {
    const { shippingAddress, paymentMethod } = createOrderDto;

    // 1. RГ©cupГ©rer le panier de l'utilisateur
    const cartResult = await this.pool.query(
      `SELECT c.id as cart_id, 
              ci.product_id, ci.quantity, ci.price_at_add, 
              p.name as product_name, p.stock
       FROM carts c
       JOIN cart_items ci ON c.id = ci.cart_id
       JOIN products p ON ci.product_id = p.id
       WHERE c.user_id = $1`,
      [userId]
    );

    if (cartResult.rows.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // 2. VГ©rifier les stocks
    for (const item of cartResult.rows) {
      if (item.stock < item.quantity) {
        throw new BadRequestException(`Insufficient stock for product: ${item.product_name}`);
      }
    }

    // 3. Calculer le montant total
    const totalAmount = cartResult.rows.reduce(
      (sum, item) => sum + (item.quantity * parseFloat(item.price_at_add)),
      0
    );

    // 4. GГ©nГ©rer le numГ©ro de commande
    const orderNumber = this.generateOrderNumber();

    // 5. CrГ©er la commande
    const orderResult = await this.pool.query(
      `INSERT INTO orders (user_id, order_number, total_amount, shipping_address, payment_method, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [userId, orderNumber, totalAmount, shippingAddress, paymentMethod]
    );

    const order = orderResult.rows[0];

    // 6. CrГ©er les order_items et mettre Г  jour les stocks
    for (const item of cartResult.rows) {
      await this.pool.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.product_id, item.product_name, item.quantity, item.price_at_add, item.quantity * parseFloat(item.price_at_add)]
      );

      // Mettre Г  jour le stock
      await this.pool.query(
        `UPDATE products SET stock = stock - $1, updated_at = NOW()
         WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    // 7. Vider le panier
    await this.pool.query(
      `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)`,
      [userId]
    );

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
      `SELECT * FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    
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
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    
    return result.rows.map(order => ({
      ...order,
      total_amount: parseFloat(order.total_amount),
    }));
  }

  async getAllOrders(userId: number, userRole: string) {
    if (userRole !== 'admin') {
      throw new BadRequestException('Only admins can view all orders');
    }
    
    const result = await this.pool.query(
      `SELECT o.*, u.email as user_email 
       FROM orders o
       JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC`
    );
    
    return result.rows.map(order => ({
      ...order,
      total_amount: parseFloat(order.total_amount),
    }));
  }

  async updateOrderStatus(orderId: number, updateDto: UpdateOrderStatusDto, userId: number, userRole: string) {
    if (userRole !== 'admin') {
      throw new BadRequestException('Only admins can update order status');
    }
    
    const { status, cancellationReason } = updateDto;
    
    const orderResult = await this.pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }
    
    const updateData: any = { status, updated_at: new Date() };
    
    if (status === 'cancelled') {
      updateData.cancelled_at = new Date();
      updateData.cancelled_by = userId;
      updateData.cancellation_reason = cancellationReason || null;
    }
    
    if (status === 'paid') {
      updateData.paid_at = new Date();
    }
    
    const result = await this.pool.query(
      `UPDATE orders 
       SET status = $1, 
           cancelled_at = COALESCE($2, cancelled_at),
           cancelled_by = COALESCE($3, cancelled_by),
           cancellation_reason = COALESCE($4, cancellation_reason),
           paid_at = COALESCE($5, paid_at),
           updated_at = $6
       WHERE id = $7
       RETURNING *`,
      [status, updateData.cancelled_at, updateData.cancelled_by, cancellationReason, updateData.paid_at, updateData.updated_at, orderId]
    );
    
    return {
      ...result.rows[0],
      total_amount: parseFloat(result.rows[0].total_amount),
    };
  }
}
