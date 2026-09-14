/**
 * .env 파일의 값을 프로그램 밖 설정값으로 읽어 들인다.
 * 이 줄이 없으면 아래 키 가드에서 바로 멈춘다.
 */
import 'dotenv/config';

const apiKey = process.env.OPENROUTER_API_KEY;

/**
 * API 키 가드. IF … IS INITIAL. MESSAGE … TYPE 'E'. 와 같다.
 * 없으면 여기서 멈춘다. 안 멈추면 401 만 보고 원인을 못 찾는다.
 */
if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY 없음. .env 를 확인한다');
}

const model = 'qwen/qwen3.8-27b';

const only: string[] = ['reka/fp8', 'akashml/fp8', 'coreweave/fp8'];

/**
 * 다른 시스템에 HTTP 요청을 보낸다.
 * 400 이어도 에러가 안 나니 바로 아래에서 res.ok 를 본다.
 */
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { //completations : 문서 참조 
  method: 'POST',
  headers: {
    'Content-Type': 'application/json', // 받는 쪽에게 json으로 보낼 것이라는 정보 제공  
    Authorization: `Bearer ${apiKey}`, //  api 키를 기반으로 요청 보낸 사람 정보 인증  
  },
  /**
   * 이미 body가 json인데 content-type을 header에서 제공하는 이유 
   * -현재 모델은 content-type이 없어도 400에러를 내지 않는다.
   * -다만 현재 모델이 관대하기 때문에 json으로 읽을 수 있는 것이고 이는 다른 모델 사용 시 "보장"되지 않는다.
   * ---
   * 인증 방식은 Bearer만 있는 것이 아님 : Openrouter가 이를 요구하기에 쓰는 것ㄴ
  */


  /**
   * 네트워크(통로)로는 텍스트만 보낼 수 있고 양 방향은 JSON 규격으로 통신하면서 각자 객체를 만든다. 
   * -이에 객체 → 문자열로 변환해야 한다. 구조를 JSON 규격의 문자열로 바꾸는 것과 같다.
   * body에는 문자열만 실을 수 있어서 여기서 바꾼다.(네트워크는 문자열만 가능하기 때문이다.)
   * 
0  */
  body: JSON.stringify({
    model,
    messages: [
      { "role": "system"   , "content": "너는 무조건 반말로 싸가지 없이 말하는 에이전트야"},
      { "role": "user"     , "content": 'SAP 이 무엇인지 두 문장으로 설명해줘' }
    ],
    provider: {
      only,
      require_parameters: true,
      allow_fallbacks: false,
    },
  }),
});

/**
 * 응답 실패 가드. MESSAGE … TYPE 'E' 처럼 여기서 멈춘다.
 * 상태코드와 응답 내용을 같이 실어 던진다. 숫자만 던지면 원인이 사라진다.
 * ---
 * res로 if문을 짰다는 건 이미 응답이 끝났다고 생각했고 이에 await를 쓴 이유
 * - 응답은 두 부분으로 나눠 도착 (앞: 상태코드 , 헤더 / 뒤 : 본문 )
 * - 본문은 무거워 헤더보다 뒤에 도착할 수 있기에 await를 붙혀 대기
 */
if (!res.ok) {
  const text = await res.text();
  throw new Error(`OpenRouter 호출 실패 ${res.status}: ${text}`);
}

/**
 * 문자열 → 객체 변환. 문자열을 구조로 되돌리는 것과 같다.
 * 결과는 타입이 없다. 응답 타입은 실제 모양을 본 뒤에 정의한다.
 */
const json = await res.json();

//-------------------------------------------------------------------------------


/**
 * 응답 모양 선언. TYPES: BEGIN OF … END OF 처럼 구조를 미리 적는다.
 * 모양을 적을 뿐 실행할 때 검사하지는 않는다. 검사는 아래 가드가 한다.
 */
type ChatCompletion = {
  choices: { 
    index: number; 
    message: { 
      role: string; 
      content: string 
    } 
  }[];

  provider: string;
  model: string;
};

/**
 * 응답 모양 가드. IF … IS INITIAL. MESSAGE … TYPE 'E'. 와 같다.
 * 되돌린 값에는 타입이 없어, 여기서 확인해야 아래에서 마음 놓고 쓴다.
 */
if (typeof json !== 'object' || json === null || !('choices' in json)) {
  throw new Error(`응답 모양이 다르다: ${JSON.stringify(json)}`);
}

const parsed = json as ChatCompletion;

/**
 * READ TABLE … WITH KEY 뒤 sy-subrc 확인과 같다.
 * 못 찾으면 값이 없는 상태가 온다. 쓰기 전에 아래에서 검사한다.
 */
const first = parsed.choices[0];

if (!first) {
  throw new Error('응답에 답변 칸이 없다');
}

console.log(`답변 : ${first.message.content}`);
console.log(`처리한 업체 : ${parsed.provider}`);
