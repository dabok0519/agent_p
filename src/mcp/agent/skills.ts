/**
 * 스킬 로드 3단계와 로컬 도구 셋. main.ts 에서 떼어 냈다 (2026-09-19, main.ts 가 560줄이라).
 * main.ts 는 skills(목록)·localTools(도구 정의)·runLocalTool(실행) 셋만 가져다 쓴다.
 */

/**
 * OpenAI 도구 정의 모양. 로컬 도구도 MCP 도구와 같은 모양으로 모델에게 보여야 한다.
 */
import type { OpenAiTool } from './openrouter.js';

/**
 * 파일·폴더 읽기. node 내장. existsSync = 있나, readdirSync = 폴더 목록, readFileSync = 글자로 읽기.
 * fs = file system. 파일 읽기·쓰기·폴더 목록 같은 걸 하는 Node 내장 모듈
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 자식 프로세스 실행. execFileSync 는 셸을 안 거치고 프로그램에 인자 배열을 그대로 준다. "; rm" 같은 글자가 명령으로 안 먹는다.
 */
import { execFileSync } from 'node:child_process';

/**
 * 스킬 폴더. .claude/ 가 아니라 src/ 밑이다. .claude/ 는 Claude Code 의 설정 폴더라 거기 두면 그 도구가 자기 스킬로 읽어 버린다 (실제로 그랬다, 사수 지적 2026-09-19).
 * 스캔(loadSkills)과 readFile 가드가 같은 값을 써야 해서 한 곳에 둔다.
 */
const SKILLS_ROOT = 'src/mcp/agent/skills';

/**
 * 스킬 하나. name·description 은 SKILL.md 맨 위 frontmatter 에서, dir 은 그 폴더 경로.
 */
type Skill = { name: string; description: string; dir: string };

/**
 * 스킬 로드 ① 스캔. 시작 때 한 번. src/mcp/agent/skills 밑 폴더마다 SKILL.md 를 읽어 이름·설명만 뽑는다.
 * 본문은 안 읽는다(③ 모델이 readSkill 을 요청하면 그때 코드가 읽음). 폴더가 없으면 빈 배열이라 스킬 없이도 예전처럼 돈다.
 */
//< 코드가 md를 읽는 함수 >
function loadSkills(root: string): Skill[] {
  if (!existsSync(root)) return [];

  const found: Skill[] = [];
  /** root = 'src/mcp/agent/skills'. entry 는 그 밑 항목 하나씩 (폴더 po-query, 파일이면 건너뜀) */
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    /** dir = 'src/mcp/agent/skills/po-query'. 스킬 폴더 경로. */
    const dir = join(root, entry.name);
    /** file = 'src/mcp/agent/skills/po-query/SKILL.md'. */
    const file = join(dir, 'SKILL.md');
    if (!existsSync(file)) continue;

    /**
     * frontmatter = 파일 맨 위 --- 와 --- 사이. 그 안에서 name: 줄과 description: 줄만.
     * \r?\n 은 Windows 줄바꿈(CRLF) 대비. ?. 는 못 찾았을 때 뒤가 안 터지게(READ TABLE 뒤 sy-subrc).
     * 하나라도 없으면 스킬로 안 친다. 모델이 readSkill 을 요청할 근거가 없어서.
     */
    const text = readFileSync(file, 'utf8');
    // name , description 파싱
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    // front 변수에서 name만 파싱
    const name = front?.[1]?.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const description = front?.[1]?.match(/^description:\s*(.+)$/m)?.[1]?.trim();
    if (!name || !description) {
      console.log(`[skill] ${file}: name 또는 description 없음. 건너뜀`);
      continue;
    }
    found.push({ name, description, dir });
  }
  return found;
}

/**
 * 시작 때 한 번 스캔한 목록. main.ts 가 SYSTEM 의 스킬 목록(② 목록)을 만들 때 쓴다.
 */
export const skills = loadSkills(SKILLS_ROOT);
console.log(`[skill] ${skills.length}개: ${skills.map((s) => s.name).join(', ') || '(없음)'}`);

/**
 * 스킬 로드 ③ 본문 — 로컬 도구. MCP 서버가 아니라 이 프로세스 안에서 처리한다. 파일만 읽으니 SAP 서버로 보낼 이유가 없다.
 * MCP 도구는 SDK 가 zod 에서 JSON Schema 를 만들어 줬지만, 로컬은 parameters 를 손으로 적는다. 그게 SDK 가 해 주던 일이다.
 */
/**
 * main.ts 가 MCP 도구 목록 뒤에 이어 붙여 모델에게 보낸다.
 */
export const localTools: OpenAiTool[] = [
  {
    type: 'function',
    function: {
      name: 'readSkill',
      description: '스킬 본문(SKILL.md)을 읽는다. SYSTEM 의 스킬 목록에 있는 이름을 넣는다. 절차를 따르기 전에 먼저 읽는다.',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: '스킬 폴더(src/mcp/agent/skills/) 안 파일을 읽는다. SKILL.md 가 가리키는 references/ 등. 폴더 밖은 거부.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runScript',
      description: '스킬 폴더 안 python 스크립트를 실행한다. SKILL.md 절차가 시킬 때 쓴다. stdout 과 exitCode 가 온다. exitCode 0 이 통과.',
      parameters: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: '스킬 이름 (예: po-query)' },
          script: { type: 'string', description: '스킬 폴더 기준 경로 (예: scripts/check_po.py)' },
          args: { type: 'array', items: { type: 'string' }, description: '스크립트에 줄 인자들' },
        },
        required: ['skill', 'script'],
      },
    },
  },
];

/**
 * 로컬 도구 실행. 이름이 로컬 도구면 결과 글자, 아니면 null(→ 부르는 쪽이 MCP 로 보낸다). 갈림은 여기 한 곳.
 * 결과 모양 { ok, … } 글자는 MCP 도구와 같다. 이력에 넣는 코드와 저장 코드가 안 바뀐다.
 */
/**
 * workers.ts 의 runPurchaseTool 이 도구 요청마다 먼저 부른다.
 */
export function runLocalTool(name: string, args: Record<string, unknown>): string | null {
  if (name === 'readSkill') {
    /** READ TABLE skills WITH KEY name. 없으면 실패를 값으로. 모델이 읽고 이름을 고친다 */
    const skill = skills.find((s) => s.name === args.name);
    if (!skill) return JSON.stringify({ ok: false, reason: `스킬 없음: ${String(args.name)}` });
    // skill.md 파일 전부 반환
    // skill.md의 내용을 미리 텍스트화 
    return JSON.stringify({ ok: true, content: readFileSync(join(skill.dir, 'SKILL.md'), 'utf8') });
  }

  if (name === 'readFile') {
    /**
     * 경로 가드. resolve 로 절대 경로를 만든 뒤 스킬 폴더로 시작하는지 본다.
     * 없으면 ../../.env 처럼 아무 파일이나 읽힌다. readSkill 은 이름으로 목록에서 찾으니 이 가드가 필요 없다.
     */
    const root = resolve(SKILLS_ROOT);
    const full = resolve(String(args.path));
    if (!full.startsWith(root)) return JSON.stringify({ ok: false, reason: `스킬 폴더 밖: ${String(args.path)}` });
    if (!existsSync(full)) return JSON.stringify({ ok: false, reason: `파일 없음: ${String(args.path)}` });
    // json으로 넘길 필요는 없지만 mcp랑 통일성을 유지하기 위해...
    return JSON.stringify({ ok: true, content: readFileSync(full, 'utf8') });
  }

  if (name === 'runScript') {
    const skill = skills.find((s) => s.name === args.skill);
    if (!skill) return JSON.stringify({ ok: false, reason: `스킬 없음: ${String(args.skill)}` });

    /** readFile 과 같은 가드. 스킬 폴더 기준으로 풀고, 그 폴더 밖이면 거부 */
    const full = resolve(skill.dir, String(args.script));
    if (!full.startsWith(resolve(skill.dir))) return JSON.stringify({ ok: false, reason: `스킬 폴더 밖: ${String(args.script)}` });
    if (!existsSync(full)) return JSON.stringify({ ok: false, reason: `스크립트 없음: ${String(args.script)}` });

    /** args 는 글자 배열이어야 한다. 아니면 빈 배열. 모델이 숫자를 넣어도 String 으로 맞춘다 */
    const argv = Array.isArray(args.args) ? args.args.map(String) : [];

    /**
     * exit code 가 0 이 아니면 execFileSync 가 throw 한다. TRY 로 받아 실패를 값으로 바꾼다.
     * 에러 객체 안에 status(exit code)·stdout·stderr 가 붙어 있어 그걸 그대로 싣는다. 모델이 사유를 읽는다.
     */
    try {
      const stdout = execFileSync('python', [full, ...argv], { encoding: 'utf8' });
      return JSON.stringify({ ok: true, exitCode: 0, stdout });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return JSON.stringify({ ok: false, exitCode: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' });
    }
  }
  return null;
}
