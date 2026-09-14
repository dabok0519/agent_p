import { tool } from 'ai';
import { z } from 'zod';
import { MOCK_PURCHASE_ORDERS, MOCK_INVOICES, MOCK_GOODS_RECEIPTS } from './mock-data.js';
import { PurchaseOrderSchema, InvoiceSchema, GoodsReceiptSchema } from './schemas.js';

// 조회 도구 3개. auto / required 두 방식이 그대로 공유한다.
// 모델은 description 만 보고 도구를 고르므로, 한쪽만 설명을 손대면
// 두 방식의 차이가 toolChoice 때문인지 설명 때문인지 구분되지 않는다.
//
// 종료용 도구는 여기 두지 않는다. auto 는 필요 없고,
// required 의 submit 은 required/agent.ts 안에 있다.

// 구매오더 조회 도구
export const searchPurchaseOrders = tool({
  description: '구매 오더 목록을 조회한다. 상태(status), 공급업체명, 구매 오더 번호로 필터링할 수 있다.', // 도구에 대한 설명
  inputSchema: z.object({
    status: z.enum(['OPEN', 'COMPLETED', 'BLOCKED']).optional()
      .describe('필터링할 구매 오더 상태. 생략하면 전체 조회.'), // 개별 인자에 대한 설명
    vendor: z.string().optional()
      .describe('공급업체명으로 필터링.'),
    poNumber: z.string().optional()
      .describe('특정 구매 오더 번호 조회.'),
  }),
  outputSchema: z.object({
    count: z.number(),
    orders: z.array(PurchaseOrderSchema),
  }),
  execute: async ({ status, vendor, poNumber }) => {
    console.log(`  [tool 실행] searchPurchaseOrders(status=${status ?? '전체'}, vendor=${vendor ?? '전체'}, poNumber=${poNumber ?? '전체'})`);
     let result = MOCK_PURCHASE_ORDERS; // 조건부 누적 필터링
  if (status) result = result.filter((po) => po.status === status);
  if (vendor) result = result.filter((po) => po.vendor.includes(vendor)); // 사용자의 입력이 완벽하지 않을 경우
  if (poNumber) result = result.filter((po) => po.poNumber === poNumber);
    return { count: result.length, orders: result }; //굳이 JSON구조로 반환 안해도 될까 ( 자유 텍스트를 반환하지 않을 것 같음 )
  },
});
// 조회 시에 복잡도 테스트 필요 ex) sap 쪽에 개발도구를 만들 때 call graph를 배열로 만들려면 배열안에 배열 ... 등등 이 존재할 수 있음 
// 거기서 code handling을 찾아줘 ~~ 이런걸로 인해 복잡도가 높아질 수 밖에 없음 
// 올리는 이유 : 테스트 provider가 스키마가 복잡하면 뻗는 경우가 있다. ( json 파싱할 때 오류가 발생할 수 있다 )
// 미리 점검하는 게 좋음 
// 점검해봤는데 하나만 좀 깊게 받아줄 수 있음 (예시)
// 도구 만들 때 input 스키마를 너무 복잡하게 만들지 말자 () -> 너무 심플한 스키마 밖에 지원 안되는 서버는 재끼자 
// 객체안에 배열 , 배열안에 객체 , + 1  
// 너무 claude한테 생각을 맡기지 말자 
// 멀티 턴이 안됨 -> cli 도구를 붙여서 멀티턴 + sicf api agent를 만들어보자 
// cli도구는 클로드 코드 처럼 (예시임) npm run cli를 하면 cli가 실행이 되고 답변 기반으로 계속 대화할 수 있게 구현해라 

// 도구: 송장 조회
export const searchInvoices = tool({
  description: '송장(Invoice) 목록을 조회한다. 상태(status), 공급업체(vendor), 구매오더 번호(poNumber), 송장 번호(invoiceNumber), 참조 입고 문서(grNumber)로 필터링할 수 있다. 입고 없이 들어온 송장을 찾으려면 hasGoodsReceipt: false 를 쓴다.',
  inputSchema: z.object({
    status: z.enum(['POSTED', 'PARKED', 'BLOCKED']).optional()
      .describe('필터링할 송장 상태. 생략하면 전체 조회.'),
    vendor: z.string().optional()
      .describe('필터링할 공급업체 이름. 생략하면 전체 조회.'),
    poNumber: z.string().optional()
      .describe('참조 구매 오더 번호. 생략하면 전체 조회.'),
    invoiceNumber: z.string().optional()
      .describe('송장 번호. 생략하면 전체 조회.'),
    grNumber: z.string().optional()
      .describe('참조 입고 문서 번호. 생략하면 전체 조회.'),
    hasGoodsReceipt: z.boolean().optional()
      .describe('입고 참조 유무로 필터링. false 면 입고 없이 들어온 송장만, true 면 입고가 연결된 송장만. 생략하면 전체 조회.'),
  }),
  outputSchema: z.object({
    count: z.number(),
    invoices: z.array(InvoiceSchema),
  }),
  execute: async ({ status, vendor, poNumber, invoiceNumber, grNumber, hasGoodsReceipt }) => {
    console.log(`  [tool 실행] searchInvoices(status=${status ?? '전체'}, vendor=${vendor ?? '전체'}, poNumber=${poNumber ?? '전체'}, invoiceNumber=${invoiceNumber ?? '전체'}, grNumber=${grNumber ?? '전체'}, hasGoodsReceipt=${hasGoodsReceipt ?? '전체'})`);
    let result = MOCK_INVOICES;
    if (status) result = result.filter((inv) => inv.status === status);          // 각 필터는 값이 있을 때만 순차 적용
    if (vendor) result = result.filter((inv) => inv.vendor.includes(vendor)); // searchPurchaseOrders 와 같은 부분 일치
    if (poNumber) result = result.filter((inv) => inv.poNumber === poNumber);
    if (invoiceNumber) result = result.filter((inv) => inv.invoiceNumber === invoiceNumber);
    if (grNumber) result = result.filter((inv) => inv.grNumber === grNumber);
    if (hasGoodsReceipt !== undefined) result = result.filter((inv) => (inv.grNumber !== null) === hasGoodsReceipt); // false 는 falsy 라 !== undefined 로 검사
    return { count: result.length, invoices: result };
  },
});


// 입고 조회 도구
export const searchGoodsReceipts = tool({
  description: '입고(Goods Receipt) 내역을 조회한다. 구매오더 번호(poNumber), 입고 문서 번호(grNumber), 자재(material)로 필터링할 수 있다. 공급업체로는 조회할 수 없으므로, 공급업체 기준이면 먼저 searchPurchaseOrders 로 구매오더 번호를 찾아야 한다.',
  inputSchema: z.object({
    poNumber: z.string().optional()
      .describe('참조 구매 오더 번호. 생략하면 전체 조회.'),
    grNumber: z.string().optional()
      .describe('입고 문서 번호. 생략하면 전체 조회.'),
    material: z.string().optional()
      .describe('자재명으로 필터링. 부분 일치.'),
  }),
  outputSchema: z.object({
    count: z.number(),
    goodsReceipts: z.array(GoodsReceiptSchema),
  }),
  execute: async ({ poNumber, grNumber, material }) => {
    console.log(`  [tool 실행] searchGoodsReceipts(poNumber=${poNumber ?? '전체'}, grNumber=${grNumber ?? '전체'}, material=${material ?? '전체'})`);
    let result = MOCK_GOODS_RECEIPTS; // 조건부 누적 필터링
    if (poNumber) result = result.filter((gr) => gr.poNumber === poNumber);
    if (grNumber) result = result.filter((gr) => gr.grNumber === grNumber);
    if (material) result = result.filter((gr) => gr.material.includes(material)); // 사용자의 입력이 완벽하지 않을 경우
    return { count: result.length, goodsReceipts: result };
  },
});



// 밴더 평가서 보고서 서칭 api
// export const searchVendorAnay = tool({
//   description: '이 도구는 유사도 검색을 지원한다. ~파라미터 서치키워즈,배열에 문장을 입력하면 회사 문서파일 시스템에서 문서를 찾아온다',
//   inputSchema: z.object({
//     VendorNum: z.string().optional()
//       .describe('참조 구매 오더 번호. 생략하면 전체 조회.'),
//     SearchKeywords: z.array(z.string()).optional()
//       .describe('입력한 키워드 배열에 문장을 입력하면 회사 문서파일 시스템에서 문서를 찾아온다.'),
//   }),
//   outputSchema: z.object({
//     count: z.number(),
//     goodsReceipts: z.array(GoodsReceiptSchema),
//   }),
//   execute: async ({ poNumber, grNumber, material }) => {
//     console.log(`  [tool 실행] searchGoodsReceipts(poNumber=${poNumber ?? '전체'}, grNumber=${grNumber ?? '전체'}, material=${material ?? '전체'})`);
//     let result = MOCK_GOODS_RECEIPTS; // 조건부 누적 필터링
//     if (poNumber) result = result.filter((gr) => gr.poNumber === poNumber);
//     if (grNumber) result = result.filter((gr) => gr.grNumber === grNumber);
//     if (material) result = result.filter((gr) => gr.material.includes(material)); // 사용자의 입력이 완벽하지 않을 경우
//     return { count: result.length, goodsReceipts: result };
//   },
// });
