/**
 * 웹 입구. useChat 이 보낸 대화를 받아 runAgent 를 돌리고 조각을 그대로 응답으로 흘린다.
 * 서버는 대화를 기억하지 않는다. 브라우저가 매 요청 전체 이력을 보낸다(useChat 기본 동작). 저장은 뼈대 4.
 * Hono 판 (2026-10-07). 전 판은 node:http 로 길 분기·본문 읽기·JSON 응답을 손으로 썼다. 그 코드를 주석에 남겨 비교한다.
 *   npm run server
 */

/**
 * Hono: 웹 표준 Request/Response 로 일하는 작은 서버 틀. 길 등록(app.post)·본문 파싱(c.req.json)·응답(c.json) 을 대신한다.
 * 프레임워크 없이는: import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
 * 문서: https://hono.dev/docs/
 */
import { Hono } from 'hono';

/**
 * node 위에서 Hono 를 띄우는 어댑터. node 의 req/res 를 표준 Request/Response 로 바꿔 app.fetch 에 넘기고, 돌려받은 Response 를 res 에 쓴다.
 * 문서: https://hono.dev/docs/getting-started/nodejs
 */
import { serve } from '@hono/node-server';

/**
 * safeValidateUIMessages: 외부 입력 가드. 
 * convertToModelMessages: 화면용 → 모델용 변환. 
 * toUIMessageStream: 조각 변환. (브라우저에 다시 보내기 위함 )
 * createUIMessageStreamResponse: 조각 스트림을 표준 Response 로. (전 판의 pipeUIMessageStreamToResponse 자리)
 */
import { safeValidateUIMessages, convertToModelMessages, toUIMessageStream, createUIMessageStreamResponse } from 'ai';

import { runAgent } from './agent.js';

/** TODO: 포트 번호. 브라우저·curl 이 붙을 주소 */
const PORT = 9000;

/** TODO: 채팅 경로 글자. 뼈대 5 의 useChat api 옵션과 같아야 한다
 * http://127.0.0.1:9000/api/chat
 * └──────┬──────┘└─┬─┘└───┬───┘
 *    호스트        PORT   CHAT_PATH
 */
const CHAT_PATH = '/api/chat';

/** TODO: 모델·도구 오류가 났을 때 화면에 보여 줄 문구. 서버 내부 메시지·키가 브라우저로 새면 안 된다 */
const ERROR_TEXT = '모델 및 도구 사용에 실패하였습니다 다시 시도해주세용 ~~';

/**
 * ① 앱 하나. 길(route)을 여기 등록하고, 요청이 오면 맞는 핸들러를 찾아 부른다.
 * ② 프레임워크 없이는: createServer((req, res) => handle(req, res)) 에서 handle 안의 if 로 길을 가렸다.
 * ③ https://hono.dev/docs/api/hono
 */
const app = new Hono();

/**
 * 전 판에 있었고 지금은 없어진 함수 둘. Hono 가 대신한다.
 *
 *   async function readBody(req: IncomingMessage): Promise<string> {   → c.req.json()
 *     let text = '';
 *     for await (const chunk of req) text += chunk;
 *     return text;
 *   }
 *
 *   function sendJson(res: ServerResponse, status: number, body: unknown): void {   → c.json(body, status)
 *     res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
 *     res.end(JSON.stringify(body));
 *   }
 */

/**
 * ① 길 등록. POST /api/chat 만 이 핸들러로. 안 맞는 길(GET, 다른 경로)은 Hono 가 알아서 404.
 * ② 프레임워크 없이는:
 *      if (req.method !== 'POST' || req.url !== CHAT_PATH) { sendJson(res, 404, { error: '없는 길' }); return; }
 *    길이 늘 때마다 if 가 늘었다. Hono 는 app.get/post 한 줄씩.
 * ③ https://hono.dev/docs/api/routing
 *
 * c = Context. 전 판의 (req, res) 한 쌍이 객체 하나로 합쳐진 것. c.req 가 요청, 응답은 return 으로 돌려준다.
 * 흐름: 본문 파싱 → 가드 → 변환 → runAgent → 조각 변환 → Response 로.
 */
app.post(CHAT_PATH, async (c) => {
  /**
   * 학습용 로그. 전 판의 console.log('[req]', req.method, req.url, req.headers) 자리. 확인했으면 지운다.
   * c.req.path 는 경로만, c.req.header() 는 헤더 전부.
   */
  console.log('[req]', c.req.method, c.req.path, c.req.header());

  /**
   * ① 본문을 모아 JSON 으로 푼다. 깨진 JSON 은 throw 하니 TRY 로 감싼다. 결과는 타입이 없어 아래 가드가 본다.
   * ② 프레임워크 없이는: body = JSON.parse(await readBody(req)) — 조각을 for await 로 모으는 readBody 를 손으로 썼다.
   * ③ https://hono.dev/docs/api/request#json
   */
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    /**
     * ① JSON 응답을 돌려준다. 상태코드·헤더·본문 직렬화를 Hono 가 한다. return 으로 끝내야 밑으로 안 내려간다.
     * ② 프레임워크 없이는: sendJson(res, 400, {...}); return; — writeHead + end 를 res 에 직접 썼다.
     * ③ https://hono.dev/docs/api/context#json
     */
    return c.json({ error: 'JSON 이 아니다' }, 400);
  }
  if (typeof body !== 'object' || body === null) {
    return c.json({ error: '본문이 객체가 아니다' }, 400);
  }
  /** 외부 JSON 은 키만 글자로 확실하고 값은 뭔지 모른다. unknown 으로 받아 아래 가드를 강제한다 */
  const o = body as Record<string, unknown>;

  /** TODO: regenerate-message(답 다시 만들기)는 범위 밖. 막을지 허용할지 */
  if (o.trigger !== 'submit-message') {
    return c.json({ error: 'trigger 는 submit-message 만 받는다' }, 400);
  }

  /**
   * ① 브라우저가 보낸 messages 배열이 UIMessage 모양(id·role·parts)인지 검사한다.
   *    (tools 옵션을 주면 도구 part 의 input/output 까지 보는데 타입 맞추기가 번거로워 뺐다)
   * ② 안 쓰면: 엉뚱한 모양이 convertToModelMessages 까지 가서 거기서 터진다. 외부 입력이라 가드는 생략 불가.
   *    validateUIMessages 는 같은 일을 하되 실패 시 throw. 여기선 400 으로 답해야 하니 safe 판.
   * ③ https://ai-sdk.dev/docs/reference/ai-sdk-ui/validate-ui-messages
   */
  const validated = await safeValidateUIMessages({ messages: o.messages });
  if (!validated.success) {
    return c.json({ error: `messages 모양이 다르다: ${validated.error.message}` }, 400);
  }

  /**
   * ① 화면용 UIMessage(parts 배열) → 모델용 ModelMessage(role + content). 앞 턴의 도구 part 는 tool-call / tool-result 로 바뀌어
   *    모델이 "앞서 이걸 조회했다" 를 안다.
   * ② 안 쓰면: streamText 가 messages 모양이 다르다고 거절한다. async 라 await 필수.
   * ③ https://ai-sdk.dev/docs/reference/ai-sdk-ui/convert-to-model-messages
   */
  const modelMessages = await convertToModelMessages(validated.data);

  const result = runAgent(modelMessages);

  /**
   * ① 조각 스트림을 표준 Response 로 만든다. 헤더(text/event-stream)와 `data: {...}\n\n` 줄 변환을 SDK 가 한다.
   *    return 으로 돌려주면 @hono/node-server 가 그 Response 의 body 를 res 에 흘려보낸다.
   * ② 프레임워크 없이는: pipeUIMessageStreamToResponse({ response: res, stream }) — res 에 직접 썼다.
   *    같은 일을 "res 에 쓰기" 와 "Response 돌려주기" 로 하는 두 함수가 있고, 틀(Hono·Next.js)이 Response 를 받으니 이쪽.
   * ③ https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream-response
   */
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      /**
       * TODO: onError — 루프 안에서 throw 가 나면(모델 401·429·도구 밖 에러) 이 함수가 돌려준 글자가 error 조각으로 브라우저에 간다.
       * 기본값은 "An error occurred." 원인은 서버 터미널에만 찍고 화면엔 고정 문구만.
       */
      onError: (e) => {
        console.error('[web]', e instanceof Error ? e.message : String(e));
        return ERROR_TEXT;
      },
    }),
  });
});

/**
 * ① 핸들러 밖으로 샌 throw 를 마지막에 받는다. 안 받으면 요청 하나 실패로 서버가 죽는다.
 * ② 프레임워크 없이는: handle(req, res).catch((e) => sendJson(res, 500, {...})) — createServer 콜백에서 직접 붙였다.
 * ③ https://hono.dev/docs/api/hono#error-handling
 */
app.onError((e, c) => c.json({ error: e.message }, 500));

/**
 * ① 서버 열기. node 의 req/res 를 표준 Request 로 바꿔 app.fetch 에 넘기고, 돌려받은 Response 를 res 에 쓴다.
 *    hostname 127.0.0.1 = 이 PC 에서만 접속. 빼면 회사망의 다른 PC 도 붙는다.
 * ② 프레임워크 없이는: const server = createServer(...); server.listen(PORT, '127.0.0.1', () => console.log(...));
 * ③ https://hono.dev/docs/getting-started/nodejs
 */
const server = serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) =>
  console.log(`http://${info.address}:${info.port}${CHAT_PATH} 에서 대기`),
);

/**
 * Ctrl+C 로 끝낼 때. 열린 연결을 닫고 나간다. 뼈대 4 에서 DB close 가 여기 추가된다. (전 판과 같음)
 */
process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
