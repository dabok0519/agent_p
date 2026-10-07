/**
 * OpenRouter 를 AI SDK 의 "모델" 로 감싼다. agent.ts 의 streamText({ model }) 자리에 꽂는다.
 * src/web 전용 (src/sdk/model.ts 를 참고해 새로 씀).
 */

/**
 * .env 의 OPENROUTER_API_KEY 를 읽는다. createOpenRouter 가 process.env 에서 직접 찾으므로 먼저 떠 있어야 한다.
 */
import 'dotenv/config';

/**
 * OpenRouter provider (@openrouter/ai-sdk-provider). AI SDK 는 모델을 공통 인터페이스로 받아
 * OpenRouter 든 다른 회사든 같은 streamText 로 부른다. 이 패키지가 그 어댑터다.
 * 문서: https://ai-sdk.dev/providers/community-providers/openrouter
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

/**
 * 키 가드. IF … IS INITIAL. MESSAGE … TYPE 'E'. 와 같다.
 * createOpenRouter 는 키가 없어도 안 멈추고 첫 호출에서 401 만 준다. 여기서 먼저 끊어야 원인을 바로 안다.
 */
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY 없음. .env 를 확인한다');
}

/** TODO: 모델 ID (src/sdk/model.ts) */
const MODEL_ID = 'qwen/qwen3.8-27b';

/** TODO: 허용할 공급자 목록. 비우면 OpenRouter 가 아무 데나 보낸다 (src/sdk/model.ts) */
const PROVIDER_ONLY: string[] = ['reka/fp8','akashml/fp8','coreweave/fp8'];

/** TODO: 목록 밖 공급자로 넘어가도 되는지 (src/sdk/model.ts) */
const ALLOW_FALLBACKS = false;

/**
 * ① 키·주소를 품은 함수를 돌려준다. 
 * 원시 판 openrouter.ts 의 apiKey 변수 + 'https://openrouter.ai/api/v1/…' 글자 + Authorization 헤더가 이 한 줄 안에 들어간다.
 *
 */
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });


/**
 * ① 모델 하나를 고른다. 원시 판 ask() 가 body 에 넣던 { model, provider: { only, require_parameters, allow_fallbacks } } 가 여기다.
 * model 은 첫 인자, provider 는 extraBody 로.
 *  extraBody = Vercel AI SDK 가 모르는 OpenRouter 전용 칸을 요청 본문에 그대로 싣는 통로.
 * ② 안 쓰면: 모델 ID 가 없어 요청이 안 만들어진다. extraBody 를 빼면 OpenRouter 가 공급자를 아무 데나 고른다.
 * 원시 openrouter.ts 의 ask() 에서는 body: JSON.stringify({ model, messages, tools, provider: {...} }) 로 우리가 전부 직접 조립했으니 구분이 없었습니다. 
 */
export const model = openrouter(MODEL_ID, {
  extraBody: {  
    provider: {
      only: PROVIDER_ONLY,
      require_parameters: true,
      allow_fallbacks: ALLOW_FALLBACKS,
    },
  },
});
