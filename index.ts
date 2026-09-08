import 'dotenv/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, tool, Output } from 'ai'; // output 추가 
import { z } from 'zod';

// ============================================================
// 1. OpenRouter 클라이언트
// ============================================================
const openrouter = createOpenRouter(); // apiKey 는 OPENROUTER_API_KEY 환경변수에서 자동으로 읽음

// ============================================================
// 2. 모델 + provider 필터링 
//    slug 바꿔가며 provider별로 검증한다:
//    - 'deepinfra/fp8' : tool + structured 둘 다 지원 → 성공해야 정상
//    - 'phala'         : structured_outputs 없음 → structured 실패/약화 예상 (대조군)
// ============================================================
const model = openrouter('qwen/qwen3.8-27b', { // :exacto -> exacto 자체가 도구 정확도 우선으로 OpenRouter가 알아서 provider를 고르는 라우팅 모드 
  extraBody: {
    provider: {
      only: [
        'reka/fp8', 'parasail/fp8', 'akashml/fp8', 'chutes/fp8',
        'ionstream/fp8', 'coreweave/fp8', 'venice/fp8', 'io-net/fp8',
      ],
      allow_fallbacks: false, // 지정 provider 안 되면 fallback 없이 에러 
    },
  },
});


// ============================================================
// 3. Mock 데이터 (실제 SAP EKKO 테이블 흉내)
// ============================================================
const MOCK_PURCHASE_ORDERS = [
  { poNumber: '4500000001', vendor: 'Siemens AG',    status: 'OPEN',      amount: 15000, currency: 'EUR' },
  { poNumber: '4500000002', vendor: 'Bosch',         status: 'OPEN',      amount:  8200, currency: 'EUR' },
  { poNumber: '4500000003', vendor: 'Hyundai Mobis', status: 'COMPLETED', amount: 42000, currency: 'KRW' },
  { poNumber: '4500000004', vendor: 'LG Chem',       status: 'BLOCKED',   amount:  3100, currency: 'KRW' },
  { poNumber: '4500000005', vendor: 'SAP SE',        status: 'OPEN',      amount:  9900, currency: 'EUR' },
];

// ============================================================
// 4. 도구: 구매 오더 검색 (main보다 위에 정의해야 함)
// ============================================================
const searchPurchaseOrders = tool({
  description: '구매 오더(Purchase Order) 목록을 조회한다. 상태(status)로 필터링할 수 있다.',
  inputSchema: z.object({ //object : 객체(필드 묶음) 형태의 스키마를 만드는 함수 
    status: z //  
      .enum(['OPEN', 'COMPLETED', 'BLOCKED']) // 메서드 체이닝 
      .optional()
      .describe('필터링할 구매 오더 상태. 생략하면 전체 조회.'), // 개별 인자(status)에 대한 설명
  }),
  execute: async ({ status }) => {
    console.log(`  [tool 실행] searchPurchaseOrders(status=${status ?? '전체'})`); // 널 병합 연산자 (로그만) 
    const result = status ? MOCK_PURCHASE_ORDERS.filter((po) => po.status === status) // 삼항 연산자
      : MOCK_PURCHASE_ORDERS; // status 없으면 전체 조회 
    return { count: result.length, orders: result };
  },
});

// ============================================================
// 검증 1: 이 provider가 tool call 을 하는가?
// ============================================================
async function verifyToolCall() {
  console.log(`\n========== [검증 1] tool call ==========`);
  try {
    const res = await generateText({
      model, 
      prompt: '현재 OPEN 상태인 구매 오더를 조회해줘.', // 테스트를 위한 임시 프롬프트
      tools: { searchPurchaseOrders }, // ← 객체로 등록 (배열 아님)
    });


    const calledTools = res.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
    if (calledTools.length > 0) {
      console.log(' tool call 성공 — 호출된 도구:', calledTools);
    } else {
      console.log(' 도구를 부르지 않음 (tool call 미지원 의심)');
    }
    console.log('최종 답변:', res.text);
  } catch (err) {
    console.log(' tool call 실패:', (err as Error).message);
  }
}

// ============================================================
// 검증 2: 이 provider가 structured output 을 하는가?
// ============================================================
async function verifyStructuredOutput() {
 console.log(`\n========== [검증 2] structured output ==========`);
  try {
    const res = await generateText({
      model,
      prompt:
        '다음 구매 오더를 JSON으로 정리해줘: 오더번호 4500000001, 공급업체 Siemens AG, 상태 OPEN, 금액 15000 EUR',
      output: Output.object({
        schema: z.object({
          poNumber: z.string().describe('구매 오더 번호'),
          vendor: z.string().describe('공급업체'),
          status: z.enum(['OPEN', 'COMPLETED', 'BLOCKED']).describe('상태'),
          amount: z.number().describe('금액'),
          currency: z.string().describe('통화'),
        }),
      }),
    });

    console.log('structured output 성공:');
    console.log(res.output);
  } catch (err) {
    console.log('structured output 실패:', (err as Error).message);
  }
}

// ============================================================
// 메인 — 검증 먼저
// ============================================================
async function main() {
  await verifyToolCall();
  await verifyStructuredOutput();
}

main().catch(console.error);

// ============================================================
// [학습 메모] ReAct loop 를 직접 구현하면 이런 모양 (선배 설명)
// AI SDK 의 stopWhen 이 아래 loop 를 자동으로 대신해준다.
// ------------------------------------------------------------
// let messages = [{ role: 'user', content: '현재 구매오더 찾아줘' }];
// for (let i = 0; i < 10; i++) {
//   const 응답 = await generateText({ system: '너는 유용한 에이전트다', messages, tools });
//   if (응답이 tool call 이면) {
//     const 결과 = 도구실행(파라미터);
//     messages.push(tool 결과);   // 결과를 대화에 추가하고 다시 loop
//   } else {
//     break;                      // 더 부를 도구 없으면 종료 (finish)
//   }
// }
// ============================================================