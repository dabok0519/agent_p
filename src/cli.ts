import { createInterface } from 'node:readline/promises';
import { ask } from './agent.js';

// 사람이 쓰는 진입점. 질문을 받아 ask() 에 넘기고 결과를 찍는다.
//   npm start
async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const question = (await rl.question('질문> ')).trim();
  rl.close();

  if (!question) {
    console.log('질문이 비어 있다.');
    return;
  }

  const { text, tools, steps } = await ask(question);

  console.log('\n===== 답변 =====');
  console.log(text);

  // 어떤 도구를 실제로 불렀는지가 답변 검증의 단서다.
  console.log('\n===== step 흐름 =====');
  console.log('총 step:', steps.length);
  steps.forEach((step, i) => {
    const names = step.toolCalls.map((call) => call.toolName);
    console.log(`[step ${i + 1}] finish=${step.finishReason} tools=${names}`);
  });
  console.log('호출한 도구:', tools.join(', ') || '(없음)');
}

main().catch(console.error);
