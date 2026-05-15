import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AddToCartDto } from '../dto/add-to-Cart.dto';
import { UpdateCartItemDto } from '../dto/update-Cart-item.dto';

@Injectable()
export class CartService {
  private pool: Pool;

  constructor(private configService: ConfigService) {
    this.pool = new Pool({
      connectionString: this.configService.get<string>('DATABASE_URL'),
    });
  }

  async getOrCreateCart(userId: number): Promise<{ id: number }> {
    // Vérifier si l'utilisateur a déjà un panier
    let result = await this.pool.query(
      'SELECT id FROM carts WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length > 0) {
      return { id: result.rows[0].id };
    }

    // Créer un nouveau panier
    result = await this.pool.query(
      'INSERT INTO carts (user_id) VALUES ($1) RETURNING id',
      [userId]
    );

    return { id: result.rows[0].id };
  }

  async addToCart(userId: number, addToCartDto: AddToCartDto) {
    const { productId, quantity } = addToCartDto;

    // 1. Vérifier que le produit existe et a du stock
    const productResult = await this.pool.query(
      'SELECT id, name, price, stock FROM products WHERE id = $1 AND is_active = true',
      [productId]
    );

    if (productResult.rows.length === 0) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const product = productResult.rows[0];

    if (product.stock < quantity) {
      throw new BadRequestException(`Insufficient stock. Available: ${product.stock}`);
    }

    // 2. Récupérer ou créer le panier
    const cart = await this.getOrCreateCart(userId);

    // 3. Vérifier si le produit est déjà dans le panier
    const existingItem = await this.pool.query(
      'SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2',
      [cart.id, productId]
    );

    if (existingItem.rows.length > 0) {
      // Mettre à jour la quantité
      const newQuantity = existingItem.rows[0].quantity + quantity;
      await this.pool.query(
        'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
        [newQuantity, existingItem.rows[0].id]
      );
    } else {
      // Ajouter le produit
      await this.pool.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity, price_at_add)
         VALUES ($1, $2, $3, $4)`,
        [cart.id, productId, quantity, product.price]
      );
    }

    return this.getCart(userId);
  }

  async getCart(userId: number) {
    const cart = await this.getOrCreateCart(userId);

    const itemsResult = await this.pool.query(
      `SELECT ci.id, ci.product_id, ci.quantity, ci.price_at_add, p.name as product_name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = $1 AND p.is_active = true`,
      [cart.id]
    );

    const items = itemsResult.rows.map(item => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      priceAtAdd: parseFloat(item.price_at_add),
      total: item.quantity * parseFloat(item.price_at_add),
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

    return {
      id: cart.id,
      userId,
      items,
      totalAmount,
      itemCount: items.length,
    };
  }

  async updateQuantity(userId: number, itemId: number, updateDto: UpdateCartItemDto) {
    const { quantity } = updateDto;

    // Vérifier que l'article appartient au panier de l'utilisateur
    const itemResult = await this.pool.query(
      `SELECT ci.id, ci.product_id, ci.quantity, p.stock
       FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       JOIN products p ON ci.product_id = p.id
       WHERE ci.id = $1 AND c.user_id = $2`,
      [itemId, userId]
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundException(`Cart item with ID ${itemId} not found`);
    }

    const item = itemResult.rows[0];

    if (item.stock < quantity) {
      throw new BadRequestException(`Insufficient stock. Available: ${item.stock}`);
    }

    await this.pool.query(
      'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
      [quantity, itemId]
    );

    return this.getCart(userId);
  }

  async removeItem(userId: number, itemId: number) {
    const result = await this.pool.query(
      `DELETE FROM cart_items
       WHERE id = $1
       AND cart_id IN (SELECT id FROM carts WHERE user_id = $2)
       RETURNING id`,
      [itemId, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Cart item with ID ${itemId} not found`);
    }

    return this.getCart(userId);
  }

  async clearCart(userId: number) {
    const cart = await this.getOrCreateCart(userId);

    await this.pool.query(
      'DELETE FROM cart_items WHERE cart_id = $1',
      [cart.id]
    );

    return this.getCart(userId);
  }
}