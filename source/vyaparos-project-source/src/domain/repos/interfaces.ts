import {
  BusinessSettings,
  User,
  Artisan,
  Customer,
  Product,
  StockBatch,
  StockMovement,
  Purchase,
  PurchaseItem,
  Invoice,
  InvoiceItem,
  Payment,
  ChangeRecord,
  BackupLog,
  ProductStockInfo,
  CustomerDueInfo,
  CustomerLedgerEntry,
  StockLocation,
} from '../types';

export interface ISettingsRepo {
  get(): Promise<BusinessSettings | null>;
  save(settings: BusinessSettings): Promise<void>;
}

export interface IUserRepo {
  getOwner(): Promise<User | null>;
  save(user: User): Promise<void>;
}

export interface ICustomerRepo {
  getAll(): Promise<Customer[]>;
  getById(id: string): Promise<Customer | null>;
  findByMobile(mobile: string): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
  softDelete(id: string): Promise<void>;
  getDues(): Promise<CustomerDueInfo[]>;
  getLedger(customerId: string): Promise<CustomerLedgerEntry[]>;
}

export interface IArtisanRepo {
  getAll(): Promise<Artisan[]>;
  getById(id: string): Promise<Artisan | null>;
  save(artisan: Artisan): Promise<Artisan>;
  softDelete(id: string): Promise<void>;
}

export interface IProductRepo {
  getAll(): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  search(query: string): Promise<Product[]>;
  save(product: Product): Promise<Product>;
  softDelete(id: string): Promise<void>;
  getStockInfo(productId?: string): Promise<ProductStockInfo[]>;
}

export interface IStockRepo {
  getBatchesForProduct(productId: string, location?: StockLocation): Promise<StockBatch[]>;
  getMovementsForProduct(productId: string): Promise<StockMovement[]>;
  getMovementsByProduct?(productId: string): Promise<StockMovement[]>;
  getAllProductsStockInfo?(): Promise<ProductStockInfo[]>;
  addBatch(batch: StockBatch): Promise<void>;
  addMovement(movement: StockMovement): Promise<void>;
  getQuantityOnHand(productId: string, location?: StockLocation): Promise<number>;
  getProductStock?(productId: string): Promise<{ currentStock: number; totalCostPaise: number }>;
  getBatchesWithRemainingQty(
    productId: string,
    location?: StockLocation
  ): Promise<Array<StockBatch & { remainingQty: number }>>;
}

export interface IPurchaseRepo {
  getAll(): Promise<Purchase[]>;
  getById(id: string): Promise<Purchase | null>;
  save(purchase: Purchase, items: PurchaseItem[]): Promise<void>;
  createPurchase?(purchase: Purchase, items: PurchaseItem[]): Promise<void>;
  postPurchase(purchaseId: string): Promise<void>;
}

export interface IInvoiceRepo {
  getAll(): Promise<Invoice[]>;
  getById(id: string): Promise<Invoice | null>;
  getByDateRange(startDate: string, endDate: string): Promise<Invoice[]>;
  getNextSequence(financialYear: string, series: string): Promise<number>;
  createFinalizedInvoice(invoice: Invoice, items: InvoiceItem[]): Promise<void>;
  cancelInvoice(invoiceId: string, reason?: string): Promise<void>;
}

export interface IPaymentRepo {
  getAll(): Promise<Payment[]>;
  getByCustomerId(customerId: string): Promise<Payment[]>;
  getByInvoiceId(invoiceId: string): Promise<Payment[]>;
  addPayment(payment: Payment): Promise<void>;
  reversePayment(paymentId: string, reason?: string): Promise<void>;
  getCustomerDues?(customerId: string): Promise<CustomerDueInfo>;
  getCustomerLedger?(customerId: string): Promise<CustomerLedgerEntry[]>;
}

export interface IChangeRepo {
  appendChange(change: ChangeRecord): Promise<void>;
  getAll(limit?: number): Promise<ChangeRecord[]>;
}

export interface IBackupLogRepo {
  log(entry: BackupLog): Promise<void>;
  getLatest(): Promise<BackupLog | null>;
}
