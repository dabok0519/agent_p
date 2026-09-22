---

name: po-query
description: 3-way match 검산(입고·송장 불일치 확인)을 할 때만. 호출 범위 정하기와 STATUS·action 코드 참고. 단순 헤더·품목 조회에는 읽지 않는다.
---

# po-query

## Overview
threeWayMatch 도구의 역할·인자·결과 모양은 도구 목록의 설명에 있다. 여기는 호출 범위를 정하는 절차와 참고 파일만.

참고 파일:
- references/codes.md — threeWayMatch 의 STATUS·action 코드 뜻

## 절차
1. 업체·회사코드 범위 전체를 검산하면 그 조건만 넣고 threeWayMatch 를 요청한다. 번호를 먼저 찾지 않는다.
2. "3개만" 처럼 개수나 특정 오더가 정해져 있으면 searchPurchaseOrders 로 번호를 고른 뒤 poNumbers 에 넣어 threeWayMatch 를 요청한다.
3. threeWayMatch 는 한 번만 요청한다. 오래 걸린다.

번호는 항상 글자로 넣는다 ("4410000000").

## Next Steps
- STATUS·action 코드 뜻이 필요하면 readFile(path=src/mcp/agent/skills/po-query/references/codes.md) 를 요청한다.
