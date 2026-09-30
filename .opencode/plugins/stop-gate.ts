/**
 * Claude Code 의 stop-gate.mjs(Stop) 를 OpenCode 로 옮긴 것.
 * 대응 = event hook 의 session.idle: 모델이 턴을 끝내고 쉬는 상태가 됐을 때 뜬다.
 * 다른 점: Claude 의 exit 2 처럼 "끝내지 못하게 막는" 힘이 없다(문서). 대신 tsc 가 실패하면
 * client.session.prompt 로 같은 세션에 이유를 새 메시지로 넣어 모델이 다시 일하게 한다.
 * 이게 실제로 이어지는지, `opencode run` 이 그 전에 꺼지는지는 실측 → 아래 결과 주석.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { execSync } from "node:child_process"

/** Claude 쪽 stop-gate.mjs 와 맞춘다 */
const MAX_LINES = 100
const HEADER = "tsc 실패. 아래 오류를 고치기 전엔 끝내지 마라"

export const StopGate: Plugin = async ({ client, directory }) => {
  /**
   * 무한 루프 가드 = Claude 의 stop_hook_active. 한 번 넣은 세션은 다음 idle 한 번을 그냥 보낸다.
   * 안 두면 tsc 가 계속 실패할 때 idle → 넣기 → idle → 넣기 가 끝없이 돈다.
   */
  const nudged = new Set<string>()

  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      const id = event.properties.sessionID
      if (nudged.has(id)) {
        nudged.delete(id)
        return
      }

      /** tsc 결과를 글자로. 통과면 빈 글자 (Claude 쪽 ③ 과 같다) */
      let tscOut = ""
      try {
        execSync("npx tsc --noEmit", { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      } catch (e: any) {
        const out = String(e.stdout ?? "") + String(e.stderr ?? "")
        tscOut = out.split("\n").filter((l) => l.trim() !== "").slice(0, MAX_LINES).join("\n")
      }

      let blocked = false
      const reason = HEADER + "\n" + tscOut

      /** TODO: tscOut 이 비어 있지 않으면 blocked = true (hook-lab/stop-gate.mjs 와 같은 조건) */
      if (tscOut !== "") blocked = true

      if (!blocked) return
      nudged.add(id)
      await client.session.prompt({ path: { id }, body: { parts: [{ type: "text", text: reason }] } })
    },
  }
}
