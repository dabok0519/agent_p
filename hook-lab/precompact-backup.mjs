/**
 * PreCompact 백업. 압축 직전에 대화 원본(jsonl)을 hook-lab/backups/ 로 복사한다.
 * 원본은 ~/.claude/projects/ 에 원래 남지만 cleanupPeriodDays(기본 30일, 문서) 뒤 지워지고 PC 를 바꾸면 안 따라온다.
 * 받는 것: stdin JSON (transcript_path, trigger = manual|auto). 답: 막을 일이 없으니 항상 exit 0. stdout 은 터미널 표시용.
 */

/** 파일 복사·폴더 만들기·경로 합치기. node 내장 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** ① stdin 을 끝까지 읽는다 */
const raw = await new Promise((ok) => {
  let s = '';
  process.stdin.on('data', (c) => (s += c));
  process.stdin.on('end', () => ok(s));
});
const input = JSON.parse(raw);

/** ② 원본 경로와 누가 압축을 일으켰나.
 *  auto = 문맥이 꽉 차서 도구가 알아서, manual = 사람이 /compact 
 * transcript_path = 지금 세션의 원본 jsonl 경로
 * trigger = auto or manual 
 * */

const transcriptPath = String(input.transcript_path ?? '');
const trigger = String(input.trigger ?? '');

/** ③ 저장 자리. CLAUDE_PROJECT_DIR = hook 을 부른 프로젝트 루트 
 * const dir = join(…) 은 경로 글자만 만든 것 
 * 
*/
const dir = join(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), 'hook-lab', 'backups');

/** ④ 파일명 = 시각-trigger.jsonl. 콜론은 윈도 파일명에 못 쓰니 바꾼다 */
const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${trigger}.jsonl`;

/**
 * ⑤ 복사. 실패해도 압축은 그대로 가야 하니 catch 에서 exit 0.
 * 원본 경로가 비어 있으면(가짜 입력 등) 복사할 게 없으므로 통과.
 */
try {
  if (transcriptPath === '') process.exit(0);
  // mkdirSync(dir, { recursive: true }) == 실제 폴더 생성 
  mkdirSync(dir, { recursive: true });
  copyFileSync(transcriptPath, join(dir, name));
  process.stdout.write(`[hook precompact:${trigger}] 백업 → hook-lab/backups/${name}`);
} catch (e) {
  process.stderr.write(`[hook precompact] 백업 실패: ${String(e)}`);
}
process.exit(0);
