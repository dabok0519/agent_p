/**
 * 검사 함수만 따로 돌리는 시험. 모델을 부르지 않아 비용도 시간도 안 든다.
 * ABAP Unit 처럼 결과를 자동으로 맞춰 본다. 입력이 같으면 결과가 같아 고정값으로 확인한다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * 손으로 쓴 검사 함수를 도구 파일에서 가져온다. 상대 경로는 .js 확장자가 필요하다.
 */
import { validatePurchaseOrderInput, validatePurchaseOrderDetailsInput } from './tools.js';

test('정상 입력은 값이 그대로 담긴다', () => {
  const r = validatePurchaseOrderInput('{"status":"OPEN","vendor":"Bosch"}');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, { status: 'OPEN', vendor: 'Bosch' });
});

test('상태가 고정값 밖이면 실패하고 사유에 칸 이름이 있다', () => {
  const r = validatePurchaseOrderInput('{"status":"open"}');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /status/);
});

test('업체명에 숫자가 오면 실패하고 사유에 칸 이름이 있다', () => {
  const r = validatePurchaseOrderInput('{"vendor":123}');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /vendor/);
});

/**
 * 새 객체에 아는 칸만 옮겨 담으므로 모르는 칸은 사라진다. 그대로 넘기면 통과 못 한다.
 */
test('모르는 칸은 결과에서 사라진다', () => {
  const r = validatePurchaseOrderInput('{"status":"OPEN","hacker":"x"}');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, { status: 'OPEN' });
});

test('JSON 이 아닌 글자는 실패하고 사유에 그 글자가 남는다', () => {
  const r = validatePurchaseOrderInput('not json');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /not json/);
});

/**
 * 배열 인자. 모델이 배열 대신 글자 하나로 뭉치거나, 안에 숫자를 섞는 경우를 막는지 본다.
 */
test('배열 인자: 정상 배열은 그대로 담긴다', () => {
  const r = validatePurchaseOrderDetailsInput('{"poNumbers":["4500000001","4500000003"]}');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, { poNumbers: ['4500000001', '4500000003'] });
});

test('배열 인자: 배열 대신 글자 하나가 오면 실패한다', () => {
  const r = validatePurchaseOrderDetailsInput('{"poNumbers":"4500000001,4500000003"}');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /배열이 아니다/);
});

test('배열 인자: 안에 숫자가 섞이면 몇 번째인지 사유에 남는다', () => {
  const r = validatePurchaseOrderDetailsInput('{"poNumbers":["4500000001",4500000003]}');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /poNumbers\[1\]/);
});

/**
 * 배열 안 객체. 칸이 객체가 아니거나, 객체 안 필수 칸이 없거나, 안쪽 타입이 틀린 경우를 막는지 본다.
 */
test('배열 안 객체: 정상 조건은 그대로 담긴다', () => {
  const r = validatePurchaseOrderDetailsInput('{"items":[{"material":"Steel","minQty":100},{"material":"Bearing"}]}');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, { items: [{ material: 'Steel', minQty: 100 }, { material: 'Bearing' }] });
});

test('배열 안 객체: 객체 대신 글자가 오면 몇 번째인지 사유에 남는다', () => {
  const r = validatePurchaseOrderDetailsInput('{"items":["Steel"]}');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /items\[0\]/);
});

test('배열 안 객체: 자재명이 없으면 실패한다', () => {
  const r = validatePurchaseOrderDetailsInput('{"items":[{"minQty":100}]}');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /items\[0\]\.material/);
});

test('배열 안 객체: 최소 수량에 글자가 오면 실패한다', () => {
  const r = validatePurchaseOrderDetailsInput('{"items":[{"material":"Steel","minQty":"100"}]}');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /items\[0\]\.minQty/);
});

/**
 * 객체 안 객체. 배열이 없으니 "몇 번째"는 없고 칸 이름을 점으로 잇는다.
 */
test('객체 안 객체: 정상 헤더 조건은 그대로 담긴다', () => {
  const r = validatePurchaseOrderDetailsInput('{"header":{"vendor":"Bosch","status":"OPEN"}}');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, { header: { vendor: 'Bosch', status: 'OPEN' } });
});

test('객체 안 객체: 객체 대신 글자가 오면 실패한다', () => {
  const r = validatePurchaseOrderDetailsInput('{"header":"Bosch"}');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /header: 객체가 아니다/);
});

test('객체 안 객체: 안쪽 상태가 고정값 밖이면 칸 경로가 사유에 남는다', () => {
  const r = validatePurchaseOrderDetailsInput('{"header":{"status":"open"}}');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /header\.status/);
});
