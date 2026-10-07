/**
 * SAP SICF 호출. src/web 전용이라 다른 폴더를 import 하지 않는다 (src/mcp/server/sap.ts 를 참고해 새로 씀).
 * AI SDK 와 무관한 순수 fetch 코드. tools.ts 의 execute 가 부른다.
 */

/**
 * .env 파일의 값을 프로그램 밖 설정값으로 읽어 들인다.
 */
import 'dotenv/config';

/**
 * zod. SAP 응답 모양을 스키마로 적으면 검사·이름 변환·타입이 한 번에 나온다.
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
 * 가드를 지난 값을 확정된 타입(string)으로 새 이름에 담는다. 함수 안에서는 위 가드가 안 보이기 때문.
 */
const sapClient: string = client;

/**
 * 사용자·비번을 Basic 인증 한 줄로 만든다. 에러·로그에는 절대 싣지 않는다.
 */
const authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

/** TODO: 제한시간 밀리초 (src/mcp/server/sap.ts:43) */
const TIMEOUT_MS = 1000;

/** TODO: 구매오더 SICF 경로 (src/mcp/server/sap.ts:123 근처) */
const PO_PATH = '/sap/bc/z_demo/z_po';

/** TODO: 자재 SICF 경로 (src/mcp/server/sap.ts:260 근처) */
const MM_PATH = '/sap/bc/z_demo/z_mm';

/**
 * SICF 노드 하나를 부르는 공통 부분. 경로·조건·응답 스키마만 다르고 인증·제한시간·가드는 전부 같다.
 * <T> 제네릭 : 어떤 값이든 올 수 있다.
 */
async function callSap<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
  /**
   * 조건을 ?이름=값&이름=값 글자로 만든다. 표준 기능이라 특수문자 처리가 자동이다.
   * 쿼리값(인자값)을 URL 형식으로 바꾸고 뒤에 sap-client 붙히기
   */
  const qs = new URLSearchParams(params);
  qs.set('sap-client', sapClient);

  /**
   * SAP 에 HTTP 요청을 보낸다.
   * 400·500 이 와도 에러가 안 나므로 바로 아래에서 res.ok 를 본다. 응답이 영영 안 올 수 있어 제한시간을 둔다.
   */
  const res = await fetch(`${baseUrl}${path}?${qs}`, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
   * 스키마 검사. 실패하면 경로와 함께 사람이 읽는 문구로 던진다. 모양이 틀리면 ABAP 과 여기가 어긋난 것이다.
   */
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`SAP 응답 모양이 다르다 ${path}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/**
 * z_po 한 줄 모양. TYPES: BEGIN OF … END OF 와 같다.
 * z.object 가 칸 검사, transform 이 대문자 ABAP 이름 → 도구 쪽 이름 변환. 도구는 ABAP 이름을 모른다.
 */
/** TODO: 값 확인 — ABAP 이 주는 칸 이름·개수가 맞는지 (src/mcp/server/sap.ts:88-97) */
const sapPurchaseOrder = 
z.object({ EBELN: z.string(), BUKRS: z.string(), LIFNR: z.string(), AEDAT: z.string(), WAERS: z.string() })
  .transform((r) => ({
    poNumber: r.EBELN,
    companyCode: r.BUKRS,
    vendor: r.LIFNR,
    orderDate: r.AEDAT,
    currency: r.WAERS,
  }));

/**
 * 스키마에서 타입을 뽑는다. transform 뒤 모양이라 소문자 이름이다.
 */
export type PurchaseOrder = z.infer<typeof sapPurchaseOrder>;

/**
 * 조회 조건 모양. 칸 이름은 도구 쪽 이름. ABAP 이름(EBELN)은 fetch 안에서만 나온다.
 * OrderDate에 대한 조회 조건은 구현되어 있지 않기 때문에 날짜를 제외한 조회 조건 생성 
 */
export type PurchaseOrderQuery = {
  poNumber?: string;
  vendor?: string;
  companyCode?: string;
  currency?: string;
};

/**
 * 구매오더를 SAP 에서 조회한다. 조건은 전부 SAP 이 거르고, 여기는 이름만 바꿔 전달한다.
 * tools.ts 의 searchPurchaseOrders 가 부른다.
 */
export async function fetchPurchaseOrders(q: PurchaseOrderQuery): Promise<PurchaseOrder[]> {
  /**
   * 값이 있는 조건만 담는다. 안 온 값을 넣으면 글자 "undefined" 가 전송되어 0건이 된다.
   */
  /** TODO: 값 확인 — 조건 칸 ↔ ABAP 파라미터 이름 대응 (src/mcp/server/sap.ts:130 근처) */
  const params: Record<string, string> = {};
  if (q.poNumber) params.EBELN = q.poNumber;
  if (q.vendor) params.LIFNR = q.vendor;
  if (q.companyCode) params.BUKRS = q.companyCode;
  if (q.currency) params.WAERS = q.currency;

  //z.array(sapPurchaseOrder) : sap가 돌려줄 결과 모양 

  return callSap(PO_PATH, params, z.array(sapPurchaseOrder));
}

/**
 * z_mm 한 줄 모양. 자재 하나에 창고가 여럿이면 여러 줄.
 */
/** TODO: 값 확인 — ABAP 이 주는 칸 이름·개수가 맞는지 (src/mcp/server/sap.ts:240-249) */
const sapMaterial = z
  .object({ MATNR: z.string(), MAKTX: z.string(), MEINS: z.string(), WERKS: z.string(), LGORT: z.string(), LABST: z.number() })
  .transform((r) => ({
    material: r.MATNR,
    description: r.MAKTX,
    unit: r.MEINS,
    plant: r.WERKS,
    storageLocation: r.LGORT,
    availableQty: r.LABST,
  }));

export type Material = z.infer<typeof sapMaterial>;

/**
 * 자재 마스터 + 창고 재고를 SAP 에서 받는다. 검색어는 부분 일치이고 ABAP 이 거른다.
 * 검색어가 없으면 TEXT 를 안 보내 ABAP 이 전체를 돌려준다.
 * tools.ts 의 searchMaterials 가 부른다.
 */
export async function fetchMaterials(q: { keywords?: string[] }): Promise<Material[]> {
  const params: Record<string, string> = {};
  if (q.keywords && q.keywords.length > 0) params.TEXT = q.keywords.join(',');

  return callSap(MM_PATH, params, z.array(sapMaterial));
}
