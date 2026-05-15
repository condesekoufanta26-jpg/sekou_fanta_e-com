export interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: number;
  orderNumber: string;
  userId: number;
  userEmail?: string;
  status: string;
  totalAmount: number;
  shippingAddress: string;
  paymentMethod: string;
  items: OrderItem[];
  createdAt: Date;
  updatedAt: Date;
}