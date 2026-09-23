/**
 * Jev 학습 1단계, 방식 2: SDK 없이 fetch 로 직접. 01-connect.ts 와 같은 state·질문을 OpenRouter 고유 주소로 보낸다.
 * 질문 객체({ type, instructions, criteria })를 손으로 쓴다. 헬퍼(choice·noul·score)가 만들어 주던 게 이 모양이다.
 * 쓰는 법: npx tsx src/jev/learn/01-fetch.ts
 */
import 'dotenv/config';

/**
 * API 키 가드. IF … IS INITIAL. MESSAGE … TYPE 'E'. 와 같다.
 * SDK 가 없으니 여기서 안 막으면 401 만 보고 원인을 못 찾는다.
 */
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY 없음. .env 를 확인한다');

const state = {
  row: { poNumber: '4410000057', itemNumber: 10, status: 'GR_PENDING', poQty: 10, grQty: 7, irQty: 0 },
  legend: { GR_PENDING: '입고 수량이 발주 수량보다 적다' },
};

/**
 * 질문 셋. 01-connect.ts 의 choice(…)·noul(…)·score(…) 가 돌려주던 객체를 그대로 적은 것.
 * type 글자가 틀리거나 criteria 모양(choice=객체, score=배열)이 틀려도 여기선 아무도 안 막는다. 서버가 422 로 돌려준다.
 */
const questions = {
  answer: {
    type: 'choice',
    instructions: '`row` 에 대한 조치는?',
    criteria: { 입고확인: '창고에 실제로 들어왔는지 확인', 송장보류: '송장 지급을 멈춤', 대기: '정상 진행 중' },
  },
  grMissing: { type: 'noul', instructions: '`row` 는 입고가 부족한 상태인가?' },
  urgency: { type: 'score', instructions: '`row` 의 처리 급한 정도', criteria: ['안 급함', '보통', '급함'] },
};

/**
 * 다른 시스템에 HTTP 요청. agent/openrouter.ts 의 ask 와 같은 모양인데 주소와 body 만 다르다.
 * 400·500 이 와도 에러가 안 나니 바로 아래에서 res.ok 를 본다. 제한시간은 SDK 가 주던 것이라 여기선 직접 건다.
 */
const res = await fetch('https://openrouter.ai/api/alpha/decisions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({ model: '~typesafe/jev-latest', state, questions }),
  signal: AbortSignal.timeout(10_000),
});

if (!res.ok) throw new Error(`OpenRouter 호출 실패 ${res.status}: ${await res.text()}`);

/**
 * 문자열 → 객체. 결과에 타입이 없어(unknown) 칸을 파기 전에 가드로 모양을 본다. SDK 는 이걸 대신 해 줬다.
 */
const json: unknown = await res.json();
if (typeof json !== 'object' || json === null || !('answers' in json)) {
  throw new Error(`응답 모양이 다르다: ${JSON.stringify(json)}`);
}

console.log(JSON.stringify(json, null, 2));
