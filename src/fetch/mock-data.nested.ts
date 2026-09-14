/**
 * 중첩 구조 실험용 목 데이터. 기존 평평한 목 데이터는 sdk 쪽 것을 그대로 쓴다.
 * SAP 구조를 흉내 냈다. 헤더 아래 품목, 품목 아래 납기 일정.
 */

/**
 * 납기 일정 한 줄 (EKET 흉내). 품목 안에 배열로 들어간다. 가장 안쪽이다.
 */
type ScheduleLine = {
  scheduleLine: string;
  deliveryDate: string;
  quantity: number;
};

/**
 * 품목 한 줄 (EKPO 흉내). 안에 납기 일정 배열을 담는다.
 */
/**
 * tools.ts 가 품목 조건 비교 함수의 인자 타입으로 가져다 쓴다.
 */
export type PurchaseOrderItem = {
  itemNumber: string;
  material: string;
  quantity: number;
  unit: string;
  netPrice: number;
  schedules: ScheduleLine[];
};

/**
 * 구매오더 한 건 (EKKO 흉내). 안에 품목 배열을 담는다.
 */
type PurchaseOrderDetail = {
  poNumber: string;
  vendor: string;
  status: 'OPEN' | 'COMPLETED' | 'BLOCKED';
  currency: string;
  orderDate: string;
  items: PurchaseOrderItem[];
};

/**
 * tools.ts 가 중첩 조회 도구에서 가져다 쓴다.
 * 건수를 적게 둔다. 응답이 길어지면 중첩 말고 길이 때문에 깨질 수 있다.
 */
export const MOCK_PO_DETAILS: PurchaseOrderDetail[] = [
  {
    poNumber: '4500000001',
    vendor: 'Siemens AG',
    status: 'OPEN',
    currency: 'EUR',
    orderDate: '2026-03-02',
    items: [
      {
        itemNumber: '10',
        /** 150 주문에 납기가 100 + 50 두 줄. 일정이 둘인 품목이 하나는 있어야 안쪽 배열을 읽는지 본다 */
        material: 'Steel Sheet 2mm',
        quantity: 150,
        unit: 'EA',
        netPrice: 100,
        schedules: [
          { scheduleLine: '0001', deliveryDate: '2026-03-10', quantity: 100 },
          { scheduleLine: '0002', deliveryDate: '2026-03-14', quantity: 50 },
        ],
      },
    ],
  },
  {
    poNumber: '4500000002',
    vendor: 'Bosch',
    status: 'OPEN',
    currency: 'EUR',
    orderDate: '2026-03-05',
    items: [
      {
        itemNumber: '10',
        material: 'Bearing 6204',
        quantity: 200,
        unit: 'EA',
        netPrice: 41,
        schedules: [
          { scheduleLine: '0001', deliveryDate: '2026-03-16', quantity: 200 },
        ],
      },
    ],
  },
  {
    poNumber: '4500000003',
    vendor: 'Hyundai Mobis',
    status: 'COMPLETED',
    currency: 'KRW',
    orderDate: '2026-02-14',
    items: [
      {
        itemNumber: '10',
        material: 'Wiring Harness A1',
        quantity: 40,
        unit: 'EA',
        netPrice: 750,
        schedules: [
          { scheduleLine: '0001', deliveryDate: '2026-02-25', quantity: 40 },
        ],
      },
      {
        itemNumber: '20',
        /** 품목이 둘인 건이 하나는 있어야 바깥 배열을 제대로 읽는지 볼 수 있다 */
        material: 'Connector Set B2',
        quantity: 20,
        unit: 'EA',
        netPrice: 600,
        schedules: [
          { scheduleLine: '0001', deliveryDate: '2026-02-20', quantity: 12 },
          { scheduleLine: '0002', deliveryDate: '2026-02-25', quantity: 8 },
        ],
      },
    ],
  },
];
