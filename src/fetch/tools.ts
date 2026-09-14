


/**
 * 목 데이터를 sdk 폴더에서 가져온다. 상대 경로는 .js 확장자가 필요하다.
 */
import { MOCK_PURCHASE_ORDERS, MOCK_INVOICES, MOCK_GOODS_RECEIPTS } from '../sdk/mock-data.js';

/**
 * 중첩 실험용 목 데이터. 같은 폴더의 파일에서 온다.
 */
import { MOCK_PO_DETAILS, type PurchaseOrderItem } from './mock-data.nested.js';

/**
 * 모델에게 알려 줄 도구 목록. 모델은 이 설명만 보고 쓸지 말지 고른다.
 * 설명이 부실하면 도구를 안 부르거나 엉뚱한 값을 넣는다.
 */
/**
 * openrouter.ts 가 요청 본문에 실으려고 가져다 쓴다.
 */
export const tools = [
  {
    type: 'function',
    function: {
      /** TODO: 도구 이름 (영문, 아래 실행 분기에서 쓰는 이름과 같아야 한다) */
      name: 'searchPurchaseOrders',
      /** TODO: 늘어난 인자를 반영한 설명 한 문장 (src/sdk/tools.ts 참고) */
      description: '구매 오더 목록을 조회한다. 상태(status)로 필터링한다.',
      parameters: {
        type: 'object',
        properties: {
          /** TODO: 받을 인자 하나 (예: 상태). 모양은 { type, description } */
           status : { type: 'string', enum: ['OPEN', 'COMPLETED', 'BLOCKED'], description: '구매 오더의 상태. 필터링 시에 반드시 셋 중 하나를 넣는다. 필터링이 필요하지 않은 경우 전체 조회한다.' },
           /** TODO: 모델이 읽을 설명. 사람이 이름을 정확히 안 쓸 수 있다는 점을 담을지 판단 */
           vendor : { type: 'string', description: '공급업체 명으로 필터링.' },
           poNumber : { type: 'string', description: '구매오더를 구분한다, 기본키 역할 ' },
          },
        /** required 는 뺐다. 안 적으면 전부 선택이라는 뜻이다.
         *  조회 도구에서는 required가 굳이 필요없음
         *  생성이나 변경시에는 값을 맘대로 지어내어 생성
         */
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchInvoices',
      /** TODO: 이 도구가 뭘 하는지 한 문장 (src/sdk/tools.ts 의 searchInvoices 참고) */
      description: '송장(Invoice) 목록을 조회한다. 상태(status), 공급업체(vendor), 구매오더 번호(poNumber), 송장 번호(invoiceNumber)로 필터링할 수 있다.',
      parameters: {
        type: 'object',
        properties: {
          /** TODO: 송장 상태 설명. 고정값 셋이 구매오더와 다르다 */
           status : { type: 'string', enum: ['POSTED', 'PARKED', 'BLOCKED'], description: '송장의 상태. 필터링 시에 반드시 셋 중 하나를 넣는다. 필터링이 필요하지 않은 경우 전체 조회한다.' },
           /** TODO: 모델이 읽을 설명 */
           vendor : { type: 'string', description: '공급업체 명으로 필터링.' },
           /** TODO: 모델이 읽을 설명. 송장이 어느 구매오더를 참조하는지 */
           poNumber : { type: 'string', description: '송장에 해당하는 poNumber가 존재하고 필요할 시 poNumber에 따라 구매 오더를 조회한다.' },
          },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchGoodsReceipts',
      /** TODO: 설명 한 문장. 업체로는 못 찾는다는 것과, 업체 기준이면 구매오더를 먼저 거치라는 순서를 담는다 (src/sdk/tools.ts 참고) */
      description: '입고(Goods Receipt) 내역을 조회한다. 구매오더 번호(poNumber), 입고 문서 번호(grNumber), 자재(material)로 필터링할 수 있다. 공급업체로는 조회할 수 없으므로, 공급업체 기준이면 먼저 searchPurchaseOrders 로 구매오더 번호를 찾아야 한다.',
      parameters: {
        type: 'object',
        properties: {
          /** TODO: 모델이 읽을 설명. 입고가 어느 구매오더를 참조하는지 */
           poNumber : { type: 'string', description: '참조 구매 오더 번호. 생략하면 전체 조회.' },
           /** TODO: 모델이 읽을 설명 */
           grNumber : { type: 'string', description: '입고 문서 번호. 생략하면 전체 조회.' },
           /** TODO: 모델이 읽을 설명. 자재명은 사람이 정확히 안 쓸 수 있다 */
           material : { type: 'string', description: '자재명으로 필터링. 부분 일치를 지원한다.' },
          },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPurchaseOrderDetails',
      /**
       * 인자가 배열인 첫 도구. 모델이 번호를 배열로 써서 보내는지, 우리 검사가 배열을 거르는지 본다.
       * 결과는 구매오더 안에 품목 배열, 품목 안에 납기 배열이 든 모양이다.
       */
      /** TODO: 무엇을 돌려주는지 한 문장. 여러 건을 한 번에 받는 것과, 결과 안에 품목·납기 배열이 있다는 것 */
      description: '구매 오더의 세부 목록을 조회한다. 구매오더 한 건 내에 배열로 여러 아이템이 존재하고 하나의 아이템 내에 납기일이 배열로 존재한다.',
      parameters: {
        type: 'object',
        properties: {
          /**
           * 배열은 type: 'array' 와 items 로 적는다. items 가 배열 한 칸의 모양이다.
           * items 를 빼면 모델이 안에 뭘 넣어야 할지 모른다.
           */
          /** TODO: 모델이 읽을 설명. 여러 개를 한 번에 넣으라는 것 */
          poNumbers: { type: 'array', 
            items: { type: 'string' }, 
            description: '구매 오더 참조 번호.' },
          /**
           * 배열 안 객체. items 자리에 type: 'object' 와 properties 를 통째로 넣는다.
           * 인자 안내서 안에 안내서가 한 번 더 들어가는 모양이다.
           */
          /** TODO: 모델이 읽을 설명. 품목 조건 여러 개를 배열로, 조건 하나는 자재명과 최소 수량 */
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                /** TODO: 자재명 설명. 사람이 정확히 안 쓸 수 있다 */
                material: { type: 'string', description: '찾을 자재명. 부분 일치' },
                /** TODO: 최소 수량 설명. 생략하면 수량은 안 본다 */
                minQty: { type: 'integer', description: '자재의 수량. 수량 값은 반드시 도구를 통해 값을 확인하고 억지로 값을 지어내지 않는다. ' },
              },
            },
            description: '찾을 품목 조건 목록. 조건 하나는 자재명과 최소 수량"',
          },
          /**
           * 객체 안 객체. 배열 없이 type: 'object' 와 properties 가 바로 들어간다.
           * items 의 안쪽 객체 부분만 떼어 붙인 모양이다.
           */
          /** TODO: 모델이 읽을 설명. 헤더(업체·상태) 조건 묶음 */
          header: {
            type: 'object',
            properties: {
              /** TODO: 업체명 설명. 부분 일치 */
              vendor: { type: 'string', description: '공급업체 명으로 필터링.' },
              /** TODO: 상태 설명 */
              status: { type: 'string', enum: ['OPEN', 'COMPLETED', 'BLOCKED'], description: '구매 오더의 상태. 필터링 시에 반드시 셋 중 하나를 넣는다. 필터링이 필요하지 않은 경우 전체 조회한다.' },
            },
            description: '구매오더 헤더 조건 묶음. 업체명(vendor)과 상태(status)로 거른다. 품목이 아니라 구매오더 한 건 전체에 붙는 조건이다. 생략하면 헤더로는 안 거른다.',
          },
        },
      },
    },
  },
];

/**
 * 도구가 실제로 하는 일. 조회만 하고 아무것도 바꾸지 않는다.
 * 
 * 모델이 지어낸 인자라 믿을 수 없다. 쓰기 전에 if 가드로 확인한다.
 */
type PurchaseOrderInput = {
  status?: 'OPEN' | 'COMPLETED' | 'BLOCKED';
  vendor?: string;
  poNumber?: string;
};

/**
 * 송장 인자 모양. 상태의 고정값이 구매오더와 다르다.
 * 한쪽 선언을 그대로 쓰면 엉뚱한 상태값을 통과시킨다.
 */
type InvoiceInput = {
  status?: 'POSTED' | 'PARKED' | 'BLOCKED';
  vendor?: string;
  poNumber?: string;
};

/**
 * 입고 인자 모양. 업체명이 없다. 목 데이터에 그 칸 자체가 없다.
 * 업체 기준으로 찾으려면 구매오더를 먼저 거쳐 번호를 얻어야 한다.
 */
type GoodsReceiptInput = {
  poNumber?: string;
  grNumber?: string;
  material?: string;
};

/**
 * 여러 건 상세 조회 인자 모양. string[] 은 글자만 담는 내부 테이블이다.
 */
type PurchaseOrderDetailsInput = {
  poNumbers?: string[];
  items?: ItemCondition[];
  header?: HeaderCondition;
};

/**
 * 헤더 조건 모양. 구조 안의 구조다. 배열이 아니라 하나뿐이다.
 */
type HeaderCondition = {
  vendor?: string;
  status?: 'OPEN' | 'COMPLETED' | 'BLOCKED';
};

/**
 * 품목 조건 하나의 모양. 배열 한 칸이 이 구조다. 자재명은 있어야 하고 최소 수량은 선택이다.
 */
type ItemCondition = {
  material: string;
  minQty?: number;
};

/**
 * 검사 결과 모양. 성공이면 값, 실패면 사유를 담는다. zod 의 safeParse 가 돌려주는 모양과 같다.
 * 꺾쇠 안 T 는 자리표시(도구마다 다른 값 모양이 들어간다).
 * <> = 타입을 인자로 받기 
 */
type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * 문자열 → 객체 변환에 실패 가드를 붙인 것. 검사 함수 셋이 같은 첫 단계를 쓴다.
 * JSON.parse 는 규격 밖 글자에 멈추므로 TRY 로 감싸 사유를 값으로 돌려준다.
 */
function parseObject(raw: string): Checked<object> {
  let 
  parsed: unknown;
  try {
    parsed = JSON.parse(raw); // 문자열 -> 객체 변환 (들어올 수 있는 값 : 배열 , 변수(객체),string , integer , null, boolean)
  } catch {
    return { ok: false, reason: `인자가 JSON 이 아니다: ${raw}` };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { // 몇 겹이든 최상위는 항상 객체여야 한다.
    return { ok: false, reason: `인자가 객체가 아니다: ${raw}` };
  }

  return { ok: true, value: parsed };
}

/**
 * 구매오더 인자 검사. zod 의 parse 가 하던 일을 손으로 쓴 것이다.
 * 받은 객체에 as 를 붙이는 대신, 확인한 값으로 새 객체를 만든다.
 * 그래서 모르는 칸은 사라지고, as 없이도 타입이 생긴다.
 */
/**
 * tools.test.ts 가 직접 불러 시험한다.
 */ 
export function validatePurchaseOrderInput(raw: string): Checked<PurchaseOrderInput> {// 이 함수가 ok:true 로 끝나면, value 는 PurchaseOrderInput 모양이라고 선언한 것 
  const parsed = parseObject(raw);
  if (!parsed.ok) return parsed;
  const obj = parsed.value;

  const value: PurchaseOrderInput = {}; // 스키마에 없는 칸을 버리기 위한 변순 (input타입에 맞춰 이상한 필드 버리기) 

  /**
   * 상태 칸. 'status' in obj 는 그 이름의 칸이 있는지 보는 것이다. 없으면 선택이라 건너뛴다.
   * 셋을 === 로 하나씩 비교해야 타입 검사기가 셋 중 하나로 좁혀 준다. includes 로는 안 좁혀진다.
   * 이 파트는 필드별 데이터 타입 + optional()에 대한 필수 여부 검사
   */
  if ('status' in obj) {
    const s = obj.status;
    if (s !== 'OPEN' && s !== 'COMPLETED' && s !== 'BLOCKED') {
      return { ok: false, reason: `status: OPEN/COMPLETED/BLOCKED 중 하나가 아니다 (받은 값: ${JSON.stringify(s)})` };
    }
    value.status = s;
  }

  if ('vendor' in obj) {
    const v = obj.vendor;
    if (typeof v !== 'string') {
      return { ok: false, reason: `vendor: 글자가 아니다 (받은 값: ${JSON.stringify(v)})` };
    }
    value.vendor = v;
  }

  if ('poNumber' in obj) {
    const n = obj.poNumber;
    if (typeof n !== 'string') {
      return { ok: false, reason: `poNumber: 글자가 아니다 (받은 값: ${JSON.stringify(n)})` };
    }
    value.poNumber = n;
  }

  return { ok: true, value };
}

/**
 * 송장 인자 검사. 위 함수와 같은 방식이고, 상태 고정값만 다르다.
 */
/**
 * tools.test.ts 가 직접 불러 시험한다.
 */
export function validateInvoiceInput(raw: string): Checked<InvoiceInput> {
  const parsed = parseObject(raw);
  if (!parsed.ok) return parsed;
  const obj = parsed.value;

  const value: InvoiceInput = {};

  if ('status' in obj) {
    const s = obj.status;
    if (s !== 'POSTED' && s !== 'PARKED' && s !== 'BLOCKED') {
      return { ok: false, reason: `status: POSTED/PARKED/BLOCKED 중 하나가 아니다 (받은 값: ${JSON.stringify(s)})` };
    }
    value.status = s;
  }

  if ('vendor' in obj) {
    const v = obj.vendor;
    if (typeof v !== 'string') {
      return { ok: false, reason: `vendor: 글자가 아니다 (받은 값: ${JSON.stringify(v)})` };
    }
    value.vendor = v;
  }

  if ('poNumber' in obj) {
    const n = obj.poNumber;
    if (typeof n !== 'string') {
      return { ok: false, reason: `poNumber: 글자가 아니다 (받은 값: ${JSON.stringify(n)})` };
    }
    value.poNumber = n;
  }

  return { ok: true, value };
}

/**
 * 입고 인자 검사. 고정값이 없어 타입만 본다.
 */
/**
 * tools.test.ts 가 직접 불러 시험한다.
 */
export function validateGoodsReceiptInput(raw: string): Checked<GoodsReceiptInput> {
  const parsed = parseObject(raw);
  if (!parsed.ok) return parsed;
  const obj = parsed.value;

  const value: GoodsReceiptInput = {};

  if ('poNumber' in obj) {
    const n = obj.poNumber;
    if (typeof n !== 'string') {
      return { ok: false, reason: `poNumber: 글자가 아니다 (받은 값: ${JSON.stringify(n)})` };
    }
    value.poNumber = n;
  }

  if ('grNumber' in obj) {
    const g = obj.grNumber;
    if (typeof g !== 'string') {
      return { ok: false, reason: `grNumber: 글자가 아니다 (받은 값: ${JSON.stringify(g)})` };
    }
    value.grNumber = g;
  }

  if ('material' in obj) {
    const m = obj.material;
    if (typeof m !== 'string') {
      return { ok: false, reason: `material: 글자가 아니다 (받은 값: ${JSON.stringify(m)})` };
    }
    value.material = m;
  }

  return { ok: true, value };
}

/**
 * 배열 인자 검사. 글자 하나 검사가 세 단계로 늘어난다. 칸이 있는가, 배열인가, 안이 전부 글자인가.
 * 배열인지 안 보고 LOOP 를 돌면 글자 하나가 와도 한 글자씩 돌아 엉뚱하게 통과한다.
 */
/**
 * tools.test.ts 가 직접 불러 시험한다.
 */
export function validatePurchaseOrderDetailsInput(raw: string): Checked<PurchaseOrderDetailsInput> {
  const parsed = parseObject(raw);
  if (!parsed.ok) return parsed;
  const obj = parsed.value;

  const value: PurchaseOrderDetailsInput = {};

  if ('poNumbers' in obj) {
    const list = obj.poNumbers;
    if (!Array.isArray(list)) {
      return { ok: false, reason: `poNumbers: 배열이 아니다 (받은 값: ${JSON.stringify(list)})` };
    }

    /**
     * 배열 안을 한 칸씩 확인해 새 배열에 옮겨 담는다. 몇 번째가 틀렸는지 사유에 남긴다.
     */
    const numbers: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (typeof n !== 'string') {
        return { ok: false, reason: `poNumbers[${i}]: 글자가 아니다 (받은 값: ${JSON.stringify(n)})` };
      }
      numbers.push(n);
    }
    value.poNumbers = numbers;
  }

  /**
   * 배열 안 객체 검사. 배열 검사에 "각 칸이 객체인가"와 "그 객체 안 칸이 맞는가"가 한 겹 더 붙는다.
   * 안쪽 칸 검사는 맨 처음 검사 함수와 같은 모양이 배열 한 칸마다 반복된다.
   */
  if ('items' in obj) {
    const list = obj.items;
    if (!Array.isArray(list)) {
      return { ok: false, reason: `items: 배열이 아니다 (받은 값: ${JSON.stringify(list)})` };
    }

    const conditions: ItemCondition[] = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (typeof c !== 'object' || c === null || Array.isArray(c)) {
        return { ok: false, reason: `items[${i}]: 객체가 아니다 (받은 값: ${JSON.stringify(c)})` };
      }

      if (!('material' in c) || typeof c.material !== 'string') {
        return { ok: false, reason: `items[${i}].material: 글자가 없다 (받은 값: ${JSON.stringify(c)})` };
      }
      const condition: ItemCondition = { material: c.material };

      if ('minQty' in c) {
        const q = c.minQty;
        if (typeof q !== 'number') {
          return { ok: false, reason: `items[${i}].minQty: 숫자가 아니다 (받은 값: ${JSON.stringify(q)})` };
        }
        condition.minQty = q;
      }

      conditions.push(condition);
    }
    value.items = conditions;
  }

  /**
   * 객체 안 객체 검사. items 블록에서 LOOP 만 뺀 모양이다. 객체인가 → 그 안 칸이 맞는가.
   */
  if ('header' in obj) {
    const h = obj.header;
    if (typeof h !== 'object' || h === null || Array.isArray(h)) {
      return { ok: false, reason: `header: 객체가 아니다 (받은 값: ${JSON.stringify(h)})` };
    }

    const header: HeaderCondition = {};

    if ('vendor' in h) {
      const v = h.vendor;
      if (typeof v !== 'string') {
        return { ok: false, reason: `header.vendor: 글자가 아니다 (받은 값: ${JSON.stringify(v)})` };
      }
      header.vendor = v;
    }

    if ('status' in h) {
      const s = h.status;
      if (s !== 'OPEN' && s !== 'COMPLETED' && s !== 'BLOCKED') {
        return { ok: false, reason: `header.status: OPEN/COMPLETED/BLOCKED 중 하나가 아니다 (받은 값: ${JSON.stringify(s)})` };
      }
      header.status = s;
    }

    value.header = header;
  }

  return { ok: true, value };
}

/**
 * main.ts 가 모델의 도구 요청을 받아 이 이름을 부른다.
 * export를 붙혀 다른 파일에서 import 가능하게 한다.
 * 
 */
export function runTool(name: string, rawArguments: string) {
  /**
   * 모르는 이름 가드. 모델이 없는 도구를 지어내 부를 수 있다.
   * 여기서 안 막으면 엉뚱한 도구가 실행된다. 멈추지 않고 실패를 값으로 돌려준다.
   */
  if (name === 'searchPurchaseOrders') {
    return runSearchPurchaseOrders(rawArguments);
  }

  if (name === 'searchInvoices') {
    return runSearchInvoices(rawArguments);
  }

  if (name === 'searchGoodsReceipts') {
    return runSearchGoodsReceipts(rawArguments);
  }

  if (name === 'getPurchaseOrderDetails') {
    return runGetPurchaseOrderDetails(rawArguments);
  }

  return { ok: false, reason: `모르는 도구 이름: ${name}` };
}

function runGetPurchaseOrderDetails(rawArguments: string) {
  const checked = validatePurchaseOrderDetailsInput(rawArguments);
  if (!checked.ok) return checked;
  const input = checked.value;

  /**
   * 후에 api 요청으로 실제 데이터를 조회하는 자리. 결과 한 건 안에 품목 배열, 그 안에 납기 배열이 있다.
   */
  let found = MOCK_PO_DETAILS;

  if (input.poNumbers) {
    const numbers = input.poNumbers;
    /** TODO: 목 데이터 한 건의 번호가 받은 배열 안에 있는지 보는 조건. 배열의 includes 를 쓴다 */
    
    found = found.filter((po) => numbers.includes(po.poNumber));
  }

  if (input.items) {
    const conditions = input.items;
    /**
     * some 은 LOOP 돌다 하나라도 맞으면 참. 구매오더의 품목 중 하나가 조건 중 하나에 맞으면 남긴다.
     */
    found = found.filter((po) => po.items.some((item) => conditions.some((c) => matches(item, c))));
  }

  if (input.header) {
    const header = input.header;

    if (header.vendor) {
      const vendor = header.vendor;
      /** TODO: 업체명 비교. 구매오더 조회와 같은 모양 */
      found = found.filter((po) => po.vendor.includes(vendor));
    }

    if (header.status) {
      /** TODO: 상태 비교 */
      found = found.filter((po) => po.status === header.status);
    }
  }

  return { ok: true, count: found.length, orders: found };
}

/**
 * 품목 하나가 조건 하나에 맞는가. 위의 some 두 겹 안쪽 물음 하나를 이름 붙여 뺀 것이다.
 */
function matches(item: PurchaseOrderItem, c: ItemCondition): boolean {
  /** TODO: 자재명 비교. item.material 이 c.material 을 대소문자 무시하고 포함하는가 (업체명 거르기와 같은 모양) */
  const materialOk = item.material.toLowerCase().includes(c.material.toLowerCase());


  /** TODO: 수량 비교. c.minQty 가 없으면 참, 있으면 item.quantity 가 그 이상인가
   * minQty = 사람이 최소 수량 필터를 물어본 경우 
   */
  
  const qtyOk = c.minQty === undefined || item.quantity >= c.minQty;

  return materialOk && qtyOk;
}

function runSearchPurchaseOrders(rawArguments: string) {
  /**
   * 문자열 → 객체 변환. 결과는 타입이 없어 바로 아래에서 검사한다.
   * rawarguments가 문자열{status: 'OPEN'}로 넘어오기 때문에 객체로 변환해야 값을 코드에서 사용 가능
   */
  const checked = validatePurchaseOrderInput(rawArguments);
  if (!checked.ok) return checked;
  const input = checked.value;

  /**
   * 조건 없이 시작해서 값이 온 것만 차례로 좁힌다.
   * 검사 없이 바로 거르면 안 온 인자로도 걸러 0건이 된다.
   * 후에 api 요청으로 실제 데이터를 조회하는 자리 
   */
  let found = MOCK_PURCHASE_ORDERS;

  /**
   * LOOP AT … WHERE 로 새 내부 테이블을 만드는 것과 같다.
   * 원본은 안 바뀌고 새 배열이 온다.
   */
  if (input.status) {
    found = found.filter((po) => po.status === input.status);
  }

  if (input.vendor) {
    /** TODO: 업체명 비교 방식. 정확히 같은 것만인지, 포함만 해도 되는지 */
    const vendor =  input.vendor;
    found = found.filter((po) => po.vendor.toLowerCase().includes(vendor.toLowerCase()));
  }

  if (input.poNumber) {
    /** TODO: 번호 비교 방식 */
    found = found.filter((po) => po.poNumber === input.poNumber);
  }

  return { ok: true, count: found.length, orders: found };
  // 조회 성공 여부 & 조회 건수 & 조회된 값
}

function runSearchInvoices(rawArguments: string) {
  const checked = validateInvoiceInput(rawArguments);
  if (!checked.ok) return checked;
  const input = checked.value;

  /**
   * 후에 api 요청으로 실제 데이터를 조회하는 자리 
   */
  let found = MOCK_INVOICES;
  

  if (input.status) {
    /** TODO: 상태 비교 방식 */
    found = found.filter((invoice) => invoice.status === input.status);
  }

  if (input.vendor) {
    /** TODO: 업체명 비교 방식. 구매오더 쪽과 같은 고민이다 */
    const vendor =  input.vendor;
    found = found.filter((invoice) => invoice.vendor.toLowerCase().includes(vendor.toLowerCase()));
  }

  if (input.poNumber) {
    /** TODO: 참조 구매오더 번호 비교 방식 */
    found = found.filter((invoice) => invoice.poNumber === input.poNumber);
  }

  return { ok: true, count: found.length, invoices: found };
}

function runSearchGoodsReceipts(rawArguments: string) {
  const checked = validateGoodsReceiptInput(rawArguments);
  if (!checked.ok) return checked;
  const input = checked.value;

  /**
   * 후에 api 요청으로 실제 데이터를 조회하는 자리
   */
  let found = MOCK_GOODS_RECEIPTS;

  if (input.poNumber) {
    /** TODO: 참조 구매오더 번호 비교 방식 */
    found = found.filter((goodreciept) => goodreciept.poNumber === input.poNumber);
  }

  if (input.grNumber) {
    /** TODO: 입고 문서 번호 비교 방식 */
    found = found.filter((goodreciept) => goodreciept.grNumber === input.grNumber);
  }

  if (input.material) {
    /** TODO: 자재명 비교 방식. 업체명 때와 같은 고민이다 */
    const material = input.material;
    found = found.filter((goodreciept) => goodreciept.material.toLowerCase().includes( material.toLowerCase()));
  }

  return { ok: true, count: found.length, goodsReceipts: found };
}
