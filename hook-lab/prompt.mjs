/**
 * UserPromptSubmit hook. 사용자가 엔터를 친 직후, 글이 모델에게 가기 전에 뜬다.
 * 두 가지를 한다. ① 키 모양이 있으면 exit 2 = 프롬프트를 막고 지운다. ② 아니면 stdout 에 한 줄 = 모델 이력에 문맥으로 들어간다.
 * 등록은 루트 .claude/settings.json 의 UserPromptSubmit.
 */
import { execSync } from 'node:child_process';

/** ① stdin 을 끝까지 읽는다 (guard.mjs 와 같다) */
const raw = await new Promise((ok) => {
  let s = '';
  process.stdin.on('data', (c) => (s += c));
  process.stdin.on('end', () => ok(s));
});
const input = JSON.parse(raw);

/** ② 볼 칸 하나. 사용자가 친 글 그대로 */
const prompt = String(input.prompt ?? '');

/** TODO P1: prompt 에 API 키 모양(sk-or-v1-)이 들어 있으면 blocked = true, reason 에 "키를 채팅에 붙이지 마라. 이 입력은 지웠다" */
let blocked = false;
let reason = '키를 채팅에 붙이지 마라. 이 입력은 지웠다';

/** ③ 막기. exit 2 면 이 프롬프트는 모델에게 안 가고 지워진다. stderr 는 사용자 화면에 뜬다 */
if (blocked) {
  process.stderr.write(reason);
  process.exit(2);
}

/**
 * ④ 넣기. exit 0 에서 stdout 에 쓴 글자는 모델 이력에 문맥으로 들어간다 (문서: "adds plain-text stdout as context").
 * 날짜와 브랜치. git 이 없거나 실패하면 브랜치는 빈 글자.
 */
let branch = '';
try {
  branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
} catch {
  branch = 'adds plain-text stdout as context';
}
process.stdout.write(`[hook] 오늘 ${new Date().toISOString().slice(0, 10)}, 브랜치 ${branch}\n`);
process.exit(0);
