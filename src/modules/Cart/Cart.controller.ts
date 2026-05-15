import { Controller, Get, Post, Body, Patch, Delete, Param, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { CartService } from './Cart.service';
import { AddToCartDto } from '../dto/add-to-Cart.dto';
import { UpdateCartItemDto } from '../dto/update-Cart-item.dto';
import { JwtAuthGuard } from '../guards/jwt-auth';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Request() req) {
    return this.cartService.getCart(req.user.userId);
  }

  @Post()
  addToCart(@Body() addToCartDto: AddToCartDto, @Request() req) {
    return this.cartService.addToCart(req.user.userId, addToCartDto);
  }

  @Patch(':id')
  updateQuantity(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCartItemDto: UpdateCartItemDto,
    @Request() req,
  ) {
    return this.cartService.updateQuantity(req.user.userId, id, updateCartItemDto);
  }

  @Delete(':id')
  removeItem(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.cartService.removeItem(req.user.userId, id);
  }

  @Delete()
  clearCart(@Request() req) {
    return this.cartService.clearCart(req.user.userId);
  }
}