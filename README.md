# VTWork — 보이스튜닝 스케쥴 관리

React + Vite + Firebase(Firestore/Auth). 배포는 Netlify.

---

## 다른 컴퓨터에서 이어서 작업하기

코드는 git 에 있지만, **비밀 정보와 데이터 백업은 git 에 없다.** 아래 4단계만 하면 된다.

### 1. 코드 받기

```bash
git clone https://github.com/cho0123/vt-work.git
cd vt-work
git checkout refactor/split-app     # 리팩터링 작업 브랜치
npm install
```

### 2. 개발 서버 실행 — 여기까지만 해도 개발은 된다

```bash
npm run dev
```

`.env.development` 는 git 에 들어 있어서, 바로 **개발용 Firebase(vt-work-dev-eeeaa)** 에 붙는다.
브라우저 탭 제목에 `[개발DB]` 가 보이면 정상이다. 운영 데이터에는 닿지 않는다.

로그인은 개발 프로젝트에 만들어 둔 계정을 쓴다.

### 3. 서비스 계정 키 (백업·검증 스크립트를 쓸 때만 필요)

git 에 올리지 않는다. Firebase 콘솔에서 새로 받으면 된다.

**콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성**

| 파일명 | 프로젝트 | 용도 |
|---|---|---|
| `key-A.json` | `vt-schedule-12568` (운영) | 백업, 규칙 배포 |
| `key-C.json` | `vt-work-dev-eeeaa` (개발) | 개발 DB 조작·검증 |

프로젝트 루트에 두면 된다. `.gitignore` 에 이미 등록돼 있다.

### 4. 데이터 백업 파일

`backup/prod-*.json` 도 git 에 없다. `key-A.json` 이 있으면 새로 만들면 된다.

```bash
npm run backup        # 운영 데이터를 로컬 JSON 으로 (읽기 전용)
```

일부 검증 스크립트(`verify-billing`)가 이 파일을 쓴다.

> `.env` (운영 Firebase 설정)는 로컬에서 `npm run build` 를 할 때만 필요하다.
> 배포는 Netlify 환경변수를 쓰므로 없어도 된다. 필요하면 `.env.example` 참고.

---

## Firebase 프로젝트

| | 프로젝트 ID | 용도 |
|---|---|---|
| 운영 | `vt-schedule-12568` | 실제 데이터. `npm run build` / Netlify 배포가 여기를 본다 |
| 개발 | `vt-work-dev-eeeaa` | 운영 데이터 사본. `npm run dev` 가 여기를 본다 |

**개발 중에는 운영에 연결하지 않는다.** 탭 제목의 `[개발DB]` 표시로 확인할 수 있고,
운영 DB에 붙은 채로 로컬 개발을 하면 제목에 경고가 뜬다.

보안 규칙(`firestore.rules`)은 허용된 계정 UID 만 접근하도록 되어 있다.
계정을 추가하려면 콘솔에서 사용자를 만든 뒤 UID 를 규칙에 넣고 재배포한다.

---

## 명령어

### 개발

```bash
npm run dev        # 개발 서버 (개발 DB)
npm run build      # 운영 빌드
npm run lint       # ESLint
```

### 데이터

```bash
npm run backup           # 운영 -> 로컬 JSON (읽기 전용)
npm run verify-backup    # 백업 파일 무결성 확인
npm run seed-dev         # 백업 -> 개발 DB (운영이면 실행 거부)
npm run verify-dev       # 개발 DB 를 백업과 전수 대조 (읽기 많음)
npm run verify-dev-cheap # 문서 수만 대조 (집계 쿼리라 거의 공짜)
```

### 회귀 검증

리팩터링 전후 결과가 같은지 확인하는 스크립트들. 고치고 나면 돌려본다.

```bash
npm run verify-rotation      # 로테이션(R1,R2...) 계산 — 개발 DB 읽음
npm run verify-billing       # 금액 계산식 — 로컬 백업만 사용
npm run verify-badge         # 배지 색상 — 순수 함수만
npm run verify-transaction   # 동시 저장 시 미수금 유실 방지 — 개발 DB
npm run verify-student-edit  # 학생 수정이 결제 결과를 덮지 않는지 — 개발 DB
```

### 보안 점검

```bash
node scripts/show-rules.js key-A.json       # 배포된 보안 규칙
node scripts/check-signup.js key-A.json     # 신규 가입 차단 여부
node scripts/list-auth-users.js key-A.json  # 계정/UID 목록
node scripts/deploy-rules.js key-A.json --yes --prod   # 규칙 배포
node scripts/verify-rules-prod.js           # 미로그인 접근이 막히는지
```

---

## 주의사항

- **일일 읽기 한도**: 무료 요금제는 하루 5만 건이다. 출석부·학생관리 탭은 로테이션
  계산 때문에 스케쥴 전체를 읽으므로, 검증 스크립트를 반복해서 돌리면 금방 소진된다.
  한도에 닿으면 그날은 저장도 조회도 막힌다(요금제를 올려도 당일에는 안 풀린다).
  로컬 캐시를 켜둬서 반복 방문은 저렴하지만, 스크립트는 아껴서 쓸 것.
- **셸 작업 디렉토리**: 다른 프로젝트와 경로 구조가 비슷하니, 명령 실행 전 위치를 확인할 것.
