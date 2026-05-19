import { 
  Controller, Get, Post, Body, Patch, Delete, Param, 
  UseGuards, Request, ParseIntPipe, BadRequestException
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  create(@Body() createProductDto: CreateProductDto, @Request() req) {
    return this.productsService.create(createProductDto, req.user.userId);
  }

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
        const productId = parseInt(id, 10);
    if (isNaN(productId)) {
      throw new BadRequestException(`Invalid product ID: "${id}" is not a number`);
    }
    return this.productsService.findOne(productId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    const productId = parseInt(id, 10);
    if (isNaN(productId)) {
      throw new BadRequestException(`Invalid product ID: "${id}" is not a number`);
    }
    return this.productsService.update(productId, updateProductDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    const productId = parseInt(id, 10);
    if (isNaN(productId)) {
      throw new BadRequestException(`Invalid product ID: "${id}" is not a number`);
    }
    return this.productsService.remove(productId);
  }
}
