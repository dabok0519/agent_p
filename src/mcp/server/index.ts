/**
 * MCP 서버 뼈대. 고수준 McpServer. 도구를 registerTool 로 등록하면 목록·검사·호출을 SDK 가 맡는다.
 * 저수준 Server 는 deprecated 표시가 있어 손검사 단계를 끝낸 뒤 이걸로 바꿨다.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * stdio 통로. 이 프로세스의 stdin 으로 요청을 받고 stdout 으로 답한다.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * 스키마·설명·실행 함수. 논리는 전부 tools.ts 에 있고 이 파일은 등록과 통로만 한다.
 */
import {
  searchInputSchema,
  searchDescription,
  runSearchPurchaseOrders,
  detailsInputSchema,
  detailsDescription,
  runGetPurchaseOrderDetails,
} from './tools.js';

/**
 * 서버 하나. capabilities 인자가 없다. registerTool 을 부르면 SDK 가 "도구 제공" 을 알아서 선언한다.
 */
const server = new McpServer({ name: 'sap_search_mcp', version: 'v01' });

/**
 * 도구 등록. 이름·설명·스키마를 주면 tools/list 응답과 tools/call 검사를 SDK 가 만든다.
 * 콜백의 input 은 zod 검사를 통과한 값이라 타입이 붙어 있다. 검사 실패면 콜백이 안 불리고 SDK 가 InvalidParams 에러를 돌려준다.
 */
server.registerTool(
  'searchPurchaseOrders',
  { description: searchDescription, inputSchema: searchInputSchema },
  async (input) => {
    const result = await runSearchPurchaseOrders(input);
    /**
     * MCP 결과 모양. content 배열 안에 글자 한 덩어리. 우리 { ok, count, … } 를 글자로 바꿔 싣는다.
     * isError 는 실패 표시. 모델은 어차피 ok:false 를 읽으니 없어도 되지만 규격이라 붙인다.
     */
    return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok };
  },
);

server.registerTool(
  'getPurchaseOrderDetails',
  { description: detailsDescription, inputSchema: detailsInputSchema },
  async (input) => {
    const result = await runGetPurchaseOrderDetails(input);
    return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok };
  },
);

/**
 * stdin/stdout 을 통로로 열고 요청을 기다린다. 이 줄부터 프로세스가 안 끝난다.
 * 이 프로세스에서 console.log 는 금지다. stdout 이 프로토콜 통로라 한 줄만 섞여도 클라이언트가 파싱 에러로 끊는다. 디버그는 console.error.
 */
await server.connect(new StdioServerTransport());
