/**
 * node 내장 SQLite. 파일 하나가 DB 다. 새 의존성 없음 (node 22.13+).
 * Sync 판이라 await 가 없다. 이력은 작아서 기다려도 된다.
 */
import { DatabaseSync } from 'node:sqlite';

/**
 * 세션 목록 한 줄 모양.
 */
export type SessionRow = { id: number; startedAt: string; title: string };

/**
 * DB 를 열고 이력을 읽고 쓰는 함수 묶음을 돌려준다. 테이블이 없으면 만든다.
 * 세션 = 프로그램 한 번 실행. 메시지는 messages 배열 원소를 JSON 글자 그대로 저장한다.
 * SYSTEM 은 저장 안 한다. 코드에서 매번 새로 넣어야 바꾼 지시가 옛 세션에도 먹는다.
 */
/**
 * main.ts 가 시작할 때 부른다.
 */
export function openHistory(path: string) {
  const db = new DatabaseSync(path);

  /**
   * CREATE TABLE IF NOT EXISTS 라 두 번 실행해도 두 개 안 생긴다.
   * body 는 메시지 통째 JSON. role·content·tool_calls·tool_call_id 가 다 그 안에 있어 칸으로 안 푼다.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      started_at TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      body TEXT NOT NULL
    );
  `);

  /**
   * SQL 을 미리 컴파일해 둔다. ? 자리에 값을 바인딩한다. ABAP 의 호스트 변수 @lv 와 같다.
   * 값을 글자에 이어 붙이면 안 된다. 따옴표 하나로 SQL 이 깨진다.
   */
  const insertSession = db.prepare(`INSERT INTO sessions (started_at) VALUES (?)`);
  const updateTitle = db.prepare(`UPDATE sessions SET title = ? WHERE id = ?`);
  const selectSessions = db.prepare(`SELECT id, started_at, title FROM sessions ORDER BY id DESC LIMIT ?`);
  const selectMessages = db.prepare(`SELECT body FROM messages WHERE session_id = ? ORDER BY seq`);
  const selectMaxSeq = db.prepare(`SELECT COALESCE(MAX(seq), 0) AS max FROM messages WHERE session_id = ?`);
  const insertMessage = db.prepare(`INSERT INTO messages (session_id, seq, body) VALUES (?, ?, ?)`);

  return {
    /**
     * 최근 세션부터. 시작 때 고르는 목록용.
     */
    listSessions(limit: number): SessionRow[] {
      const rows: SessionRow[] = [];
      for (const r of selectSessions.all(limit)) {
        /** all() 결과는 칸 타입이 없어 하나씩 본다. 우리가 넣은 값이라 틀리면 코드 버그 */
        if (typeof r.id !== 'number' || typeof r.started_at !== 'string' || typeof r.title !== 'string') {
          throw new Error(`sessions 줄 모양이 다르다 ${JSON.stringify(r)}`);
        }
        rows.push({ id: r.id, startedAt: r.started_at, title: r.title });
      }
      return rows;
    },

    /**
     * 새 세션 한 줄. INSERT 뒤 자동 번호를 돌려받는다.
     */
    createSession(): number {
      const result = insertSession.run(new Date().toISOString());
      return Number(result.lastInsertRowid);
    },

    /**
     * 세션 제목. main.ts 의 makeTitle 이 모델에게 한 줄 요청해 받은 글자를 넘긴다. 모델 호출이 실패하면 첫 질문 글자. 목록에서 알아보려고.
     */
    setTitle(sessionId: number, title: string): void {
      updateTitle.run(title, sessionId);
    },

    /**
     * 세션의 메시지를 seq 순으로. JSON.parse 결과는 타입이 없어 객체인지 본다.
     */
    loadMessages(sessionId: number): Record<string, unknown>[] {
      const messages: Record<string, unknown>[] = [];
      for (const r of selectMessages.all(sessionId)) {
        if (typeof r.body !== 'string') throw new Error(`messages.body 가 글자가 아니다 ${JSON.stringify(r)}`);
        const parsed: unknown = JSON.parse(r.body);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error(`messages.body 가 객체가 아니다 ${r.body}`);
        }
        messages.push({ ...parsed });
      }
      return messages;
    },

    /**
     * 질문 하나가 성공한 뒤 새로 쌓인 메시지들을 seq 이어서 넣는다.
     * 트랜잭션. 중간에 실패하면 전부 취소돼 반쪽 이력이 안 남는다. COMMIT WORK / ROLLBACK WORK.
     */
    appendMessages(sessionId: number, msgs: Record<string, unknown>[]): void {
      const row = selectMaxSeq.get(sessionId);
      let seq = typeof row?.max === 'number' ? row.max : 0;
      db.exec('BEGIN');
      try {
        for (const m of msgs) {
          seq += 1;
          insertMessage.run(sessionId, seq, JSON.stringify(m));
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },

    close(): void {
      db.close();
    },
  };
}
