import {
  Injectable, NotFoundException, BadRequestException, Logger, Inject,
} from '@nestjs/common';
import { Pool } from 'pg';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { getCorrelationId } from '../../common/middleware/correlation-id.middleware';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
  ) {}

  // ✅ Récupère ou crée le panier de l'utilisateur
  private async getOrCreateCart(userId: number): Promise<number> {
    const existing = await this.pool.query(
      'SELECT id FROM carts WHERE user_id = $1',
      [userId],
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    const created = await this.pool.query(
      'INSERT INTO carts (user_id, created_at, updated_at) VALUES ($1, NOW(), NOW()) RETURNING id',
      [userId],
    );

    return created.rows[0].id;
  }

  async getCart(userId: number) {
    const cartId = await this.getOrCreateCart(userId);

    const result = await this.pool.query(
      `SELECT ci.id, ci.product_id, ci.quantity, ci.price_at_add,
              p.name as product_name, p.stock, p.is_active,
              (ci.quantity * ci.price_at_add) as item_total
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = $1`,
      [cartId],
    );

    const items = result.rows;
    const totalAmount = items.reduce(
      (sum, item) => sum + parseFloat(item.item_total),
      0,
    );

    this.logger.log(JSON.stringify({
      event: 'DATA_ACCESS',
      correlationId: getCorrelationId(),
      resource: 'cart',
      userId,
      itemCount: items.length,
    }));

    return {
      cartId,
      items,
      itemCount: items.length,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
    };
  }

  async addToCart(userId: number, addToCartDto: AddToCartDto) {
    const { productId, quantity } = addToCartDto;

    // Vérifier que le produit existe et est en stock
    const productResult = await this.pool.query(
      'SELECT id, name, price, stock, is_active FROM products WHERE id = $1',
      [productId],
    );

    if (productResult.rows.length === 0) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const product = productResult.rows[0];

    if (!product.is_active) {
      throw new BadRequestException('Product is not available');
    }

    if (product.stock < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${product.stock}`,
      );
    }

    const cartId = await this.getOrCreateCart(userId);

    // Vérifier si l'article est déjà dans le panier
    const existingItem = await this.pool.query(
      'SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2',
      [cartId, productId],
    );

    if (existingItem.rows.length > 0) {
      // Mettre à jour la quantité
      const newQuantity = existingItem.rows[0].quantity + quantity;

      if (product.stock < newQuantity) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${product.stock}`,
        );
      }

      await this.pool.query(
        'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
        [newQuantity, existingItem.rows[0].id],
      );
    } else {
      // Ajouter un nouvel article
      await this.pool.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity, price_at_add, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [cartId, productId, quantity, product.price],
      );
    }

    await this.pool.query(
      'UPDATE carts SET updated_at = NOW() WHERE id = $1',
      [cartId],
    );

    this.logger.log(JSON.stringify({
      event: 'CART_ITEM_ADDED',
      correlationId: getCorrelationId(),
      userId,
      productId,
      quantity,
    }));

    return this.getCart(userId);
  }

  async updateCartItem(userId: number, itemId: number, updateDto: UpdateCartItemDto) {
    const { quantity } = updateDto;

    // Vérifier que l'item appartient à l'utilisateur (OWASP API1 — BOLA)
    const itemResult = await this.pool.query(
      `SELECT ci.id, ci.product_id, p.stock
       FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       JOIN products p ON ci.product_id = p.id
       WHERE ci.id = $1 AND c.user_id = $2`,
      [itemId, userId],
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundException('Cart item not found');
    }

    const item = itemResult.rows[0];

    if (item.stock < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${item.stock}`,
      );
    }

    await this.pool.query(
      'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
      [quantity, itemId],
    );

    this.logger.log(JSON.stringify({
      event: 'CART_ITEM_UPDATED',
      correlationId: getCorrelationId(),
      userId,
      itemId,
      quantity,
    }));

    return this.getCart(userId);
  }

  async removeCartItem(userId: number, itemId: number) {
    // ✅ BOLA protection — vérifier ownership
    const itemResult = await this.pool.query(
      `SELECT ci.id FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       WHERE ci.id = $1 AND c.user_id = $2`,
      [itemId, userId],
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundException('Cart item not found');
    }

    await this.pool.query('DELETE FROM cart_items WHERE id = $1', [itemId]);

    this.logger.log(JSON.stringify({
      event: 'CART_ITEM_REMOVED',
      correlationId: getCorrelationId(),
      userId,
      itemId,
    }));

    return this.getCart(userId);
  }

  async clearCart(userId: number) {
    const cartResult = await this.pool.query(
      'SELECT id FROM carts WHERE user_id = $1',
      [userId],
    );

    if (cartResult.rows.length > 0) {
      await this.pool.query(
        'DELETE FROM cart_items WHERE cart_id = $1',
        [cartResult.rows[0].id],
      );
    }

    this.logger.log(JSON.stringify({
      event: 'CART_CLEARED',
      correlationId: getCorrelationId(),
      userId,
    }));

    return { message: 'Cart cleared successfully' };
  }
}