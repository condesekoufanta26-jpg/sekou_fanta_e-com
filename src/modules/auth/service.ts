import { Injectable, UnauthorizedException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { RegisterDto } from '../dto/register';
import { LoginDto } from '../dto/login';

@Injectable()
export class AuthService {
  private pool: Pool;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.pool = new Pool({
      connectionString: this.configService.get<string>('DATABASE_URL'),
    });
  }

  async register(registerDto: RegisterDto) {
    const { email, password, name } = registerDto;

    const existing = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await this.pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'customer')
       RETURNING id, email, name, role`,
      [email, passwordHash, name]
    );

    const user = result.rows[0];
    return this.generateTokens(user);
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const result = await this.pool.query(
      `SELECT id, email, password_hash, name, role
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET') || this.configService.get('JWT_SECRET'),
      });

      const result = await this.pool.query(
        'SELECT id, email, role FROM users WHERE id = $1',
        [payload.sub]
      );

      if (result.rows.length === 0) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(result.rows[0]);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: number) {
    return { message: 'Logged out successfully' };
  }

  async getMe(userId: number) {
    const result = await this.pool.query(
      'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  }

  async setAdminRole(userId: number, isAdmin: boolean, requesterId: number): Promise<{ message: string }> {
    const userResult = await this.pool.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const user = userResult.rows[0];
    const newRole = isAdmin ? 'admin' : 'customer';

    if (user.role === newRole) {
      return { message: `User is already ${newRole}` };
    }

    await this.pool.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      [newRole, userId]
    );

    return { 
      message: `User ${user.email} is now ${newRole}` 
    };
  }

  async getAdmins(): Promise<{ id: number; email: string; name: string; role: string }[]> {
    const result = await this.pool.query(
      'SELECT id, email, name, role FROM users WHERE role = $1 ORDER BY id',
      ['admin']
    );
    return result.rows;
  }

  async isAdmin(email: string): Promise<{ isAdmin: boolean; role: string }> {
    const result = await this.pool.query(
      'SELECT role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return { isAdmin: false, role: 'none' };
    }

    return { 
      isAdmin: result.rows[0].role === 'admin',
      role: result.rows[0].role
    };
  }

  async createFirstAdmin(email: string, password: string, name: string): Promise<void> {
    const adminCheck = await this.pool.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    
    if (adminCheck.rows.length > 0) {
      throw new ForbiddenException('An admin already exists. Use set-admin endpoint.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'admin')`,
      [email, passwordHash, name]
    );
  }

  private async generateTokens(user: { id: number; email: string; role: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET') || this.configService.get('JWT_SECRET'),
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }
}