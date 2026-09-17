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

/**
 * 터미널에서 한 줄 입력을 받는 node 내장 기능. promises 판이라 await 로 기다릴 수 있다.
 */
import { createInterface } from 'node:readline/promises';

/**
 * 대화 이력 저장소(SQLite). 세션 목록·불러오기·저장.
 */
import { openHistory, type SessionRow } from './history.js';

/**
 * 모델에게 미리 주는 지시. 질문보다 앞에 둬야 그 뒤 전부에 적용된다.
 * 여러 줄을 줄바꿈으로 이어 한 덩어리 글자로 만든다.
 */
const SYSTEM = [
  '너는 SAP 구매 오더 조회 도우미다. 도구로 데이터를 조회하고, 그 결과만으로 한국어로 정리해서 답한다.',
  '답에 쓰는 값은 도구가 반환한 결과에서 가져온다. 기억이나 추측으로 채우지 마라.',
  '조회하지 않은 대상을 "없다"고 단정하지 마라. 확인이 필요하면 도구를 먼저 불러라.',
  '필요한 데이터를 다 모으기 전에 결론을 내지 마라. 부분 조회 상태로 답하지 마라.',
  '도구의 정보를 보고 사용자의 응답에 답하기 힘든 경우 사용자에게 다시 정확한 값을 되묻는다.',
  '구매오더 번호는 44 또는 45로 시작하는 10자리다(4410000000, 4420000008). 번호는 반드시 글자로 넣는다.',
  /** TODO: 공급업체가 이름이 아니라 코드(BP2100)라는 것. 이름으로 물어오면 어떻게 하라고 할지 */
  '공급업체(Vendor) 코드는 BP로 시작하며 , BP나 숫자가 아닌 이름으로 공급업체를 물을 시 사용자에게 이름은 존재하지 않는다고 반환한다. ',
  '구매 오더 세부 항목은 구매 오더 헤더의 정보를 가지지 않는다. 구매 오더 헤더의 정보를 사용자가 물어볼 시 구매오더 조회 도구를 사용한다. ',
  '도구는 셋이다. 헤더(poNumber·companyCode·vendor·orderDate·currency)는 searchPurchaseOrders, 품목(itemNumber·material·quantity)은 getPurchaseOrderDetails, 발주·입고·송장 대조(3-way match, 검산, 불일치, 입고·송장 확인)는 threeWayMatch.',
  '구매 오더의 번호를 모르면 searchPurchaseOrders 로 번호를 얻는다. 번호를 알면 바로 getPurchaseOrderDetails.',
  'threeWayMatch 는 업체·회사코드·번호 중 아는 것만 넣어 한 번에 부른다. 번호를 먼저 찾을 필요 없다. 결과의 summary(상태별 건수)와 mismatches(불일치 줄, action·reason)로 답한다. 오래 걸리니 한 번만 부른다.',
].join('\n');

/**
 * MCP 서버 연결. 프로그램 시작 때 한 번. 서버가 자식 프로세스로 뜨고 초기화 인사가 끝날 때까지 기다린다.
 * 실행 명령은 mcp-check.ts 와 같다.
 */
const client = new Client({ name: 'sap-agent', version: '0.1.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/mcp/server/index.ts'],
  }),
);

/**
 * 도구 목록을 서버에서 받아 OpenAI Compatiable 모양으로 바꾼다. 한 번만 받고 매 왕복마다 모델에게 같이 보낸다.
 * MCP { name, description, inputSchema } → OpenAI { type:'function', function:{ name, description, parameters } }.
 * description 은 규격상 없을 수 있어(?) ?? '' 로 빈 글자를 넣는다.
 */
const list = await client.listTools();


const tools: OpenAiTool[] = list.tools.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema },
}));

/**
 * 대화 이력. 왕복할 때마다 여기에 쌓아서 통째로 다시 보낸다.
 * 서버는 지난 대화를 기억하지 않아 매번 전부 실어 보내야 한다.
 */
const messages: Record<string, unknown>[] = [
  { role: 'system', content: SYSTEM },
];

/** 최대 왕복 횟수. 모델이 끝을 안 내면 여기서 끊는다 */
const MAX_STEPS = 20;

/**
 * 질문 하나에 대한 도구 왕복 전체. 이력을 받아 답이 나올 때까지 돌고 답 글자를 돌려준다.
 * 이력은 밖에서 만들어 넘기므로 부를 때마다 이어진다.
 */
async function runAgent(messages: Record<string, unknown>[]): Promise<string> {
  /**
   * 최종 답변을 담을 자리. 반복문이 끝난 뒤 나왔는지 확인한다.
   */
  let answer: string | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await ask(messages, tools);

    /**
     * READ TABLE 뒤 sy-subrc 확인과 같다. 못 찾으면 값이 없는 상태가 온다.
     */
    const choice = res.choices[0];
    if (!choice) {
      throw new Error('응답에 답변 칸이 없다');
    }
    const calls = choice.message.tool_calls;

    /**
     * 종료 판단은 finish_reason 으로 한다. stop 이면 답이 끝난 것이다.
     * 전에는 tool_calls 유무로 봤는데, 그러면 length(잘림)·error 도 답으로 오인한다.
     */
    if (choice.finish_reason === 'stop') {
      /**
       * 답도 이력에 남긴다. 안 남기면 다음 질문 때 모델이 자기가 뭐라 답했는지 모른다.
       */
      messages.push(choice.message);
      answer = choice.message.content;
      console.log(`[provider] ${res.provider}`);
      break;
    }

    /**
     * stop 도 tool_calls 도 아니면(length·error·모르는 값) 답이 아니다. 잘린 글을 답으로 찍지 않게 멈춘다.
     * || !calls 는 논리가 아니라 타입용이다. tool_calls 칸이 ? 라 있다고 확인해야 아래 for 가 컴파일된다.
     */
    if (choice.finish_reason !== 'tool_calls' || !calls) {
      /** 사유를 같이 싣는다. error 일 때 공급자가 choice 안에 error 칸으로 이유를 준다. 없으면 이 문구만으로는 원인을 못 찾는다 */
      throw new Error(`모델이 끝내지 못했다: finish_reason=${choice.finish_reason} ${JSON.stringify(choice).slice(0, 500)}`);
    }

    /**
     * 모델이 "도구를 불러 달라"고 한 그 발언을 이력에 그대로 남긴다.
     * 빼면 다음 요청에서 도구 결과가 어디에 딸린 것인지 서버가 모른다.
     */
    messages.push(choice.message);

    /**
     * LOOP AT 처럼 요청 하나하나를 돈다.
     * 결과를 하나라도 빠뜨리면 서버가 짝이 안 맞는다며 거절한다.
     */
    for (const call of calls) {
      /**
       * 모델의 arguments 는 글자다. 서버는 객체를 받으니 여기서 푼다. 옛 tools.ts 의 parseObject 앞 절반이 이 자리로 왔다.
       * JSON.parse 는 규격 밖 글자에 멈추므로 TRY 로 감싸고, 실패면 null 로 두어 아래 가드가 잡게 한다.
       */
      let args: unknown = null;
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        args = null;
      }

      /**
       * 객체 가드. 배열·글자·null 이면 서버에 안 보내고 실패를 값으로 이력에 넣는다. 모델이 읽고 다시 시도한다.
       * continue 는 LOOP 의 다음 줄로 건너뛰기다.
       * // args의 type 확정 
       */
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, reason: `인자가 객체가 아니다: ${call.function.arguments}` }),
        });
        continue;
      }

      /**
       * callTool 의 arguments 타입(type)은 "키가 글자인 객체" 라서 object 를 그대로 못 넣는다.
       * { ...args } 로 칸을 전부 펼쳐 새 객체를 만들면 그 모양이 된다. 
       * Record<string, unknown> == mcp sdk에서 인자값의 형태를 미리 정의해뒀기 때문에 이에 한 번 맞추는게 좋음 
       * 없어도 문제는 x 
       */
      const argsRecord: Record<string, unknown> = { ...args };

      /**
       * MCP 서버에 실행 요청. server/index.ts → tools.ts → sap.ts → SAP 을 거쳐 돌아올 때까지 기다린다.
       * await 을 빼면 결과가 아니라 "나중에 준다"는 표가 실려 아래에서 {} 로 찍힌다.
       * 세 번째 인자는 제한시간. 기본 60초인데 threeWayMatch 는 실측 5분(LLM 공급자가 느림)이라 10분으로.
       */
      const res = await client.callTool({ name: call.function.name, arguments: argsRecord }, undefined, { timeout: 600_000 });

      /**
       * 도구 실행 결과를 이력에 넣는다. 서버가 text 에 이미 글자로 싸 놓았으니 JSON.stringify 를 다시 안 한다.
       * MCP 서버 반환 파라메타 확인해보기 
       */
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: textOf(res),
      });
    }
  }

  /**
   * 상한까지 돌았는데 답이 없으면 알린다.
   * 안 막으면 아무것도 안 찍히고 조용히 끝나 원인을 못 찾는다.
   */
  if (answer === null) {
    throw new Error(`왕복 ${MAX_STEPS}회 안에 답이 안 나왔다`);
  }

  return answer;
}

/**
 * MCP 결과에서 text 글자를 꺼낸다. mcp-check.ts 의 bodyOf 와 같은 가드인데 JSON.parse 는 안 한다.
 * 글자 그대로 tool 메시지에 실으면 모델이 읽는다. 우리 서버는 항상 text 하나를 주기로 했으니 아니면 코드가 어긋난 것이다.
 */
function textOf(res: object): string {
  if (!('content' in res) || !Array.isArray(res.content)) {
    throw new Error(`MCP 결과에 content 배열이 없다 ${JSON.stringify(res)}`);
  }
  const first: unknown = res.content[0];
  if (
    typeof first !== 'object' || first === null ||
    !('type' in first) || first.type !== 'text' ||
    !('text' in first) || typeof first.text !== 'string'
  ) {
    throw new Error(`MCP 결과 content[0] 이 text 가 아니다 ${JSON.stringify(res)}`);
  }
  return first.text;
}

/**
 * 첫 왕복이 끝난 뒤 제목 한 줄을 모델에게 짓게 한다. 도구 없이 부른다. 대화 이력은 안 넘기고 두 줄짜리 새 대화다.
 * 실패해도 throw 하지 않고 첫 질문 글자를 돌려준다. 제목 실패가 대화 실패가 되면 안 된다.
 */
async function makeTitle(question: string, answer: string): Promise<string> {
  try {
    const res = await ask([
      { role: 'system', content: ' 대화의 제목을 한국어 명사구 15자 이내로, 따옴표·마침표 없이 한 줄만 답한다.' },
      /** 답은 앞 500자만. 제목엔 그만큼이면 충분하고 토큰을 아낀다 */
      { role: 'user', content: `질문: ${question}\n답: ${answer.slice(0, 500)}` },
    ]);
    /** 모델이 따옴표나 줄바꿈을 섞어도 한 줄로 만든다. 30자 넘으면 자른다 */
    const raw = res.choices[0]?.message.content ?? '';
    const title = raw.replace(/["'\n]/g, '').trim().slice(0, 30);
    return title || question;
  } catch {
    return question;
  }
}




/**
 * 터미널 입출력 통로를 연다. 다 쓰면 close 해야 프로그램이 끝난다.
 */
const rl = createInterface({ input: process.stdin, output: process.stdout });

/**
 * 이력 DB. 파일이 없으면 만든다. 실행 위치 기준 경로라 저장소 루트에서 돌린다.
 */
/** TODO: DB 파일 경로. .gitignore 에 넣을 것 */
const history = openHistory('agent-history.db');

/**
 * 세션 번호. 첫 질문이 성공할 때 만든다(null 이면 아직 없음). 불러오기만 하고 끄면 아무것도 안 남는다.
 */
let sessionId: number | null = null;

/**
 * 최근 세션 목록을 찍고 돌려준다. 고를 때는 # 뒤의 세션 id 를 그대로 친다.
 */
/** TODO: 목록에 보여 줄 세션 개수 */
function showSessions(): SessionRow[] {
  const rows = history.listSessions(5);
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    
    

    if (s) console.log(`#${s.id}  ${s.title}`);
  }
  if (rows.length === 0) console.log('저장된 세션 없음');
  return rows;
}

/**
 * 고른 세션의 메시지를 이력 배열에 붙인다. DB 는 안 건드린다. 옛 세션은 읽기만 한다.
 * 저장은 첫 질문이 성공할 때 한 곳에서 한다. 그때 배열 전부(복사본 + 새 대화)가 새 세션으로 들어가 갈라 두기가 된다.
 * 시작 메뉴에서 불러오기를 골랐을 때 쓴다.
 */
function forkSession(chosen: SessionRow): void {
  const loaded = history.loadMessages(chosen.id);
  // 기존 message 변수와 연결되는 곳 
  messages.push(...loaded);
  /**
   * 경계 표시. 옛 것 뒤·새 것 앞에 두어 모델이 어디까지가 불러온 이력인지 알게 한다. system 이라 사용자 발언으로 안 보인다.
   * DB 에는 안 넣는다(저장 때 system 을 거른다). 불러올 때마다 여기서 새로 넣는다.
   */
  messages.push({ role: 'system', content: '위 대화는 이전 세션에서 불러온 이력이다. 사용자가 "이전 세션" 이라고 하면 위 내용을 말한다.' });
  console.log(`세션 #${chosen.id} 을 불러옴. 메시지 ${loaded.length}개. 첫 질문이 성공하면 새 세션으로 저장된다`);
}

/**
 * 시작 메뉴. 먼저 "불러오기 / 새로" 를 고르고, 불러오기면 그때 목록을 찍고 번호를 묻는다.
 * 세션 선택은 시작 때 한 번뿐이다. 대화 중 바꾸는 명령(/new·/load)은 없다.
 * find 는 READ TABLE … WITH KEY id = 와 같다. 빈 줄·없는 번호면 못 찾아 chosen 이 없고 새 세션으로 간다.
 */
console.log('1) 이전 세션 불러오기');
console.log('2) 새 세션');
const menu = (await rl.question('선택 : ')).trim();
if (menu === '1') {
  const recent = showSessions();
  const picked = (await rl.question('세션 번호 (빈 줄 = 새 세션) : ')).trim();
  const chosen = recent.find((s) => s.id === Number(picked));
  if (chosen) forkSession(chosen);
  else console.log('새 세션으로 시작');
}

/**
 * 질문을 받아 답하고 다시 받는다. 끝내는 신호가 올 때까지 돈다.
 * messages 는 이 반복문 밖에 있어 질문마다 같은 이력에 쌓인다.
 */
while (true) {
  const question = (await rl.question('질문 : ')).trim();

  /**
   * 끝내는 신호. 빈 줄이면 반복문을 나간다. 멈춤이 아니라 정상 종료라 throw 가 아니다.
   */
  if (!question) {
    console.log('종료합니다.');
    break;
  }

  /**
   * 이 질문 전의 이력 길이. 실패하면 여기까지 되돌린다.
   */
  const before = messages.length;

  messages.push({ role: 'user', content: question });

  /**
   * TRY…CATCH…ENDTRY. runAgent 안의 throw 를 여기서 받는다.
   * 안 받으면 질문 하나 실패로 프로그램이 끝나고 앞 대화가 다 날아간다.
   */
  try {
    const answer = await runAgent(messages);
    console.log(answer);

    /**
     * 저장은 여기 한 곳. 실패는 catch 에서 배열을 되돌리니 DB 에 안 간다.
     * 세션이 아직 없으면(첫 성공) 만들고 SYSTEM 을 뺀 배열 전부를 넣는다. 불러온 복사본이 있으면 같이 들어가 새 세션이 혼자 완전해진다.
     * 이미 있으면 이번 질문에서 쌓인 것(before 이후)만 이어 넣는다.
     * 첫 세션 생성 시에 
     */
    if (sessionId === null) {
      sessionId = history.createSession();
      /** system 은 저장 안 한다. 맨 위 SYSTEM 과 경계 표시는 코드가 매번 넣는다 */
      history.appendMessages(sessionId, messages.slice(1).filter((m) => m.role !== 'system')); // slice(n) : n 자리부터 끝까지
      history.setTitle(sessionId, await makeTitle(question, answer));
    } else {
      history.appendMessages(sessionId, messages.slice(before));
    }
  } catch (e) {
    /**
     * ROLLBACK WORK. 실패한 질문에서 쌓인 것을 전부 잘라 낸다.
     * 안 자르면 결과 없는 도구 요청이 남아 다음 질문까지 서버가 거절한다.
     */
    messages.length = before;

    console.log(`실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

rl.close();
history.close();

/**
 * MCP 통로를 닫는다. 안 닫으면 서버 자식 프로세스가 남아 프로그램이 안 끝난다.
 */
await client.close();
