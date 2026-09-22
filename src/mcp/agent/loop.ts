/**
 * 도구 왕복 루프 하나. main.ts 에서 떼어 냈다 (supervisor 과제 2026-09-21). 파일 이름이 loop 인 이유: 총괄도 담당도 이 루프를 쓴다. 특정 에이전트가 아니다.
 * 전역 tools·client 를 안 본다. 도구 목록과 "도구를 어떻게 실행하나"(runTool)를 인자로 받는다.
 */

/**
 * 요청 함수와 OpenAI 도구 모양. 상대 경로는 .js 확장자가 필요하다.
 */
import { ask, type OpenAiTool } from './openrouter.js';

/**
 * 도구 실행 함수 모양. 이름과 인자를 받아 결과 글자를 돌려준다.
 * 담당은 runMcpOrLocalTool(로컬 ?? MCP), 총괄은 delegateToWorker(담당 돌리기). 루프는 그 안이 뭔지 모른다.
 */
/**
 * workers.ts·supervisor.ts 가 이 모양으로 runTool 을 만든다.
 */
export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<string>;

/** 최대 왕복 횟수. 모델이 끝을 안 내면 여기서 끊는다 */
const MAX_STEPS = 20;

/**
 * 질문 하나에 대한 도구 왕복 전체. 이력을 받아 답이 나올 때까지 돌고 답 글자를 돌려준다.
 * 이력은 밖에서 만들어 넘기므로 부를 때마다 이어진다. tools 는 매 왕복 같이 보낸다(서버는 지난 요청을 기억 안 함).
 */
/**
 * supervisor.ts(총괄)와 workers.ts(담당)가 각자 인자를 넣어 부른다.
 */
export async function runToolLoop(messages: Record<string, unknown>[], tools: OpenAiTool[], runTool: ToolRunner): Promise<string> 
{
  /**
   * 최종 답변을 담을 자리. 반복문이 끝난 뒤 나왔는지 확인한다.
   */
  let answer: string | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    // supervisor : 위임도구 1개와 system & 프롬프트 
    // 
    const res = await ask(messages, tools);

    /**
     * READ TABLE 뒤 sy-subrc 확인과 같다. 못 찾으면 값이 없는 상태가 온다.
     */
    const choice = res.choices[0];
    if (!choice) {
      throw new Error('응답에 답변 칸이 없다');
    }
    const calls = choice.message.tool_calls;

    /**
     * 종료 판단은 finish_reason 으로 한다. stop 이면 답이 끝난 것이다.
     * 전에는 tool_calls 유무로 봤는데, 그러면 length(잘림)·error 도 답으로 오인한다.
     */
    if (choice.finish_reason === 'stop') {
      /**
       * 답도 이력에 남긴다. 안 남기면 다음 질문 때 모델이 자기가 뭐라 답했는지 모른다.
       */
      messages.push(choice.message);
      answer = choice.message.content;
      console.log(`[provider] ${res.provider}`);
      break;
    }

    /**
     * stop 도 tool_calls 도 아니면(length·error·모르는 값) 답이 아니다. 잘린 글을 답으로 찍지 않게 멈춘다.
     * || !calls 는 논리가 아니라 타입용이다. tool_calls 칸이 ? 라 있다고 확인해야 아래 for 가 컴파일된다.
     */
    if (choice.finish_reason !== 'tool_calls' || !calls) {
      /** 사유를 같이 싣는다. error 일 때 공급자가 choice 안에 error 칸으로 이유를 준다. 없으면 이 문구만으로는 원인을 못 찾는다 */
      throw new Error(`모델이 끝내지 못했다: finish_reason=${choice.finish_reason} ${JSON.stringify(choice).slice(0, 500)}`);
    }

    /**
     * 모델이 "도구를 불러 달라"고 한 그 발언을 이력에 그대로 남긴다.
     * 빼면 다음 요청에서 도구 결과가 어디에 딸린 것인지 서버가 모른다.
     */
    messages.push(choice.message);

    /**
     * LOOP AT 처럼 요청 하나하나를 돈다.
     * 결과를 하나라도 빠뜨리면 서버가 짝이 안 맞는다며 거절한다.
     */
    for (const call of calls) {
      /**
       * 모델의 arguments 는 글자다. 실행 쪽은 객체를 받으니 여기서 푼다.
       * JSON.parse 는 규격 밖 글자에 멈추므로 TRY 로 감싸고, 실패면 null 로 두어 아래 가드가 잡게 한다.
       */
      let args: unknown = null;
      try {
        // { worker: '자재 조회 도우미', task: 'SMPS 자재의 창고별 가용재고를 조회해 줘' }
        args = JSON.parse(call.function.arguments);
      } catch {
        args = null;
      }

      /**
       * 객체 가드. 배열·글자·null 이면 실행 안 하고 실패를 값으로 이력에 넣는다. 모델이 읽고 다시 시도한다.
       * continue 는 LOOP 의 다음 줄로 건너뛰기다.
       */
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, reason: `인자가 객체가 아니다: ${call.function.arguments}` }),
        });
        continue;
      }

      /**
       * 도구 실행. 로컬인지 MCP 인지 담당인지는 runTool 이 정한다. 여기는 이름·인자를 넘기고 결과 글자를 받을 뿐이다.
       * { ...args } 는 "키가 글자인 객체" 모양으로 맞추는 것.
       * runTool 은 ToolRunner 타입이다. 
       * 그래서 두 번째 인자는 Record<string, unknown> 이어야 한다.
       * TS 에서 object 는 "객체인 건 알겠는데 키가 뭔지는 전혀 모름"라서 그대로는 못 넣음 
       * 반환 타입을 맞춘다. 
       */
      /** 어느 도구를 어떤 인자로 요청했는지 로그. 총괄이면 delegate, 담당이면 searchMaterials 등이 찍혀 흐름이 보인다 */
      console.log(`[tool] ${call.function.name} ${call.function.arguments}`);
      const content = await runTool(call.function.name, args as Record<string, unknown>);

      /**
       * 도구 실행 결과를 이력에 넣는다. 어느 실행법이든 같은 모양(role tool + 글자)이라 뒤 코드는 구분 안 한다.
       */
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content,
      });
    }
  }

  /**
   * 상한까지 돌았는데 답이 없으면 알린다.
   * 안 막으면 아무것도 안 찍히고 조용히 끝나 원인을 못 찾는다.
   */
  if (answer === null) {
    throw new Error(`왕복 ${MAX_STEPS}회 안에 답이 안 나왔다`);
  }

  return answer;
}

/**
 * MCP 결과에서 text 글자를 꺼낸다. 서버가 { content:[{ type:'text', text }] } 상자로 주니 그 안 글자만.
 * 우리 서버는 항상 text 하나를 주기로 했으니 아니면 코드가 어긋난 것이다.
 */
/**
 * workers.ts 의 runMcpOrLocalTool 이 callTool 결과에 쓴다.
 */
export function textOf(res: object): string {
  if (!('content' in res) || !Array.isArray(res.content)) {
    throw new Error(`MCP 결과에 content 배열이 없다 ${JSON.stringify(res)}`);
  }
  const first: unknown = res.content[0];
  if (
    typeof first !== 'object' || first === null ||
    !('type' in first) || first.type !== 'text' ||
    !('text' in first) || typeof first.text !== 'string'
  ) {
    throw new Error(`MCP 결과 content[0] 이 text 가 아니다 ${JSON.stringify(res)}`);
  }
  return first.text;
}
