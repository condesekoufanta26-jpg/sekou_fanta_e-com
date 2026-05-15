import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { JwtAuthGuard } from '../guards/jwt-auth';
import { RolesGuard } from '../guards/roles';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  createOrder(@Body() createOrderDto: CreateOrderDto, @Request() req) {
    return this.ordersService.createOrder(req.user.userId, createOrderDto);
  }

  @Get()
  getMyOrders(@Request() req) {
    return this.ordersService.getUserOrders(req.user.userId);
  }

  @Get(':id')
  getOrderById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.ordersService.getOrderById(id, req.user.userId);
  }

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles('admin')
  getAllOrders(@Request() req) {
    return this.ordersService.getAllOrders(req.user.userId, req.user.role);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @Request() req,
  ) {
    return this.ordersService.updateOrderStatus(id, updateOrderStatusDto, req.user.userId, req.user.role);
  }
}