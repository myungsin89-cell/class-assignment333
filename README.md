# 🎓 반배정 프로그램 (Class Assignment System)

Next.js와 Neon PostgreSQL을 사용한 공정하고 편안한 반배정 시스템입니다.

## ✨ 주요 기능

### 📚 학급 관리
- 학년별 반 생성 및 관리
- 반 편성 기능 (균등 배치 알고리즘)
- 명렬표 작성 및 마감 관리

### 👨‍🎓 학생 정보 관리
- **기본 정보**: 이름, 성별, 생년월일, 연락처
- **학습 관리**: 석차, 특이사항, 이전 반 정보
- **특성 분류**:
  - 문제행동 학생
  - 특수교육 대상
  - 저성취 학생
- **그룹 관리**: 모둠별 분류 (그룹1~10)

### 🎯 편의 기능
- **엑셀 붙여넣기**: 대량 데이터 한번에 입력
- **드래그앤드롭 석차 지정**: 직관적인 순위 조정
- **분리 그룹 설정**: 특정 학생들 다른 반으로 배치
- **자동 반편성**: 성별, 석차, 특성 고려한 균등 배치

## 🗄️ Database Setup (Neon)

This project uses [Neon](https://neon.tech) as the PostgreSQL database provider.

### 1. Create a Neon Database

1. Go to [Neon Console](https://console.neon.tech/)
2. Create a new project
3. Copy your connection string (it will look like: `postgresql://username:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require`)

### 2. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` and add your Neon database URL:
   ```
   DATABASE_URL=your_neon_database_url_here
   ```

### 3. Database Schema

The database schema will be automatically initialized when you first run the application. It includes:
- `schools` - School information and authentication
- `classes` - Class management
- `students` - Student data

#### 🔄 자동 스키마 초기화

새로운 Neon 데이터베이스에 연결할 때 스키마를 자동으로 생성하는 기능이 있습니다:

**방법 1: 웹 인터페이스 (권장)**
1. 개발 서버 실행: `npm run dev`
2. 브라우저에서 http://localhost:3000/init-db 접속
3. "데이터베이스 초기화 시작" 버튼 클릭

**방법 2: API 직접 호출**
```bash
curl http://localhost:3000/api/init-db
```

**자동 생성되는 테이블:**
- `schools`: id, name, password, created_at
- `classes`: id, school_id, grade, section_count, is_distributed, parent_class_id, section_statuses, created_at
- `students`: id, class_id, section_number, name, gender, birth_date, contact, notes, is_problem_student, is_special_class, is_underachiever, group_name, rank, previous_section, created_at

자세한 내용은 `NEON_SETUP.md` 파일을 참조하세요.

### OAuth2 Deployment Architecture

This project is designed to support automatic deployment via OAuth2:
- Each user gets their own forked repository via GitHub OAuth2
- The repository is automatically deployed to Vercel
- Each user's deployment uses their own Neon database URL
- The `DATABASE_URL` environment variable should be set in Vercel environment settings

When deploying via OAuth2, the deployment script should:
1. Fork the repository to the user's GitHub account
2. Create a new Vercel project
3. Set the `DATABASE_URL` environment variable with the user's Neon database URL

## Getting Started

First, install dependencies and set up your environment:

```bash
npm install
# Copy and configure your .env.local file as described above
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 🚀 원클릭 배포 (Deploy with One Click)

### 방법 1: 배포 페이지 사용 (권장)

`deploy-page.html` 파일을 브라우저에서 열고 버튼을 클릭하면 자동으로:
1. ✅ GitHub에 저장소 복사 (Fork)
2. ✅ Vercel에 자동 배포
3. ✅ NeonDB 자동 생성 및 연결 (DATABASE_URL 자동 설정)

**로컬에서 파일 열기:**
```bash
# Windows
start deploy-page.html

# Mac/Linux
open deploy-page.html
```

### 방법 2: Deploy Button 직접 사용

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fchoimin1243%2Ffirst123&repository-name=student-management-system&project-name=student-management-system&integration-ids=oac_VqOgBHqhEoFTPzGkPd7L0iH6&env=DATABASE_URL,NEXT_PUBLIC_COINGECKO_API_KEY&envDescription=Environment%20variables%20required%20for%20the%20application&envLink=https%3A%2F%2Fgithub.com%2Fchoimin1243%2Ffirst123%2Fblob%2Fsong%2FREADME.md)

### ⚡ 자동 설정되는 것들

- **NeonDB (PostgreSQL)**: Vercel이 자동으로 생성하고 `DATABASE_URL`을 설정
- **GitHub 저장소**: 당신의 GitHub 계정으로 자동 Fork
- **배포 환경**: Production 환경으로 즉시 배포

### 📝 배포 후 할 일

1. Vercel에서 `NEXT_PUBLIC_COINGECKO_API_KEY` 환경 변수 설정 (선택사항)
   - CoinGecko API 무료 버전은 키가 필요 없습니다
2. 배포된 URL 방문하여 앱 확인!

## Deploy on Vercel (Manual)

If you prefer manual deployment, you can use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 📖 사용 가이드

### 1. 학교 등록 및 로그인
1. 메인 페이지에서 "학교 등록" 선택
2. 학교명과 비밀번호 입력하여 등록
3. 등록 후 자동으로 로그인됩니다

### 2. 학급 생성
1. 대시보드에서 학년 선택 (1~6학년)
2. 반 수 입력 (1~20개)
3. "학급 생성" 버튼 클릭

### 3. 학생 정보 입력

#### 방법 A: 수동 입력
- 각 필드에 직접 입력
- "+ 학생 추가" 버튼으로 행 추가
- 체크박스로 특성 표시

#### 방법 B: 엑셀 붙여넣기 (권장)
1. "엑셀 붙여넣기" 버튼 클릭
2. 엑셀에서 데이터 복사 (Ctrl+C)
3. 테이블 클릭 후 붙여넣기 (Ctrl+V)
4. "예시자료" 버튼으로 템플릿 다운로드 가능

### 4. 석차 및 그룹 설정
- **석차 지정**: "석차 지정" 버튼 → 드래그앤드롭으로 순위 조정
- **분리 그룹**: "반 내부 분리" 버튼 → 같은 반에 배치하지 않을 학생들 선택

### 5. 반편성 실행
1. 모든 학생의 석차가 입력되었는지 확인
2. "반편성" 버튼 클릭
3. 새로운 반 수 입력
4. 자동으로 균등 배치됨
   - 성별 비율 균등
   - 석차 균등 분배
   - 문제행동/특수교육/저성취 학생 분산
   - 분리 그룹 고려

### 6. 명렬표 마감
- "명렬표 마감" 버튼으로 해당 반의 입력 완료 표시
- 마감 후에도 수정 가능 ("마감 해지" 버튼)

## 🛠️ 기술 스택

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Neon PostgreSQL
- **DB Client**: @neondatabase/serverless
- **Drag & Drop**: @dnd-kit
- **Icons**: @heroicons/react
- **Password Hashing**: bcrypt

## 📁 주요 파일 구조

```
first123/
├── app/
│   ├── api/              # API Routes
│   │   ├── schools/      # 학교 인증
│   │   ├── classes/      # 학급 관리
│   │   ├── students/     # 학생 관리
│   │   └── init-db/      # DB 초기화
│   ├── students/         # 학생 입력 페이지
│   ├── classes/          # 학급 관리 페이지
│   ├── dashboard/        # 대시보드
│   └── init-db/          # DB 초기화 페이지
├── lib/
│   ├── db.ts             # DB 연결
│   └── db-schema.ts      # 스키마 초기화
├── NEON_SETUP.md         # DB 설정 가이드
└── package.json
```

## ⚠️ 주의사항

1. `.env.local` 파일은 절대 커밋하지 마세요 (보안)
2. 반편성은 되돌릴 수 없으니 신중하게 진행하세요
3. 데이터베이스 백업을 주기적으로 수행하세요
4. 프로덕션 환경에서는 비밀번호 복잡도를 높이세요

## 🐛 문제 해결

**Q: "DATABASE_URL is not set" 오류**
- A: `.env.local` 파일 확인 및 서버 재시작

**Q: 데이터가 저장되지 않음**
- A: http://localhost:3000/init-db 에서 DB 재초기화

**Q: 엑셀 붙여넣기가 안됨**
- A: "엑셀 붙여넣기" 버튼 클릭 후 테이블에 포커스

**Q: 반편성 후 학생이 사라짐**
- A: 새로운반의 각 반 번호를 확인하세요 (학생은 여러 반으로 분산됨)

---

**Made with ❤️ for Teachers**
