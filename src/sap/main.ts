/**
 * 요청 함수를 통신 담당 파일에서 가져온다. 상대 경로는 .js 확장자가 필요하다.
 */
import { ask } from './openrouter.js';

/**
 * 도구 실행 함수를 도구 담당 파일에서 가져온다.
 */
import { runTool } from './tools.js';

/**
 * 터미널에서 한 줄 입력을 받는 node 내장 기능. promises 판이라 await 로 기다릴 수 있다.
 */
import { createInterface } from 'node:readline/promises';

/**
 * 모델에게 미리 주는 지시. 질문보다 앞에 둬야 그 뒤 전부에 적용된다.
 * 여러 줄을 줄바꿈으로 이어 한 덩어리 글자로 만든다.
 */
const SYSTEM = [
  '너는 SAP 구매 오더 조회 도우미다. 도구로 데이터를 조회하고, 그 결과만으로 한국어로 정리해서 답한다.',
  '답에 쓰는 값은 도구가 반환한 결과에서 가져온다. 기억이나 추측으로 채우지 마라.',
  '조회하지 않은 대상을 "없다"고 단정하지 마라. 확인이 필요하면 도구를 먼저 불러라.',
  '필요한 데이터를 다 모으기 전에 결론을 내지 마라. 부분 조회 상태로 답하지 마라.',
  '구매오더 번호는 44 또는 45로 시작하는 10자리다(4410000000, 4420000008). 번호는 반드시 글자로 넣는다.',
  /** TODO: 공급업체가 이름이 아니라 코드(BP2100)라는 것. 이름으로 물어오면 어떻게 하라고 할지 */
  '공급업체(Vendor) 코드는 BP로 시작하며 , BP나 숫자가 아닌 이름으로 공급업체를 물을 시 사용자에게 이름은 존재하지 않는다고 반환한다. ',
  '구매 오더 세부 항목은 구매 오더 헤더의 정보를 가지지 않는다. 구매 오더 헤더의 정보를 사용자가 물어볼 시 구매오더 조회 도구를 사용한다. ',
  '도구는 둘이다. 헤더(poNumber·companyCode·vendor·orderDate·currency)는 searchPurchaseOrders, 품목(itemNumber·material·quantity)은 getPurchaseOrderDetails.',
  '구매 오더의 번호를 모르면 searchPurchaseOrders 로 번호를 얻는다. 번호를 알면 바로 getPurchaseOrderDetails.',
].join('\n');

/**
 * 대화 이력. 왕복할 때마다 여기에 쌓아서 통째로 다시 보낸다.
 * 서버는 지난 대화를 기억하지 않아 매번 전부 실어 보내야 한다.
 */
const messages: Record<string, unknown>[] = [
  { role: 'system', content: SYSTEM },
];

/** 최대 왕복 횟수. 모델이 끝을 안 내면 여기서 끊는다 */
const MAX_STEPS = 20;

/**
 * 질문 하나에 대한 도구 왕복 전체. 이력을 받아 답이 나올 때까지 돌고 답 글자를 돌려준다.
 * 이력은 밖에서 만들어 넘기므로 부를 때마다 이어진다.
 */
async function runAgent(messages: Record<string, unknown>[]): Promise<string> {
  /**
   * 최종 답변을 담을 자리. 반복문이 끝난 뒤 나왔는지 확인한다.
   */
  let answer: string | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await ask(messages);

    /**
     * READ TABLE 뒤 sy-subrc 확인과 같다. 못 찾으면 값이 없는 상태가 온다.
     */
    const choice = res.choices[0];
    if (!choice) {
      throw new Error('응답에 답변 칸이 없다');
    }

    const calls = choice.message.tool_calls;

    /**
     * 종료 판단은 finish_reason 으로 한다. stop 이면 답이 끝난 것이다.
     * 전에는 tool_calls 유무로 봤는데, 그러면 length(잘림)·error 도 답으로 오인한다.
     */
    if (choice.finish_reason === 'stop') {
      /**
       * 답도 이력에 남긴다. 안 남기면 다음 질문 때 모델이 자기가 뭐라 답했는지 모른다.
       */
      messages.push(choice.message);
      answer = choice.message.content;
      console.log(`[provider] ${res.provider}`);
      break;
    }

    /**
     * stop 도 tool_calls 도 아니면(length·error·모르는 값) 답이 아니다. 잘린 글을 답으로 찍지 않게 멈춘다.
     * || !calls 는 논리가 아니라 타입용이다. tool_calls 칸이 ? 라 있다고 확인해야 아래 for 가 컴파일된다.
     */
    if (choice.finish_reason !== 'tool_calls' || !calls) {
      throw new Error(`모델이 끝내지 못했다: finish_reason=${choice.finish_reason}`);
    }

    /**
     * 모델이 "도구를 불러 달라"고 한 그 발언을 이력에 그대로 남긴다.
     * 빼면 다음 요청에서 도구 결과가 어디에 딸린 것인지 서버가 모른다.
     */
    messages.push(choice.message);

    /**
     * LOOP AT 처럼 요청 하나하나를 돈다.
     * 결과를 하나라도 빠뜨리면 서버가 짝이 안 맞는다며 거절한다.
     */
    for (const call of calls) {
      /**
       * SAP 을 거치므로 결과가 올 때까지 기다린다.
       * await 을 빼면 결과가 아니라 "나중에 준다"는 표가 실려 아래에서 {} 로 찍힌다.
       */
      const result = await runTool(call.function.name, call.function.arguments);

      /**
       * 도구 실행 결과를 이력에 넣는다. 결과는 문자열로 실어야 한다.
       */
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  /**
   * 상한까지 돌았는데 답이 없으면 알린다.
   * 안 막으면 아무것도 안 찍히고 조용히 끝나 원인을 못 찾는다.
   */
  if (answer === null) {
    throw new Error(`왕복 ${MAX_STEPS}회 안에 답이 안 나왔다`);
  }

  return answer;
}

/**
 * 터미널 입출력 통로를 연다. 다 쓰면 close 해야 프로그램이 끝난다.
 */
const rl = createInterface({ input: process.stdin, output: process.stdout });

/**
 * 질문을 받아 답하고 다시 받는다. 끝내는 신호가 올 때까지 돈다.
 * messages 는 이 반복문 밖에 있어 질문마다 같은 이력에 쌓인다.
 */
while (true) {
  const question = (await rl.question('질문 : ')).trim();

  /**
   * 끝내는 신호. 빈 줄이면 반복문을 나간다. 멈춤이 아니라 정상 종료라 throw 가 아니다.
   */
  if (!question) {
    console.log('종료합니다.');
    break;
  }

  /**
   * 이 질문 전의 이력 길이. 실패하면 여기까지 되돌린다.
   */
  const before = messages.length;

  messages.push({ role: 'user', content: question });

  /**
   * TRY…CATCH…ENDTRY. runAgent 안의 throw 를 여기서 받는다.
   * 안 받으면 질문 하나 실패로 프로그램이 끝나고 앞 대화가 다 날아간다.
   */
  try {
    console.log(await runAgent(messages));
  } catch (e) {
    /**
     * ROLLBACK WORK. 실패한 질문에서 쌓인 것을 전부 잘라 낸다.
     * 안 자르면 결과 없는 도구 요청이 남아 다음 질문까지 서버가 거절한다.
     */
    messages.length = before;

    console.log(`실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

rl.close();
