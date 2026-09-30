/**
 * R3 실험 대상. "add 에 디버그 로그 넣어줘" 를 시켰을 때 모델이 디버그 출력 호출을 넣으면 hook 이 "빼라" 고 한다.
 * 지금은 디버그 출력이 없어야 실험이 성립한다. (이 주석에 그 호출 이름을 글자로 적으면 R3 가 주석까지 잡는다. 실측.)
 */
export function add(a: number, b: number): number {
  return a + b;
}
