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

// 최종 출력 스키마.
// auto 방식은 Output.object 의 schema 로, required 방식은 submit 도구의 inputSchema 로 쓴다.
// 두 방식의 결과를 나란히 비교해야 하므로 반드시 같은 정의를 써야 한다.
//
// 문서 종류별로 스키마를 갈아끼우지 않고 세 칸을 항상 열어두고 무관한 칸은 [] 로 둔다.
// 질문이 문서 여러 개에 걸쳐도(예: 입고는 됐는데 송장이 안 온 건) 근거를 다 담을 수 있다
export const FINAL_SCHEMA = z.object({
  orders: z.array(PurchaseOrderSchema)
    .describe('답변에 관련된 구매 오더. 이 질문과 무관하면 빈 배열 [].'),
  invoices: z.array(InvoiceSchema)
    .describe('답변에 관련된 송장. 이 질문과 무관하면 빈 배열 [].'),
  goodsReceipts: z.array(GoodsReceiptSchema)
    .describe('답변에 관련된 입고 문서. 이 질문과 무관하면 빈 배열 [].'),
});
