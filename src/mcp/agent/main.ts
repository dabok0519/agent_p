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
 * 총괄. 부하에게 delegate 로 맡기고 답을 합친다. SYSTEM 도 부하 목록에서 만든다.
 */
import { runSupervisor, makeSupervisorSystem } from './supervisor.js';

/**
 * 부하 정의. 구매 부하 안에 v0.12 의 SYSTEM·스킬 목록·도구 여섯·로컬/MCP 갈림이 다 들어 있다.
 */
import { makeWorkers } from './workers.js';

/**
 * MCP 서버 연결. 프로그램 시작 때 한 번. 서버가 자식 프로세스로 뜨고 초기화 인사가 끝날 때까지 기다린다.
 * 실행 명령은 mcp-check.ts 와 같다.
 */
const client = new Client({ name: 'sap-agent', version: '0.1.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/mcp/server/index.ts'],
    /**
    * 부모 환경변수 전부 물려준다. SDK 기본은 PATH 등 12개만 넘겨서, VS Code 가 자식에 디버거를 붙이려고 심는 변수가 잘린다.
    * 없으면 서버(index.ts 밑) 중단점이 안 걸린다. 서버는 .env 를 직접 읽으니 동작엔 영향 없다.
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
 * 부하 둘(구매·자재). 총괄이 이 목록으로 delegate 도구와 SYSTEM 을 만든다. main 은 부하를 직접 안 부른다.
 */
const workers = makeWorkers(mcpTools, client);

/**
 * 대화 이력. 왕복할 때마다 여기에 쌓아서 통째로 다시 보낸다.
 * 서버는 지난 대화를 기억하지 않아 매번 전부 실어 보내야 한다.
 */
const messages: Record<string, unknown>[] = [
  { role: 'system', content: makeSupervisorSystem(workers) },
];

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
 * 터미널 입출력 통로를 연다. 다 쓰면 close 해야 프로그램이 끝난다.
 */
const rl = createInterface({ input: process.stdin, output: process.stdout });

/**
 * 이력 DB. 파일이 없으면 만든다. 실행 위치 기준 경로라 저장소 루트에서 돌린다.
 */
/** TODO: DB 파일 경로. .gitignore 에 넣을 것 */
const history = openHistory('agent-history.db');

/**
 * 세션 번호. 새 세션이면 첫 질문이 성공할 때 만든다(null 이면 아직 없음). 불러온 세션이면 그 번호를 그대로 쓴다.
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
 * 고른 세션의 메시지를 이력 배열에 붙이고, 그 세션에 이어 쓴다 (sessionId 를 그 번호로).
 * 이후 질문은 저장 자리의 else 갈래로 가서 이 세션 뒤에 붙는다. 새 세션은 안 생긴다.
 * (갈라 두기 판은 뺐다. 사용자 결정 2026-09-19: 불러오기 = 이어 쓰기)
 * 시작 메뉴에서 불러오기를 골랐을 때 쓴다.
 */
function loadSession(chosen: SessionRow): void {
  sessionId = chosen.id;
  const loaded = history.loadMessages(chosen.id);
  // 기존 message 변수와 연결되는 곳 
  messages.push(...loaded);
  /**
   * 경계 표시. 옛 것 뒤·새 것 앞에 두어 모델이 어디까지가 불러온 이력인지 알게 한다. system 이라 사용자 발언으로 안 보인다.
   * DB 에는 안 넣는다(저장 때 system 을 거른다). 불러올 때마다 여기서 새로 넣는다.
   */
  messages.push({ role: 'system', content: '위 대화는 이전 세션에서 불러온 이력이다. 사용자가 "이전 세션" 이라고 하면 위 내용을 말한다.' });
  console.log(`세션 #${chosen.id} 을 불러옴. 메시지 ${loaded.length}개. 이 세션에 이어서 저장된다`);
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
  if (chosen) loadSession(chosen);
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
   * TRY…CATCH…ENDTRY. runSupervisor 안의 throw 를 여기서 받는다.
   * 안 받으면 질문 하나 실패로 프로그램이 끝나고 앞 대화가 다 날아간다.
   */
  try {
    /**
     * 총괄 루프. trace(부른 부하 이름)는 검증 파일이 쓰고 여기선 안 본다.
     */
    const { answer } = await runSupervisor(messages, workers);
    console.log(answer);

    /**
     * 저장은 여기 한 곳. 실패는 catch 에서 배열을 되돌리니 DB 에 안 간다.
     * 새 세션의 첫 성공이면 세션을 만들고 SYSTEM 을 뺀 배열 전부를 넣고 제목을 짓는다.
     * 불러온 세션이거나 두 번째 질문부터는 이번 질문에서 쌓인 것(before 이후)만 이어 넣는다.
     */
    if (sessionId === null) {
      sessionId = history.createSession();
      /** system 은 저장 안 한다. 맨 위 SYSTEM 과 경계 표시는 코드가 매번 넣는다 */
      history.appendMessages(sessionId, messages.slice(1).filter((m) => m.role !== 'system')); // slice(n) : n 자리부터 끝까지
      history.setTitle(sessionId, await makeTitle(question, answer));
    } 
    else {
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
