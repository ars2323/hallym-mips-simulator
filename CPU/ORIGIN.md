# CPU/ — 출처

**이 디렉터리는 수정하지 않는다.**

SPIM 시뮬레이터 코어(James R. Larus, BSD 라이선스)다. Qt판 저장소의 설계 원칙 —
코어는 손대지 않고, 필요한 것은 전부 바깥(프런트엔드)에서 한다 — 을 이 저장소도 따른다.
코어의 동작을 바꿔야 할 일이 생기면 여기를 고치지 말고 `native/src/addon.cc` 쪽에서
코어 함수를 감싸거나 한 줄씩 따라 쓴다(`readAssemblyText` 가 그 예).

| 항목 | 값 |
|---|---|
| 원본 저장소 | `github.com/ars2323/hallym-mips-simulator` (Qt판) |
| 원본 커밋 | `c20d0c3` (`c20d0c36c0551e547b4700d9b6707802d39e03ab`) |
| 복사한 날 | 2026-09-24 |
| 복사한 것 | 그 커밋의 `CPU/` 전체, 바이트 그대로 |
| 그 너머의 원본 | Qt판 태그 `vanilla-9.1.24` (SPIM/QtSpim 9.1.24, SVN r764) — `c20d0c3` 의 `CPU/` 는 이 태그와 같다 |

이 파일(`ORIGIN.md`)만 이 저장소에서 더한 것이다.

## 두 저장소의 CPU/ 가 같은지 확인하기

```sh
# 작업 트리끼리
diff -r --exclude=ORIGIN.md ~/workspace/hallym-mips-simulator/CPU CPU

# 커밋 기준으로 (Qt판 작업 트리 상태와 무관하게)
for f in CPU/*; do [ "$f" = CPU/ORIGIN.md ] && continue
  printf '%s %s\n' "$(git hash-object "$f")" "${f#CPU/}"; done \
| diff - <(git -C ~/workspace/hallym-mips-simulator ls-tree -r c20d0c3 CPU \
           | awk '{print $3, substr($4, 5)}')
```

둘 다 출력이 없으면 같다. 복사한 날 두 번째 명령으로 확인했다.
