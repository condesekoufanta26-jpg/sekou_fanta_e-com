export interface CartItem {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  priceAtAdd: number;
  total: number;
}

export interface Cart {
  id: number;
  userId: number;
  items: CartItem[];
  totalAmount: number;
  itemCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}