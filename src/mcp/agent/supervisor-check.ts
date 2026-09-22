/**
 * 총괄만 따로 돌려보는 파일. graph-check.ts 와 같은 방식. readline·history 없이 runSupervisor 를 직접 부른다.
 * 모델 답은 매번 달라서 trace(어느 부하를 불렀나)와 답에 든 고정값만 확인한다.
 */
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { OpenAiTool } from './openrouter.js';
import { makeWorkers } from './workers.js';
import { runSupervisor, makeSupervisorSystem } from './supervisor.js';

/**
 * 서버 연결과 부하 만들기. main.ts 시작 부분과 같다.
 */
const client = new Client({ name: 'supervisor-check', version: '0.1.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/mcp/server/index.ts'],
    /** 부모 환경 전부. 없으면 VS Code 가 서버 자식 프로세스에 디버거를 못 붙인다 (main.ts 와 같은 이유) */
    env: process.env as Record<string, string>,
  }),
);
const list = await client.listTools();
const mcpTools: OpenAiTool[] = list.tools.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema },
}));
// 서브 에이전트 2개 생성 
const workers = makeWorkers(mcpTools, client);
const system = makeSupervisorSystem(workers);

/**
 * 질문 하나 = 새 이력. 질문끼리 섞이면 앞 질문의 부하 호출이 뒤에 영향을 준다.
 */
async function askSupervisor(question: string) {
  const messages: Record<string, unknown>[] = [
    { role: 'system', content: system },
    { role: 'user', content: question },
  ];
  return runSupervisor(messages, workers);
}

/**
 * ① 구매 질문 → 구매 부하 한 번. 답에 126 (BP2100 헤더 126건, sap-check 와 같은 값).
 */
const r1 = await askSupervisor('BP2100 오더 몇 건?');
assert.deepEqual(r1.trace, ['구매 조회 도우미']);
assert.match(r1.answer, /126/);
console.log('① 구매:', r1.trace, '|', r1.answer.slice(0, 80));

/**
 * ② SAP 과 무관 → 부하 없음.
 */
const r2 = await askSupervisor('오늘 날씨 어때?');
assert.deepEqual(r2.trace, []);
console.log('② 날씨:', r2.trace, '|', r2.answer.slice(0, 80));

/**
 * ③ 자재 질문 → 자재 부하 한 번. 질문에 없는 자재번호(SMPS 검색 결과 둘 중 하나)가 답에 있으면 실제로 조회한 것.
 */
const r3 = await askSupervisor('SMPS 자재 재고 알려줘');
assert.deepEqual(r3.trace, ['자재 조회 도우미']);
assert.match(r3.answer, /ST75P211A1|ML92A201563A/);
console.log('③ 자재:', r3.trace, '|', r3.answer.slice(0, 80));

await client.close();
