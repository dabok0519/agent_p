/**
 * zod. 인자 모양을 스키마로 적으면 검사와 타입이 한 번에 나온다.
 * 손검사(in·typeof·Array.isArray)를 배열·중첩까지 끝낸 뒤라 여기서 바꾼다. 옛 손검사는 src/sap/tools.ts 에 그대로 있다.
 */
import { z } from 'zod';

/**
 * 실제 SAP 을 부르는 함수와 조건 모양을 가져온다. 상대 경로는 .js 확장자가 필요하다.
 */
import { fetchPurchaseOrders, fetchPurchaseOrderDetails, type PurchaseOrderQuery, type PurchaseOrderDetailQuery } from './sap.js';

/**
 * 3-way match 그래프. 안이 LangGraph 인 건 이 import 하나로만 드러난다.
 */
import { runGraph } from './match-graph.js';

/**
 * 헤더 조회 인자 스키마. z.string().optional() 한 단어가 옛 'vendor' in obj + typeof + 반환 네 줄과 같다.
 * z.enum 이 w !== 'USD' && w !== 'VND' 다. SDK 가 이 스키마로 검사한 뒤 통과값만 콜백에 넘긴다.
 */
/**
 * index.ts 가 registerTool 에 넘긴다.
 */
export const searchInputSchema = z.object({
  /** TODO: 모델이 읽을 설명. 44/45 로 시작하는 10자리이고 글자로 넣어야 한다는 것 */
  poNumber: z.string().optional().describe('구매오더를 구분한다. 기본키 역할'),
  /** TODO: 모델이 읽을 설명. 업체 이름이 아니라 코드라는 것 (예: BP2100) */
  vendor: z.string().optional().describe('공급업체 명으로 필터링.'),
  /** TODO: 모델이 읽을 설명. 회사코드 네 자리 (예: 1000) */
  companyCode: z.string().optional().describe('회사업체 명으로 필터링.'),
  /** TODO: 모델이 읽을 설명. 필터가 필요 없으면 안 넣는다는 것 */
  currency: z.enum(['USD', 'VND']).optional().describe('통화 단위로 필터링'),
});

export const searchDescription =
  '구매오더 헤더 목록을 조회한다. 줄마다 poNumber·companyCode·vendor·orderDate·currency. 조건 넷(poNumber·vendor·companyCode·currency)은 필요한 것만 넣는다. 둘 이상 넣으면 전부 만족하는 줄만 온다(OR 없음). 하나도 안 넣으면 전체.';

/**
 * 항목 조회 인자 스키마. z.array(z.string()) 이 옛 Array.isArray + LOOP 안 typeof 다.
 * 셋 다 선택. 하나도 없으면 전체 조회(오더 248건, 각각 items).
 */
export const detailsInputSchema = z.object({
  poNumbers: z.array(z.string()).optional().describe('구매오더 번호 배열. 여러 오더는 한 번에 배열로 넣는다. 44/45 로 시작하는 10자리 글자.'),
  material: z.string().optional().describe('자재 번호 (예: ST75P211A1/WHE). 이 자재가 든 항목만 온다.'),
  minQuantity: z.number().optional().describe('최소 수량. 이 값 이상인 항목만 온다. 숫자로 넣는다.'),
});

export const detailsDescription =
  '구매오더의 품목(항목) 목록을 조회한다. 오더 번호별로 items 배열(itemNumber·material·quantity)이 온다. 업체·회사코드·통화·날짜는 안 온다(헤더는 searchPurchaseOrders). 조건 셋(poNumbers·material·minQuantity)은 필요한 것만 넣는다. 둘 이상 넣으면 전부 만족하는 항목만 온다. 하나도 안 넣으면 전체 오더의 항목이 온다.';

/**
 * 스키마에서 type of를 통해 타입을 뽑는다. TYPES 선언을 따로 안 쓰고 스키마 하나가 검사와 타입을 다 한다.
 * z.infer 의 선택 칸은 "없거나 undefined" 라서 sap.ts 의 Query 타입("없음"만)과 이름표가 다르다. 아래 run 이 값 있는 칸만 옮겨 맞춘다.
 */
type SearchInput = z.infer<typeof searchInputSchema>;
type DetailsInput = z.infer<typeof detailsInputSchema>;

/**
 * 3-way match 인자 스키마. 넷 다 선택. poNumbers 가 있으면 업체·회사코드는 안 본다 (match-graph.ts 의 afterStart).
 * 하나도 없으면 전체 오더 검산.
 */
export const matchInputSchema = z.object({
  vendor: z.string().optional().describe('업체 코드 (예: BP2100). 이 업체 오더만 검산한다.'),
  companyCode: z.string().optional().describe('회사코드 네 자리 (예: 1000).'),
  poNumbers: z.array(z.string()).optional().describe('구매오더 번호 배열. 있으면 업체·회사코드는 안 본다. 44/45 로 시작하는 10자리 글자.'),
  chunkSize: z.number().optional().describe('한 번에 검산할 오더 수. 보통 안 넣는다 (기본 50).'),
});

export const matchDescription =
  '구매오더 항목마다 발주·입고·송장 수량과 단가를 맞춰 보는 3-way match. 상태별 건수(summary)와 불일치 줄(mismatches, 조치 action·이유 reason 포함)을 돌려준다. 조건 없이 부르면 전체 오더.';

type MatchInput = z.infer<typeof matchInputSchema>;

/**
 * index.ts 의 registerTool 콜백이 검사 통과값을 넘겨 부른다.
 * 도구 안에서는 throw 하면 안 된다. 멈추면 모델이 실패를 읽고 고칠 기회를 잃는다.
 */
export async function runSearchPurchaseOrders(input: SearchInput) { //인자의 타입 
  // "input 은 { poNumber?, vendor?, companyCode?, currency? } 모양" 
  /**
   * 값이 있는 칸만 옮긴다. undefined 가 들어 있는 칸을 그대로 넘기면 타입이 안 맞는다(exactOptionalPropertyTypes).
   * type과 query 값 즉 , llm의 값과 맞는지 검사 
   */
  const q: PurchaseOrderQuery = {};
  if (input.poNumber !== undefined) q.poNumber = input.poNumber;
  if (input.vendor !== undefined) q.vendor = input.vendor;
  if (input.companyCode !== undefined) q.companyCode = input.companyCode;
  if (input.currency !== undefined) q.currency = input.currency;

  try {
    const orders = await fetchPurchaseOrders(q);
    /** query 를 같이 실어야 0건일 때 모델이 어떤 조건이었는지 보고 조건을 빼며 다시 시도한다 */
    return { ok: true, count: orders.length, query: q, orders };
  } catch (e) {
    /** sap.ts 가 만든 문구(상태코드+응답 내용)를 그대로 싣는다. 비밀번호는 거기서 이미 뺐다 */
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function runGetPurchaseOrderDetails(input: DetailsInput) {
  const q: PurchaseOrderDetailQuery = {};
  if (input.poNumbers !== undefined) q.poNumbers = input.poNumbers;
  if (input.material !== undefined) q.material = input.material;
  if (input.minQuantity !== undefined) q.minQuantity = input.minQuantity;

  try {
    const orders = await fetchPurchaseOrderDetails(q);
    return { ok: true, count: orders.length, query: q, orders };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 그래프 안에서는 SAP·OpenRouter 실패가 throw 로 올라온다. 여기서 한 번만 잡아 모델이 읽을 { ok:false, reason } 으로 바꾼다.
 */
export async function runThreeWayMatch(input: MatchInput) {
  const q: { vendor?: string; companyCode?: string; poNumbers?: string[] } = {};
  if (input.vendor !== undefined) q.vendor = input.vendor;
  if (input.companyCode !== undefined) q.companyCode = input.companyCode;
  if (input.poNumbers !== undefined) q.poNumbers = input.poNumbers;

  try {
    return await runGraph(q, input.chunkSize ?? 50);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
