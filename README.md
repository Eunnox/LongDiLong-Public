# Long-Distance-Relationship

(현재 ing 작업중)

장거리 연애를 위한 AI 챗봇 웹앱입니다.

롱디 연애 중인 연인이 서로의 마음을 챗봇을 통해 전할 수 있도록 기획한 프로젝트입니다.  
한 사람이 자신의 말투와 감정을 담아 챗봇을 만들고, 초대 코드를 통해 멀리 떨어진 연인이 그 챗봇과 대화할 수 있도록 구성했습니다.  
즉, 단순한 AI 채팅 서비스가 아니라 연인이 직접 챗봇의 성격을 만들고, 그 챗봇을 관계의 매개로 사용하게 하는 경험을 목표로 했습니다.

이 작업은 Product / Interaction / UXUI Designer의 관점에서, 감정의 흐름과 대화의 톤, 공유 방식까지 하나의 제품 경험으로 설계해 본 바이브 코딩 기반 포트폴리오 프로젝트입니다.

사용자는 구글 로그인 후 자신만의 챗봇 아이덴티티를 만들고 초대 코드를 생성할 수 있습니다.  
연인은 그 코드를 입력해 챗봇과 대화를 시작하고, 챗봇을 만든 사람은 공유 전에 프롬프트를 다듬고 테스트해볼 수 있습니다.

<p align="center">
  <img src="./client/src/assets/images/ldl_main.png" alt="login background" width="180" />
</p>


## 핵심 흐름

1. 구글 계정으로 로그인
2. 오너가 챗봇 이름과 아이덴티티 프롬프트를 작성
3. 초대 코드를 생성해 연인에게 공유
4. 연인이 코드를 입력하고 챗봇과 대화 시작
5. 오너는 대시보드에서 프롬프트를 수정하고 테스트 후 다시 다듬기

## 주요 기능

- Google Sign-In 로그인
- 오너와 연인 역할을 분리한 사용 흐름
- 초대 코드 생성과 코드 중복 방지 로직
- 챗봇 프롬프트 수정 및 테스트 미리보기
- 연인 전용 채팅 화면과 고양이 버튼 신호 기능
- MySQL + Drizzle 기반 데이터 저장
- 실제 AI를 켜기 전에도 개발 가능한 fallback 구조

## 기술 스택

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: Express, tRPC, TypeScript
- Database: MySQL, Drizzle ORM
- Auth: Google Sign-In

## 환경 변수

프로젝트 루트에 `.env` 파일을 만들고 아래 값을 채워주세요.

```env
VITE_OAUTH_PORTAL_URL=http://localhost:3000
VITE_APP_ID=test-app
OAUTH_SERVER_URL=http://localhost:3000
JWT_SECRET=your-jwt-secret

GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DB_NAME

ENABLE_REAL_AI=false
BUILT_IN_FORGE_API_KEY=your-llm-api-key
```

주요 값 설명:
- `DATABASE_URL`: MySQL 연결 정보
- `ENABLE_REAL_AI=false`: 실제 AI 호출 비활성화, 개발용 fallback 답변 사용
- `ENABLE_REAL_AI=true`: 실제 AI 호출 활성화
- `BUILT_IN_FORGE_API_KEY`: 실제 AI 호출에 필요한 키

## 실행 방법

### 1. 패키지 설치

```bash
pnpm install
```

### 2. 데이터베이스 반영

```bash
pnpm db:push
```

### 3. 개발 서버 실행

```bash
pnpm run dev
```

개발 서버 기본 주소:

```text
http://localhost:3000
```

## 개발 메모

- 실제 AI 키가 없어도 오너 대시보드의 테스트 기능은 fallback 답변으로 동작합니다.
- 실제 AI 모델 테스트를 하려면 `ENABLE_REAL_AI=true`와 `BUILT_IN_FORGE_API_KEY`가 모두 필요합니다.
- MySQL이 연결되지 않은 로컬 개발 환경에서는 일부 데이터가 개발용 파일로 저장될 수 있습니다.

## GitHub 업로드 전 체크

- `.env`는 커밋하지 않기
- `.env.example`에는 형식만 남기고 실제 비밀값은 비워두기
- README 설명이 현재 서비스 흐름과 맞는지 확인하기

이미 민감한 값이 Git에 올라갔다면 `.gitignore`만으로는 해결되지 않습니다.  
반드시 비밀번호와 키를 재발급하는 것이 안전합니다.
