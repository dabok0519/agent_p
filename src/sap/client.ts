/**
 * .env 파일의 값을 프로그램 밖 설정값으로 읽어 들인다.
 */
import 'dotenv/config';

const baseUrl = process.env.SAP_BASE_URL;
const client = process.env.SAP_CLIENT;
const user = process.env.SAP_USER;
const password = process.env.SAP_PASSWORD;

/**
 * 접속 정보 가드. IF … IS INITIAL. MESSAGE … TYPE 'E'. 와 같다.
 * 없으면 여기서 멈춘다. 안 멈추면 401 만 보고 원인을 못 찾는다.
 */
if (!baseUrl || !client || !user || !password) {
  throw new Error('SAP 접속 정보 없음. .env 의 SAP_BASE_URL / SAP_CLIENT / SAP_USER / SAP_PASSWORD 를 확인한다');
}

/**
 * 함수 선언은 파일 어디에 있든 먼저 떠 있어서, 위 가드가 함수 안까지는 안 보인다.
 * 가드를 지난 값을 확정된 타입(string)으로 새 이름에 담아 함수 안에서 쓴다.
 */
const sapClient: string = client;

/**
 * 도구에게 넘길 모양. SAP 의 대문자 칸을 도구 쪽 이름으로 바꾼 것이다.
 * 이 변환을 여기서 끝내야 도구 쪽이 ABAP 필드 이름을 몰라도 된다.
 */
export type PurchaseOrder = {
  poNumber: string;
  companyCode: string;
  vendor: string;
  orderDate: string;
  currency: string;
};

/**
 * tools.ts 가 검사 통과값을 fetchPurchaseOrders 에 넘길 때의 조건 모양.
 * 칸 이름은 도구 쪽 이름이다. ABAP 이름(EBELN)은 fetch 안에서만 나온다.
 */
export type PurchaseOrderQuery = {
  poNumber?: string;
  vendor?: string;
  companyCode?: string;
  currency?: string;
};

/**
 * 사용자·비번을 Basic 인증 한 줄로 만든다. 에러·로그에는 절대 싣지 않는다.
 * Buffer를 통해 바이트 화 -> toString('base64')를 통해 바이트를 영문자 및 숫자화
 */
const authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

/**
 * SICF 노드 하나를 부르는 공통 부분. 경로와 조건만 다르고 인증·제한시간·가드는 전부 같다.
 * 배열까지만 확인해 돌려준다. 줄 안의 칸은 부르는 쪽 toXxx 가 본다.
 */
async function callSap(path: string, params: Record<string, string>): Promise<unknown[]> {
  /** 제한시간 밀리초. 응답이 영영 안 올 수 있어 끊는다 */
  const timeoutMs = 6000;

  /**
   * 조건을 ?이름=값&이름=값 글자로 만든다. 표준 기능이라 특수문자 처리가 자동이다.
   * 쿼리값(인자값)을 URL 형식으로 바꾸고 뒤에 sap-client 붙히기
   */
  const qs = new URLSearchParams(params);
  qs.set('sap-client', sapClient);

  /**
   * sap 시스템에 HTTP 요청을 보낸다.
   * 400·500 이 와도 에러가 안 나므로 바로 아래에서 res.ok 를 본다.
   */
  const res = await fetch(`${baseUrl}${path}?${qs}`, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(timeoutMs),
  });

  /**
   * 실패 가드. 상태코드와 응답 내용을 같이 실어야 원인을 찾는다. 비밀번호는 뺀다.
   */
  if (!res.ok) {
    throw new Error(`SAP 호출 실패 ${res.status}: ${await res.text()}`);
  }

  /**
   * 글자 → 객체 변환. 결과는 타입이 없어 부르는 쪽에서 손으로 확인한다.
   */
  const json = await res.json();

  /**
   * 배열 가드. 한 건만 있을 때 객체 하나로 돌려주는 서비스도 있다.
   * 안 막으면 부르는 쪽 LOOP 가 엉뚱한 값을 돌다 멈춘다.
   * 현재 ISCF 쪽에서 최상위를 배열로 반환하기 때문에 배열로 왔는지 검사한다.
   */
  if (!Array.isArray(json)) {
    throw new Error(`SAP 응답이 배열이 아니다: ${JSON.stringify(json)}`);
  }

  return json;
}

/**
 * 구매오더를 SAP 에서 조회한다. 조건은 전부 SAP 이 거르고, 여기는 이름만 바꿔 전달한다.
 * CALL FUNCTION 처럼 결과가 돌아올 때까지 기다린다.
 */
/**
 * tools.ts 가 검사를 통과한 조건을 넘겨 부른다. check.ts 는 모델 없이 직접 부른다.
 */
export async function fetchPurchaseOrders(q: PurchaseOrderQuery): Promise<PurchaseOrder[]> {
  /**
   * 값이 있는 조건만 담는다. 안 온 값을 넣으면 글자 "undefined" 가 전송되어 0건이 된다.
   * ABAP 은 빈 파라미터를 무시하니, 없는 값을 안 보내는 건 TS 몫이다.
   */
  // ABAP이 읽을 수 있게 변환
  const params: Record<string, string> = {};
  if (q.poNumber) params.EBELN = q.poNumber;
  if (q.vendor) params.LIFNR = q.vendor;
  if (q.companyCode) params.BUKRS = q.companyCode;
  if (q.currency) params.WAERS = q.currency;

  const json = await callSap('/sap/bc/z_demo/z_po', params);

  const rows: PurchaseOrder[] = [];

  /**
   * 값을 하나씩 확인해 새 배열에 옮겨 담는다. 몇 번째 줄인지 같이 넘겨 어긋난 자리를 남긴다.
   */
  for (let i = 0; i < json.length; i++) {
    const one = json[i];

    // one == 배열 한 껍데기를 벗긴 후 행 한 줄 {item , [] ..등등 }
    if (typeof one !== 'object' || one === null) {
      throw new Error(`줄 ${i}: 객체가 아니다 ${JSON.stringify(one)}`);
    }

    rows.push(toPurchaseOrder(one, `줄 ${i}`));
  }

  return rows;
}

/**
 * /sap/bc/z_demo/z_po 한 줄 = ABAP SELECT ebeln, bukrs, lifnr, aedat, waers FROM ekko. ABAP 칸을 바꾸면 여기와 PurchaseOrder 를 같이 고친다.
 * ABAP 칸 이름을 도구가 쓰는 이름으로 바꾼다. 칸이 있는지(해당 값들은 모두 필수로 반환받아야 하기 때문임)·글자인지만 본다.
 * 우리 ABAP 이 준 값이라 모양이 틀리면 코드가 어긋난 것이다. 멈춰서 어느 칸인지 알린다.
 */
function toPurchaseOrder(row: object, where: string): PurchaseOrder {
  if (!('EBELN' in row) || typeof row.EBELN !== 'string') {
    throw new Error(`${where}: EBELN 칸이 없거나 글자가 아니다 ${JSON.stringify(row)}`);
  }
  if (!('BUKRS' in row) || typeof row.BUKRS !== 'string') {
    throw new Error(`${where}: BUKRS 칸이 없거나 글자가 아니다 ${JSON.stringify(row)}`);
  }
  if (!('LIFNR' in row) || typeof row.LIFNR !== 'string') {
    throw new Error(`${where}: LIFNR 칸이 없거나 글자가 아니다 ${JSON.stringify(row)}`);
  }
  if (!('AEDAT' in row) || typeof row.AEDAT !== 'string') {
    throw new Error(`${where}: AEDAT 칸이 없거나 글자가 아니다 ${JSON.stringify(row)}`);
  }
  if (!('WAERS' in row) || typeof row.WAERS !== 'string') {
    throw new Error(`${where}: WAERS 칸이 없거나 글자가 아니다 ${JSON.stringify(row)}`);
  }

  return {
    poNumber: row.EBELN,
    companyCode: row.BUKRS,
    vendor: row.LIFNR,
    /** AEDAT 는 날짜형이라 /ui2/cl_json 이 '2025-06-12' 로 바꿔서 보낸다. 여기선 그대로 쓴다. */
    orderDate: row.AEDAT,
    currency: row.WAERS,
  };
}

/**
 * 도구에게 넘길 항목 모양. ABAP 의 ty_item.
 */
export type PurchaseOrderItem = {
  itemNumber: number;
  material: string;
  quantity: number;
};

/**
 * 도구에게 넘길 상세 모양. ABAP 의 ty_po. 번호 하나에 items 배열. 헤더 다른 칸은 z_po 가 이미 주므로 안 싣는다.
 */
export type PurchaseOrderDetail = {
  poNumber: string;
  items: PurchaseOrderItem[];
};

/**
 * tools.ts 가 fetchPurchaseOrderDetails 에 넘기는 조건 모양. 셋 다 선택이다.
 * minQuantity 는 "이상". ABAP 쪽 RANGES option 이 GE 라서 그렇다.
 */
export type PurchaseOrderDetailQuery = {
  poNumbers?: string[];
  material?: string;
  minQuantity?: number;
};

/**
 * 구매오더 항목을 SAP 에서 조회한다. 조건은 전부 SAP 이 거르고, 여기는 이름만 바꿔 전달한다.
 * 번호 배열은 쉼표로 이어 한 파라미터로 보내면 ABAP 이 SPLIT 해서 RANGES 여러 줄로 만든다.
 */
/**
 * tools.ts 가 검사를 통과한 조건을 넘겨 부른다. check.ts 는 직접 부른다.
 */
export async function fetchPurchaseOrderDetails(q: PurchaseOrderDetailQuery): Promise<PurchaseOrderDetail[]> {
  /**
   * 조건이 셋 다 없으면 ABAP 이 조건 없음으로 보고 오더 248건 전부에 항목을 붙여 준다. 전체 조회로 허용한다.
   */
  const params: Record<string, string> = {};
  if (q.poNumbers && q.poNumbers.length > 0) params.EBELN = q.poNumbers.join(',');
  if (q.material) params.MATNR = q.material;
  /** 숫자 0 도 값이라 !== undefined 로 본다. if (q.minQuantity) 면 0 이 빠진다 */
  if (q.minQuantity !== undefined) params.MENGE = String(q.minQuantity);

  const json = await callSap('/sap/bc/z_demo/z_po_item', params);

  const rows: PurchaseOrderDetail[] = [];

  for (let i = 0; i < json.length; i++) {
    const one = json[i];

    if (typeof one !== 'object' || one === null) {
      throw new Error(`줄 ${i}: 객체가 아니다 ${JSON.stringify(one)}`);
    }

    rows.push(toPurchaseOrderDetail(one, `줄 ${i}`));
  }

  return rows;
}

/**
 * /sap/bc/z_demo/z_po_item 한 줄 = { EBELN, ITEMS[] }. ABAP 이 ekpo 를 EBELN·MATNR·MENGE 로 거르고 ekko 번호 밑에 LOOP 로 담은 것.
 * 번호 칸 하나와 ITEMS 배열을 본다.
 * 항목마다 몇 번째인지 where 에 이어 붙여 어긋난 자리가 "줄 3 항목 0" 처럼 나오게 한다.
 */
function toPurchaseOrderDetail(row: object, where: string): PurchaseOrderDetail {
  if (!('EBELN' in row) || typeof row.EBELN !== 'string') {
    throw new Error(`${where}: EBELN 칸이 없거나 글자가 아니다 ${JSON.stringify(row)}`);
  }

  if (!('ITEMS' in row) || !Array.isArray(row.ITEMS)) {
    throw new Error(`${where}: ITEMS 칸이 없거나 배열이 아니다 ${JSON.stringify(row)}`);
  }

  const items: PurchaseOrderItem[] = [];

  for (let j = 0; j < row.ITEMS.length; j++) {
    const one: unknown = row.ITEMS[j];

    if (typeof one !== 'object' || one === null) {
      throw new Error(`${where} 항목 ${j}: 객체가 아니다 ${JSON.stringify(one)}`);
    }

    items.push(toItem(one, `${where} 항목 ${j}`));
  }

  return { poNumber: row.EBELN, items };
}

/**
 * ITEMS 한 줄 = { EBELP, MATNR, MENGE }. EBELP·MENGE 는 ABAP 숫자형이라 숫자로 온다 (브라우저 확인: 10, 2.000).
 * 세부 항목 한 줄을 도구 이름으로 바꾼다.
 */
function toItem(row: object, where: string): PurchaseOrderItem {
  if (!('EBELP' in row) || typeof row.EBELP !== 'number') {
    throw new Error(`${where}: EBELP 칸이 없거나 숫자가 아니다 ${JSON.stringify(row)}`);
  }
  if (!('MATNR' in row) || typeof row.MATNR !== 'string') {
    throw new Error(`${where}: MATNR 칸이 없거나 글자가 아니다 ${JSON.stringify(row)}`);
  }
  if (!('MENGE' in row) || typeof row.MENGE !== 'number') {
    throw new Error(`${where}: MENGE 칸이 없거나 숫자가 아니다 ${JSON.stringify(row)}`);
  }

  return {
    itemNumber: row.EBELP,
    material: row.MATNR,
    quantity: row.MENGE,
  };
}
