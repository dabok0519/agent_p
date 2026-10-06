---

name: po-query
description: 3-way match 검산(입고·송장 불일치 확인)을 할 때만. 호출 범위 정하기. 단순 헤더·품목 조회에는 읽지 않는다.
---

# po-query

## Overview
threeWayMatch 도구의 역할·인자·결과 모양은 도구 목록의 설명에 있다. 여기는 호출 범위를 정하는 절차만. 스크립트는 scripts/check_po.py 하나(번호 형식 검사).

## 절차
1. 업체·회사코드 범위 전체를 검산하면 그 조건만 넣고 threeWayMatch 를 요청한다. 번호를 먼저 찾지 않는다. 이 경우 3번은 건너뛴다.
2. "3개만" 처럼 개수나 특정 오더가 정해져 있으면 searchPurchaseOrders 로 목록을 받아 번호를 고른다. 개수만 정해져 있으면 목록의 앞에서부터 그 개수만큼 고른다.
3. 번호가 정해졌으면(사용자가 줬거나 2번에서 골랐으면) runScript(skill=po-query, script=scripts/check_po.py, args=[번호들]) 를 먼저 요청한다. ok:false 면 stdout 의 사유를 그대로 사용자에게 되묻고 threeWayMatch 는 요청하지 않는다.
4. 통과한 번호들을 poNumbers 에 넣어 threeWayMatch 를 한 번만 요청한다. 오래 걸린다.

번호는 항상 글자로 넣는다 ("4410000000").

## Next Steps
- mismatches 줄에 action 이 없으면 모델 답이 검사를 못 통과한 것이다. status 와 수량만으로 답한다.
