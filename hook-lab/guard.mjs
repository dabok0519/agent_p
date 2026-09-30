/**
 * guard = 규칙 R1·R2·R3 묶음. 기능 단위 파일이라 이벤트 둘(PreToolUse·PostToolUse)을 한 파일이 받고 안에서 가른다.
 * 받는 것: stdin 으로 "지금 뭘 하려는지" JSON. 주는 것: 종료 코드. 0 = 통과, 2 = stderr 글자를 모델에게.
 *   PreToolUse 의 2 = 도구 실행 안 함. PostToolUse 의 2 = 이미 실행됐고 글자만 전달.
 * 등록은 루트 .claude/settings.json (PreToolUse, PostToolUse 둘 다 이 파일). 실행은 node 가 직접(exec 형식).
 * OpenCode 쪽 짝: .opencode/plugins/guard.ts
 */

/** ① stdin 을 끝까지 읽는다. 조각으로 오니 다 모을 때까지 기다린다 */
const raw = await new Promise((ok) => {
  let s = '';
  process.stdin.on('data', (c) => (s += c));
  process.stdin.on('end', () => ok(s));
});
const input = JSON.parse(raw);

/** ② 어느 이벤트로 불렸나. 'PreToolUse' | 'PostToolUse' */
const event = String(input.hook_event_name ?? '');

/** ③ 볼 칸. Read·Edit·Write 는 file_path, Grep 은 path, Bash·PowerShell 은 command. 없는 칸은 빈 글자 */
const filePath = String(input.tool_input?.file_path ?? input.tool_input?.path ?? '');
const command = String(input.tool_input?.command ?? '');

let blocked = false;
let reason = '';

/** ── 실행 전 (PreToolUse) ── */
if (event === 'PreToolUse') {
  /** R1: .env 접근 차단 */
  if (filePath.endsWith('.env') || command.includes('.env')) {
    blocked = true;
    reason = '.env 는 비밀 키 파일이라 읽을 수 없다. 필요한 설정 이름만 말해라.';
  }

  /** R2: 파일 삭제 명령 차단 */
  if (command.includes('rm -rf')) {
    blocked = true;
    reason = 'rm -rf 는 막혀 있다. 지울 파일을 하나씩 rm 으로 지정하거나, 먼저 ls 로 확인해라.';
  }
}

/** ── 실행 후 (PostToolUse, Edit·Write) ── */
if (event === 'PostToolUse') {
  /**
   * R3 재료. added = 새로 들어간 글자(Write 는 content, Edit 은 new_string).
   * inLab = 실습 폴더 안 파일인가. hook 이 저장소 전체에 걸려 있어서, console.log 를 정상 출력으로 쓰는 main.ts·loop.ts 를 건드리지 않게 범위를 좁힌다.
   */
  const added = String(input.tool_input?.content ?? input.tool_input?.new_string ?? '');
  const inLab = filePath.replace(/\\/g, '/').includes('/hook-lab/');

  /** R3: 실습 폴더 파일에 console.log 가 새로 들어갔으면 "지워라" (주석 글자까지 잡는 한계 있음. 실측) */
  if (added.includes('console.log') && inLab) {
    blocked = true;
    reason = '방금 고친 파일에 console.log 가 들어갔다. 이 폴더(hook-lab 폴더)엔 디버그 로그 안 남긴다. 그 줄을 지금 바로 지워라.';
  }
}

/** ④ 답. stdout 엔 아무것도 안 찍는다 */
if (blocked) {
  process.stderr.write(reason);
  process.exit(2);
}
process.exit(0);
