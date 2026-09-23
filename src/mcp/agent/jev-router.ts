/**
 * Jev 라우터. 사용자 문장 하나를 받아 Jev 를 한 번 부르고 값 셋을 돌려준다.
 * 임계값 판단과 실패 처리(폴백)는 여기서 안 한다. supervisor.ts 가 한다. 조회와 판단을 분리.
 */
import 'dotenv/config';
import { TypeSafeClient } from '@typesafe-ai/sdk';

/**
 * 질문 둘은 상수 파일에서. 문구·임계값을 고칠 자리는 거기 하나다.
 */
import { WORKER_QUESTION, SELF_CONTAINED_QUESTION } from './jev-questions.js';

if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY 없음. .env 를 확인한다');

const client = new TypeSafeClient();

/**
 * 결과 모양. worker 는 WORKER_QUESTION 의 옵션 이름 중 하나, 나머지 둘은 0~1 숫자.
 */
export type Route = { worker: string; confidence: number; selfContained: number };

/**
 * supervisor.ts 가 runToolLoop 직전에 부른다.
 * 질문 둘을 한 요청에(fan-out). 이력은 안 보낸다. Jev 가 못 쓰고 잡음만 된다.
 * 실패(401·429·timeout)는 SDK 가 throw 하고 그대로 올라간다. 잡는 건 호출한 쪽.
 */
export async function routeQuestion(userMessage: string): Promise<Route> {
  const { answers } = await client.systemOne({
    state: { userMessage },
    questions: { worker: WORKER_QUESTION, selfContained: SELF_CONTAINED_QUESTION },
  });
  return {
    worker: answers.worker.choice,
    confidence: answers.worker.confidence,
    selfContained: answers.selfContained.noul,
  };
}
