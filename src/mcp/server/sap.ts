/**
 * .env 파일의 값을 프로그램 밖 설정값으로 읽어 들인다.
 */
import 'dotenv/config';

/**
 * zod. SAP 응답 모양을 스키마로 적으면 검사·이름 변환·타입이 한 번에 나온다.
 * 옛 손가드(in·typeof·Array.isArray) 판은 src/sap/client.ts 에 그대로 있다.
 */
import { z } from 'zod';

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
 * 사용자·비번을 Basic 인증 한 줄로 만든다. 에러·로그에는 절대 싣지 않는다.
 * Buffer를 통해 바이트 화 -> toString('base64')를 통해 바이트를 영문자 및 숫자화
 */
const authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

/**
 * SICF 노드 하나를 부르는 공통 부분. 경로·조건·응답 스키마만 다르고 인증·제한시간·가드는 전부 같다.
 * schema 가 배열인지·줄마다 칸이 맞는지를 한 번에 본다. 통과한 값은 이미 도구 쪽 이름이다.
 */
async function callSap<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
  /** 제한시간 밀리초. 응답이 영영 안 올 수 있어 끊는다 */
  const timeoutMs = 12000;

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
   * 글자 → 객체 변환. 결과는 타입이 없어 바로 아래 스키마가 본다.
   */
  const json: unknown = await res.json();

  /**
   * 스키마 검사. 실패하면 zod 가 던지는데 문구가 기계용이라, 경로와 함께 사람이 읽는 문구로 바꿔 다시 던진다.
   * 우리 ABAP 이 준 값이라 모양이 틀리면 코드가 어긋난 것이다. 멈춰서 어느 줄 어느 칸인지 알린다.
   */
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`SAP 응답 모양이 다르다 ${path}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/**
 * z_po 한 줄 = ABAP SELECT ebeln, bukrs, lifnr, aedat, waers FROM ekko. ABAP 칸을 바꾸면 여기만 고친다.
 * z.object 가 옛 in + typeof 가드 다섯이고, transform 이 옛 return { poNumber: row.EBELN, … } 이다.
 * 대문자→도구 이름 변환을 여기서 끝내야 도구 쪽이 ABAP 필드 이름을 몰라도 된다.
 */
const sapPurchaseOrder = z
  .object({ EBELN: z.string(), BUKRS: z.string(), LIFNR: z.string(), AEDAT: z.string(), WAERS: z.string() })
  .transform((r) => ({
    poNumber: r.EBELN,
    companyCode: r.BUKRS,
    vendor: r.LIFNR,
    /** AEDAT 는 날짜형이라 /ui2/cl_json 이 '2025-06-12' 로 바꿔서 보낸다. 여기선 그대로 쓴다. */
    orderDate: r.AEDAT,
    currency: r.WAERS,
  }));

/**
 * 스키마에서 타입을 뽑는다. transform 뒤 모양이라 소문자 이름이다. TYPES 를 따로 안 쓴다.
 */
export type PurchaseOrder = z.infer<typeof sapPurchaseOrder>;

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
 * 구매오더를 SAP 에서 조회한다. 조건은 전부 SAP 이 거르고, 여기는 이름만 바꿔 전달한다.
 * CALL FUNCTION 처럼 결과가 돌아올 때까지 기다린다.
 */
/**
 * tools.ts 가 검사를 통과한 조건을 넘겨 부른다. sap-check.ts 는 모델 없이 직접 부른다.
 */
export async function fetchPurchaseOrders(q: PurchaseOrderQuery): Promise<PurchaseOrder[]> {
  /**
   * 값이 있는 조건만 담는다. 안 온 값을 넣으면 글자 "undefined" 가 전송되어 0건이 된다.
   * ABAP 은 빈 파라미터를 무시하니, 없는 값을 안 보내는 건 TS 몫이다.
   */
  const params: Record<string, string> = {};
  if (q.poNumber) params.EBELN = q.poNumber;
  if (q.vendor) params.LIFNR = q.vendor;
  if (q.companyCode) params.BUKRS = q.companyCode;
  if (q.currency) params.WAERS = q.currency;

  return callSap('/sap/bc/z_demo/z_po', params, z.array(sapPurchaseOrder));
}

/**
 * ITEMS 한 줄 = { EBELP, MATNR, MENGE }. EBELP·MENGE 는 ABAP 숫자형이라 숫자로 온다 (브라우저 확인: 10, 2.000).
 */
const sapItem = z
  .object({ EBELP: z.number(), MATNR: z.string(), MENGE: z.number() })
  .transform((r) => ({ itemNumber: r.EBELP, material: r.MATNR, quantity: r.MENGE }));

/**
 * z_po_item 한 줄 = { EBELN, ITEMS[] }. ABAP 이 ekpo 를 거르고 ekko 번호 밑에 LOOP 로 담은 것.
 * z.array(sapItem) 이 옛 "ITEMS 배열 가드 + 항목 LOOP 안 toItem" 이다. 몇 번째 항목이 틀렸는지는 zod 가 경로로 알린다.
 */
const sapDetail = z
  .object({ EBELN: z.string(), ITEMS: z.array(sapItem) })
  .transform((r) => ({ poNumber: r.EBELN, items: r.ITEMS }));

export type PurchaseOrderItem = z.infer<typeof sapItem>;
export type PurchaseOrderDetail = z.infer<typeof sapDetail>;

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
 * tools.ts 가 검사를 통과한 조건을 넘겨 부른다. sap-check.ts 는 직접 부른다.
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

  return callSap('/sap/bc/z_demo/z_po_item', params, z.array(sapDetail));
}

/**
 * z_match 의 판정 여섯. ABAP IF 순서와 같다. z.enum 하나가 옛 "배열 + find + undefined 가드" 다.
 * 여기 없는 글자가 오면 ABAP 이 바뀐 것이라 멈춘다.
 */
const matchStatus = z.enum(['OK', 'GR_PENDING', 'GR_OVER', 'IR_OVER', 'IR_UNDER', 'PRICE_DIFF']);
export type MatchStatus = z.infer<typeof matchStatus>;

/**
 * z_match 한 줄 = { EBELN, EBELP, MATNR, PO_QTY, GR_QTY, IR_QTY, PO_AMT, IR_AMT, STATUS }. ABAP ty_result.
 * 수량 셋·금액 둘은 ABAP 이 이미 합쳐서 준 값이다 (브라우저 확인: 10.000, 128.60 → 숫자).
 */
const sapMatch = z
  .object({
    EBELN: z.string(),
    EBELP: z.number(),
    MATNR: z.string(),
    PO_QTY: z.number(),
    GR_QTY: z.number(),
    IR_QTY: z.number(),
    PO_AMT: z.number(),
    IR_AMT: z.number(),
    STATUS: matchStatus,
  })
  .transform((r) => ({
    poNumber: r.EBELN,
    itemNumber: r.EBELP,
    material: r.MATNR,
    poQty: r.PO_QTY,
    grQty: r.GR_QTY,
    irQty: r.IR_QTY,
    poAmt: r.PO_AMT,
    irAmt: r.IR_AMT,
    status: r.STATUS,
  }));

export type PurchaseOrderMatch = z.infer<typeof sapMatch>;

/**
 * 3-way match 결과를 SAP 에서 받는다. 검산은 전부 ABAP 이 하고 여기는 이름만 바꾼다.
 * 번호가 없으면 EBELN 을 안 보내 ABAP 이 전체를 돌려준다 (z_po_item 과 같은 규칙).
 */
/**
 * match-graph.ts 의 fetchChunk 노드가 부른다. sap-check.ts 는 직접 부른다.
 */
export async function fetchPurchaseOrderMatch(q: { poNumbers?: string[] }): Promise<PurchaseOrderMatch[]> {
  const params: Record<string, string> = {};
  if (q.poNumbers && q.poNumbers.length > 0) params.EBELN = q.poNumbers.join(',');

  return callSap('/sap/bc/z_demo/z_match', params, z.array(sapMatch));
}
