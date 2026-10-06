/**
 * 에이전트 공용 부분. main.ts(터미널)와 web/server.ts(웹)가 같이 쓴다.
 * main.ts 에서 떼어 냈다 (웹 UI 과제 2026-10-06). 화면 입출력(readline·console)은 여기 없다. 부르는 쪽이 한다.
 */

/**
 * 요청 함수와 OpenAI 도구 모양을 통신 담당 파일에서 가져온다. 상대 경로는 .js 확장자가 필요하다.
 * type 을 붙인 것은 값이 아니라 모양만 가져온다는 표시다.
 */
import { ask, type OpenAiTool } from './openrouter.js';

/**
 * MCP 클라이언트. 도구는 이제 이 프로세스 안(tools.ts)이 아니라 별도 서버 프로세스에 있다.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * 서버를 자식 프로세스로 띄우고 그 stdin/stdout 을 통로로 삼는다. 이 프로세스의 stdin/stdout 은 안 쓴다.
 */
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import type { openHistory, SessionRow } from './history.js';
import { runSupervisor, makeSupervisorSystem } from './supervisor.js';
import { makeWorkers, type Worker } from './workers.js';

/**
 * 이력 저장소 모양. openHistory 가 돌려주는 함수 묶음 그대로다.
 */
export type History = ReturnType<typeof openHistory>;

/**
 * 대화 하나. TYPES: BEGIN OF … END OF 처럼 모양만 적는다.
 * 전엔 main.ts 의 전역 변수 둘이었다. 묶어서 넘기면 대화를 여러 개 가질 수 있다 (CLI 는 하나, 웹은 브라우저 대화마다 하나).
 */
export type Chat = { messages: Record<string, unknown>[]; sessionId: number | null };

/**
 * MCP 서버 연결 + 부하 + 총괄 SYSTEM. 프로그램 시작 때 한 번. main.ts·web/server.ts 가 부른다.
 * 서버가 자식 프로세스로 뜨고 초기화 인사가 끝날 때까지 await 로 기다린다. 실행 명령은 mcp-check.ts 와 같다.
 * client 도 돌려준다. 끝날 때 close 해야 서버 자식 프로세스가 안 남는다.
 */
export async function connectAgent() {
  const client = new Client({ name: 'sap-agent', version: '0.1.0' });
  await client.connect(
    new StdioClientTransport({
      // MCP 서버를 자식 프로세스로 직접 띄우기 위해 command로 현재 파일 경로 제공 
      command: process.execPath,
      args: ['--import', 'tsx', 'src/mcp/server/index.ts'],
      /**
      * 부모 환경변수 전부 물려준다. SDK 기본은 PATH 등 12개만 넘겨서, VS Code 가 자식에 디버거를 붙이려고 심는 변수가 잘린다.
      * 없으면 mcp 서버(index.ts 밑) 중단점이 안 걸린다. 서버는 .env 를 직접 읽으니 동작엔 영향 없다.
      */

      env: process.env as Record<string, string>,
    }),
  );

  /**
   * 도구 목록을 서버에서 받아 OpenAI Compatiable 모양으로 바꾼다. 한 번만 받고 매 왕복마다 모델에게 같이 보낸다.
   * MCP { name, description, inputSchema } → OpenAI { type:'function', function:{ name, description, parameters } }.
   * description 은 규격상 없을 수 있어(?) ?? '' 로 빈 글자를 넣는다.
   */
  const list = await client.listTools();

  const mcpTools: OpenAiTool[] = list.tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema },
  }));

  /**
   * 부하 둘(구매·자재). 총괄이 이 목록으로 delegate 도구와 SYSTEM 을 만든다. 부르는 쪽은 부하를 직접 안 부른다.
   */
  const workers = makeWorkers(mcpTools, client);

  return { client, workers, system: makeSupervisorSystem(workers) };
}

/**
 * 새 대화. 이력 첫 줄은 총괄 SYSTEM. 세션 번호는 첫 질문이 성공할 때 만든다(null 이면 아직 없음).
 * 서버는 지난 대화를 기억하지 않아 이 배열을 매번 통째로 보낸다.
 * function newChat(system: string): Chat
 *             ─────┬────────  ──┬─
 *           들어오는 인자       돌려주는 값의 타입

 */
export function newChat(system: string): Chat {
  return { messages: [{ role: 'system', content: system }], sessionId: null };
}

/**
 * 첫 왕복이 끝난 뒤 제목 한 줄을 모델에게 짓게 한다. 도구 없이 부른다. 대화 이력은 안 넘기고 두 줄짜리 새 대화다.
 * 실패해도 throw 하지 않고 첫 질문 글자를 돌려준다. 제목 실패가 대화 실패가 되면 안 된다.
 */
async function makeTitle(question: string, answer: string): Promise<string> {
  try {
    const res = await ask([
      { role: 'system', content: ' 대화의 제목을 한국어 명사구 15자 이내로, 따옴표·마침표 없이 한 줄만 답한다.' },
      /** 답은 앞 500자만. 제목엔 그만큼이면 충분하고 토큰을 아낀다
       * 사용자의 질문 + runagent의 결과 제공
      */
      { role: 'user', content: `질문: ${question}\n답: ${answer.slice(0, 500)}` },
    ]);
    /** 모델이 따옴표나 줄바꿈을 섞어도 한 줄로 만든다. 30자 넘으면 자른다 */
    const raw = res.choices[0]?.message.content ?? '';
    const title = raw.replace(/["'\n]/g, '').trim().slice(0, 30);
    //ask 결과 제목을 생성해주지 않은 경우 question으로 지정
    return title || question;
  } catch {
    return question;
  }
}

/**
 * 고른 세션의 메시지를 대화 이력에 붙이고, 그 세션에 이어 쓴다 (sessionId 를 그 번호로).
 * 이후 질문은 askChat 저장 자리의 else 갈래로 가서 이 세션 뒤에 붙는다. 새 세션은 안 생긴다.
 * 불러온 메시지 개수를 돌려준다. 찍는 건 부르는 쪽이 한다.
 */
export function loadInto(chat: Chat, chosen: SessionRow, history: History): number {
  chat.sessionId = chosen.id;
  const loaded = history.loadMessages(chosen.id);
  // 기존 message 변수와 연결되는 곳
  chat.messages.push(...loaded);
  /**
   * 경계 표시. 옛 것 뒤·새 것 앞에 두어 모델이 어디까지가 불러온 이력인지 알게 한다. system 이라 사용자 발언으로 안 보인다.
   * DB 에는 안 넣는다(저장 때 system 을 거른다). 불러올 때마다 여기서 새로 넣는다.
   */
  chat.messages.push({ role: 'system', content: '위 대화는 이전 세션에서 불러온 이력이다. 사용자가 "이전 세션" 이라고 하면 위 내용을 말한다.' });
  return loaded.length;
}

/**
 * 질문 하나 처리: 이력에 넣고 → 총괄(Supervisor) 돌리고 → DB 저장. 실패하면 이력을 되돌리고 throw 를 그대로 올려 보낸다.
 * 화면에 찍는 건 부르는 쪽(main.ts 는 console, web/server.ts 는 응답)이 한다.
 */
export async function askChat(chat: Chat, question: string, workers: Worker[], history: History): Promise<{ answer: string; trace: string[] }> {
  /**
   * 이 질문 전의 이력 길이. 실패하면 여기까지 되돌린다.
   */
  const before = chat.messages.length;

  chat.messages.push({ role: 'user', content: question });

  /**
   * TRY…CATCH…ENDTRY. runSupervisor·저장 안의 throw 를 받아 되돌린 뒤 다시 던진다.
   * 안 되돌리면 결과 없는 도구 요청이 남아 다음 질문까지 서버가 거절한다.
   */
  try {
    const { answer, trace } = await runSupervisor(chat.messages, workers);

    /**
     * 저장은 여기 한 곳. 실패는 catch 에서 배열을 되돌리니 DB 에 안 간다.
     * 새 세션의 첫 성공이면 세션을 만들고 SYSTEM 을 뺀 배열 전부를 넣고 제목을 짓는다.
     * 불러온 세션이거나 두 번째 질문부터는 이번 질문에서 쌓인 것(before 이후)만 이어 넣는다.
     */
    if (chat.sessionId === null) {
      chat.sessionId = history.createSession();
      /** system 은 저장 안 한다. 맨 위 SYSTEM 과 경계 표시는 코드가 매번 넣는다 */
      history.appendMessages(chat.sessionId, chat.messages.slice(1).filter((m) => m.role !== 'system')); // slice(n) : n 자리부터 끝까지
      history.setTitle(chat.sessionId, await makeTitle(question, answer));
    }
    else {
      history.appendMessages(chat.sessionId, chat.messages.slice(before));
    }

    return { answer, trace };
  } catch (e) {
    /**
     * ROLLBACK WORK. 실패한 질문에서 쌓인 것을 전부 잘라 낸다.
     */
    chat.messages.length = before;
    throw e;
  }
}
