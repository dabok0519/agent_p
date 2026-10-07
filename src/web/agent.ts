/**
 * 에이전트 루프 1개. 원시 판 loop.ts 의 for 문 전체가 streamText 호출 한 줄로 바뀐다.
 * server.ts 가 요청마다 runAgent 를 부른다. agent-check.ts 는 HTTP 없이 직접 부른다.
 */

/**
 * streamText: LLM 호출 + 도구 실행 + 재호출 루프. stepCountIs: 루프 상한 조건. ModelMessage: 모델용 메시지 모양(타입만).
 */
import { streamText, stepCountIs, type ModelMessage } from 'ai';

import { model } from './model.js';
import { tools } from './tools.js';

/** TODO: 최대 왕복(step) 수. 1 step = LLM 호출 1번. 도구 부르고 답까지 쓰려면 최소 2 (src/sdk/agent.ts:17) */
const MAX_STEPS = 20;

/** TODO: 시스템 지시문. 도구 결과만으로 답하기·추측 금지·문서번호 형식 (src/sdk/agent.ts:19-25) */
const SYSTEM = [
  '너는 SAP 구매 프로세스 도우미다. 도구로 데이터를 조회하고, 그 결과만으로 한국어로 정리해서 답한다.',
  '답에 쓰는 값은 도구가 반환한 결과에서 가져온다. 기억이나 추측으로 채우지 마라.',
  '조회하지 않은 대상을 "없다"고 단정하지 마라. 확인이 필요하면 도구를 먼저 불러라.',
  '필요한 데이터를 다 모으기 전에 결론을 내지 마라. 부분 조회 상태로 답하지 마라.',
  '문서번호 형식: 구매오더는 45로 시작하는 10자리(4500000001), 송장은 51(5100000001), 입고는 50(5000000001). 예시를 들 때 다른 형식을 지어내지 마라.',
].join('\n');

/** TODO: 0 이면 매번 같은 답에 가깝다. 조회 도우미라 낮게 */
const TEMPERATURE = 0;

/**
 * ① 루프를 돌린다. 원시 판에서 손으로 하던 것 — ask() 호출, finish_reason 판단, tool_calls 풀기, runTool, messages.push(assistant/tool), MAX_STEPS 반복 — 이 전부 이 안.
 *    await 가 없다. 바로 돌아오고, 결과 객체의 stream(조각 통로)·text(완성 답 Promise)·finishReason(Promise) 이 나중에 채워진다.
 * ② 안 쓰면: generateText 를 쓰면 같은 루프지만 다 끝난 뒤 text 만 준다(src/sdk/agent.ts). 글자 스트리밍이 목표라 streamText.
 *    stopWhen 을 안 넘기면 기본값 stepCountIs(1) 이라 도구 한 번 부르고 답 없이 끝난다.
 * ③ 문서: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text , https://ai-sdk.dev/docs/ai-sdk-core/agents#stopping
 */
/**
 * server.ts 가 convertToModelMessages 로 바꾼 이력을 넘긴다.
 */
export function runAgent(messages: ModelMessage[]) {
  return streamText({
    model,
    system: SYSTEM,
    messages,
    tools,
    temperature: TEMPERATURE,
    stopWhen: stepCountIs(MAX_STEPS),
  });
}
