/**
 * Claude Code 의 prompt.mjs(UserPromptSubmit) 를 OpenCode 로 옮긴 것.
 * 대응 hook = chat.message: 사용자 글이 모델에게 가기 직전에 뜬다. output.parts 가 그 글의 조각들(텍스트·파일).
 * ① 날짜·브랜치 한 줄을 텍스트 조각 끝에 덧붙인다 (Claude 의 stdout 주입 대응).
 * ② 막기(P1) 는 throw 로 시도한다. 막히는지는 실측 전 → 「확인 필요」.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { execSync } from "node:child_process"

export const PromptHook: Plugin = async ({ directory }) => {
  return {
    "chat.message": async (_input, output) => {
      /** 사용자 글의 첫 텍스트 조각. 없으면(파일만 보낸 경우) 할 일 없음 */
      const textPart = output.parts.find((p) => p.type === "text")
      if (!textPart || textPart.type !== "text") return
      const prompt = textPart.text

      let blocked = false
      let reason = "키를 채팅에 붙이지 마라. 이 입력은 지웠다"

      /** TODO P1: prompt 에 API 키 모양(sk-or-v1-)이 들어 있으면 blocked = true (hook-lab/prompt.mjs 와 같은 조건) */
      if(prompt.includes("sk-or-v1-")) { 
        blocked = true ; 

      }

      /** 막기. throw 하면 이 메시지가 모델에게 안 가는지, 아니면 오류만 뜨고 그대로 가는지 실측 필요 */
      if (blocked) throw new Error(reason)

      /** 넣기. 브랜치는 git 이 없거나 실패하면 빈 글자 */
      let branch = ""
      try {
        branch = execSync("git branch --show-current", { cwd: directory, encoding: "utf8" }).trim()
      } catch {
        branch = ""
      }
      textPart.text = `${prompt}\n[hook] 오늘 ${new Date().toISOString().slice(0, 10)}, 브랜치 ${branch}`
    },
  }
}
