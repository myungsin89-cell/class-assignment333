# 🚀 Neon 데이터베이스 설정 가이드

새로운 Neon 서버로 전환할 때 스키마를 자동으로 적용하는 방법입니다.

## 📝 사용 방법

### 1단계: DATABASE_URL 변경

`.env.local` 파일을 열고 새로운 Neon 서버 주소로 변경하세요:

```env
DATABASE_URL=postgresql://username:password@your-neon-host/database?sslmode=require
```

### 2단계: 데이터베이스 초기화

두 가지 방법 중 하나를 선택하세요:

#### 방법 1: 웹 인터페이스 사용 (권장)

1. 서버를 실행합니다: `npm run dev`
2. 브라우저에서 http://localhost:3000/init-db 접속
3. "데이터베이스 초기화 시작" 버튼 클릭
4. 완료되면 자동으로 메인 페이지로 이동

#### 방법 2: API 직접 호출

브라우저나 curl로 직접 호출:

```bash
curl http://localhost:3000/api/init-db
```

또는 브라우저에서:
```
http://localhost:3000/api/init-db
```

### 3단계: 확인

초기화가 완료되면 다음 테이블과 컬럼이 자동으로 생성됩니다:

**schools 테이블:**
- id, name, password, created_at

**classes 테이블:**
- id, school_id, grade, section_count, is_distributed, parent_class_id, section_statuses, created_at

**students 테이블:**
- id, class_id, section_number, name, gender
- is_problem_student, is_special_class, is_underachiever
- group_name, rank, previous_section
- birth_date, contact, notes
- created_at

## 🔄 기존 데이터베이스가 있는 경우

걱정하지 마세요! 초기화 스크립트는:
- 기존 테이블이 있으면 건너뜁니다 (CREATE TABLE IF NOT EXISTS)
- 누락된 컬럼만 추가합니다 (ADD COLUMN IF NOT EXISTS)
- 기존 데이터는 그대로 유지됩니다

## ⚠️ 주의사항

1. `.env.local` 파일이 `.gitignore`에 포함되어 있는지 확인하세요 (보안)
2. DATABASE_URL이 올바른지 확인하세요
3. Neon 데이터베이스에 접근 권한이 있는지 확인하세요

## 🆘 문제 해결

### "DATABASE_URL environment variable is not set" 오류
- `.env.local` 파일이 프로젝트 루트에 있는지 확인
- 서버를 재시작 (Ctrl+C 후 `npm run dev`)

### "Connection refused" 오류
- Neon 데이터베이스 URL이 올바른지 확인
- 네트워크 연결 확인
- Neon 대시보드에서 데이터베이스가 활성화되어 있는지 확인

### 스키마 초기화가 실패하는 경우
- 서버 로그를 확인하세요
- Neon 데이터베이스에 쓰기 권한이 있는지 확인
- `/api/init-db` 엔드포인트를 다시 호출해보세요
