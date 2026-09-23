/**
 * Jev 학습 1단계, 방식 3: OpenRouter 자체 SDK(@openrouter/sdk). 01-fetch.ts 와 같은 주소(/api/alpha/decisions)로 보내되
 * 주소·헤더·재시도·응답 검사를 SDK 가 대신한다. 질문 객체는 fetch 방식처럼 손으로 쓴다(헬퍼 없음).
 * 쓰는 법: npx tsx src/jev/learn/01-openrouter-sdk.ts
 */
import 'dotenv/config';

/**
 * 다른 프로그램의 INCLUDE 처럼 OpenRouter SDK 에서 클라이언트 하나를 가져온다. 패키지 이름이라 .js 는 안 붙인다.
 */
import { OpenRouter } from '@openrouter/sdk';

/**
 * API 키 가드. IF … IS INITIAL. MESSAGE … TYPE 'E'. 와 같다.
 * 이 SDK 도 OPENROUTER_API_KEY 를 스스로 읽지만, 없을 때 문구가 영어라 여기서 먼저 막는다.
 */
if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY 없음. .env 를 확인한다');

const openrouter = new OpenRouter();

const state = {
  row: { poNumber: '4410000057', itemNumber: 10, status: 'GR_PENDING', poQty: 10, grQty: 7, irQty: 0 },
  legend: { GR_PENDING: '입고 수량이 발주 수량보다 적다' },
};

/**
 * CALL FUNCTION 처럼 답이 올 때까지 기다린다. 실패는 SDK 가 throw 하므로 여기선 잡지 않는다.
 * 요청 모양이 decisionsRequest 로 한 겹 싸여 있는 게 TypeSafe SDK 와 다른 점. 안의 JSON 은 01-fetch.ts 의 body 와 같다.
 * type 이 'choice' 인데 criteria 를 배열로 주면 SDK 타입 검사에서 빨간 줄이 난다(fetch 방식엔 그 검사가 없다).
 */
const res = await openrouter.alpha.decisions.create({
  decisionsRequest: {
    model: '~typesafe/jev-latest',
    state,
    questions: {
      answer: {
        type: 'choice',
        instructions: '`row` 에 대한 조치는?',
        criteria: { 입고확인: '창고에 실제로 들어왔는지 확인', 송장보류: '송장 지급을 멈춤', 대기: '정상 진행 중' },
      },
      grMissing: { type: 'noul', instructions: '`row` 는 입고가 부족한 상태인가?' },
      urgency: { type: 'score', instructions: '`row` 의 처리 급한 정도', criteria: ['안 급함', '보통', '급함'] },
    },
  },
});

console.log(JSON.stringify(res, null, 2));

/**
 * 칸을 꺼내 쓸 때. 답 타입이 "셋 중 하나" 로만 오고 질문 이름과 안 묶여 있어, type 가드로 어느 것인지 먼저 가른다.
 * TypeSafe SDK 는 질문에서 답 타입을 추론해 이 가드가 필요 없었다. 그게 두 SDK 의 가장 큰 차이다.
 */
const a = res.answers.answer;
if (a !== undefined && a.type === 'choice') console.log('고른 것:', a.choice, '확신:', a.confidence);
