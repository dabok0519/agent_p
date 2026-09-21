# threeWayMatch 코드

## STATUS (항목마다 하나. ABAP z_match 가 판정)

| STATUS | 뜻 | 조건 |
|---|---|---|
| OK | 정상 | 발주 = 입고 = 송장, 단가 같음 |
| GR_PENDING | 입고 대기 | 입고 < 발주 |
| GR_OVER | 과입고 | 입고 > 발주 |
| IR_OVER | 과청구 | 송장 > 입고 |
| IR_UNDER | 미청구 | 송장 < 입고 |
| PRICE_DIFF | 단가 다름 | 수량은 맞는데 발주 단가 ≠ 송장 단가 |

GR = Goods Receipt(입고), IR = Invoice Receipt(송장).

## action (불일치 줄마다 하나. 모델이 답 글자로 적어 주면 도구 코드가 넷 중 하나인지 검사해서 싣는다)

| action | 뜻 |
|---|---|
| 입고확인 | 창고에 실제로 들어왔는지 확인 |
| 송장보류 | 송장 지급을 멈춤 |
| 업체문의 | 업체에 사유 확인 |
| 대기 | 정상 진행 중. 기다림 |

mismatches 줄에 action 이 없으면 모델 답에 그 줄이 빠졌거나 검사를 못 통과한 것이다. status 만으로 답한다.
