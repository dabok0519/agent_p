/**
 * 루프를 HTTP 없이 돌려 본다. LLM 실호출(비용). 조각이 흘러나오는 순서를 눈으로 본다.
 *   npx tsx src/web/agent-check.ts
 */

/**
 * toUIMessageStream: streamText 의 원시 조각을 useChat 규격 조각으로 바꾼다. server.ts 도 같은 걸 쓴다.
 */
import { toUIMessageStream } from 'ai';

import { runAgent } from './agent.js';

/** TODO: 도구를 부르게 되는 질문 하나 */
const QUESTION = '구매오더 3개만 찾아줘 ';

// StreamTextResult를 돌려줌 
const result = runAgent([{ role: 'user', content: QUESTION }]);

/**
 * ① 조각을 useChat 규격으로 바꾼다. 원시 판엔 없던 것 — 원시 판은 답 글자 하나만 돌려줬다.
 *    조각 종류: start → (tool-input-available → tool-output-available)* → text-start → text-delta×N → text-end → finish
 * ② 안 쓰면: result.stream 의 원시 조각(text-delta, tool-call, tool-result …)을 직접 읽어야 한다. 브라우저 규격이 아니라 server.ts 에선 못 쓴다.
 * ③ 문서: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
 */
/**
 * for await: 조각이 올 때마다 한 번씩 도는 LOOP. ABAP 에 없는 개념. 통로가 닫히면 끝난다.
 */
for await (const chunk of toUIMessageStream({ stream: result.stream })) {
  /** 글자 조각은 줄바꿈 없이 이어 찍어야 글자 스트리밍이 보인다. 나머지는 종류와 내용 한 줄 */
  if (chunk.type === 'text-delta') process.stdout.write(chunk.delta);
  else console.log(`\n[${chunk.type}]`, JSON.stringify(chunk).slice(0, 200));
}

console.log('\n--- finishReason:', await result.finishReason);
