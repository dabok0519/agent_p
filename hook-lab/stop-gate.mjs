/**
 * Stop 마무리 게이트. 모델이 턴을 끝내려는 순간에 뜬다. 끝내도 되는 상태인지 검사해서
 * 아니면 stderr 이유 + exit 2 → 모델이 못 끝내고 이유를 읽고 계속 일한다. 되면 exit 0.
 * 받는 것: stdin JSON. 볼 칸은 stop_hook_active (true = 이미 이 hook 이 한 번 막아서 다시 온 턴).
 * 등록은 루트 .claude/settings.json 의 Stop. timeout 은 tsc 시간보다 넉넉해야 한다(넘으면 막지 않고 통과).
 */
import { execSync } from 'node:child_process';

/** ① stdin 을 끝까지 읽는다 */
const raw = await new Promise((ok) => {
  let s = '';
  process.stdin.on('data', (c) => (s += c));
  process.stdin.on('end', () => ok(s));
});
const input = JSON.parse(raw);

/**
 * ② 무한 루프 가드. 한 번 막힌 뒤 다시 온 턴이면 그냥 보낸다.
 * 안 두면 tsc 가 계속 실패할 때 막힘 → 시도 → 막힘 이 끝없이 돈다(문서).
 */
if (input.stop_hook_active === true) process.exit(0);

/** TODO: 모델에게 보낼 오류 줄 수 (hook-lab/tsc-gate.mjs 와 같은 고민) */
const MAX_LINES = 100;

/** TODO: 이유 앞에 붙일 한 문장. "끝내지 마라 + 왜" */
const HEADER = 'tsc 실패. 아래 오류를 고치기 전엔 끝내지 마라';

/**
 * ③ tsc 실행 결과를 글자로 모은다. 통과면 빈 글자, 실패면 오류 목록(앞 MAX_LINES 줄).
 * 여기서는 판단 안 함. 판단은 아래 ④ 에서.
 */
let tscOut = '';
try {
  execSync('npx tsc --noEmit', { cwd: process.env.CLAUDE_PROJECT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  const out = String(e.stdout ?? '') + String(e.stderr ?? '');
  tscOut = out.split('\n').filter((l) => l.trim() !== '').slice(0, MAX_LINES).join('\n');
}

let blocked = false;
let reason =  HEADER + '\n' + tscOut

/** TODO: tscOut 이 비어 있지 않으면 blocked = true, reason = HEADER + '\n' + tscOut.
 *  tsc 말고 더 볼 게 있으면 여기 if 추가 */
if(tscOut != "") { 
  blocked = true ;
}


/** ④ 답. 막으면 stderr 이유 + exit 2. 아니면 exit 0 */
if (blocked) {
  process.stderr.write(reason);
  process.exit(2);
}
process.exit(0);
