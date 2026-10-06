/**
 * 웹 입구. main.ts(터미널)와 같은 일을 HTTP 로 한다. 알맹이는 session.ts 에 있고 여기는 요청·응답만 맡는다.
 * 뼈대 1 (2026-10-06): 질문 하나 받아 답하기까지. 세션 목록·불러오기는 뼈대 2.
 * 뼈대 3 (2026-10-06): 요청·응답을 useChat 규격(UI message stream)으로. 에이전트 쪽은 안 바뀐다.
 */

/**
 * HTTP 서버를 여는 node 내장 기능. 외부 패키지 없이 요청을 받을 수 있다.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

/**
 * AI SDK. 답을 useChat 이 읽는 조각 스트림으로 포장해 보낸다. LLM 호출엔 안 쓴다(그건 openrouter.ts 가 fetch 로).
 * createUIMessageStream = 조각을 담는 통, pipeUIMessageStreamToResponse = 통을 res 에 흘려보내기.
 */
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';

/**
 * 이력 저장소(SQLite). main.ts 와 같은 파일을 쓴다.
 */
import { openHistory } from '../history.js';

/**
 * 에이전트 공용 부분. 한 단계 위 폴더라 ../ 다.
 */
import { connectAgent, newChat, askChat, type Chat } from '../session.js';

/**
 * MCP 서버 연결. 프로그램 시작 때 한 번. 브라우저가 몇 개 붙어도 이 연결 하나를 같이 쓴다.
 */
const { client, workers, system } = await connectAgent();

/** TODO: DB 파일 경로. main.ts 와 같은 값이어야 터미널에서 쌓은 세션이 웹에서도 보인다 (src/mcp/agent/main.ts) */
const history = openHistory('agent-history.db');

/** TODO: 답 글자 조각의 id. text-start·delta·end 셋이 같은 글 덩어리임을 이 값으로 묶는다. 아무 글자나 된다 */
const TEXT_ID = 'answer';

/** TODO: 화면에 보여 줄 오류 문구. 서버 내부 메시지·키가 브라우저로 새면 안 되니 고정 문구 하나 */
const ERROR_TEXT = '답변에 실패했습니다. 다시 시도해 주세요.';

/**
 * 대화 표. 내부 테이블에 READ TABLE … WITH KEY 하는 것과 같다. 키 → Chat.
 * 터미널은 chat 변수 하나였다. 웹은 브라우저마다 채팅 하나라 표가 필요하다. 서버를 끄면 비고 DB 만 남는다.
 */
const chats = new Map<string, Chat>();

/**
 * 요청 본문을 글자로 모은다. 본문은 조각으로 나뉘어 오므로 다 올 때까지 기다린다.
 * ABAP 에 없는 개념. for await 는 조각이 올 때마다 한 번씩 도는 LOOP 다.
 */
async function readBody(req: IncomingMessage): Promise<string> {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text;
}

/**
 * JSON 응답 한 번에 보내기. 상태코드·헤더·본문을 같이 쓴다. 응답마다 반복되는 세 줄을 묶었다.
 * 뼈대 3 부터 정상 답은 스트림으로 가고, 여기는 404·400 같은 거절에만 쓴다.
 * HTTP/1.1 400 Bad Request                         ← writeHead 의 status
 * Content-Type: application/json; charset=utf-8    ← writeHead 의 둘째 인자
 *                                                 ← 빈 줄 (머리 끝)
 * {"error":"..."}                                  ← end 의 인자
 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/**
 * 요청 본문에서 꺼낸 것. id 는 브라우저(useChat)가 정하는 대화 번호. 같은 id 로 보내면 같은 대화에 이어진다.
 * question 은 useChat 이 보낸 messages 배열의 마지막 user 메시지 글자. 앞 메시지들은 버린다(이력 정본은 서버 Map).
 */
type AskBody = { id: string; question: string };

/**
 * useChat 이 보내는 모양: 
 * { id, 
 * trigger, 
 * messages: [{ role, parts: [{ type: 'text', text }] }] 
 * trigger , 
 * messageId  // regenerate 일 때만 값이 있음
 * }.
 * JSON.parse 결과는 타입이 없어 모양을 손으로 본다. 맞으면 AskBody, 틀리면 null.
 * 가드를 안 두면 question 이 없는 요청이 askChat 까지 가서 모델에게 빈 질문이 간다.
 */
function parseAskBody(text: string): AskBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  /** 외부 JSON 은 키만 글자로 확실하고 값은 뭔지 모른다. unknown 으로 받아 아래 typeof 가드를 강제한다 */
  const o = parsed as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.trim()) return null;

  /**
   * TODO: trigger 가 'regenerate-message'(답 다시 만들기)면 어떻게 할지. 지금은 막는다(null → 400).
   * 'submit-message' : 사용자가 새 메시지를 보낼 때 (보통 이것)
   * 'regenerate-message' : 마지막 답을 다시 생성할 때. messageId에 다시 만들 메시지 id가 같이 옴
   * 허용하려면 마지막 assistant 를 이력에서 빼고 다시 돌려야 해서 뼈대가 커진다.
   */
  if (o.trigger !== 'submit-message') return null;

  /**
   * 마지막 메시지 = 방금 친 질문. READ TABLE … INDEX lines( ) 와 같다. 배열이 비면 undefined 라 가드.
   */
  if (!Array.isArray(o.messages)) return null;
  const last: unknown = o.messages[o.messages.length - 1];
  if (typeof last !== 'object' || last === null) return null;
  // m: last와 같은 원소. 객체임을 확인한 뒤 칸을 읽을 수 있게 타입만 바꾼 것.
  // 객체임을 확인해야 
  const m = last as Record<string, unknown>;
  if (m.role !== 'user' || !Array.isArray(m.parts)) return null;

  /**
   * parts 중 type:'text' 인 조각의 text 를 이어 붙인다. 보통 하나지만 규격상 여러 개일 수 있다.
   */
  let question = '';
  for (const p of m.parts as unknown[]) {
    if (typeof p !== 'object' || p === null) continue;
    const part = p as Record<string, unknown>;
    if (part.type === 'text' && typeof part.text === 'string') question += part.text;
  }
  if (!question.trim()) return null;

  return { id: o.id, question };
}

/**
 * 요청 하나 처리. 터미널 while 문 안쪽 한 바퀴와 같다. 길은 하나뿐이다: POST /ask.
 * res는 응답 내용이 아니라 "요청을 보낸 브라우저로 통하는 통로"라서,
 * node가 연결마다 만들어 준 것(res, req 한쌍) 을 받아 거기에 써야 한다.
 * 흐름: 길 확인 → 본문 읽기 → 모양 가드 → 대화 찾기(없으면 새로) → askChat → 조각 스트림 응답.
 */
async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST' || req.url !== '/ask') {
    sendJson(res, 404, { error: '없는 길' });
    return;
  }

  const body = parseAskBody(await readBody(req));
  if (!body) {
    sendJson(res, 400, { error: '본문은 useChat 모양 { id, trigger:"submit-message", messages:[…, { role:"user", parts:[{ type:"text", text }] }] } 이어야 한다' });
    return;
  }

  /**
   * 대화 찾기. 표에 있으면 꺼내고, 없으면 새 대화를 만들어 넣는다. 터미널의 newChat(system) 한 줄이 여기선 표 한 칸이다.
   * ponytail: 서버를 재시작하면 표가 비어있어서 ( map은 메모리에만 존재 )
   * 같은 id 가 새 대화가 된다(DB 엔 남음). 필요하면 id ↔ sessionId 연결을 DB 에 저장.
   */
  let chat = chats.get(body.id);
  if (!chat) {
    chat = newChat(system);
    chats.set(body.id, chat);
  }
  const current = chat;

  /**
   * 조각 스트림. execute 안에서 writer.write 로 조각을 하나씩 넣으면 SDK 가 start·finish 를 앞뒤에 붙여 준다.
   * 답은 한 번에 나오므로 text-delta 한 조각에 답 전체를 싣는다. 글자 단위 스트리밍이 아니다.
   */
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const { answer, trace } = await askChat(current, body.question, workers, history);

      /** TODO: data 조각 이름. 'data-' 뒤 글자가 화면(useChat)에서 part.type 으로 보인다. 화면 쪽과 같은 이름이어야 한다 */
      writer.write({ type: 'data-route', data: trace });

      writer.write({ type: 'text-start', id: TEXT_ID });
      writer.write({ type: 'text-delta', id: TEXT_ID, delta: answer });
      writer.write({ type: 'text-end', id: TEXT_ID });
    },
    /**
     * execute 안의 throw 를 여기서 받는다. 돌려준 글자가 error 조각으로 브라우저에 간다. 전 뼈대의 catch → 500 자리.
     * askChat 은 던지기 전에 이력을 이미 되돌렸다. 원인은 서버 터미널에만 찍고 화면엔 고정 문구만.
     */
    onError: (e) => {
      console.error(`[web] ${e instanceof Error ? e.message : String(e)}`);
      return ERROR_TEXT;
    },
  });

  /**
   * 통 안 조각을 data: … 줄(SSE)로 바꿔 res 에 흘린다. 헤더(text/event-stream)와 끝맺음까지 SDK 가 한다.
   */
  pipeUIMessageStreamToResponse({ response: res, stream });
}

/** TODO: 포트 번호. 브라우저·curl 이 붙을 주소 */
const port = 3000;

/**
 * 서버 열기. 요청이 올 때마다 handle 이 한 번씩 불린다. 터미널의 while 문 자리다.
 * createServer로 서버를 열고 listen으로 포트가 붙는다.
 * 요청이 들어올때마다 handle(req, res) 가 호출된다.
 */
const server = createServer((req, res) => {
  /** handle 안의 throw 가 밖으로 새면 서버가 죽는다. 여기서 마지막으로 받는다 */
  handle(req, res).catch((e) => sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) }));
});
/** 127.0.0.1 = 이 PC 에서만 접속. 빼면 회사망의 다른 PC 도 붙는다 */
server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/ask 에서 대기`));

/**
 * Ctrl+C 로 끝낼 때. 터미널 버전의 마지막 세 줄과 같다. 안 닫으면 MCP 서버 자식 프로세스가 남는다.
 */
process.on('SIGINT', async () => {
  server.close();
  history.close();
  await client.close();
  process.exit(0);
});
