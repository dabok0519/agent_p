/**
 * 3-way match 도구의 안. LangGraph 로 짠다. 바깥(main.ts)은 이 파일을 도구 하나로만 본다.
 * 검산은 ABAP(z_match)이 끝냈다. 여기는 PO 번호를 모아 묶음으로 묻고, 불일치 줄만 모델에게 보내 조치 글자를 받아 검사한다.
 */
import 'dotenv/config';

/**
 * LangGraph 네 가지. Annotation = State 선언, StateGraph = 조립, START/END = 시작·끝 표시.
 */
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';

import { z } from 'zod';

/**
 * LLM 호출은 main.ts 와 같은 ask 를 쓴다. LangChain 껍데기(ChatOpenAI.invoke) 대신 직접 반복문 (사수 결정 2026-09-17).
 * agent 폴더 것을 server 가 가져다 쓰는 건 층이 섞이지만, 같은 함수를 두 벌 두는 것보다 낫다.
 */
import { ask } from '../agent/openrouter.js';

/**
 * SAP 호출 둘. 헤더(번호 모으기)와 검산 결과. 상대 경로는 .js 확장자가 필요하다.
 */
import { fetchPurchaseOrders, fetchPurchaseOrderMatch, type PurchaseOrderMatch, type MatchStatus } from './sap.js';

/**
 * 모델 답에 허용하는 조치 넷. 모델은 글자로 적어 줄 뿐이고, parseVerdicts 가 이 밖의 글자는 거른다.
 * llm이 결과 값을 보고 4개의 조치 중 하나를 반환하도록 설정 ( actions 값 설정은 보류 )
 */
const actions = z.enum(['입고확인', '송장보류', '업체문의', '대기']);

/**
 * LLM 답 한 줄 모양. judge 가 이 모양의 JSON 배열을 요구하고 parseVerdicts 가 이 스키마로 검사한다.
 */
const verdictSchema = z.object({
  poNumber: z.string(),
  itemNumber: z.number(),
  action: actions,
  reason: z.string(),
});
type Verdict = z.infer<typeof verdictSchema>;


/**
 * 모델에게 요구할 답 규격. verdictSchema 하나로 검사(zod)와 요청(JSON Schema) 둘 다 쓴다.
 * strict 는 스키마 밖 칸·값을 금지. 답이 [ … ] 배열 글자로만 온다.
 */
const verdictFormat = {
  type: 'json_schema',
  json_schema: { 
    name: 'verdicts',
    strict: true, 
    // 배열 안 객체 자체를 jsonschema로 변경한 것 
    schema: z.toJSONSchema(z.array(verdictSchema)) },
};


/**
 * judge 를 다시 도는 상한. 답 모양이 이만큼 틀리면 포기한다. 없으면 모델이 계속 틀릴 때 안 끝난다.
 */
const judgeTries = 10;

/**
 * State. 그래프 전체가 같이 보는 구조 하나. ABAP 의 전역 DATA 묶음.
 * reducer 가 없는 칸은 노드가 돌려준 값으로 덮어쓴다. reducer 가 있는 칸은 (지금 값, 노드가 준 조각) → 합친 값.
 * 노드는 바뀐 칸만 돌려주면 된다. 안 돌려준 칸은 그대로 남는다.
 */
const State = Annotation.Root({
  /** 입력 조건. poNumbers 가 있으면 헤더 조회 없이 그 번호로. 셋 다 없으면 전체 검산 */
  query: Annotation<{ vendor?: string; companyCode?: string; poNumbers?: string[] }>,
  /** 한 번에 z_match 에 보낼 PO 번호 수 */
  chunkSize: Annotation<number>,
  /** searchHeaders 가 채우는 번호 목록. 덮어쓰기 */
  poNumbers: Annotation<string[]>,
  /** 다음 묶음 시작 위치. fetchChunk 가 돌 때마다 앞으로 간다 */
  cursor: Annotation<number>,
  /**
   * reducer. 묶음마다 온 줄을 이어 붙인다. APPEND LINES OF … TO rows.
   * 없으면 두 번째 묶음이 첫 묶음을 덮어써 앞 결과가 사라진다.
   */
  rows: Annotation<PurchaseOrderMatch[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  /** reducer. 지나간 노드 이름을 순서대로. 테스트가 "judge 몇 번" 을 여기서 센다 */
  trace: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  /** reducer. judge 가 1 씩 돌려주면 더한다. ADD 1 TO tries. 순환 상한 계산용 */
  tries: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  /** judge 답 글자 그대로. 다음 노드(check)에 넘기는 통로. 덮어쓰기 — 붙으면 JSON 이 깨진다 */
  judgeText: Annotation<string>,
  /** check 를 통과한 답. 비어 있으면 통과 못 한 것. 덮어쓰기 */
  verdicts: Annotation<Verdict[]>,
  /** check 가 떨어진 사유. 비어 있으면 통과. judge 가 재시도 때 모델에게 보여 준다. 덮어쓰기 */
  checkError: Annotation<string>,
});
// z.infer 와 같은 역할이다. 값(State 선언)에서 타입을 뽑는 것.
type S = typeof State.State;

/**
 * 불일치 줄만. OK 를 뺀 나머지 다섯 상태. (GR OVER , IR_OVER , GR_PENDING , IR_UNDER , PRICE_DIFF)
 */
function mismatchesOf(rows: PurchaseOrderMatch[]): PurchaseOrderMatch[] {
  return rows.filter((r) => r.status !== 'OK');
}

/**
 * 노드 1. 조건으로 헤더를 조회해 PO 번호만 모은다. FORM search_headers.
 * 값이 있는 조건만 옮긴다. undefined 칸을 넣으면 타입이 안 맞는다(exactOptionalPropertyTypes).
 * -> 바뀐 칸만 돌려주기 때문에 돌려 줄 값을 Partial 로 선언한다.
 */
async function searchHeaders(state: S): Promise<Partial<S>> {
  const q: { vendor?: string; companyCode?: string } = {};
  if (state.query.vendor !== undefined) q.vendor = state.query.vendor;
  if (state.query.companyCode !== undefined) q.companyCode = state.query.companyCode;

  /**  fetchPurchaseOrder를 통해 PO를 뽑아오되 , PoNumber만 살리고 나머지는 버린다. 
   * [ {poNumber:'A', vendor:…, currency:…},{poNumber:'B', vendor:…, currency:…} ] -> [{poNumber:'A'},{poNumber:'B'}]
  */
  const orders = await fetchPurchaseOrders(q);
  return { poNumbers: orders.map((o) => o.poNumber), cursor: 0, trace: ['searchHeaders'] };
}

/**
 * 노드 2. cursor 부터 chunkSize 개를 잘라 z_match 에 묻는다. 번호가 하나도 없으면 EBELN 없이 전체.
 * rows 는 조각만 돌려준다. 이어 붙이는 건 reducer 가 한다.
 */
async function fetchChunk(state: S): Promise<Partial<S>> {
  // 결과값을 curor ~ ChunkSize까지 자르기 
  const chunk = state.poNumbers.slice(state.cursor, state.cursor + state.chunkSize);
  // n개의 po 값들을 Fetch를 통해 sap api로 값을 넘겨 poNumber 기준 3way match 
  const rows = await fetchPurchaseOrderMatch(chunk.length > 0 ? { poNumbers: chunk } : {});
  return { rows, cursor: state.cursor + state.chunkSize, trace: ['fetchChunk'] };
}

/**
 * LLM 답 글자 → 검사된 배열 + 실패 사유. 틀리면 빈 배열과 어디서 틀렸는지 글자. 
 * [ ] 자르기
 * JSON.parse 
 * 가드 → zod 모양 검사.
 *  그래서 세 겹. 사유는 judge 가 재시도 때 모델에게 되돌려 준다.
 */
function parseVerdicts(text: string): { verdicts: Verdict[]; error: string } {
  /**
   * 모델이 ```json … ``` 으로 감싸는 일이 잦다. 첫 [ 부터 마지막 ] 까지만 자른다.
   */
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) return {verdicts : [],error : 'json 배열 없음'};

  /**
   * 글자 → 객체. JSON 문법이 깨졌으면 throw 라 잡아서 빈 배열로.
   */
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { verdicts: [], error: 'JSON 문법 오류' };
  }

  /** safeParse : 틀려도 throw 안 함 → 
   * saFePharse를 통해 실패하더라도 값을 되돌려 주기 때문에 순환이 가능
   *
   */
  const result = z.array(verdictSchema).safeParse(parsed);
  /**
   * success 가 true 인 조건 (전부 만족해야):
   * parsed 가 객체로 구성된 배열 
   * 배열 안 원소마다 객체이고
   * poNumber 글자, itemNumber 숫자, reason 글자 있고
   * action 이 입고확인 | 송장보류 | 업체문의 | 대기 넷 중 하나
   */
  // prettifyError :zod 중 어느 칸에 에러 났는지 설명 
  if (!result.success) return { verdicts: [], error: z.prettifyError(result.error) };
  return { verdicts: result.data, error: '' }; // 통과 
}

/**
 * 노드 3. LLM. 불일치 줄을 JSON 으로 보여 주고 줄마다 조치 하나 + 이유 한 줄을 JSON 배열로 받는다.
 * ask 를 한 번만 부르고 답을 글자로 둔다. 검사는 다음 노드(check)가, 재시도는 엣지(afterCheck)가 한다. 한 노드 = 한 일.
 * LLM 호출은 main.ts 와 같은 ask 직접 호출 (사수 결정: LangChain invoke 안 씀).
 */
async function judge(state: S): Promise<Partial<S>> {
  /**
   * 불일치 줄 전부 한 번에 보낸다 (사용자 결정 2026-09-17). 상한 없음.
   * 답이 흔들리거나 잘리면(finish_reason length) 그때 20개씩 나눠 보내는 순환을 넣는다.
   */
  const target = mismatchesOf(state.rows);

  /**
   * 매번 새로 만든다. 그래프 밖(main.ts) 이력과는 프로세스가 달라 섞일 수 없다.
   * Record<string, unknown> 으로 넓혀 둔다. 아래 assistant 줄을 push 하려면 content 가 글자로 고정돼 있으면 안 된다.
   */
  const messages: Record<string, unknown>[] = [
    {
      role: 'system',
      content: `구매 3-way match 불일치 줄마다 조치를 정한다.
        조치는 다음 넷 중 하나만: ${actions.options.join(', ')}.
        GR_PENDING=입고<발주, GR_OVER=입고>발주, IR_OVER=송장>입고, IR_UNDER=송장<입고, PRICE_DIFF=단가 다름.
        답은 JSON 배열만. 다른 글자 없이. 줄 모양: {"poNumber":"...","itemNumber":10,"action":"...","reason":"한 문장"}.
        입력에 있는 줄을 하나도 빼지 않는다.`
      // Structed Output
    },
    { role: 'user', content: JSON.stringify(target) },
  ];

  /**
   * 재시도(check 가 떨어져 되돌아온 경우)면 앞 답과 사유를 붙인다. 모델이 뭘 고칠지 알게.
   * 앞 답은 State 의 judgeText 에 남아 있다. 이 노드가 새로 시작돼도 State 는 이어진다.
   */
  if (state.checkError !== '') {
    messages.push(
      { role: 'assistant', content: state.judgeText },
      { role: 'user', content: `앞 답이 규격에 안 맞았다: ${state.checkError}\nJSON 배열만 다시 답한다.` },
    );
  }

  /**
   * 에이전트 루프 뼈대. main.ts 의 runAgent 와 같은 모양인데 도구를 안 달았다.
   * 도구가 없으니 finish_reason 은 거의 항상 stop 이라 첫 바퀴에 나간다. 루프가 실제로 도는 건 length(잘림)·error 때뿐.
   * JSON 파싱·zod 검사는 여기서 안 한다. check 노드가 하고, 틀리면 afterCheck 가 tries 로 judge 를 되돌린다.
   */
  const MAX_STEPS = 3;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await ask(messages, undefined, verdictFormat);

    /** .find 와 같다. choices[0] 이 없으면 undefined 라 먼저 본다 */
    const choice = res.choices[0];
    if (!choice) throw new Error('응답에 답변 칸이 없다');

    /**
     * 답이 끝났다. 글자만 State 에 싣고 나간다. 검사는 check 노드가.
     * 이 프로세스에서 console.log 는 금지. stdout 이 MCP 통로다. 찍으려면 console.error.
     */
    if (choice.finish_reason === 'stop') {
      return { judgeText: choice.message.content ?? '', tries: 1, trace: ['judge'] };
    }

    /** length·error 등. 같은 질문을 한 번 더 */
    console.error(`[judge] finish_reason=${choice.finish_reason} provider=${res.provider} 재시도 ${step + 1}/${MAX_STEPS}`);
  }

  /**
   * MAX_STEPS 안에 stop 을 못 받았다. 빈 글자를 주면 check 가 실패로 보고 afterCheck 가 다시 judge 로 보낸다.
   */
  return { judgeText: '', tries: 1, trace: ['judge'] };
}

/**
 * 노드 4. judge 답 검사. parseVerdicts 가 틀리면 빈 배열이고, 그러면 afterCheck 가 judge 로 되돌린다.
 * LLM 도 SAP 도 안 부르는 순수 코드 노드라 async 가 없다.
 */
function check(state: S): Partial<S> {
  
 const parsed = parseVerdicts(state.judgeText);
 return { verdicts: parsed.verdicts, checkError: parsed.error, trace: ['check'] };

}

/**
 * 조건 분기 0. 번호가 이미 있으면(입력으로 받음) 헤더 조회 없이 바로. 업체·회사코드가 있으면 헤더 조회로.
 * 셋 다 없으면 바로 전체 검산. IF … ELSEIF … ELSE.
 */
function afterStart(state: S): 'searchHeaders' | 'fetchChunk' {
  if (state.poNumbers.length > 0) return 'fetchChunk';
  if (state.query.vendor !== undefined || state.query.companyCode !== undefined) return 'searchHeaders';
  return 'fetchChunk';
}

/**
 * 조건 분기 1. 번호가 0건이면 끝. 있으면 묶음 조회로.
 */
function afterSearch(state: S): 'fetchChunk' | typeof END {
  return state.poNumbers.length === 0 ? END : 'fetchChunk';
}

/**
 * 조건 분기 2. 남은 번호가 있으면 자기 자신으로 (순환 1, 코드).
 *  다 돌았으면 불일치 유무로 갈린다.
 * DO … ENDDO 의 EXIT 조건이 여기 있다.
 */
function afterChunk(state: S): 'fetchChunk' | 'judge' | typeof END {
  if (state.cursor < state.poNumbers.length) return 'fetchChunk';
  // 조건 분기를 위한 것
  // 다 ok = end <> 판단 
  return mismatchesOf(state.rows).length === 0 ? END : 'judge';
}

/**
 * 조건 분기 3. 검사 통과면 끝. 실패면 judgeTries 까지 다시 judge (순환 2, LLM 개입). 그 뒤는 포기하고 끝.
 * check가 zod
 */
function afterCheck(state: S): 'judge' | typeof END {
  return state.verdicts.length === 0 && state.tries < judgeTries ? 'judge' : END;
}

/**
 * 조립. 노드를 등록하고 선을 잇는다. addEdge = 무조건 다음, addConditionalEdges = 함수가 다음을 고른다.
 * compile 로 실행 가능한 그래프가 된다.
 */
const graph = new StateGraph(State)
  .addNode('searchHeaders', searchHeaders)
  .addNode('fetchChunk', fetchChunk)
  .addNode('judge', judge)
  .addNode('check', check)
  .addConditionalEdges(START, afterStart)
  .addConditionalEdges('searchHeaders', afterSearch)
  .addConditionalEdges('fetchChunk', afterChunk)
  .addEdge('judge', 'check')
  .addConditionalEdges('check', afterCheck)
  //선언(노드·엣지 목록)을 실행 가능한 객체로 바꾸는 단계
  .compile();

/**
 * 도구 결과 모양. summary 는 상태별 건수, mismatches 는 불일치 줄 + LLM 조치(있으면).
 */
export type ThreeWayMatchResult = {
  ok: boolean;
  reason?: string;
  count: number;
  summary: Record<string, number>;
  mismatches: (PurchaseOrderMatch & { action?: string; reason?: string })[];
  trace: string[];
};

/**
 * 그래프를 한 번 돌리고 결과를 도구 모양으로 접는다. index.ts 의 threeWayMatch 콜백이 부른다.
 * recursionLimit 은 노드 실행 횟수 상한. 순환이 잘못돼도 여기서 멈춘다.
 */
export async function runGraph(
  query: { vendor?: string; companyCode?: string; poNumbers?: string[] },
  chunkSize: number,
): Promise<ThreeWayMatchResult> {
  /**
   * 초기 State. 입력에 번호가 있으면 poNumbers 에 미리 넣어 afterStart 가 헤더 조회를 건너뛰게 한다.
   */
  const final = await graph.invoke(
    { query, chunkSize, poNumbers: query.poNumbers ?? [], cursor: 0, judgeText: '', verdicts: [] , checkError: ''},
    { recursionLimit: 50 },
  );

  /**
   * 조건은 있었는데 번호가 0건. 전체 조회(조건 없음)와 구분해 실패로 돌려준다.
   */
  // 조건이 없는 경우 hasQwery =false (전체조회)->if문 실행 x 
  const hadQuery = query.vendor !== undefined || query.companyCode !== undefined;
  // 조건이 있어 hasQuery = 참 & 조건 자체가 sap에 값이 없어 graph의 
  // aftersearch 안에서 return state.poNumbers.length === 0 ? END : 'fetchChunk'; end로 오는 경우  
  if (hadQuery && final.poNumbers.length === 0) {
    return { ok: false, reason: '조건에 맞는 구매오더가 없다', count: 0, summary: {}, mismatches: [], trace: final.trace };
  }

  /**
   * const summary: Record<string, number> = {};
   * for (const r of final.rows)
   * summary[r.status] = (summary[r.status] ?? 0) + 1;
  */
  
  const summary: Record<MatchStatus, number> = { OK: 0, GR_PENDING: 0, GR_OVER: 0, IR_OVER: 0, IR_UNDER: 0, PRICE_DIFF: 0 };
  for (const r of final.rows) summary[r.status] += 1;
  

  /**
   * SAP 줄(rows) 위에 LLM 판정(verdicts)을 얹는다. 두 배열을 PO번호+항목번호로 짝 맞춘다.
   * map = LOOP AT 불일치줄 … APPEND 새줄. 원본 rows 는 안 바뀌고 새 배열이 나온다.
   * ThreeWayMatchResult['mismatches'] : ThreeWayMatchResult에서 mismatch 필드만 꺼내 온 것 
   */
const mismatches: ThreeWayMatchResult['mismatches'] = [];
for (const r of mismatchesOf(final.rows)) { 
  /** READ TABLE verdicts WITH KEY. 못 찾으면 undefined 
   *  r = SICF에서 반환한 행 
   *  v = llm이 행마다 내린 판정 
  */
  const v = final.verdicts.find((x) => x.poNumber === r.poNumber && x.itemNumber === r.itemNumber);
  // sap가 제공한 행에 대해 llm이 답을 내지 못해 verdict이 존재하지 않는 경우 
  if (v === undefined) {
    mismatches.push(r);
  }
  // sap가 반환한 줄 뒤에 action과 reason을 붙힘  
  else {
    mismatches.push({ ...r, action: v.action, reason: v.reason });
  }
}

  return { ok: true, count: final.rows.length, summary, mismatches, trace: final.trace };
}
