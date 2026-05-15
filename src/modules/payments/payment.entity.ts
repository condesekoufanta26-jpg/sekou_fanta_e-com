export interface Payment {
  id: number;
  orderId: number;
  userId: number;
  paymentMethod: string;
  amount: number;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';
  transactionId: string;
  paymentIntentId?: string;
  cardLast4?: string;
  cardBrand?: string;
  errorMessage?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentLog {
  id: number;
  paymentId?: number;
  action: string;
  status: string;
  requestData?: any;
  responseData?: any;
  errorMessage?: string;
  createdAt: Date;
}