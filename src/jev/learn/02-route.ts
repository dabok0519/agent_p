/**
 * Jev 학습 2단계(라우팅). 코드 수정 없이 라우팅 질문 둘이 한국어 문장에 얼마나 먹는지 잰다.
 * 결과가 임계값 둘(ROUTE_MIN_CONFIDENCE, SELF_CONTAINED_MIN)의 근거가 된다.
 * 쓰는 법: npx tsx src/jev/learn/02-route.ts
 */
import 'dotenv/config';
import { TypeSafeClient, choice, noul } from '@typesafe-ai/sdk';

if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY 없음. .env 를 확인한다');

const client = new TypeSafeClient();

/**
 * 옵션 이름은 workers.ts 의 부하 이름과 같은 글자. 나중에 코드가 이 이름으로 부하를 찾는다.
 * what 은 workers.ts 의 description 그대로, not_for 는 상대 부하 영역.
 * 모델이 instructions 의 `userMessage` 를 보고 "state 에 그 이름의 칸이 있네" 하고 찾아 읽는다. 
 * 이건 TypeSafe 문서가 정한 약속(state 칸 참조는 백틱으로)
 */
const WORKER_QUESTION = choice('`userMessage` 을 처리할 담당은?', {
  '구매 조회 도우미': {
    what: '구매오더 헤더·품목 조회, 3-way match 검산. SAP 구매 데이터 질문(오더·발주·업체·송장·입고·검산)',
    not_for: '자재 마스터나 창고 재고 자체를 묻는 질문',
    examples: ['BP2100 오더 몇 건?', '4410000057 검산해줘', '오더 품목 보여줘'],
  },
  '자재 조회 도우미': {
    what: '자재 마스터(자재명·단위)와 창고별 가용재고 조회. SAP 자재·재고 질문',
    not_for: '구매오더·발주·송장처럼 거래를 묻는 질문',
  },
  없음: {
    what: '인사·날씨·일반 상식처럼 SAP 데이터가 필요 없는 질문',
    not_for: 'SAP 의 오더·자재·재고를 묻는 질문',
  },
});

/**
 * 앞 대화에 기대는 질문("그 업체", "아까 그거")은 Jev 가 이력을 못 보니 총괄에게 넘겨야 한다.
 * 이 값이 낮게 나와야 그 폴백이 성립한다.
 */
const SELF_CONTAINED_QUESTION = noul('`userMessage` 이 앞 대화를 몰라도 그 자체로 완결되는가?', {
  true: '질문 안에 업체코드·오더번호(44/45 로 시작하는 10자리)·자재명 같은 대상이 적혀 있거나, SAP 와 무관한 일반 질문이라 앞 대화가 필요 없다',
  false: '"그", "아까", "다시", "그거" 처럼 앞 대화를 가리키는 말이 있어 혼자서는 무엇을 묻는지 모른다',
});

/**
 * 문장 8개와 기대값. 확실한 것·후속 질문·애매한 것을 섞었다.
 */
const cases = [
  { text: 'BP2100 오더 몇 건?', worker: '구매 조회 도우미', self: true },
  { text: 'SMPS 자재 재고 알려줘', worker: '자재 조회 도우미', self: true },
  { text: '오늘 날씨 어때?', worker: '없음', self: true },
  { text: '그 업체 품목도 보여줘', worker: '구매 조회 도우미', self: false },
  { text: '아까 그거 다시', worker: '?', self: false },
  { text: 'SMPS 발주 내역', worker: '?', self: true },
  { text: '오더랑 재고 둘 다 알려줘', worker: '?', self: true },
  { text: '4410000057 검산해줘', worker: '구매 조회 도우미', self: true },
];

/**
 * 문장 하나 = 요청 하나, 그 안에 질문 둘(fan-out). 8개를 동시에.
 */
const rows = await Promise.all(
  cases.map(async (c) => {
    const { answers } = await client.systemOne({
      state: { userMessage: c.text },
      questions: { worker: WORKER_QUESTION, selfContained: SELF_CONTAINED_QUESTION },
    });
    const w = answers.worker;
    return {
      text: c.text,
      worker: w.choice,
      confidence: w.confidence.toFixed(2),
      기대worker: c.worker,
      worker맞음: c.worker === '?' ? '-' : w.choice === c.worker ? 'O' : 'X',
      selfContained: answers.selfContained.noul.toFixed(2),
      기대self: c.self,
    };
  }),
);

console.table(rows);
