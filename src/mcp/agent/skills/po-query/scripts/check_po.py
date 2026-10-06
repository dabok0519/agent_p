"""구매오더 번호 형식 검사. 인자로 받은 번호를 전부 본다.

모델이 runScript(skill=po-query, script=scripts/check_po.py, args=[번호들]) 를 요청하면
skills.ts 의 runLocalTool 이 이 파일을 python 으로 실행하고 stdout 과 exit code 를 글자로 돌려준다.
사용: python check_po.py 4410000000 4420000008
통과: 아무것도 안 찍고 exit 0
실패: 틀린 번호마다 사유 한 줄 stdout, exit 1
"""
import re
import sys

# 인자 전부. 앞뒤 공백은 지운다 (모델이 " 4410000000" 처럼 넣어도 같은 번호로 본다)
numbers = [a.strip() for a in sys.argv[1:]]

if not numbers:
    print("번호가 없다")
    sys.exit(1)

# 44 또는 45 로 시작하는 10자리 숫자. fullmatch = 글자 전체가 이 모양이어야 통과
PATTERN = r"4[45]\d{8}"

# 틀린 번호만 모은다
bad = [n for n in numbers if not re.fullmatch(PATTERN, n)]

for n in bad:
    print(f"'{n}' 은 구매오더 번호 형식이 아니다. 44 또는 45 로 시작하는 10자리 숫자여야 한다")

sys.exit(1 if bad else 0)
