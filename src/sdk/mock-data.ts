// Mock 데이터
// orderDate 는 SAP EKKO 의 BEDAT(구매 오더 문서일자). 아래 입고일·송장일보다 항상 앞선다
export const MOCK_PURCHASE_ORDERS = [
  { poNumber: '4500000001', vendor: 'Siemens AG',    status: 'OPEN',      amount: 15000, currency: 'EUR', orderDate: '2026-03-02' },
  { poNumber: '4500000002', vendor: 'Bosch',         status: 'OPEN',      amount:  8200, currency: 'EUR', orderDate: '2026-03-05' },
  { poNumber: '4500000003', vendor: 'Hyundai Mobis', status: 'COMPLETED', amount: 42000, currency: 'KRW', orderDate: '2026-02-14' },
  { poNumber: '4500000004', vendor: 'LG Chem',       status: 'BLOCKED',   amount:  3100, currency: 'KRW', orderDate: '2026-03-19' },
  { poNumber: '4500000005', vendor: 'SAP SE',        status: 'OPEN',      amount:  9900, currency: 'EUR', orderDate: '2026-03-11' },
];

// 송장 (SAP RBKP 송장 헤더 흉내) — poNumber 로 위 구매 오더와 연결
// grNumber 는 RSEG 의 LFBNR(참조 입고 문서). 참조 방향은 송장 → 입고 이며, 그 반대는 없다.
// null = 입고 없이 들어온 송장 (3-way match 불일치 후보)
// 4500000003 은 분할 송장 2건, 4500000004(LG Chem) 는 아직 송장 없음
export const MOCK_INVOICES = [
  { invoiceNumber: '5100000001', poNumber: '4500000001', grNumber: '5000000001' as string | null, vendor: 'Siemens AG',    amount: 15000, currency: 'EUR', status: 'POSTED',  invoiceDate: '2026-03-15' },
  { invoiceNumber: '5100000002', poNumber: '4500000002', grNumber: null,         vendor: 'Bosch',         amount:  8200, currency: 'EUR', status: 'PARKED',  invoiceDate: '2026-03-18' },
  { invoiceNumber: '5100000003', poNumber: '4500000003', grNumber: '5000000004', vendor: 'Hyundai Mobis', amount: 30000, currency: 'KRW', status: 'POSTED',  invoiceDate: '2026-02-27' },
  { invoiceNumber: '5100000004', poNumber: '4500000003', grNumber: null,         vendor: 'Hyundai Mobis', amount: 12000, currency: 'KRW', status: 'POSTED',  invoiceDate: '2026-03-20' },
  { invoiceNumber: '5100000005', poNumber: '4500000005', grNumber: '5000000005', vendor: 'SAP SE',        amount:  9900, currency: 'EUR', status: 'BLOCKED', invoiceDate: '2026-03-22' },
];

// 입고 (SAP MSEG 자재문서 흉내) — poNumber 로 위 구매 오더와 연결
// MSEG 에는 공급업체 필드가 없다. vendor 는 poNumber 로 구매 오더를 타고 가야 알 수 있음
// 4500000001 은 분할 입고 2건, 4500000004(LG Chem, BLOCKED) 는 입고 없음
export const MOCK_GOODS_RECEIPTS = [
  { grNumber: '5000000001', poNumber: '4500000001', material: 'Steel Sheet 2mm',   quantity: 100, unit: 'EA', receiptDate: '2026-03-10' },
  { grNumber: '5000000002', poNumber: '4500000001', material: 'Steel Sheet 2mm',   quantity:  40, unit: 'EA', receiptDate: '2026-03-14' },
  { grNumber: '5000000003', poNumber: '4500000002', material: 'Bearing 6204',      quantity: 200, unit: 'EA', receiptDate: '2026-03-16' },
  { grNumber: '5000000004', poNumber: '4500000003', material: 'Wiring Harness A1', quantity:  60, unit: 'EA', receiptDate: '2026-02-25' },
  { grNumber: '5000000005', poNumber: '4500000005', material: 'License Pack',      quantity:   5, unit: 'EA', receiptDate: '2026-03-21' },
];
