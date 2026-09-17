/**
 * 그래프만 같은 프로세스에서 직접 돌려보는 파일. MCP 도 바깥 모델도 안 거친다. sap-check.ts 와 같은 성격.
 * 디버거용. graph-check.ts 는 서버를 자식 프로세스로 띄워 match-graph.ts 안 중단점이 안 걸린다.
 * 쓰는 법: match-graph.ts 에 중단점 → 이 파일을 편집기에 열고 F5("현재 파일").
 */
import { runGraph } from './match-graph.js';

/**
 * 번호 하나(OK). LLM 안 부른다. 노드 흐름(afterStart → fetchChunk → afterChunk → END)만 보기 좋다.
 */
const small = await runGraph({ poNumbers: ['4410000023'] }, 50);
console.log('4410000023:', small.summary, '| trace:', small.trace.join('>'));

/**
 * 불일치 셋. judge → check 까지 간다. LLM 한 번이라 2분쯤 걸린다.
 */
const three = await runGraph({ poNumbers: ['4410000057', '4110000054', '4550000003'] }, 50);
console.log('셋:', three.summary, '| trace:', three.trace.join('>'));
console.log(JSON.stringify(three.mismatches, null, 2));
