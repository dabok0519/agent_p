import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ask } from './agent.js';

// 실제로 LLM 을 호출한다. 질문당 10~55초 걸리고 비용이 든다.
// concurrency: true 로 4개를 동시에 돌려 가장 느린 하나 시간에 끝낸다.
// 답변 문장은 매번 조금씩 달라지므로, 문서번호처럼 표현이 고정된 것만 확인한다.
//
// 목업 기준 (src/mock-data.ts)
//   4500000004 LG Chem  — 송장·입고 둘 다 없음
//   4500000001 Siemens  — 입고 5000000001(100EA), 5000000002(40EA)
//   4500000003 Hyundai  — 오더 42,000 = 송장 30,000 + 12,000
//   5100000002, 5100000004 — grNumber 가 null (입고 참조 없음)




describe('SAP 에이전트', { concurrency: true }, () => {

  it('송장이 없는 구매오더는 4500000004 하나다', async () => {
    const { text } = await ask('송장이 없는 구매오더 알려줘');

    assert.ok(text.includes('4500000004'), '4500000004 가 답변에 없다');
    assert.ok(text.includes('LG Chem'), 'LG Chem 이 답변에 없다');
  });

  it('4500000001 의 입고 2건을 조회해서 답한다', async () => {
    const { text, tools } = await ask('구매오더 4500000001 의 입고 내역 보여줘');

    assert.ok(tools.includes('searchGoodsReceipts'), '입고 도구를 부르지 않았다');
    assert.ok(text.includes('5000000001'), '입고 5000000001 이 답변에 없다');
    assert.ok(text.includes('5000000002'), '입고 5000000002 가 답변에 없다');
  });

  it('3사 대조에서 세 문서를 모두 조회한다', async () => {
    const { text, tools } = await ask(
      'Hyundai Mobis 와 Bosch 의 오더·입고·송장을 대조해서 안 맞는 건 정리해줘',
    );

    // 예전에 입고를 빼먹고 답하던 지점이다. 답변 텍스트만으로는 잡히지 않는다.
    assert.ok(tools.includes('searchPurchaseOrders'), '구매오더를 조회하지 않았다');
    assert.ok(tools.includes('searchGoodsReceipts'), '입고를 조회하지 않았다');
    assert.ok(tools.includes('searchInvoices'), '송장을 조회하지 않았다');

    assert.ok(text.includes('5100000002'), '입고 미연결 송장 5100000002 를 못 찾았다');
    assert.ok(text.includes('5100000004'), '입고 미연결 송장 5100000004 를 못 찾았다');
  });

  it('분할 송장을 합산해서 금액이 맞다고 판단한다', async () => {
    const { text } = await ask('구매오더 4500000003 의 오더 금액이랑 송장 금액이 맞는지 확인해줘');

    // 송장 30,000 + 12,000 = 42,000. 한 건만 보고 답하면 이 값이 안 나온다.
    assert.ok(text.includes('42,000'), '송장 합산 42,000 이 답변에 없다');
  });

});

// ── 표현이 달라도 같은 결과를 내는가 ─────────────────────────────
// 같은 의도를 여러 말로 던진다. 깨지면 도구 description 을 고쳐야 한다는 신호다.
// 목업에서 OPEN 은 4500000001(Siemens), 4500000002(Bosch), 4500000005(SAP SE) 세 건.

const 미결_표현 = [
  'OPEN 상태인 구매오더 알려줘',
  '미결 PO 목록 뽑아줘',
  '아직 진행 중인 구매오더 뭐 있어?',
  '완료되지 않은 발주 보여줘',
];

describe('표현이 달라도 미결 구매오더를 찾는다', { concurrency: true }, () => {

  for (const 질문 of 미결_표현) {
    it(`"${질문}"`, async () => {
      const { text, tools } = await ask(질문);

      assert.ok(tools.includes('searchPurchaseOrders'), '구매오더 도구를 부르지 않았다');

      // BLOCKED 인 4500000004 를 포함시키는지는 해석에 따라 갈리므로 OPEN 세 건만 본다
      for (const po of ['4500000001', '4500000002', '4500000005']) {
        assert.ok(text.includes(po), `OPEN 오더 ${po} 가 답변에 없다`);
      }
    });
  }

});
