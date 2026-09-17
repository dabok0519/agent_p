/**
 * threeWayMatch 도구(안은 LangGraph)만 따로 돌려보는 파일. mcp-check.ts 와 같은 방식.
 * 바깥 모델은 안 부른다. 그래프 안 judge 노드의 LLM 호출은 실제로 나간다 (비용·시간 듦).
 */
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', 'src/mcp/server/index.ts'],
});
const client = new Client({ name: 'graph-check', version: '0.1.0' });
await client.connect(transport);

/**
 * 도구 결과 모양. match-graph.ts 의 ThreeWayMatchResult 와 같다. JSON 을 거쳐 오니 여기서 다시 적는다.
 */
type Result = {
  ok: boolean;
  reason?: string;
  count: number;
  summary: Record<string, number>;
  mismatches: { poNumber: string; itemNumber: number; status: string; action?: string; reason?: string }[];
  trace: string[];
};

/**
 * 호출 → content[0].text → 객체. mcp-check.ts 의 textOf + bodyOf 를 하나로.
 */
async function call(args: Record<string, unknown>): Promise<Result> {
  /**
   * 세 번째 인자가 요청 제한시간. 기본 60초. 실측 BP2100 이 321초(LLM 공급자가 느림)라 10분으로.
   */
  const res = await client.callTool({ name: 'threeWayMatch', arguments: args }, undefined, { timeout: 600_000 });
  if (!('content' in res) || !Array.isArray(res.content)) throw new Error(`content 가 배열이 아니다 ${JSON.stringify(res)}`);
  const first: unknown = res.content[0];
  if (typeof first !== 'object' || first === null || !('text' in first) || typeof first.text !== 'string') {
    throw new Error(`content[0] 이 text 가 아니다 ${JSON.stringify(res)}`);
  }
  return JSON.parse(first.text);
}

/** trace 에서 이름이 몇 번 나오나 */
const countOf = (trace: string[], name: string) => trace.filter((t) => t === name).length;

/**
 * ① 업체 하나. 헤더 126건 → 50씩 묶음 3번 → 불일치 있음 → judge.
 * action 이 붙은 줄은 넷 중 하나여야 한다. 몇 줄에 붙었는지는 LLM 답이라 assert 안 하고 찍기만.
 */
const r1 = await call({ vendor: 'BP2100', chunkSize: 50 });
assert.equal(r1.ok, true, `① 실패: ${r1.reason}`);
assert.equal(r1.count, 127); /** 오더 126 인데 4420000038 이 항목 둘이라 줄은 127 */
assert.equal(countOf(r1.trace, 'searchHeaders'), 1);
assert.equal(countOf(r1.trace, 'fetchChunk'), 3);
assert.ok(countOf(r1.trace, 'judge') >= 1, 'judge 가 안 돌았다');
const allowed = ['입고확인', '송장보류', '업체문의', '대기'];
for (const m of r1.mismatches) {
  if (m.action !== undefined) assert.ok(allowed.includes(m.action), `action 이 넷 밖: ${m.action}`);
}
const judged = r1.mismatches.filter((m) => m.action !== undefined).length;
console.log('① BP2100:', r1.count, '건', r1.summary, '| trace:', r1.trace.join('>'));
console.log('   불일치', r1.mismatches.length, '줄 중 action 붙음', judged, '| 첫 줄:', JSON.stringify(r1.mismatches[0]));

/**
 * ② 번호 하나(OK 만). 헤더 조회 없이 fetchChunk 한 번, 불일치 0 → judge 안 돎.
 */
const r2 = await call({ poNumbers: ['4410000023'] });
assert.equal(r2.ok, true, `② 실패: ${r2.reason}`);
assert.equal(r2.summary.OK, 1);
assert.equal(countOf(r2.trace, 'searchHeaders'), 0);
assert.equal(countOf(r2.trace, 'judge'), 0);
console.log('② 4410000023:', r2.summary, '| trace:', r2.trace.join('>'));

/**
 * ③ 없는 업체. 헤더 0건 → END, ok:false.
 */
const r3 = await call({ vendor: 'ZZZZ' });
assert.equal(r3.ok, false);
assert.deepEqual(r3.trace, ['searchHeaders']);
console.log('③ ZZZZ:', r3.reason, '| trace:', r3.trace.join('>'));

await client.close();
