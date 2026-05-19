import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from '../products/products.entity';

@Injectable()
export class ProductsService {
  private pool: Pool;

  constructor(private configService: ConfigService) {
    this.pool = new Pool({
      connectionString: this.configService.get<string>('DATABASE_URL'),
    });
  }

  async create(createProductDto: CreateProductDto, userId: number): Promise<Product> {
    const { name, description, price, stock } = createProductDto;

    const result = await this.pool.query(
      `INSERT INTO products (name, description, price, stock, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, $5, NOW(), NOW())
       RETURNING id, name, description, price, stock, is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"`,
      [name, description, price, stock, userId]
    );

    return result.rows[0];
  }

  async findAll(): Promise<Product[]> {
    const result = await this.pool.query(
      `SELECT id, name, description, price, stock, is_active as "isActive", 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM products 
       WHERE is_active = true
       ORDER BY id DESC`
    );
    return result.rows;
  }

  async findOne(id: number): Promise<Product> {
        if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid product ID: ${id}. ID must be a positive number.`);
    }

    const result = await this.pool.query(
      `SELECT id, name, description, price, stock, is_active as "isActive", 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM products 
       WHERE id = $1 AND is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async update(id: number, updateProductDto: UpdateProductDto): Promise<Product> {
        if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid product ID: ${id}. ID must be a positive number.`);
    }

        await this.findOne(id);

    const { name, description, price, stock, isActive } = updateProductDto;
    
    const result = await this.pool.query(
      `UPDATE products 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           stock = COALESCE($4, stock),
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE id = $6 AND is_active = true
       RETURNING id, name, description, price, stock, is_active as "isActive", 
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [name, description, price, stock, isActive, id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async remove(id: number): Promise<{ message: string }> {
        if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid product ID: ${id}. ID must be a positive number.`);
    }

    const product = await this.findOne(id);
    
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.pool.query(
      `UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    return { message: `Product ${id} has been deleted` };
  }

  async updateStock(id: number, quantity: number): Promise<void> {
        if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid product ID: ${id}`);
    }
    
    if (isNaN(quantity) || quantity <= 0) {
      throw new BadRequestException(`Invalid quantity: ${quantity}. Quantity must be positive.`);
    }

    const result = await this.pool.query(
      `UPDATE products 
       SET stock = stock - $1, updated_at = NOW() 
       WHERE id = $2 AND stock >= $1 AND is_active = true
       RETURNING id`,
      [quantity, id]
    );

    if (result.rows.length === 0) {
      throw new BadRequestException(`Insufficient stock for product ${id}`);
    }
  }

  async checkStock(id: number, quantity: number): Promise<boolean> {
       if (isNaN(id) || id <= 0) {
      return false;
    }
    
    if (isNaN(quantity) || quantity <= 0) {
      return false;
    }

    const result = await this.pool.query(
      `SELECT stock >= $1 as sufficient FROM products WHERE id = $2 AND is_active = true`,
      [quantity, id]
    );
    return result.rows[0]?.sufficient || false;
  }
}
