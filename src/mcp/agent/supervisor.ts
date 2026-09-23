/**
 * 총괄(supervisor). SAP 도구를 직접 안 쓴다. 도구는 delegate 하나뿐이고, 그걸로 부하에게 task 를 맡긴 뒤 받은 답을 합쳐 사용자에게 답한다.
 * 총괄도 담당도 같은 runToolLoop 를 돈다. 다른 건 도구 목록(delegate 하나 vs 여섯)과 runTool(담당 돌리기 vs 로컬/MCP)뿐.
 */

/**
 * 범용 루프와 실행 함수 모양. 상대 경로는 .js 확장자가 필요하다.
 */
import { runToolLoop, type ToolRunner } from './loop.js';

/**
 * 부하 모양과 부하 실행. 총괄은 부하 목록을 받아 delegate 도구·SYSTEM 을 만들고, 요청이 오면 runWorker 로 돌린다.
 */
import { runWorker, type Worker } from './workers.js';

import type { OpenAiTool } from './openrouter.js';

/**
 * Jev 라우터와 임계값 둘. 확실한 질문은 총괄(Qwen)에게 묻기 전에 코드가 부하를 바로 부른다.
 */
import { routeQuestion } from './jev-router.js';
import { ROUTE_MIN_CONFIDENCE, SELF_CONTAINED_MIN } from './jev-questions.js';

/**
 * 총괄 SYSTEM. 부하 목록은 workers 에서 만든다(스킬 목록과 같은 방식). 부하가 늘면 여기가 자동으로 는다.
 */
/**
 * main.ts 가 이력 첫 줄(system)로 넣는다. supervisor-check.ts 도 같다.
 */
export function makeSupervisorSystem(workers: Worker[]): string {
/**
 * list 
 * '- 구매 조회 도우미: 구매오더 헤더·품목 조회, 3-way match 검산. SAP 구매 데이터 질문은 여기.
 *  - 자재 조회 도우미: 자재 마스터(자재명·단위)와 창고별 가용재고 조회. SAP 자재·재고 질문은 여기.'
*/
const list = workers.map((w) => `- ${w.name}: ${w.description}`).join('\n');


  return `너는 SAP 조회 도우미다. 사용자와 대화하는 건 너뿐이다. 
  SAP 데이터는 직접 조회하지 않고 부하에게 delegate 로 맡긴 뒤, 돌려받은 answer 만으로 한국어로 정리해서 답한다.
  SAP 데이터가 필요한 질문이면 알맞은 부하에게 task 를 한국어 한 문장으로 맡긴다.
  사용자가 준 값(오더번호·업체코드·자재번호 등)은 task 에 그대로 넣는다. 필요하면 여러 부하를 차례로 맡긴다.
  SAP 과 무관한 질문(인사·날씨·일반 상식)은 부하 없이 바로 답한다.
  부하가 ok:false 를 돌려주거나 값이 더 필요하다고 하면, 그 내용을 사용자에게 그대로 전하고 되묻는다. 추측으로 채우지 마라.
  사용자가 묻지 않은 집계·분류·전체 목록은 답에 넣지 않는다. 건수를 물으면 건수만 답하고, 목록은 사용자가 요청할 때만 적는다.
  부하 목록:
  ${list}`;
}

/**
 * 총괄의 도구 하나. 
 * worker 는 부하 이름 중 하나(enum), task 는 맡길 일 한 문장.
 * JSON Schema 를 손으로 적는다(로컬 도구와 같은 방식). enum 이 부하 목록에서 나오니 부하가 늘면 같이 는다.
 */
function makeDelegateTool(workers: Worker[]): OpenAiTool {
  return {
    type: 'function',
    function: {
      name: 'delegate',
      description: '부하에게 일을 맡긴다. 부하는 자기 도구로 처리하고 { ok, answer } 또는 { ok:false, reason } 을 돌려준다.',
      parameters: {
        type: 'object',
        properties: {
          // workers를 모두 map하여 load한 다음 enum: ['구매 조회 도우미', '자재 조회 도우미']으로 변경하여
          // Input schema 제공  
          worker: { type: 'string', enum: workers.map((w) => w.name), description: '맡길 부하 이름' },
          task: { type: 'string', description: '부하에게 맡길 일. 한국어 한 문장' },
        },
        required: ['worker', 'task'],
      },
    },
  };
}

/**
 * 총괄 루프 한 번. 이력을 받아 답이 나올 때까지 돌고 { answer, trace } 를 돌려준다.
 * trace = 이 질문에서 부른 부하 이름 순서. 검증(supervisor-check.ts)이 "구매 질문엔 ['구매'], 날씨엔 []" 을 여기서 본다.
 */
/**
 * main.ts 의 질문 루프와 supervisor-check.ts 가 부른다.
 */
export async function runSupervisor(messages: Record<string, unknown>[], workers: Worker[]): Promise<{ answer: string; trace: string[] }> {
  const trace: string[] = [];

  /**
   * 총괄의 runTool. delegate 요청이 오면 담당을 찾아 runWorker 로 돌리고 그 글자를 그대로 돌려준다.
   * 부하의 이력은 runWorker 안에서 생겼다 사라진다. 총괄 이력엔 이 결과 글자만 남는다.
   * .find 는 못 찾으면 undefined. enum 으로 막았지만 모델이 딴 이름을 줄 수 있어 가드.
   * delegateToWorker는 변수이며 , ToolRunner라는 모양의 함수만 담을 것이다.
   * ToolRunner =  (name: string, args: Record<string, unknown>) => Promise<string>;
   */
  const delegateToWorker: ToolRunner = async (name, args) => {
    if (name !== 'delegate') return JSON.stringify({ ok: false, reason: `모르는 도구: ${name}` });
    // 인자값과 workers배열을 비교하여 맞는 도우미를 worker에 저장 
    // worker : 구매 오더 도우미 == 이름 파싱 
    const worker = workers.find((w) => w.name === args.worker);

    if (!worker) return JSON.stringify({ ok: false, reason: `부하 없음: ${String(args.worker)}` });
    trace.push(worker.name);
    return runWorker(worker, String(args.task ?? ''));
  };

  /**
   * 총괄이 볼 도구 목록. delegate 하나뿐이라 배열에 하나.
   * delegateTool은 반환이 1개이지만  runToolLoop 는 담당과 함수를 공유하기 때문에 배열 구조로 제공해야함 
   * -> 차 후 runagent 즉 , llm 호출을 분리하는 것도 고려사항 
   */
  const delegateTool = makeDelegateTool(workers);
  const tools = [delegateTool];



  /**
   * Jev 빠른 길. 마지막 user 문장을 Jev 에게 보여 "누구 몫인가·혼자 완결인가" 를 받고,
   * 둘 다 확실하면 코드가 부하를 직접 부른 뒤 이력에 "delegate 가 이미 일어난 것" 으로 두 줄을 넣는다.
   * 그 밖(user 줄 없음·Jev 실패·없음·확신 부족·미완결·부하 못 찾음)은 아무것도 안 하고 아래 원래 길로.
   */
  /**
   * 뒤에서부터 user 줄을 찾는다. (배열을 reverse하여 user 즉 , 최신 사용자 프롬프트를 찾는다.) 
   * READ TABLE … WITH KEY role = 'user' 를 뒤에서. 불러온 세션은 끝에 system 경계 줄이 있어 마지막 줄을 집으면 안 된다.
   */
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  // 타입 검사 
  const userMessage = typeof lastUser?.content === 'string' ? lastUser.content : '';

  if (userMessage !== '') {
    /**
     * Jev 실패(401·429·timeout)는 여기서 잡는다. 라우터가 답을 막으면 안 되니 로그만 남기고 원래 길로.
     */
    try {
      const route = await routeQuestion(userMessage);
      console.log(`[jev] ${route.worker} confidence=${route.confidence.toFixed(2)} selfContained=${route.selfContained.toFixed(2)}`);

      const routed = workers.find((w) => w.name === route.worker);
      if (routed && route.confidence >= ROUTE_MIN_CONFIDENCE && route.selfContained >= SELF_CONTAINED_MIN) {
        /**
         * task 는 문장 원문. 완결 문장이라 부하가 그대로 이해한다. 총괄 프롬프트도 "사용자가 준 값은 그대로" 다.
         */
        const result = await runWorker(routed, userMessage);
        trace.push(`jev:${routed.name}`);

        /**
         * loop.ts 가 쌓는 모양 그대로 두 줄. 안 맞추면 다음 요청에서 서버가 "도구 결과가 어디 딸린 것인지 모른다" 며 거절한다.
         * jev 모델을 통해 라우팅 후 assistant가 Delegate 도구를 호출한 것 처럼 message 이력을 작성한다. 
         */
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'jev-1', type: 'function', function: { name: 'delegate', arguments: JSON.stringify({ worker: routed.name, task: userMessage }) } }],
        });
        messages.push({ role: 'tool', tool_call_id: 'jev-1', content: result });
      }
    } catch (e) {
      console.error(`[jev] 라우팅 실패, 원래 길로: ${e instanceof Error ? e.message : String(e)}`);
    }
  }



  /**
   * 루프에 셋을 넘긴다. delegateToWorker 는 지금 실행하는 게 아니라 "요청 오면 이렇게 처리해라" 는 절차를 건네는 것.
   * runToolLoop 가 모델의 delegate 요청을 받을 때마다 그 절차를 실행한다. 요청이 없으면(날씨 질문) 한 번도 안 돈다.
   * tools로 인해 Worker와 task가 정해진다 이에 따라 
   */
  const answer = await runToolLoop(messages, tools, delegateToWorker);
  return { answer, trace };
}
