---

name: po-query
description: SAP 구매오더 질문(헤더·품목 조회, 3-way match 검산)일 때. 번호 형식 검사와 도구 선택 절차.
---

# po-query

## Overview
도구 셋(searchPurchaseOrders·getPurchaseOrderDetails·threeWayMatch)의 역할·인자·결과 모양은 도구 목록의 설명에 있다. 여기는 순서(절차)와 참고 파일만.

참고 파일:
- references/codes.md — threeWayMatch 의 STATUS·action 코드 뜻
- scripts/check_po.py — 구매오더 번호 형식 검사

## 절차
1. 사용자가 구매오더 번호를 줬으면 먼저 runScript(skill=po-query, script=scripts/check_po.py, args=[번호]) 를 요청한다. 결과가 ok:false 면 stdout 의 사유를 그대로 사용자에게 되묻고 다른 도구를 요청하지 않는다.
2. 헤더(목록·업체·회사코드·통화·날짜)를 물었거나 번호를 모르면 searchPurchaseOrders. 헤더 질문이면 여기서 답하고 끝낸다. 품목은 조회하지 않는다. 업체는 이름이 아니라 코드(BP2100 처럼 BP 로 시작)다. 이름으로 물으면 코드를 되묻는다.
3. 품목(항목·자재·수량)을 물었을 때만 getPurchaseOrderDetails. 번호를 모르면 2 로 먼저 얻는다. 묻지 않은 것은 조회하지 않는다.
4. 3-way match(검산·불일치·입고·송장 확인)는 threeWayMatch 를 한 번만 요청한다. 업체·회사코드 범위 전체면 그 조건만 넣고 번호를 먼저 찾지 않는다. "3개만" 처럼 개수나 특정 오더가 정해져 있으면 searchPurchaseOrders 로 번호를 고른 뒤 poNumbers 로 넘긴다. 오래 걸린다.

번호는 항상 글자로 넣는다 ("4410000000").

## Next Steps
- 0건이면 조건을 하나 빼고 다시 조회한다.
- STATUS·action 코드 뜻이 필요하면 readFile(path=src/mcp/agent/skills/po-query/references/codes.md) 를 요청한다.
