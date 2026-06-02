import {
  Injectable, NotFoundException, BadRequestException, Logger, Inject,
} from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './products.entity';
import { getCorrelationId } from '../../common/middleware/correlation-id.middleware';

const CACHE_TTL_SECONDS = 300;
const CACHE_KEY_ALL = 'products:all';
const cacheKeyOne = (id: number) => `products:one:${id}`;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // ✅ Timeout 100ms — Redis lent ou mort n'attend plus 10s
  private async cacheGet(key: string): Promise<string | null> {
    try {
      return await Promise.race([
        this.redis.get(key),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Redis timeout')), 100)
        ),
      ]);
    } catch {
      return null;
    }
  }

  private async cacheSet(key: string, value: string, ttl: number): Promise<void> {
    try {
      await Promise.race([
        this.redis.setex(key, ttl, value),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Redis timeout')), 100)
        ),
      ]);
    } catch {
      // Redis mort ou lent — on continue sans cache
    }
  }

  private async cacheDel(...keys: string[]): Promise<void> {
    try {
      await Promise.race([
        this.redis.del(...keys),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Redis timeout')), 100)
        ),
      ]);
    } catch {
      // Redis mort ou lent — on continue
    }
  }

  async create(createProductDto: CreateProductDto, userId: number): Promise<Product> {
    const { name, description, price, stock } = createProductDto;

    const result = await this.pool.query(
      `INSERT INTO products (name, description, price, stock, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, $5, NOW(), NOW())
       RETURNING id, name, description, price, stock,
                 is_active as "isActive",
                 created_at as "createdAt",
                 updated_at as "updatedAt"`,
      [name, description, price, stock, userId],
    );

    await this.cacheDel(CACHE_KEY_ALL);

    const product = result.rows[0];
    this.logger.log(JSON.stringify({
      event: 'PRODUCT_CREATED',
      correlationId: getCorrelationId(),
      productId: product.id,
      userId,
    }));

    return product;
  }

  async findAll(page = 1, limit = 20) {
    const cacheKey = `${CACHE_KEY_ALL}:page${page}:limit${limit}`;

    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      this.logger.log(JSON.stringify({
        event: 'PRODUCT_LIST_CACHE_HIT',
        correlationId: getCorrelationId(),
      }));
      return JSON.parse(cached);
    }

    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      this.pool.query(
        `SELECT id, name, description, price, stock,
                is_active as "isActive",
                created_at as "createdAt",
                updated_at as "updatedAt"
         FROM products
         WHERE is_active = true
         ORDER BY id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      this.pool.query(
        'SELECT COUNT(*)::int as total FROM products WHERE is_active = true',
      ),
    ]);

    const total = countResult.rows[0].total;
    const response = {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    await this.cacheSet(cacheKey, JSON.stringify(response), CACHE_TTL_SECONDS);

    this.logger.log(JSON.stringify({
      event: 'PRODUCT_LIST',
      correlationId: getCorrelationId(),
      total,
      page,
    }));

    return response;
  }

  async findOne(id: number): Promise<Product> {
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid product ID: ${id}`);
    }

    const cacheKey = cacheKeyOne(id);
    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.pool.query(
      `SELECT id, name, description, price, stock,
              is_active as "isActive",
              created_at as "createdAt",
              updated_at as "updatedAt"
       FROM products
       WHERE id = $1 AND is_active = true`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const product = result.rows[0];
    await this.cacheSet(cacheKey, JSON.stringify(product), CACHE_TTL_SECONDS);

    return product;
  }

  async update(id: number, updateProductDto: UpdateProductDto): Promise<Product> {
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid product ID: ${id}`);
    }

    await this.findOne(id);

    const { name, description, price, stock, isActive } = updateProductDto;

    const result = await this.pool.query(
      `UPDATE products
       SET name        = COALESCE($1, name),
           description = COALESCE($2, description),
           price       = COALESCE($3, price),
           stock       = COALESCE($4, stock),
           is_active   = COALESCE($5, is_active),
           updated_at  = NOW()
       WHERE id = $6
       RETURNING id, name, description, price, stock,
                 is_active as "isActive",
                 created_at as "createdAt",
                 updated_at as "updatedAt"`,
      [name, description, price, stock, isActive, id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.cacheDel(cacheKeyOne(id), CACHE_KEY_ALL);

    this.logger.log(JSON.stringify({
      event: 'PRODUCT_UPDATED',
      correlationId: getCorrelationId(),
      productId: id,
    }));

    return result.rows[0];
  }

  async remove(id: number): Promise<{ message: string }> {
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid product ID: ${id}`);
    }

    await this.findOne(id);

    await this.pool.query(
      'UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1',
      [id],
    );

    await this.cacheDel(cacheKeyOne(id), CACHE_KEY_ALL);

    this.logger.log(JSON.stringify({
      event: 'PRODUCT_DELETED',
      correlationId: getCorrelationId(),
      productId: id,
    }));

    return { message: `Product ${id} has been deleted` };
  }

  async updateStock(id: number, quantity: number): Promise<void> {
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid product ID: ${id}`);
    }
    if (isNaN(quantity) || quantity <= 0) {
      throw new BadRequestException(`Invalid quantity: ${quantity}`);
    }

    const result = await this.pool.query(
      `UPDATE products
       SET stock = stock - $1, updated_at = NOW()
       WHERE id = $2 AND stock >= $1 AND is_active = true
       RETURNING id`,
      [quantity, id],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException(`Insufficient stock for product ${id}`);
    }

    await this.cacheDel(cacheKeyOne(id), CACHE_KEY_ALL);
  }

  async checkStock(id: number, quantity: number): Promise<boolean> {
    if (isNaN(id) || id <= 0 || isNaN(quantity) || quantity <= 0) {
      return false;
    }

    const result = await this.pool.query(
      'SELECT stock >= $1 as sufficient FROM products WHERE id = $2 AND is_active = true',
      [quantity, id],
    );

    return result.rows[0]?.sufficient || false;
  }
}