/**
 * Claude Code 의 precompact-backup.mjs(PreCompact) 를 OpenCode 로 옮긴 것.
 * 대응 hook = experimental.session.compacting: 압축 시작 직전에 뜬다.
 * 다른 점: OpenCode 는 대화를 jsonl 파일이 아니라 SQLite(opencode.db) 에 두므로 파일 복사가 안 된다.
 * 대신 client.session.messages 로 대화를 받아 JSON 파일로 쓴다. 실패해도 압축은 그대로 가야 하니 throw 안 함.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const PrecompactBackup: Plugin = async ({ client, directory }) => {
  return {
    "experimental.session.compacting": async (input, _output) => {
      const dir = join(directory, "hook-lab", "backups")
      const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-opencode.json`
      try {
        /** 이 세션의 메시지 전부. Claude 의 transcript_path 읽기에 해당 */
        const res = await client.session.messages({ path: { id: input.sessionID } })
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, name), JSON.stringify(res.data ?? [], null, 2))
      } catch (e) {
        /** 백업 실패는 압축을 막을 이유가 아니다. 로그만 */
        console.error(`[hook precompact] 백업 실패: ${String(e)}`)
      }
    },
  }
}
