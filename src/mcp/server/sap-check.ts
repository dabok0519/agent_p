/**
 * SAP 호출만 따로 한 번 돌려보는 파일. 모델도 도구도 안 부른다.
 * 에이전트에 붙이기 전에 응답이 제대로 오는지 여기서 먼저 본다.
 */
import { fetchPurchaseOrders, fetchPurchaseOrderDetails, fetchPurchaseOrderMatch, fetchMaterials } from './sap.js';

/**
 * 결과가 돌아올 때까지 기다린다. await 를 빼면 값이 아니라
 * "나중에 준다"는 표(Promise, ABAP 에 없는 개념)만 찍힌다.
 * 빈 조건 {} 은 전체 조회다. 브라우저에서 본 건수와 같아야 한다.
 */
const all = await fetchPurchaseOrders({});
console.log('전체:', all.length, '건, 첫 줄:', all[0]);

/**
 * 조건 하나. 브라우저 &LIFNR=BP2100 건수와 같아야 한다.
 */
const byVendor = await fetchPurchaseOrders({ vendor: 'BP2100' });
console.log('BP2100:', byVendor.length, '건, 첫 줄:', byVendor[0]);

/**
 * 조건 둘 겹침. 브라우저 &BUKRS=1000&WAERS=VND 건수와 같아야 한다.
 */
const byTwo = await fetchPurchaseOrders({ companyCode: '1000', currency: 'VND' });
console.log('1000+VND:', byTwo.length, '건, 첫 줄:', byTwo[0]);

/**
 * 항목. 번호 둘 → 브라우저 &EBELN=4410000000,4420000008 과 같은 두 건, 각각 items 배열.
 */
const details = await fetchPurchaseOrderDetails({ poNumbers: ['4410000000', '4420000008'] });
console.log('항목:', details.length, '건, 첫 줄:', JSON.stringify(details[0]));

/**
 * 항목 조건. 수량 10 이상인 항목이 있는 오더만. 브라우저 &MENGE=10 과 같아야 한다.
 */
const byQty = await fetchPurchaseOrderDetails({ minQuantity: 10 });
console.log('수량≥10:', byQty.length, '건, 첫 줄:', JSON.stringify(byQty[0]));

/**
 * 3-way match. 브라우저 z_match?EBELN=4410000023 과 같은 한 줄, STATUS OK.
 */
const match = await fetchPurchaseOrderMatch({ poNumbers: ['4410000023'] });
console.log('match:', match.length, '건, 첫 줄:', JSON.stringify(match[0]));

/**
 * 자재. 브라우저 z_mm?TEXT=SMPS 와 같은 자재 둘(ML92A201563A·ST75P211A1/WHE) 창고별 여덟 줄.
 */
const materials = await fetchMaterials({ keywords: ['SMPS'] });
console.log('자재:', materials.length, '건, 첫 줄:', JSON.stringify(materials[0]));
