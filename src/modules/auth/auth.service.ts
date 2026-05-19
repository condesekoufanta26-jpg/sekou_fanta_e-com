// src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
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
      max: 20, // Connection pooling max 20 connexions
    });
  }

  async register(registerDto: RegisterDto) {
    const { email, password, name, phoneNumber } = registerDto;

    // Check if user already exists
    const existing = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );

    if (existing.rows.length > 0) {
      throw new ConflictException('Email already exists');
    }

    // Hash password with bcrypt (work factor 12)
    const passwordHash = await bcrypt.hash(password, 12);

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
    const isValid = await bcrypt.compare(password, user.password_hash);

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
    } catch (error) {
      this.logger.warn(`Invalid refresh token attempt`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: number) {
    // Blacklist all refresh tokens for this user
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
      // Don't reveal if email exists (security best practice)
      return { message: 'If your email exists, you will receive a reset code' };
    }

    const user = userResult.rows[0];

    if (!user.phone_number) {
      return { message: 'No phone number associated with this account' };
    }

    // Delete old unused codes
    await this.pool.query(
      'DELETE FROM password_resets WHERE user_id = $1 AND used = false',
      [user.id],
    );

    // Generate 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiration

    await this.pool.query(
      `INSERT INTO password_resets (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, resetCode, expiresAt],
    );

    try {
      await this.smsService.sendVerificationCode(user.phone_number, resetCode);
      this.logger.log(`Reset code sent to ${user.phone_number}`);
      return { message: 'Reset code sent via SMS' };
    } catch (error) {
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

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update user password
    await this.pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, resetRequest.user_id],
    );

    // Mark code as used
    await this.pool.query(
      'UPDATE password_resets SET used = true WHERE id = $1',
      [resetRequest.id],
    );

    // Revoke all refresh tokens
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [resetRequest.user_id],
    );

    this.logger.log(`Password reset for user ${resetRequest.user_id}`);
    return { message: 'Password reset successfully' };
  }

  private async generateTokens(user: { id: number; email: string; role: string }) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET') || this.configService.get('JWT_SECRET'),
      expiresIn: '7d',
    });

    // Store refresh token hash in database (rotation)
    const tokenHash = await bcrypt.hash(refreshToken, 1);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt],
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }
}