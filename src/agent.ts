import 'dotenv/config';

import { createInterface } from 'node:readline/promises';
import { generateText, stepCountIs } from 'ai';
import { model } from './model.js';
import { searchPurchaseOrders, searchInvoices, searchGoodsReceipts } from './tools.js';

// ── ReAct 에이전트 ───────────────────────────────────────────────────────────
// 모델이 도구를 부를지 답을 쓸지 스스로 정한다(toolChoice 기본값 = auto).
// 최종 출력은 모델이 쓴 텍스트(r.text)다. 구조화 출력을 강제하지 않으므로
// 종료용 도구도, prepareStep 착륙도 필요 없다.
// 필요한 데이터를 다 모았다고 판단하면 모델이 도구를 그만 부르고 답을 쓰며,
// 그 시점에 부를 도구가 없으므로 루프가 끝난다.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_STEPS = 20; // 폭주 방지 안전장치

const SYSTEM = [
  '너는 SAP 구매 프로세스 도우미다. 도구로 데이터를 조회하고, 그 결과만으로 한국어로 정리해서 답한다.',
  '답에 쓰는 값은 도구가 반환한 결과에서 가져온다. 기억이나 추측으로 채우지 마라.',
  '조회하지 않은 대상을 "없다"고 단정하지 마라. 확인이 필요하면 도구를 먼저 불러라.',
  '필요한 데이터를 다 모으기 전에 결론을 내지 마라. 부분 조회 상태로 답하지 마라.',
].join('\n');

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const question = (await rl.question('질문> ')).trim();
  rl.close();

  if (!question) return console.log('질문이 비어 있다.');

  const r = await generateText({
    model,
    system: SYSTEM,
    prompt: question,
    tools: { searchPurchaseOrders, searchInvoices, searchGoodsReceipts },
    temperature: 0,
    stopWhen: stepCountIs(MAX_STEPS),

    onStepFinish: (step) =>
      console.log(`  [step] finish=${step.finishReason} tools=[${step.toolCalls.map((c) => c.toolName)}]`),
  });

  console.log('\n===== 답변 =====');
  console.log(r.text);

  // 어떤 도구를 실제로 불렀는지가 답변 검증의 단서다.
  console.log('\n===== step 흐름 =====');
  console.log('총 step:', r.steps.length);
  r.steps.forEach((s, i) =>
    console.log(`[step ${i + 1}] finish=${s.finishReason} tools=${s.toolCalls.map((c) => c.toolName)}`),
  );
}

main().catch(console.error);
