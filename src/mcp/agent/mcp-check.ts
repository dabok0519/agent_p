/**
 * MCP 서버만 따로 돌려보는 파일. 모델은 안 부른다. check.ts 와 같은 성격.
 * 서버를 자식 프로세스로 띄우고 목록 하나 + 호출 셋을 한 뒤 닫는다.
 */

/**
 * 결과를 자동으로 맞춰 보는 node 내장 기능. 틀리면 그 자리에서 멈춘다. ABAP Unit 의 assert 와 같다.
 */
import assert from 'node:assert/strict';

/**
 * MCP 클라이언트. main.ts 가 5단계에서 쓰는 것과 같은 것이다.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * 서버를 자식 프로세스로 띄우고 그 stdin/stdout 을 통로로 삼는다.
 */
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * 서버 실행 명령. process.execPath 는 지금 도는 node 실행 파일 경로라 `node --import tsx 파일` 과 같다.
 * npx 는 Windows 에서 .cmd 라 자식 프로세스로 바로 못 띄워 node 를 직접 부른다.
 */
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', 'src/mcp/server/index.ts'],
});

const client = new Client({ name: 'mcp-check', version: '0.1.0' });

/**
 * 자식 프로세스를 띄우고 초기화 인사가 끝날 때까지 기다린다.
 */
await client.connect(transport);

/**
 * ① 목록. 이름 셋이 등록 순서로 오는가.
 */
// 도구 목록 요청
const list = await client.listTools();

assert.deepEqual(
  list.tools.map((t) => t.name),
  ['searchPurchaseOrders', 'getPurchaseOrderDetails', 'threeWayMatch'],
);
console.log('목록:', list.tools.map((t) => t.name).join(', '));

/**
 * 호출 결과에서 content[0].text 글자를 꺼낸다. main.ts 의 textOf 와 같다.
 */
function textOf(res: object): string {
  /** SDK 반환 타입이 { content } 또는 옛 규격 { toolResult } 둘 중 하나라 content 가 있는지부터 본다 */
  if (!('content' in res) || !Array.isArray(res.content)) throw new Error(`content 가 배열이 아니다 ${JSON.stringify(res)}`);
  const first: unknown = res.content[0];
  // context[0]이 우리가 정한 내용에 맞게 반환됐는지 검사
  if (typeof first !== 'object' || first === null || !('type' in first) || first.type !== 'text' || !('text' in first) || typeof first.text !== 'string') {
    throw new Error(`content[0] 이 text 가 아니다 ${JSON.stringify(res)}`);
  }
  return first.text;
}

/**
 * 그 글자를 우리 { ok, … } 객체로 푼다. 서버가 JSON.stringify 로 싼 것의 반대.
 */
function bodyOf(res: object): { ok: boolean; count?: number; reason?: string } {
  return JSON.parse(textOf(res));
}

/**
 * ② 정상 호출. check.ts 의 BP2100 건수(126)와 같아야 한다.
 */
const r1 = await client.callTool({ name: 'searchPurchaseOrders', arguments: { vendor: 'BP2100' } });
const b1 = bodyOf(r1);
assert.equal(b1.ok, true, `BP2100 실패: ${b1.reason}`);
// assert.equal : b1.ok가 참이여야 하고 참이 아니면 뒷 문장을 실행해라
console.log('BP2100:', b1.count, '건');

/**
 * ③ zod 검사가 MCP 너머에서 도는가. KRW 는 z.enum 에서 걸려 콜백까지 안 간다.
 * SDK 는 throw 하지 않고(server/mcp.js:135-142 에서 잡음) isError:true + text 에 에러 문구를 담은 정상 결과로 돌려준다.
 * text 가 우리 JSON 이 아니라 SDK 문구라 bodyOf 로 못 풀고 textOf 로 글자만 본다.
 */
const r2 = await client.callTool({ name: 'searchPurchaseOrders', arguments: { currency: 'KRW' } });
assert.equal('isError' in r2 && r2.isError, true, 'KRW 가 거절되지 않았다');
assert.match(textOf(r2), /currency/);
console.log('KRW:', textOf(r2));

/**
 * ④ 상세 전체 조회. 조건 없이 248건.
 */
const r3 = await client.callTool({ name: 'getPurchaseOrderDetails', arguments: {} });
const b3 = bodyOf(r3);
assert.equal(b3.ok, true, `상세 실패: ${b3.reason}`);
console.log('상세 전체:', b3.count, '건');

/**
 * 안 닫으면 자식 프로세스가 남아 프로그램이 안 끝난다.
 */
await client.close();
