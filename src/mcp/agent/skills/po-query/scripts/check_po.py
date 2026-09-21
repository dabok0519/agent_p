"""구매오더 번호 형식 검사. 44 또는 45 로 시작하는 10자리 숫자.

모델이 runScript 를 요청하면 main.ts 가 이 파일을 python 으로 실행한다.
사용: python check_po.py 4410000000
통과: 아무것도 안 찍고 exit 0
실패: 사유 한 줄 stdout, exit 1
"""
import re
import sys

if len(sys.argv) < 2:
    print("번호가 없다")
    sys.exit(1)

po = sys.argv[1].strip()

if not re.fullmatch(r"4[45]\d{8}", po):
    print(f"'{po}' 은 구매오더 번호 형식이 아니다. 44 또는 45 로 시작하는 10자리 숫자여야 한다")
    sys.exit(1)

sys.exit(0)
