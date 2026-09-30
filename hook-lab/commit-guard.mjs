  /**
 * commit-guard = 커밋 메시지 규칙. PreToolUse 에서 뜨되, settings.json 의 if: "Bash(git commit *)" 때문에
 * git commit 으로 시작하는 Bash 명령일 때만 띄워진다. 다른 명령엔 아예 안 뜬다.
 * 받는 것: stdin JSON. 볼 칸은 tool_input.command (git commit -m "…" 전체 글자). 답: exit 0 통과 / exit 2 막음 + stderr 이유.
 */

/** ① stdin 을 끝까지 읽는다 */
const raw = await new Promise((ok) => {
  let s = '';
  process.stdin.on('data', (c) => (s += c));
  process.stdin.on('end', () => ok(s));
});
const input = JSON.parse(raw);

/** ② 커밋 명령 전체. 메시지(-m "…")가 이 글자 안에 그대로 들어 있다 */
const command = String(input.tool_input?.command ?? '');

let blocked = false;
let reason = '';

/** TODO: command 에 'Co-Authored-By: Claude' 가 들어 있으면 blocked = true, reason = "트레일러를 빼고 같은 메시지로 다시 커밋해라" 같은 문장 */
if(command.includes('Co-Authored-By: Claude')) { 
  blocked = true
  reason = "Claude 트레일러를 빼고 같은 메시지로 다시 커밋해라" 

}


/** ③ 답. 막는 방법 셋 중 하나만 살리고 나머지는 주석. 문서: exit code 보다 stdout JSON 이 우선 */
if (blocked) {
  /** 방식 A. exit 2 + stderr. 지금까지 쓰던 것 (실측 2026-09-29: 막힘) */
  process.stderr.write(reason);
  process.exit(2);

  /** 방식 B. stdout 에 deny JSON + 일부러 exit 1. 문서대로면 JSON 이 결정하고 exit 1 은 무시돼 막힌다 (실측 2026-09-29: 막힘) */
  /* process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"' + reason + '"}}');
  process.exit(1); */

  /** 방식 C. JSON 을 일부러 깨뜨림(마지막 } 없음) + exit 1. 문서대로면 비차단 오류 → 커밋이 실행된다. 함정 (실측 2026-09-29: 커밋 통과함) */
  /* process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"' + reason + '"}');
  process.exit(1); */
}
process.exit(0);
