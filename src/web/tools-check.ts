/**
 * 도구 2개를 모델 없이 직접 돌려 본다. SAP 실호출. 세 경우: 키워드 1개, 없는 키워드, 구매오더 조건 1개.
 *   npx tsx src/web/tools-check.ts
 */
import { tools } from './tools.js';

/**
 * execute 의 둘째 인자는 SDK 가 실제 실행 때 채워 주는 값(호출 id·그때까지 이력·실행 문맥). 직접 부를 땐 빈 값으로 흉내 낸다.
 * context 는 v7 에서 필수 칸. 우리 도구는 안 보니 빈 객체.
 */
const ctx = { toolCallId: 'check', messages: [], context: {} };

console.log('--- searchMaterials SMPS');
console.log(await tools.searchMaterials.execute!({ keywords: ['SMPS'] }, ctx));

console.log('--- searchMaterials 없는 키워드');
console.log(await tools.searchMaterials.execute!({ keywords: ['없는자재XYZ'] }, ctx));

console.log('--- searchPurchaseOrders companyCode');
/** TODO: 실제 있는 회사코드 하나 */
console.log(await tools.searchPurchaseOrders.execute!({ companyCode: '' }, ctx));
