/**
 * tsc 게이트. PostToolUse(Edit·Write 실행 후)에 뜬다. 고친 파일이 .ts 면 npx tsc --noEmit 을 돌리고,
 * 실패면 오류를 stderr 로 모델에게 보낸다(exit 2). 이미 고쳐진 뒤라 막지는 못한다. 모델이 읽고 다시 고치게 하는 것.
 * 등록은 루트 .claude/settings.json 의 PostToolUse. timeout 은 tsc 시간보다 넉넉해야 한다(넘으면 막지 않고 통과).
 */
import { execSync } from 'node:child_process';

/** ① stdin 을 끝까지 읽는다 */
const raw = await new Promise((ok) => {
  let s = '';
  process.stdin.on('data', (c) => (s += c));
  process.stdin.on('end', () => ok(s));
});
const input = JSON.parse(raw);

/** ② 고친 파일. .ts 가 아니면 할 일 없음 */
const filePath = String(input.tool_input?.file_path ?? '');
if (!filePath.endsWith('.ts')) process.exit(0);

/** TODO: 모델에게 보낼 오류 줄 수. 너무 많으면 이력이 길어지고, 너무 적으면 원인이 안 보인다 */
const MAX_LINES = 100;

/** TODO: 오류 앞에 붙일 한 문장. "고쳐라 + 왜" */
const HEADER = 'tsc 검사 실패';

/**
 * ③ tsc 실행. 통과면 아무 출력 없이 exit 0. 실패면 throw 라 catch 로 간다.
 * stdout 에 오류 목록이 오고(tsc 는 오류를 stdout 에 찍는다), 그중 앞 MAX_LINES 줄만 모델에게.
 */
try {
  /**
   * 터미널에서 `npx tsc --noEmit` 을 치는 것과 같다. 끝날 때까지 기다린다(CALL FUNCTION 처럼).
   * cwd = 어느 폴더에서 칠지(tsconfig 가 있는 저장소 루트). stdio = [키보드, 화면, 오류화면] 연결: 입력은 안 주고('ignore'), 출력 둘은 화면 대신 우리가 받는다('pipe').
   * tsc 가 오류를 내면(exit 1) 이 줄이 throw 하고 아래 catch 로 간다. 그래서 다음 줄까지 오면 통과다.
   */
  execSync('npx tsc --noEmit', { cwd: process.env.CLAUDE_PROJECT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.exit(0);
} catch (e) {
  const out = String(e.stdout ?? '') + String(e.stderr ?? '');
  const lines = out.split('\n').filter((l) => l.trim() !== '').slice(0, MAX_LINES);
  process.stderr.write(`${HEADER}\n${lines.join('\n')}`);
  process.exit(2);
}
