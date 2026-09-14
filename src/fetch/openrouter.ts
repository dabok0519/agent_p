/**
 * .env 파일의 값을 프로그램 밖 설정값으로 읽어 들인다.
 */
import 'dotenv/config';

/**
 * 도구 목록을 요청에 실으려고 가져온다. 상대 경로는 .js 확장자가 필요하다.
 */
import { tools } from './tools.js';

const apiKey = process.env.OPENROUTER_API_KEY;

/**
 * API 키 가드. IF … IS INITIAL. MESSAGE … TYPE 'E'. 와 같다.
 */
if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY 없음. .env 를 확인한다');
}

const model = 'qwen/qwen3.8-27b';
const only = ['reka/fp8']; // 'reka/fp8', 'akashml/fp8', 'CoreWeave/fp8'

/**
 * 응답 모양 선언. TYPES: BEGIN OF … END OF 처럼 구조를 미리 적는다.
 * 모양을 적을 뿐 실행할 때 검사하지 않는다. 검사는 ask() 안의 가드가 한다.
 */
/**
 * 이 세 이름을 main.ts 가 가져다 쓴다.
 */
export type ToolCall = { id: string; function: { name: string; arguments: string } };
export type Message = { role: string; content: string | null; tool_calls?: ToolCall[] };
/**
 * provider 는 어느 서버가 답했는지다. 중첩 인자를 잘 쓰는지가 서버마다 달라 기록해 둔다.
 */
export type ChatCompletion = { choices: { message: Message }[]; provider?: string };

/**
 * 한 번의 요청을 보내고 검사까지 마친 결과를 모델에게 return.
 * 왕복이 두 번이라 같은 코드를 두 번 쓰지 않으려고 묶었다.
 */
/**
 * main.ts 가 왕복할 때마다 이 이름을 부른다. 이력은 밖에서 받는다.
 */
export async function ask(messages: Record<string, unknown>[]): Promise<ChatCompletion> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ // JSON.stringfy : 객체 → 문자열로 변환
      model,
      messages,
      tools,
      provider: { only, require_parameters: true, allow_fallbacks: false },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter 호출 실패 ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  /**  res.json을 통해 json 규격의 텍스트가 아닌 json 규격의 객체(인스턴스)를 만드는 것 
  */

  /**
   * 응답 모양 가드. 되돌린 값에는 타입이 없어 여기서 확인한다.
   * 안 막으면 아래에서 없는 칸을 파고들다 엉뚱한 데서 멈춘다.
   */
  if (typeof json !== 'object' || json === null || !('choices' in json)) {
    throw new Error(`응답 모양이 다르다: ${JSON.stringify(json)}`);
  }
  // ChatCompletion에 맞춰서 필요한 값들을 json에 담아서 return

  return json as ChatCompletion;
}
