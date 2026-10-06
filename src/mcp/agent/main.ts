/**
 * 터미널에서 한 줄 입력을 받는 node 내장 기능. promises 판이라 await 로 기다릴 수 있다.
 */
import { createInterface } from 'node:readline/promises';

/**
 * 대화 이력 저장소(SQLite). 세션 목록·불러오기·저장.
 */
import { openHistory, type SessionRow } from './history.js';

/**
 * 에이전트 공용 부분. MCP 연결·부하·SYSTEM, 질문 1회 처리(저장·되돌리기), 세션 불러오기가 다 여기 있다.
 * 이 파일은 터미널 입출력만 맡는다. web/server.ts 도 같은 함수를 쓴다.
 */
import { connectAgent, newChat, askChat, loadInto } from './session.js';

/**
 * MCP 서버 연결과 부하 만들기. 프로그램 시작 때 한 번.
 * connectagent() 통해서 supervisor load 
 */
const { client, workers, system } = await connectAgent();

/**
 * 대화 이력. 왕복할 때마다 여기에 쌓아서 통째로 다시 보낸다.
 * 서버는 지난 대화를 기억하지 않아 매번 전부 실어 보내야 한다.
 * user : system을 통해 newchat 시작 
 */
const chat = newChat(system);

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
  if (chosen) {
    const count = loadInto(chat, chosen, history);
    console.log(`세션 #${chosen.id} 을 불러옴. 메시지 ${count}개. 이 세션에 이어서 저장된다`);
  }
  else console.log('새 세션으로 시작');
}

/**
 * 질문을 받아 답하고 다시 받는다. 끝내는 신호가 올 때까지 돈다.
 * chat 은 이 반복문 밖에 있어 질문마다 같은 이력에 쌓인다.
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
   * TRY…CATCH…ENDTRY. askChat 은 실패하면 이력을 되돌린 뒤 throw 한다. 여기선 찍기만 한다.
   * 안 받으면 질문 하나 실패로 프로그램이 끝나고 앞 대화가 다 날아간다.
   */
  try {
    /**
     * 총괄 루프 + 저장. trace(부른 부하 이름)는 어느 길로 갔는지 찍는 데만 쓴다.
     */
    const { answer, trace } = await askChat(chat, question, workers, history);
    /** 어느 길로 갔는지 한 줄. jev: 접두어면 코드가 Jev 답대로 부하를 직접 부른 것, 없으면 총괄(Qwen)이 위임한 것 */
    console.log(`[route] ${trace.length === 0 ? '부하 없음' : trace.join(' > ')}`);
    console.log(answer);
  } catch (e) {
    console.log(`실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

rl.close();
history.close();

/**
 * MCP 통로를 닫는다. 안 닫으면 서버 자식 프로세스가 남아 프로그램이 안 끝난다.
 */
await client.close();
