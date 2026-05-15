import { Controller, Post, Body, UseGuards, Get, Request, Patch, Param, ParseIntPipe } from '@nestjs/common';
import { AuthService } from './service';
import { RegisterDto } from '../dto/register';
import { LoginDto } from '../dto/login';
import { RefreshTokenDto } from '../dto/refresh-token';
import { SetAdminDto } from '../dto/set-admin.dto';
import { JwtAuthGuard } from '../guards/jwt-auth';
import { RolesGuard } from '../guards/roles';
import { Roles } from './decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Request() req) {
    return this.authService.logout(req.user.userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Request() req) {
    return this.authService.getMe(req.user.userId);
  }

  @Patch('set-admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  setAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() setAdminDto: SetAdminDto,
    @Request() req,
  ) {
    return this.authService.setAdminRole(id, setAdminDto.isAdmin ?? true, req.user.userId);
  }

  @Get('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getAdmins() {
    return this.authService.getAdmins();
  }

  @Get('is-admin/:email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  checkIsAdmin(@Param('email') email: string) {
    return this.authService.isAdmin(email);
  }
}