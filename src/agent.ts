import 'dotenv/config';

import { generateText, stepCountIs, Output } from 'ai';
import { z } from 'zod';
import { model } from './model.js';
import {
  searchPurchaseOrders, searchInvoices, searchGoodsReceipts, done,
  PurchaseOrderSchema, InvoiceSchema, GoodsReceiptSchema,
} from './tools.js';

const MAX_STEPS = 20;

// 질문은 CLI 인자로 받는다. 없으면 기본 질문.
const question = process.argv[2] ?? '현재 송장이 없는 구매 오더를 조회해서 정리해줘.';

// agent 실행
async function main() {
  const r = await generateText({ //reason and acting == 추론하고 행동(도구 사용) 도구가 뭐냐 ? -> agent가 이제 코드에 사용할 도구를 사용자의 프롬프트를 보고 판단해서 코드에 알려주면 코드가 실행할 함수?정도
    model,
    system: '너는 SAP 구매 프로세스 도우미다. 도구로 실제 데이터를 조회한 뒤 한국어로 정리해서 답한다.같은 도구를 조건만 바꿔 반복 호출하지 마라. 필요한 데이터를 다 모았으면 반드시 done을 호출해라.',
    prompt: question,
    tools: { searchPurchaseOrders, searchInvoices, searchGoodsReceipts, done },
    temperature: 0, 
    toolChoice: 'required', // 도구 강제 (환각 방지)
    stopWhen: stepCountIs(MAX_STEPS),

    // 조사하는 동안은 위 'required' 를 그대로 쓰고, done 신호가 오면 'none' 으로 착륙시킨다.
    // 'none' 이어야 모델이 최종 답변을 쓰고 finishReason 이 'stop' 이 되어 output 이 파싱된다.
    // 끝낼 시점은 모델이 done 으로 정하므로 step 번호를 하드코딩하지 않는다.
    prepareStep: ({ steps }) => {
      const signaled = steps.some((s) => s.toolCalls.some((c) => c.toolName === 'done'));
      const lastChance = steps.length >= MAX_STEPS - 1;   // 폭주 방지 안전장치
      return signaled || lastChance ? { toolChoice: 'none' } : { toolChoice: 'required' };
    },

    onStepFinish: (step) =>
      console.log(`  [step] finish=${step.finishReason} tools=[${step.toolCalls.map((c) => c.toolName)}]`),

    // Output Structure 강제 (환각 방지).
    // 문서 종류별로 스키마를 갈아끼우지 않고, 세 칸을 항상 열어두고 무관한 칸은 [] 로 둔다.
    // 질문이 문서 여러 개에 걸쳐도(예: 입고는 됐는데 송장이 안 온 건) 근거를 다 담을 수 있다.
    // count 는 넣지 않는다 — 모델이 세면 틀리므로 코드에서 .length 로 뽑는다.
    // 산문 필드(answer)도 두지 않는다 — 자유 텍스트 칸이 있으면 모델이 데이터를 배열 대신
    // 거기에 표로 써버리고 배열을 비운다. 쓸 곳이 배열뿐이어야 배열이 찬다.
    output: Output.object({
      schema: z.object({
        orders: z.array(PurchaseOrderSchema)
          .describe('답변에 관련된 구매 오더. 이 질문과 무관하면 빈 배열 [].'),
        invoices: z.array(InvoiceSchema)
          .describe('답변에 관련된 송장. 이 질문과 무관하면 빈 배열 [].'),
        goodsReceipts: z.array(GoodsReceiptSchema)
          .describe('답변에 관련된 입고 문서. 이 질문과 무관하면 빈 배열 [].'),
      }),
    }),
  });

    /*
    onStepFinish: (step) => {                          
      console.log(`\n── [step 종료] finish=${step.finishReason}`);
      console.log(`   호출 도구:`, step.toolCalls.map((c) => c.toolName));
      if (step.toolResults.length > 0) {
        console.log(`   도구 결과:`, JSON.stringify(step.toolResults.map((r) => r.output)));
      }
      if (step.text) console.log(`   생성 텍스트:`, step.text);
    },*/

  

  // ① 도구가 조회한 JSON 데이터 (사실, 근거)
  const toolData = r.steps
    .flatMap((s) => s.toolResults)
    .map((tr) => tr.output);


  // 최종 structured output (이게 진짜 결과)
  console.log('\n===== 최종 구조화 출력 =====');
  console.log('질문:', question);
  console.log(`건수: PO ${r.output.orders.length} / 송장 ${r.output.invoices.length} / 입고 ${r.output.goodsReceipts.length}`);
  console.log(JSON.stringify(r.output, null, 2));

  // step 흐름 확인
  console.log('\n===== step 흐름 =====');
  console.log('총 step:', r.steps.length);
  r.steps.forEach((s, i) =>
    console.log(`[step ${i+1}] finish=${s.finishReason} tools=${s.toolCalls.map(c => c.toolName)}`)
  );
  
    };

  


main().catch(console.error);