import {
  Injectable, UnauthorizedException, ConflictException,
  BadRequestException, NotFoundException, Logger, Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto'; // ✅ AJOUTÉ pour SHA-256
import { Pool } from 'pg';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { SmsService } from '../../common/services/sms/sms.service';

// ✅ Récupérer depuis la config au lieu d'une constante fixe
// Pour la compatibilité, garder une valeur par défaut

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private bcryptRounds: number;

  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
  ) {
    // ✅ Lire bcrypt rounds depuis .env (défaut 10 pour prod, 8 pour benchmark)
    this.bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS', 10);
  }

  async register(registerDto: RegisterDto) {
    const { email, password, name, phoneNumber } = registerDto;

    const existing = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );

    if (existing.rows.length > 0) {
      throw new ConflictException('Email already exists');
    }

    // ✅ Utiliser bcryptRounds configurable
    const passwordHash = await bcrypt.hash(password, this.bcryptRounds);

    const result = await this.pool.query(
      `INSERT INTO users (email, password_hash, name, role, phone_number)
       VALUES ($1, $2, $3, 'customer', $4)
       RETURNING id, email, name, role`,
      [email, passwordHash, name, phoneNumber || null],
    );

    const user = result.rows[0];
    this.logger.log(JSON.stringify({
      event: 'AUTH_REGISTER',
      email,
      userId: user.id,
    }));

    return this.generateTokens(user);
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const result = await this.pool.query(
      `SELECT id, email, password_hash, name, role
       FROM users WHERE email = $1 AND is_active = true`,
      [email],
    );

    if (result.rows.length === 0) {
      this.logger.warn(JSON.stringify({ event: 'AUTH_LOGIN_FAIL', reason: 'user_not_found', email }));
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = result.rows[0];

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      this.logger.warn(JSON.stringify({ event: 'AUTH_LOGIN_FAIL', reason: 'wrong_password', email }));
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(JSON.stringify({ event: 'AUTH_LOGIN_SUCCESS', userId: user.id, email }));

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ||
          this.configService.get<string>('JWT_SECRET'),
      });

      const tokenResult = await this.pool.query(
        `SELECT id FROM refresh_tokens
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
         LIMIT 1`,
        [payload.sub],
      );

      if (tokenResult.rows.length === 0) {
        throw new UnauthorizedException('Refresh token revoked or expired');
      }

      const userResult = await this.pool.query(
        'SELECT id, email, role FROM users WHERE id = $1 AND is_active = true',
        [payload.sub],
      );

      if (userResult.rows.length === 0) {
        throw new UnauthorizedException('User not found');
      }

      await this.pool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [payload.sub],
      );

      this.logger.log(JSON.stringify({ event: 'AUTH_REFRESH', userId: payload.sub }));

      return this.generateTokens(userResult.rows[0]);
    } catch (error: any) {
      this.logger.warn(JSON.stringify({ event: 'AUTH_REFRESH_FAIL', error: error.message }));
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: number) {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
    this.logger.log(JSON.stringify({ event: 'AUTH_LOGOUT', userId }));
    return { message: 'Logged out successfully' };
  }

  async getMe(userId: number) {
    const result = await this.pool.query(
      `SELECT id, email, name, role, phone_number, created_at
       FROM users WHERE id = $1 AND is_active = true`,
      [userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(JSON.stringify({ event: 'DATA_ACCESS', resource: 'user_profile', userId }));

    return result.rows[0];
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const userResult = await this.pool.query(
      'SELECT id, phone_number FROM users WHERE email = $1 AND is_active = true',
      [email],
    );

    if (userResult.rows.length === 0) {
      return { message: 'If your email exists, you will receive a reset code' };
    }

    const user = userResult.rows[0];

    if (!user.phone_number) {
      return { message: 'If your email exists, you will receive a reset code' };
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
      this.logger.log(JSON.stringify({ event: 'AUTH_PASSWORD_RESET_REQUESTED', userId: user.id }));
      return { message: 'If your email exists, you will receive a reset code' };
    } catch (error: any) {
      this.logger.error(JSON.stringify({ event: 'AUTH_PASSWORD_RESET_SMS_FAIL', error: error.message }));
      return { message: 'If your email exists, you will receive a reset code' };
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
    const passwordHash = await bcrypt.hash(newPassword, this.bcryptRounds);

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

    this.logger.log(JSON.stringify({ event: 'AUTH_PASSWORD_RESET_SUCCESS', userId: resetRequest.user_id }));
    return { message: 'Password reset successfully' };
  }

  async setAdminRole(userId: number, isAdmin: boolean, requesterId: number) {
    const userResult = await this.pool.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [userId],
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
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2',
      [newRole, userId],
    );

    this.logger.log(JSON.stringify({
      event: 'AUTH_ROLE_CHANGE',
      targetUserId: userId,
      newRole,
      requesterId,
    }));

    return { message: `User ${user.email} is now ${newRole}` };
  }

  async getAdmins() {
    const result = await this.pool.query(
      'SELECT id, email, name, role FROM users WHERE role = $1 ORDER BY id',
      ['admin'],
    );
    return result.rows;
  }

  // ✅ ✅ ✅ CORRECTION CRITIQUE : Remplacer bcrypt par SHA-256 pour le refresh token
  private async generateTokens(user: { id: number; email: string; role: string }) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

    const refreshToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('JWT_REFRESH_SECRET') ||
        this.configService.get<string>('JWT_SECRET'),
      expiresIn: '7d',
    });

    // ✅ REMPLACÉ : bcrypt.hash → SHA-256 (gain de performance ~2000x)
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
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