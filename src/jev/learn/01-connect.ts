/**
 * Jev 학습 1단계. 연결만 확인한다. 질문 하나(Noul) 보내고 응답 JSON 을 통째로 본다.
 * 쓰는 법: .env 에 TYPESAFE_API_KEY (OpenRouter 키면 TYPESAFE_BASE_URL 도) → npx tsx src/jev/learn/01-connect.ts
 */

/**
 * .env 파일의 값을 프로그램 밖 설정값으로 읽어 들인다. 없으면 아래 가드에서 멈춘다.
 */
import 'dotenv/config';

/**
 * 다른 프로그램의 INCLUDE 처럼 SDK 에서 둘을 가져온다. TypeSafeClient = 요청 보내는 객체, noul = 예/아니오 질문 만들기.
 * 상대 경로가 아니라 패키지 이름이라 .js 확장자는 안 붙인다.
 */
import { TypeSafeClient, noul , choice , score } from '@typesafe-ai/sdk';

/**
 * API 키 가드. IF … IS INITIAL. MESSAGE … TYPE 'E'. 와 같다.
 * SDK 도 없으면 멈추지만, 그 문구는 영어라 여기서 먼저 우리말로 멈춘다.
 */
if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY 없음. .env 를 확인한다');

/**
 * 인자 없음. 키·주소는 SDK 가 .env(TYPESAFE_API_KEY, TYPESAFE_BASE_URL)에서 직접 읽는다.
 */
const client = new TypeSafeClient();

/** TODO: 판단 대상 글 한 줄 (예: 고객 문의 문장) */
const state = {
  row: { poNumber: '4410000057', itemNumber: 10, status: 'GR_PENDING', poQty: 10, grQty: 7, irQty: 0 },
  legend: { GR_PENDING: '입고 수량이 발주 수량보다 적다' },
};

/** TODO: 그 글에 대한 예/아니오 질문 한 줄 */
const question = '`row` 에 대한 조치는?'; 

/**
 * CALL FUNCTION 처럼 답이 올 때까지 기다린다. await 가 빠지면 답이 아니라 "나중에 준다"는 표(Promise, ABAP 에 없는 개념)만 온다.
 * 실패(401·422·시간 초과)는 SDK 가 throw 하므로 여기선 잡지 않고 그대로 멈춘다.
 */
const res = await client.systemOne({
  state,
  questions: {
    answer: choice(question, {                    // 첫 인자 = 질문, 두 번째 = 후보
      입고확인: '창고에 실제로 들어왔는지 확인',
      송장보류: '송장 지급을 멈춤',
      대기: '정상 진행 중',
    },),
    grMissing: noul('`row` 는 입고가 부족한 상태인가?'),
    urgency: score('`row` 의 처리 급한 정도', ['안 급함', '보통', '급함']),
  },
});

/**
 * 객체 → 문자열. 응답 모양(model·answers·usage)을 통째로 본다.
 */
console.log(JSON.stringify(res, null, 2));
