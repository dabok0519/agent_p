import 'dotenv/config';

import { generateText, stepCountIs, Output } from 'ai';
import { model } from '../model.js';
import { searchPurchaseOrders, searchInvoices, searchGoodsReceipts } from '../tools.js';
import { FINAL_SCHEMA } from '../schemas.js';

// ── auto 방식 ────────────────────────────────────────────────────────────────
// toolChoice 는 기본값('auto'). 모델이 도구를 더 부를지 답을 쓸지 스스로 정한다.
// 스스로 텍스트로 끝낼 수 있어 finishReason 이 'stop' 이 되므로 Output.object 가 그대로 파싱된다.
// 종료 도구도, prepareStep 착륙도 필요 없다.
//
// 대신 '안 불러도 된다'는 자유가 있어 조사를 중간에 접을 수 있다.
// prepareStep 은 첫 step 에 도구를 아예 안 부르는 사고만 막는 최소 보장이고,
// 조사를 끝까지 시키는 건 시스템 프롬프트 몫이다.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_STEPS = 20;

// 질문은 CLI 인자로 받는다. 없으면 기본 질문.
const question = process.argv[2] ?? '현재 송장이 없는 구매 오더를 조회해서 정리해줘.';

async function main() {
  const r = await generateText({
    model,
    // 최소 제약만. 본격적인 프롬프트 설계는 별도 과제로 미룬다.
    system: [
      '너는 SAP 구매 프로세스 도우미다. 도구로 실제 데이터를 조회한 뒤 한국어로 정리해서 답한다.',
      '조회하지 않은 대상을 "없다"고 단정하지 마라. 확인이 필요하면 도구를 먼저 불러라.',
      '"A인데 B가 없는 것"을 묻는 질문은 A 전체와 B 전체를 각각 조회한 뒤 대조해서 구한다.',
      '필요한 데이터를 다 모으기 전에 결론을 내지 마라. 부분 조회 상태로 답하지 마라.',
    ].join('\n'),
    prompt: question,
    tools: { searchPurchaseOrders, searchInvoices, searchGoodsReceipts },
    temperature: 0,
    stopWhen: stepCountIs(MAX_STEPS),

    // 첫 step 만 도구를 강제한다. 그 뒤는 모델 판단에 맡긴다.
    // 빈 객체를 반환하면 바깥 설정(= toolChoice 미지정, 즉 'auto')이 그대로 쓰인다.
    prepareStep: ({ stepNumber }) => (stepNumber === 0 ? { toolChoice: 'required' } : {}),

    onStepFinish: (step) =>
      console.log(`  [step] finish=${step.finishReason} tools=[${step.toolCalls.map((c) => c.toolName)}]`),

    output: Output.object({ schema: FINAL_SCHEMA }),
  });

  console.log('\n===== 최종 구조화 출력 (auto) =====');
  console.log('질문:', question);
  console.log(`건수: PO ${r.output.orders.length} / 송장 ${r.output.invoices.length} / 입고 ${r.output.goodsReceipts.length}`);
  console.log(JSON.stringify(r.output, null, 2));

  console.log('\n===== step 흐름 =====');
  console.log('총 step:', r.steps.length);
  r.steps.forEach((s, i) =>
    console.log(`[step ${i + 1}] finish=${s.finishReason} tools=${s.toolCalls.map((c) => c.toolName)}`),
  );
}

main().catch(console.error);
