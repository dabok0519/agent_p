import 'dotenv/config';

import { generateText, stepCountIs, hasToolCall, tool } from 'ai';
import { z } from 'zod';
import { model } from '../model.js';
import { searchPurchaseOrders, searchInvoices, searchGoodsReceipts } from '../tools.js';
import { FINAL_SCHEMA } from '../schemas.js';

// ── required 방식 ────────────────────────────────────────────────────────────
// toolChoice: 'required' 를 끝까지 유지한다. 모델이 도구를 거치지 않고 답할 통로가 없다.

// required 면 모델이 tool_calls 칸만 쓰니 content 가 비고, 그 결과로 finishReason 이 'tool-calls'
// 그래서 Output.object 는 쓰지 않고, submit 도구의 inputSchema 로 최종 답을 받는다.
// 도구 호출로 끝나도 되므로 finishReason 이 'stop' 일 필요가 없기도 함 
// ─────────────────────────────────────────────────────────────────────────────

const MAX_STEPS = 20;

// 질문은 CLI 인자로 받는다. 없으면 기본 질문.
const question = process.argv[2] ?? '현재 송장이 없는 구매 오더를 조회해서 정리해줘.';

// 종료 도구. 최종 답을 인자로 받는다 — 이 방식에서는 여기가 곧 출력이다.
// execute 를 남긴다: execute 없는 도구는 타입상 outputSchema 가 필수가 되고,
// inputSchema 가 비어있지 않으면 타입 에러가 난다.
// 실제 종료는 아래 stopWhen 의 hasToolCall 이 시킨다.
const submit = tool({
  description:
    '필요한 데이터 조회를 모두 마쳤을 때 호출한다. 조회 결과만으로 최종 답을 인자에 담아 넘긴다. 이걸 호출하면 작업이 끝난다.',
  inputSchema: FINAL_SCHEMA,
  execute: async () => ({ ok: true }),
});

async function main() {
  const r = await generateText({
    model,
    system:
      '너는 SAP 구매 프로세스 도우미다. 도구로 실제 데이터를 조회한 뒤 한국어로 정리해서 답한다.같은 도구를 조건만 바꿔 반복 호출하지 마라. 필요한 데이터를 다 모았으면 반드시 submit을 호출해라.',
    prompt: question,
    tools: { searchPurchaseOrders, searchInvoices, searchGoodsReceipts, submit },
    temperature: 0,
    toolChoice: 'required', // 끝까지 유지. 도구를 거치지 않고 답할 통로가 없다
    stopWhen: [hasToolCall('submit'), stepCountIs(MAX_STEPS)], // 뒤쪽은 폭주 방지용

    onStepFinish: (step) =>
      console.log(`  [step] finish=${step.finishReason} tools=[${step.toolCalls.map((c) => c.toolName)}]`),
  });

  // 최종 답은 submit 호출 인자에 있다. inputSchema 로 이미 검증된 값이라 별도 parse 불필요.
  const call = r.steps.at(-1)?.toolCalls.find((c) => c.toolName === 'submit');
  const result = call?.input as z.infer<typeof FINAL_SCHEMA> | undefined;
  // 그 호출의 input을 꺼내라. 타입은 "FINAL_SCHEMA 모양 (또는 없으면 undefined)"
  // .input 은 이미 inputSchema 로 검증된 값

  console.log('\n===== 최종 구조화 출력 (required) =====');
  console.log('질문:', question);
  if (!result) {
    console.log('submit 미호출 — step 한도에 걸렸거나 모델이 종료를 선언하지 않았다.');
  } else {
    console.log(`건수: PO ${result.orders.length} / 송장 ${result.invoices.length} / 입고 ${result.goodsReceipts.length}`);
    console.log(JSON.stringify(result, null, 2));
  }

  console.log('\n===== step 흐름 =====');
  console.log('총 step:', r.steps.length);
  r.steps.forEach((s, i) =>
    console.log(`[step ${i + 1}] finish=${s.finishReason} tools=${s.toolCalls.map((c) => c.toolName)}`),
  );
}

main().catch(console.error);
