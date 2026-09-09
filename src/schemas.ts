import { z } from 'zod';

// 문서 스키마 — 도구의 outputSchema 와 각 방식의 최종 출력이 같은 정의를 공유한다.
// 필드가 바뀌면 여기 한 곳만 고치면 된다.
export const PurchaseOrderSchema = z.object({
  poNumber: z.string(),
  vendor: z.string(),
  status: z.enum(['OPEN', 'COMPLETED', 'BLOCKED']),
  amount: z.number(),
  currency: z.string(),
  orderDate: z.string().describe('구매 오더 문서일자. YYYY-MM-DD'),
});

export const InvoiceSchema = z.object({
  invoiceNumber: z.string(),
  poNumber: z.string(),
  grNumber: z.string().nullable().describe('참조 입고 문서 번호. null 이면 입고 없이 들어온 송장.'),
  vendor: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(['POSTED', 'PARKED', 'BLOCKED']),
  invoiceDate: z.string(),
});

export const GoodsReceiptSchema = z.object({
  grNumber: z.string(),
  poNumber: z.string(),
  material: z.string(),
  quantity: z.number(),
  unit: z.string(),
  receiptDate: z.string(),
});
