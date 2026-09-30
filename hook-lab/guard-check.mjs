/**
 * OpenCode guard.ts 를 모델 없이 직접 부르는 확인 파일. Claude 쪽 `printf … | node guard.mjs` 와 같은 역할.
 * 플러그인은 훅 객체를 돌려주는 함수라, 그 객체의 훅을 가짜 (input, output) 으로 부르면 된다.
 * .mjs 인 이유: .ts 로 두면 tsc 가 guard.ts 까지 끌어와 검사한다. tsx 는 .mjs 에서 .ts 를 import 할 수 있다.
 * 쓰는 법: npx tsx hook-lab/guard-check.mjs
 */
import { Guard } from '../.opencode/plugins/guard.ts';

/** 플러그인 함수 호출 = OpenCode 가 켜질 때 하는 일. directory 만 넘긴다(다른 칸은 guard 가 안 씀) */
const hooks = await Guard({ directory: process.cwd() });

/** 결과 한 줄. 이 폴더는 R3 때문에 console.log 를 못 쓴다 */
const say = (label, value) => process.stdout.write(`${label}: ${value}\n`);

/** before 훅 하나 부르기. throw 면 "막힘", 아니면 "통과" */
async function before(tool, args) {
  try {
    await hooks['tool.execute.before']({ tool, sessionID: 's', callID: 'c' }, { args });
    return '통과';
  } catch (e) {
    return `막힘: ${e.message}`;
  }
}

/** after 훅 부르기. before 를 먼저 불러 lastArgs 를 채운 뒤, output.output 이 어떻게 바뀌는지 본다 */
async function after(tool, args) {
  await hooks['tool.execute.before']({ tool, sessionID: 's', callID: 'c' }, { args });
  const output = { title: '', output: 'Edit applied successfully.', metadata: {} };
  await hooks['tool.execute.after']({ tool, sessionID: 's', callID: 'c' }, output);
  return output.output;
}

const lab = `${process.cwd()}\\hook-lab\\sample.ts`;
const main = `${process.cwd()}\\src\\mcp\\agent\\main.ts`;

say('R1 read .env      ', await before('read', { filePath: 'C:\\x\\.env' }));
say('R1 read sample.ts ', await before('read', { filePath: lab }));
say('R2 bash rm -rf    ', await before('bash', { command: 'rm -rf x' }));
say('R2 bash ls        ', await before('bash', { command: 'ls' }));
say('R3 lab + log      ', await after('edit', { filePath: lab, newString: 'console.log(a);' }));
say('R3 main.ts + log  ', await after('edit', { filePath: main, newString: 'console.log(a);' }));
