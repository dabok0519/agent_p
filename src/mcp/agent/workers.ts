/**
 * 부하(worker) 정의. 총괄(supervisor)이 delegate 로 일을 맡기면 여기 부하가 자기 도구·스킬로 처리하고 답 글자만 돌려준다.
 * 구매 부하 = v0.12 main.ts 가 하던 일 그대로. 자재 부하 = 도구 없는 빈 자리(나중에 꽂는다).
 */

/**
 * 범용 루프와 실행 함수 모양, MCP 결과 열기. 상대 경로는 .js 확장자가 필요하다.
 */
import { runToolLoop, textOf, type ToolRunner } from './loop.js';

/**
 * OpenAI 도구 모양. 부하마다 도구 목록을 갖는다.
 */
import type { OpenAiTool } from './openrouter.js';

/**
 * 스킬 목록·로컬 도구·로컬 실행. 구매 부하가 그대로 쓴다.
 */
import { skills, localTools, runLocalTool } from './skills.js';

/**
 * MCP 클라이언트 타입. runMcpOrLocalTool 이 callTool 에 쓴다. 값은 main.ts 가 연결해서 넘긴다.
 */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * 부하 하나. name 은 trace 와 delegate 의 enum 에, description 은 총괄 SYSTEM 의 부하 목록에 실린다.
 * system·tools·runTool 셋이 "이 담당이 어떻게 일하나" 의 전부다. 루프(runToolLoop)는 공용.
 */
/**
 * supervisor.ts 가 목록으로 받아 delegate 도구와 SYSTEM 을 만든다.
 */
export type Worker = {
  name: string;
  description: string;
  system: string;
  tools: OpenAiTool[];
  runTool: ToolRunner;
};

/**
 * 스킬 로드 ② 목록. 이름·설명만 붙인다. 본문은 모델이 readSkill 을 요청하면 그때 코드가 읽어 준다.
 * 스킬이 없으면 빈 글자라 SYSTEM 은 역할 5줄뿐이다.
 */
const skillList =
  skills.length > 0
    ? `\n3-way match(검산·불일치·입고·송장 확인)를 물었을 때만 readSkill 로 스킬 본문을 먼저 읽고 그 절차를 따른다. 그 외 질문에는 스킬을 읽지 않는다. 스킬 목록:\n${skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')}`
    : '';

/**
 * 구매 부하 SYSTEM. v0.12 main.ts 의 SYSTEM 그대로 옮겼다. 역할 5줄 + 스킬 목록.
 */
const PURCHASE_SYSTEM = 
`너는 SAP 구매 조회 담당이다. 구매오더 헤더·품목 조회와 3-way match 검산만 맡는다.
 도구로 데이터를 조회하고, 그 결과만으로 한국어로 정리해서 답한다.
답에 쓰는 값은 도구가 반환한 결과에서 가져온다. 기억이나 추측으로 채우지 마라.
조회하지 않은 대상을 "없다"고 단정하지 마라. 확인이 필요하면 도구를 먼저 불러라.
필요한 데이터를 다 모으기 전에 결론을 내지 마라. 부분 조회 상태로 답하지 마라.
맡은 범위 밖이거나 값이 부족하면, 무엇이 필요한지 한 줄로 되묻는 답을 돌려준다.${skillList}`;

/**
 * 자재 부하 SYSTEM. 구매와 같은 규칙에 자재 조회 특성 둘(창고별 여러 줄, 이름 일부 검색)을 더했다. 스킬은 아직 없어 목록 없음.
 */
const MATERIAL_SYSTEM =
`너는 SAP 자재 조회 담당이다. 자재 마스터(자재명·단위)와 창고별 가용재고 조회만 맡는다.
도구로 데이터를 조회하고, 그 결과만으로 한국어로 정리해서 답한다.
답에 쓰는 값은 도구가 반환한 결과에서 가져온다. 기억이나 추측으로 채우지 마라.
자재 하나가 창고별로 여러 줄로 온다. 창고(plant·storageLocation)별로 나눠 적고, 합계를 물으면 availableQty 를 더해 적는다.
자재번호를 정확히 몰라도 이름 일부(예: SMPS)로 조회할 수 있다. 조회 결과가 없으면 검색어를 바꿔 한 번 더 시도한 뒤 없다고 답한다.
맡은 범위 밖(구매오더·입고·송장)이거나 값이 부족하면, 무엇이 필요한지 한 줄로 되묻는 답을 돌려준다.`;

/**
 * 부하 둘을 만든다. mcpTools·client 는 main.ts 가 서버를 띄운 뒤에야 생겨서 그때 받는다.
 */
/**
 * main.ts 와 supervisor-check.ts 가 시작 때 한 번 부른다.
 * client : main.ts 가 만든 MCP 서버와의 연결 통로 객체
 */
export function makeWorkers(mcpTools: OpenAiTool[], client: Client): Worker[] {
  /**
   * 담당 공용 도구 실행. 구매·자재 둘 다 사용. 로컬 도구(readSkill 등)면 여기서 끝, null 이면 MCP 서버로
   * callTool 두 번째 인자(결과 스키마)는 안 쓴다. 세 번째(제한시간)를 넣으려면 그 자리를 undefined 로 채운다.
   * -> 이전 10분 걸린 이력이 존재하여 timeout을 넣기 위해 schema 값 undefined 
   * ToolRunner = Promise -- 이 타입으로 결과값을 돌려주겠다 약속 
   */
  const runMcpOrLocalTool: ToolRunner = async (name, args) => {
    const local = runLocalTool(name, args);
    if (local !== null) return local;
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 600_000 });
    return textOf(res);
  };
  
  /**
   * MCP 도구를 담당별로 가른다. 이름으로 거른다. 원본 mcpTools 는 안 바뀌고 새 배열이 온다.
   * 안 가르면 구매 담당이 자재 도구까지 보고, 자재 질문을 구매 담당이 처리해 버린다.
   */
  const materialTools = mcpTools.filter((t) => t.function.name === 'searchMaterials');
  const purchaseTools = mcpTools.filter((t) => t.function.name !== 'searchMaterials');

  return [
    {
      name: '구매 조회 도우미',
      description: '구매오더 헤더·품목 조회, 3-way match 검산. SAP 구매 데이터 질문은 여기.',
      system: PURCHASE_SYSTEM,
      tools: [...purchaseTools, ...localTools],
      // 가지고 있는 도구들 실행할 함수와 함께 return 해주는 것 
      runTool: runMcpOrLocalTool,
    },
    {
      /**
       * * 자재 부하. 도구는 searchMaterials 하나. 스킬은 아직 없어 로컬 도구(readSkill 등)를 안 준다.
       * 나중에 자재 MCP 도구와 스킬이 생기면 tools·runTool 만 채운다.
       */
      name: '자재 조회 도우미',
      description: '자재 마스터(자재명·단위)와 창고별 가용재고 조회. SAP 자재·재고 질문은 여기.',
      system: MATERIAL_SYSTEM,
      tools: materialTools,
       runTool: runMcpOrLocalTool,
    },
  ];
}

/**
 * 부하 하나를 돌린다. 매번 새 이력([system, task])으로 시작하고 답 글자만 돌려준다. 이력은 이 함수가 끝나면 버려진다.
 * 총괄에게 가는 건 { ok:true, answer } 또는 { ok:false, reason } 글자. throw 는 여기서 잡는다. 부하 실패가 총괄 실패가 되면 안 된다.
 */
/**
 * supervisor.ts 의 delegateToWorker 가 delegate 요청을 받을 때 부른다.
 */
export async function runWorker(worker: Worker, task: string): Promise<string> {
  /**
   * 도구가 없는 부하는 LLM 을 안 부른다. 물어봐야 할 수 있는 게 없다. 사유를 바로 돌려준다.
   */
  if (worker.tools.length === 0) {
    return JSON.stringify({ ok: false, reason: `${worker.name} 부하: 도구 없음` });
  }

  const messages: Record<string, unknown>[] = [
    { role: 'system', content: worker.system },
    { role: 'user', content: task },
  ];

  try {
    const answer = await runToolLoop(messages, worker.tools, worker.runTool);

    return JSON.stringify({ ok: true, answer });
  } catch (e) {
    return JSON.stringify({ ok: false, reason: `${worker.name} 부하 실패: ${e instanceof Error ? e.message : String(e)}` });
  }
}
