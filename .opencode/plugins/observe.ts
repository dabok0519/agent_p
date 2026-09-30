/**
 * OpenCode 플러그인 (V1 형식, 1.18.30 기준 문서 https://opencode.ai/docs/plugins/).
 * .opencode/plugins/ 에 파일 하나로 두면 자동 로드. 폴더/index.ts 는 안 읽힌다(실측).
 * Claude Code 로 치면 settings.json 의 hooks 블록 + guard.mjs 가 이 파일 하나에 코드로 들어간다.
 * 지금은 관찰만: 도구 이름·인자·결과 모양을 로그로 남긴다.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const LOG_DIR = join(process.cwd(), "hook-lab", "logs")

/** 한 줄 append. 실패해도 플러그인이 죽지 않게 try */
function log(record: unknown) {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(join(LOG_DIR, "opencode.jsonl"), JSON.stringify(record) + "\n")
  } catch {}
}

/**
 * OpenCode 가 켜질 때 이 함수를 한 번 부르고, 돌려준 객체의 키가 hook 이 된다.
 * 인자: project·client·$(셸)·directory·worktree. 여기선 안 쓴다.
 */
export const Observe: Plugin = async () => {
  log({ at: new Date().toISOString(), phase: "setup" })

  return {
    /** 도구 실행 직전. Claude 의 PreToolUse. input.tool = 도구 이름, output.args = 인자 (고치면 그대로 실행됨) */
    "tool.execute.before": async (input, output) => {
      log({ at: new Date().toISOString(), phase: "before", tool: input.tool, args: output.args })
    },

    /** 도구 실행 직후. Claude 의 PostToolUse. output 을 통째로 기록해 어떤 칸이 있는지 본다 */
    "tool.execute.after": async (input, output) => {
      log({ at: new Date().toISOString(), phase: "after", tool: input.tool, output })
    },
  }
}
