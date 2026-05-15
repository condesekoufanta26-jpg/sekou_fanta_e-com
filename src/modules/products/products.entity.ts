// product.entity.ts
export class Product {
  id!: number;
  name!: string;
  description!: string;
  price!: number;
  stock!: number;
  isActive!: boolean;
  createdBy!: number;      // ID de l'admin qui a créé
  createdAt!: Date;
  updatedAt!: Date;
}