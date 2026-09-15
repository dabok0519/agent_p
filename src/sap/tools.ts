/**
 * 실제 SAP 을 부르는 함수를 가져온다. 상대 경로는 .js 확장자가 필요하다.
 */
import { fetchPurchaseOrders, fetchPurchaseOrderDetails } from './client.js';

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
      name: 'searchPurchaseOrders',
      /** TODO: 이 도구가 뭘 하는지 한 문장. 인자 넷을 반영한다 (src/fetch/tools.ts 참고) */
      description: '구매 오더 목록을 조회한다.',
      parameters: {
        type: 'object',
        properties: {
          /** TODO: 모델이 읽을 설명. 44/45 로 시작하는 10자리이고 글자로 넣어야 한다는 것 */
          poNumber: { type: 'string', description: '구매오더를 구분한다. 기본키 역할' },
          /** TODO: 모델이 읽을 설명. 업체 이름이 아니라 코드라는 것 (예: BP2100) */
          vendor: { type: 'string', description: '공급업체 명으로 필터링.' },
          /** TODO: 모델이 읽을 설명. 회사코드 네 자리 (예: 1000) */
          companyCode: { type: 'string', description: '회사업체 명으로 필터링.' },
          /**
           * enum 은 모델에게 주는 안내일 뿐 강제가 아니다.
           * 모델이 KRW 를 보내도 그대로 도착한다. 막는 건 아래 검사 함수뿐이다.
           */
          /** TODO: 모델이 읽을 설명. 필터가 필요 없으면 안 넣는다는 것 */
          currency: { type: 'string', enum: ['USD', 'VND'], description: '통화 단위로 필터링' },
        },
        /** required 는 뺐다. 안 적으면 전부 선택이라는 뜻이다. 조회 도구라 필수값이 없다. */
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPurchaseOrderDetails',
      description:
        '구매오더의 품목(항목) 목록을 조회한다. 오더 번호별로 items 배열이 온다. poNumbers·material·minQuantity 는 전부 선택이고 AND 로 겹친다. 하나도 안 넣으면 전체 오더의 항목이 온다.',
      parameters: {
        type: 'object',
        properties: {
          /**
           * 배열 인자. items 가 원소 하나의 모양이다. 모델은 ["4410000000","4420000008"] 처럼 보낸다.
           */
          poNumbers: {
            type: 'array',
            items: { type: 'string' },
            description: '구매오더 번호 배열. 여러 오더는 한 번에 배열로 넣는다. 44/45 로 시작하는 10자리 글자.',
          },
          material: { type: 'string', description: '자재 번호 (예: ST75P211A1/WHE). 이 자재가 든 항목만 온다.' },
          minQuantity: { type: 'number', description: '최소 수량. 이 값 이상인 항목만 온다. 숫자로 넣는다.' },
        },
        /** required 는 뺐다. 셋 다 선택이고 하나도 없으면 전체 조회다. */
      },
    },
  },
];

/**
 * 도구 인자 모양. TYPES: BEGIN OF … END OF 처럼 구조를 미리 적는다.
 * 모양만 적을 뿐 실행할 때 검사하지 않으므로, 값 확인은 아래 가드가 한다.
 */
type PurchaseOrderInput = {
  poNumber?: string;
  vendor?: string;
  companyCode?: string;
  currency?: 'USD' | 'VND';
};

/**
 * 검사 결과 모양. 성공이면 값, 실패면 사유를 담는다.
 * 꺾쇠 안 T 는 자리표시(도구마다 다른 값 모양이 들어간다).
 */
type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * 문자열 → 객체 변환에 실패 가드를 붙인 것.
 * JSON.parse 는 규격 밖 글자에 멈추므로 TRY 로 감싸 사유를 값으로 돌려준다.
 */
function parseObject(raw: string): Checked<object> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: `인자가 JSON 이 아니다: ${raw}` };
  }

  /**
   * 몇 겹이든 최상위는 항상 객체여야 한다. 배열도 typeof 로는 object 라 따로 막는다.
   */
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: `인자가 객체가 아니다: ${raw}` };
  }

  return { ok: true, value: parsed };
}

/**
 * 인자 검사. 받은 객체에 as 를 붙이는 대신, 확인한 값으로 새 객체를 만든다.
 * 그래서 모르는 칸은 사라지고, as 없이도 타입이 생긴다.
 */
/**
 * tools.test.ts 를 붙일 때 이 이름을 직접 부른다.
 */
export function validatePurchaseOrderInput(raw: string): Checked<PurchaseOrderInput> {
  const parsed = parseObject(raw);
  if (!parsed.ok) return parsed;
  const obj = parsed.value;

  const value: PurchaseOrderInput = {};

  /**
   * 'poNumber' in obj 는 그 이름의 칸이 있는지 보는 것이다. 없으면 선택이라 건너뛴다.
   * 앞자리 0 때문에 모델이 숫자로 보내면 값이 달라지므로 글자인지 꼭 본다.
   */
  if ('poNumber' in obj) {
    const n = obj.poNumber;
    if (typeof n !== 'string') {
      return { ok: false, reason: `poNumber: 글자가 아니다 (받은 값: ${JSON.stringify(n)})` };
    }
    value.poNumber = n;
  }

  if ('vendor' in obj) {
    const v = obj.vendor;
    if (typeof v !== 'string') {
      return { ok: false, reason: `vendor: 글자가 아니다 (받은 값: ${JSON.stringify(v)})` };
    }
    value.vendor = v;
  }

  if ('companyCode' in obj) {
    const c = obj.companyCode;
    if (typeof c !== 'string') {
      return { ok: false, reason: `companyCode: 글자가 아니다 (받은 값: ${JSON.stringify(c)})` };
    }
    value.companyCode = c;
  }

  /**
   * 고정값 칸. 둘을 === 로 하나씩 비교해야 타입 검사기가 둘 중 하나로 좁혀 준다.
   * includes 로는 안 좁혀진다.
   */
  if ('currency' in obj) {
    const w = obj.currency;
    if (w !== 'USD' && w !== 'VND') {
      return { ok: false, reason: `currency: USD/VND 중 하나가 아니다 (받은 값: ${JSON.stringify(w)})` };
    }
    value.currency = w;
  }

  return { ok: true, value };
}

/**
 * 상세 도구 인자 모양. 셋 다 선택. 하나도 없으면 전체 조회.
 */
type PurchaseOrderDetailsInput = {
  poNumbers?: string[];
  material?: string;
  minQuantity?: number;
};

/**
 * tools.test.ts 를 붙일 때 이 이름을 직접 부른다.
 */
export function validatePurchaseOrderDetailsInput(raw: string): Checked<PurchaseOrderDetailsInput> {
  const parsed = parseObject(raw);
  if (!parsed.ok) return parsed;
  const obj = parsed.value;

  const value: PurchaseOrderDetailsInput = {};

  /**
   * 배열 칸. 배열인지 본 뒤 원소를 하나씩 글자인지 본다. LOOP 안에서 하나라도 틀리면 그 자리에서 거절.
   * 검사한 원소만 새 배열에 담아야 as 없이 string[] 이 된다.
   */
  if ('poNumbers' in obj) {
    const arr = obj.poNumbers;
    if (!Array.isArray(arr)) {
      return { ok: false, reason: `poNumbers: 배열이 아니다 (받은 값: ${JSON.stringify(arr)})` };
    }
    const numbers: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      const n: unknown = arr[i];
      if (typeof n !== 'string') {
        return { ok: false, reason: `poNumbers[${i}]: 글자가 아니다 (받은 값: ${JSON.stringify(n)})` };
      }
      numbers.push(n);
    }
    value.poNumbers = numbers;
  }

  if ('material' in obj) {
    const m = obj.material;
    if (typeof m !== 'string') {
      return { ok: false, reason: `material: 글자가 아니다 (받은 값: ${JSON.stringify(m)})` };
    }
    value.material = m;
  }

  /**
   * 숫자 칸. 글자 "2" 로 오면 거절한다. ABAP 이 MENGE=abc 를 받으면 런타임 에러라 여기서 막아야 한다.
   */
  if ('minQuantity' in obj) {
    const q = obj.minQuantity;
    if (typeof q !== 'number') {
      return { ok: false, reason: `minQuantity: 숫자가 아니다 (받은 값: ${JSON.stringify(q)})` };
    }
    value.minQuantity = q;
  }

  /**
   * 조건이 하나도 없으면 전체 조회다(오더 248건, 각각 items). 지금 데이터 크기에선 허용한다.
   * 항목이 오더당 여럿인 실데이터로 가면 ABAP 에 UP TO n ROWS 를 넣는 게 순서다.
   */
  return { ok: true, value };
}

/**
 * main.ts 가 모델의 도구 요청을 받아 이 이름을 부른다.
 * SAP 을 기다려야 해서 async 다. 부르는 쪽에 await 이 없으면 결과가 아니라 빈 객체가 실린다.
 */
/**
 * main.ts 가 왕복할 때마다 이 이름을 부른다.
 */
export async function runTool(name: string, rawArguments: string) {
  /**
   * 모르는 이름 가드. 모델이 없는 도구를 지어내 부를 수 있다.
   * 멈추지 않고 실패를 값으로 돌려줘야 모델이 읽고 다시 시도한다.
   */
  if (name === 'searchPurchaseOrders') {
    return runSearchPurchaseOrders(rawArguments);
  }

  if (name === 'getPurchaseOrderDetails') {
    return runGetPurchaseOrderDetails(rawArguments);
  }

  return { ok: false, reason: `모르는 도구 이름: ${name}` };
}

async function runSearchPurchaseOrders(rawArguments: string) {
  const checked = validatePurchaseOrderInput(rawArguments);
  if (!checked.ok) return checked;
  const input = checked.value;

  /**
   * 조건 넷을 통째로 넘긴다. 거르는 건 전부 SAP 이 하고, 여기서 다시 거르지 않는다.
   * 도구 안에서는 throw 하면 안 된다. 멈추면 모델이 실패를 읽고 고칠 기회를 잃는다.
   */
  try {
    const orders = await fetchPurchaseOrders(input);
    /** query 를 같이 실어야 0건일 때 모델이 어떤 조건이었는지 보고 조건을 빼며 다시 시도한다 */
    return { ok: true, count: orders.length, query: input, orders };
  } catch (e) {
    /** client.ts 가 만든 문구(상태코드+응답 내용)를 그대로 싣는다. 비밀번호는 거기서 이미 뺐다 */
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function runGetPurchaseOrderDetails(rawArguments: string) {
  const checked = validatePurchaseOrderDetailsInput(rawArguments);
  if (!checked.ok) return checked;
  const input = checked.value;

  try {
    const orders = await fetchPurchaseOrderDetails(input);
    return { ok: true, count: orders.length, query: input, orders };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
