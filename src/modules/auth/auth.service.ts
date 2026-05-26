// src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Pool } from 'pg';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { SmsService } from '../../common/services/sms/sms.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private pool: Pool;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private smsService: SmsService,
  ) {
    this.pool = new Pool({
      connectionString: this.configService.get<string>('DATABASE_URL'),
      max: 20,
    });
  }

  // ✅ Sécurité: Argon2 pour le hashage (meilleur que bcrypt)
  async register(registerDto: RegisterDto) {
    const { email, password, name, phoneNumber } = registerDto;

    const existing = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );

    if (existing.rows.length > 0) {
      throw new ConflictException('Email already exists');
    }

    // Hachage avec Argon2id (résistant GPU et side-channel)
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,      // 64 MB
      timeCost: 3,            // 3 itérations
      parallelism: 4,         // 4 threads
    });

    const result = await this.pool.query(
      `INSERT INTO users (email, password_hash, name, role, phone_number)
       VALUES ($1, $2, $3, 'customer', $4)
       RETURNING id, email, name, role`,
      [email, passwordHash, name, phoneNumber || null],
    );

    const user = result.rows[0];
    this.logger.log(`User registered: ${email}`);

    return this.generateTokens(user);
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const result = await this.pool.query(
      `SELECT id, email, password_hash, name, role
       FROM users WHERE email = $1`,
      [email],
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = result.rows[0];
    
    // ✅ Vérification avec Argon2
    let isValid = false;
    try {
      isValid = await argon2.verify(user.password_hash, password);
    } catch (err: any) {
  this.logger.error(`Argon2 verification error: ${err.message}`);
  throw new UnauthorizedException('Invalid credentials');
}

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${email}`);

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET') || this.configService.get('JWT_SECRET'),
      });

      const result = await this.pool.query(
        'SELECT id, email, role FROM users WHERE id = $1',
        [payload.sub],
      );

      if (result.rows.length === 0) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(result.rows[0]);
    } catch (error: any) {
      this.logger.warn(`Invalid refresh token attempt: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: number) {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
    this.logger.log(`User ${userId} logged out`);
    return { message: 'Logged out successfully' };
  }

  async getMe(userId: number) {
    const result = await this.pool.query(
      'SELECT id, email, name, role, phone_number, created_at FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0];
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const userResult = await this.pool.query(
      'SELECT id, phone_number FROM users WHERE email = $1',
      [email],
    );

    if (userResult.rows.length === 0) {
      return { message: 'If your email exists, you will receive a reset code' };
    }

    const user = userResult.rows[0];

    if (!user.phone_number) {
      return { message: 'No phone number associated with this account' };
    }

    await this.pool.query(
      'DELETE FROM password_resets WHERE user_id = $1 AND used = false',
      [user.id],
    );

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await this.pool.query(
      `INSERT INTO password_resets (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, resetCode, expiresAt],
    );

    try {
      await this.smsService.sendVerificationCode(user.phone_number, resetCode);
      this.logger.log(`Reset code sent to ${user.phone_number}`);
      return { message: 'Reset code sent via SMS' };
    } catch (error: any) {
      this.logger.error(`Failed to send SMS: ${error.message}`);
      return { message: 'Failed to send reset code' };
    }
  }

  async resetPassword(code: string, resetPasswordDto: ResetPasswordDto) {
    const { newPassword, confirmPassword } = resetPasswordDto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const result = await this.pool.query(
      `SELECT pr.id, pr.user_id
       FROM password_resets pr
       WHERE pr.token = $1 AND pr.used = false AND pr.expires_at > NOW()`,
      [code],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const resetRequest = result.rows[0];

    // Hachage avec Argon2
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await this.pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, resetRequest.user_id],
    );

    await this.pool.query(
      'UPDATE password_resets SET used = true WHERE id = $1',
      [resetRequest.id],
    );

    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [resetRequest.user_id],
    );

    this.logger.log(`Password reset for user ${resetRequest.user_id}`);
    return { message: 'Password reset successfully' };
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

    this.logger.log(`User ${user.email} is now ${newRole} (by admin ${requesterId})`);
    return { message: `User ${user.email} is now ${newRole}` };
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

  private async generateTokens(user: { id: number; email: string; role: string }) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET') || this.configService.get('JWT_SECRET'),
      expiresIn: '7d',
    });

    const tokenHash = await argon2.hash(refreshToken, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 2,
      parallelism: 2,
    });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt],
    );

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