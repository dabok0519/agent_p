/**
 * 모델이 부를 수 있는 도구 2개. AI SDK 의 tool() 로 정의한다. agent.ts 의 streamText({ tools }) 에 넣는다.
 * src/web 전용 (src/sdk/tools.ts 의 패턴, src/mcp/server/tools.ts 의 문구를 참고해 새로 씀).
 */

/**
 * tool(): 도구 정의 함수. 원시 판의 OpenAiTool 손 JSON Schema + loop.ts 의 JSON.parse·가드·runTool 분기가 전부 이 안에 들어간다.
 */
import { tool } from 'ai';

/**
 * zod. inputSchema 를 적으면 모델용 JSON Schema 와 execute 의 입력 타입이 둘 다 여기서 나온다.
 */
import { z } from 'zod';

/**
 * SAP 호출. 이 파일은 SAP 이름(EBELN)을 모른다. sap.ts 가 도구 쪽 이름으로 바꿔 준다.
 */
import { fetchPurchaseOrders, fetchMaterials, type PurchaseOrderQuery } from './sap.js';

/**
 * ① 도구 하나 = description(모델이 읽고 부를지 판단) + inputSchema(모델이 채울 칸) + execute(SDK 가 실행).
 *    원시 판에서 손으로 적던 { type:'function', function:{ name, description, parameters } } 를 zod 에서 자동 생성하고,
 *    모델이 준 arguments 글자를 JSON.parse 해서 schema 로 검사한 뒤 execute 를 부르고, 반환값을 role:'tool' 로 이력에 넣는 것까지 SDK 가 한다.
 * ② 안 쓰면: streamText 의 tools 에 넣을 모양이 안 나온다. 대신 dynamicTool() 은 schema 를 실행 때 정하는 판(MCP 처럼 도구가 밖에서 올 때).
 * ③ 문서: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
 */
export const searchPurchaseOrders = tool({
  /** TODO: 모델이 읽을 설명. 어떤 칸이 오는지·조건이 AND 인지·조건 없으면 전체인지 (src/mcp/server/tools.ts:35) */
  description: '',
  inputSchema: z.object({
    /** TODO: 44/45 로 시작하는 10자리, 글자로 넣는다는 것 */
    poNumber: z.string().optional().describe(''),
    /** TODO: 업체 이름이 아니라 코드라는 것 (예: BP2100) */
    vendor: z.string().optional().describe(''),
    /** TODO: 회사코드 네 자리 (예: 1000) */
    companyCode: z.string().optional().describe(''),
    /** TODO: 필터 필요 없으면 안 넣는다는 것 */
    currency: z.enum(['USD', 'VND']).optional().describe(''),
  }),
  /**
   * 도구 안에서는 throw 하지 않는다. 멈추면 모델이 실패를 읽고 조건을 바꿔 다시 시도할 기회를 잃는다.
   * input 타입은 inputSchema 에서 추론된다. 따로 안 적는다.
   */
  execute: async (input) => {
    /**
     * 값이 있는 칸만 옮긴다. undefined 가 든 칸을 그대로 넘기면 타입이 안 맞는다(exactOptionalPropertyTypes).
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
      /** sap.ts 가 만든 문구(상태코드+응답 내용). 비밀번호는 거기서 이미 뺐다 */
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  },
});

export const searchMaterials = tool({
  /** TODO: 모델이 읽을 설명. 창고별 여러 줄, 이름 일부로 찾는다는 것 (src/mcp/server/tools.ts:81) */
  description: '',
  inputSchema: z.object({
    /** TODO: 자재번호·자재명 일부 배열, 하나라도 맞으면 온다, 없으면 전체 (src/mcp/server/tools.ts:78) */
    keywords: z.array(z.string()).optional().describe(''),
  }),
  execute: async (input) => {
    const q: { keywords?: string[] } = {};
    if (input.keywords !== undefined) q.keywords = input.keywords;

    try {
      const rows = await fetchMaterials(q);
      return { ok: true, count: rows.length, query: q, rows };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  },
});

/**
 * agent.ts 가 streamText({ tools }) 에 통째로 넣는다. 키 이름이 모델이 보는 도구 이름이다.
 */
export const tools = { searchPurchaseOrders, searchMaterials };
