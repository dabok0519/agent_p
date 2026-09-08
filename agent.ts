import 'dotenv/config';

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, tool, stepCountIs, Output } from 'ai';
import { z } from 'zod';

const openrouter = createOpenRouter();

// exacto = OpenRouter가 tool-calling 잘하는 provider를 자동 선택 (라우팅 모드)
const model = openrouter('qwen/qwen3.8-27b:exacto');

// Mock 데이터
const MOCK_PURCHASE_ORDERS = [
  { poNumber: '4500000001', vendor: 'Siemens AG',    status: 'OPEN',      amount: 15000, currency: 'EUR' },
  { poNumber: '4500000002', vendor: 'Bosch',         status: 'OPEN',      amount:  8200, currency: 'EUR' },
  { poNumber: '4500000003', vendor: 'Hyundai Mobis', status: 'COMPLETED', amount: 42000, currency: 'KRW' },
  { poNumber: '4500000004', vendor: 'LG Chem',       status: 'BLOCKED',   amount:  3100, currency: 'KRW' },
  { poNumber: '4500000005', vendor: 'SAP SE',        status: 'OPEN',      amount:  9900, currency: 'EUR' },
];

// 도구
const searchPurchaseOrders = tool({
  description: '구매 오더 목록을 조회한다. 상태(status)로 필터링할 수 있다.', // 도구에 대한 설명 
  inputSchema: z.object({
    status: z.enum(['OPEN', 'COMPLETED', 'BLOCKED']).optional()
      .describe('필터링할 구매 오더 상태. 생략하면 전체 조회.'), // 개별 인자에 대한 설명 
  }),
  execute: async ({ status }) => {
    console.log(`  [tool 실행] searchPurchaseOrders(status=${status ?? '전체'})`);
    const result = status
      ? MOCK_PURCHASE_ORDERS.filter((po) => po.status === status) // === : .equal() , po는 임시 변수 정의 
      : MOCK_PURCHASE_ORDERS;
    return { count: result.length, orders: result }; //굳이 JSON구조로 반환 안해도 될까 ( 자유 텍스트를 반환하지 않을 것 같음 )
  },
});

// agent 실행
async function main() {
  const r = await generateText({
    model,
    system: '너는 SAP 구매 프로세스 도우미다. 도구로 실제 데이터를 조회한 뒤 한국어로 정리해서 답한다.',
    prompt: '현재 OPEN 상태인 구매 오더를 조회해서 정리해줘.',
    tools: { searchPurchaseOrders },
    temperature: 0, 
    toolChoice: 'required',
    stopWhen: stepCountIs(5),
    output: Output.object({
      schema: z.object({
        count: z.number().describe('조회된 오더 건수'),
        orders: z.array( // 배열 안 객체
          z.object({  
            poNumber: z.string(),
            vendor: z.string(),
            status: z.enum(['OPEN', 'COMPLETED', 'BLOCKED']),
            amount: z.number(),
            currency: z.string(),
          }),
        ).describe('구매 오더 목록'),
      }),
    }),

    onStepFinish: (step) => {                          
      console.log(`\n── [step 종료] finish=${step.finishReason}`);
      console.log(`   호출 도구:`, step.toolCalls.map((c) => c.toolName));
      if (step.toolResults.length > 0) {
        console.log(`   도구 결과:`, JSON.stringify(step.toolResults.map((r) => r.output)));
      }
      if (step.text) console.log(`   생성 텍스트:`, step.text);
    },

  })

  console.log(`\n===== 최종 =====`);
  console.log(`총 step: ${r.steps.length}`)
  console.log(JSON.stringify(r.output, null, 2));
  };

  


main().catch(console.error);