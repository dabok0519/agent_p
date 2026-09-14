import 'dotenv/config';

import { generateText, stepCountIs } from 'ai';
import { model } from './model.js';
import { searchPurchaseOrders, searchInvoices, searchGoodsReceipts } from './tools.js';

// ── ReAct 에이전트 ───────────────────────────────────────────────────────────
// 모델이 도구를 부를지 답을 쓸지 스스로 정한다(toolChoice 기본값 = auto).
// 최종 출력은 모델이 쓴 텍스트(r.text)다. 구조화 출력을 강제하지 않으므로
// 종료용 도구도, prepareStep 착륙도 필요 없다.
// 필요한 데이터를 다 모았다고 판단하면 모델이 도구를 그만 부르고 답을 쓰며,
// 그 시점에 부를 도구가 없으므로 루프가 끝난다.
//
// 이 파일은 실행하지 않는다. 화면 입출력은 cli.ts, 검증은 agent.test.ts 가 맡는다.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_STEPS = 20; // 폭주 방지 안전장치

const SYSTEM = [
  '너는 SAP 구매 프로세스 도우미다. 도구로 데이터를 조회하고, 그 결과만으로 한국어로 정리해서 답한다.',
  '답에 쓰는 값은 도구가 반환한 결과에서 가져온다. 기억이나 추측으로 채우지 마라.',
  '조회하지 않은 대상을 "없다"고 단정하지 마라. 확인이 필요하면 도구를 먼저 불러라.',
  '필요한 데이터를 다 모으기 전에 결론을 내지 마라. 부분 조회 상태로 답하지 마라.',
  '문서번호 형식: 구매오더는 45로 시작하는 10자리(4500000001), 송장은 51(5100000001), 입고는 50(5000000001). 예시를 들 때 다른 형식을 지어내지 마라.',
].join('\n');

/**
 * 질문 하나를 받아 에이전트를 돌린다.
 *
 * - text  : 모델이 쓴 최종 답변
 * - tools : 실제로 호출된 도구 이름 (중복 없이). 답변이 근거를 가졌는지 판단하는 단서다
 * - steps : step 원본. 흐름을 찍거나 도구 결과를 볼 때 쓴다
 */
export async function ask(question: string) {

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: question,
    tools: { searchPurchaseOrders, searchInvoices, searchGoodsReceipts },
    temperature: 0,
    stopWhen: stepCountIs(MAX_STEPS),
  });
  
  const tools: string[] = [];
  for (const step of result.steps) {
    for (const call of step.toolCalls) {
      if (!tools.includes(call.toolName)) {
        tools.push(call.toolName);
      }
    }
  }

  return { text: result.text, tools, steps: result.steps };
}
