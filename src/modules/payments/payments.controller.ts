import { Controller, Get, Post, Body, Param, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ProcessPaymentDto } from '../dto/process-payment.dto';
import { WebhookPaymentDto } from '../dto/webhook-payment.dto';
import { JwtAuthGuard } from '../guards/jwt-auth';
import { RolesGuard } from '../guards/roles';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('process/:orderId')
  @UseGuards(JwtAuthGuard)
  processPayment(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() processPaymentDto: ProcessPaymentDto,
    @Request() req,
  ) {
    return this.paymentsService.processPayment(req.user.userId, orderId, processPaymentDto);
  }

  @Get('status/:paymentId')
  @UseGuards(JwtAuthGuard)
  getPaymentStatus(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Request() req,
  ) {
    return this.paymentsService.getPaymentStatus(paymentId, req.user.userId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  getUserPayments(@Request() req) {
    return this.paymentsService.getUserPayments(req.user.userId);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getAllPayments(@Request() req) {
    return this.paymentsService.getAllPayments(req.user.userId, req.user.role);
  }

  @Post('webhook')
  webhook(@Body() webhookDto: WebhookPaymentDto) {
    return this.paymentsService.webhook(webhookDto);
  }
}