import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Request() req: any) {
    return this.cartService.getCart(req.user.sub);
  }

  // POST /cart - can initialize or return active cart
  @Post()
  createOrGetCart(@Request() req: any) {
    return this.cartService.getCart(req.user.sub);
  }

  @Post('items')
  addItem(
    @Request() req: any,
    @Body() dto: { productId: string; quantity?: number },
  ) {
    return this.cartService.addItem(req.user.sub, dto);
  }

  @Put('items/:id')
  updateItem(
    @Request() req: any,
    @Param('id') id: string,
    @Body('quantity') quantity: number,
  ) {
    return this.cartService.updateItem(req.user.sub, id, Number(quantity));
  }

  @Delete('items/:id')
  removeItem(@Request() req: any, @Param('id') id: string) {
    return this.cartService.removeItem(req.user.sub, id);
  }

  @Delete()
  clearCart(@Request() req: any) {
    return this.cartService.clearCart(req.user.sub);
  }
}
