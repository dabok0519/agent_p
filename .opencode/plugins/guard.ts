/**
 * Claude Code 의 guard.mjs(R1·R2·R3) + tsc-gate.mjs 를 OpenCode 플러그인 하나로 옮긴 것.
 * 대응(실측 2026-09-29): tool_name → input.tool(소문자), tool_input.file_path → output.args.filePath,
 * PreToolUse exit 2 → throw, PostToolUse stderr → output.output 끝에 덧붙이기.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { execSync } from "node:child_process"

/** R3 범위. Claude 쪽 inLab 과 같다 */
const LAB = "/hook-lab/"

/** tsc 오류를 모델에게 보낼 줄 수와 머리 문장. Claude 쪽 tsc-gate.mjs 와 맞춘다 */
const MAX_LINES = 100
const HEADER = "tsc 검사 실패"

/** tool.execute.after에는 인자가 안 온다.
 *  before 에서 받은 인자를 여기 둬서 after 가 쓴다 (도구는 순서대로 돌므로 하나면 된다) */
let lastArgs: Record<string, unknown> = {}

export const Guard: Plugin = async ({ directory }) => {
  let blocked = false ;
  let reason = '';

  return {
    /**
     * 도구 실행 직전 = Claude 의 PreToolUse. 막으려면 throw. 던진 문구가 모델에게 간다(문서).
     * read·grep 은 filePath / path, bash 는 command.
     */
    "tool.execute.before": async (input, output) => {
      lastArgs = output.args
      const filePath = String(output.args.filePath ?? output.args.path ?? "")
      const command = String(output.args.command ?? "")

      /** TODO R1: filePath 가 .env 로 끝나거나 command 에 .env 가 있으면 throw new Error('…') (guard.mjs 의 R1 이유 그대로) */
        if (filePath.endsWith(".env") || command.includes(".env")) {
          throw new Error(".env 는 비밀 키 파일이라 읽을 수 없다. 필요한 설정 이름만 말해라.")
        }
       /** TODO R2: input.tool 이 'bash' 이고 command 에 rm -rf 가 있으면 throw new Error('…') */  
        if (input.tool === "bash" && command.includes("rm -rf")) {
         throw new Error("rm -rf 는 막혀 있다. 지울 파일을 하나씩 rm 으로 지정하거나, 먼저 ls 로 확인해라.")
        }
    },

    /**
     * 도구 실행 직후 = Claude 의 PostToolUse. 못 막는다. output.output 끝에 글자를 붙이면 모델이 결과와 함께 읽는다.
     * edit·write 만 본다.
     */
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "edit" && input.tool !== "write") return

      /** before 에서 받아 둔 인자. filePath 와 새로 들어간 글자(edit 은 newString, write 는 content) */
      const filePath = String(lastArgs.filePath ?? "").replace(/\\/g, "/")
      const added = String(lastArgs.newString ?? lastArgs.content ?? "")
      const inLab = filePath.includes(LAB)

      /** TODO R3: inLab 이고 added 에 console.log 가 있으면 output.output += '\n' + 이유 (guard.mjs 의 R3 이유 그대로) */
      if (inLab && added.includes("console.log")) {
      output.output += "\n방금 고친 파일에 console.log 가 들어갔다. 이 폴더(hook-lab 폴더)엔 디버그 로그 안 남긴다. 그 줄을 지금 바로 지워라."
      }


      /** tsc 게이트. .ts 면 tsc 를 돌리고 실패 시 오류 앞줄들을 결과 끝에 붙인다 */
      if (filePath.endsWith(".ts")) {
        try {
          /**
           * 터미널에서 `npx tsc --noEmit` 을 치는 것과 같다. 끝날 때까지 기다린다.
           * cwd = OpenCode 가 준 저장소 루트. stdio = [키보드, 화면, 오류화면]: 입력 안 줌('ignore'), 출력 둘은 화면 대신 우리가 받음('pipe').
           * 오류가 있으면 이 줄이 throw → catch 에서 e.stdout 의 오류 글자를 꺼낸다.
           */
          execSync("npx tsc --noEmit", { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
        } catch (e: any) {
          const out = String(e.stdout ?? "") + String(e.stderr ?? "")
          const lines = out.split("\n").filter((l) => l.trim() !== "").slice(0, MAX_LINES)
          output.output += `\n\n${HEADER}\n${lines.join("\n")}`
        }
      }
    },
  }
}
