# 계정별 공시 캘린더 DB

연결된 기존 Supabase 프로젝트 `zyagwjbntxtihppagtkk` (서울)에 전용 네임스페이스를 추가했다. 기존 P/L 테이블·정책·Auth 설정은 변경하지 않았다.

- `public.disclosure_calendar_entries`: 사용자 UUID, 항목 종류(settings/overrides/done/custom), 안정적인 업무 키, JSON 값, 버전, 수정일. 복합 PK의 선두 user_id로 계정별 조회를 지원한다.
- `public.disclosure_calendar_apply(jsonb)`: SECURITY INVOKER. 변경 항목을 하나의 트랜잭션으로 적용한다. 버전이 다르면 40001로 전체 취소한다. 삭제는 null tombstone으로 남겨 오래된 탭에서의 복원을 방지한다.
- RLS: SELECT/INSERT/UPDATE 모두 `(select auth.uid()) = user_id`. UPDATE는 USING과 WITH CHECK를 모두 적용했다. 익명 읽기·쓰기와 직접 DELETE를 허용하지 않는다.
- 프론트엔드는 publishable key만 사용한다. 개인 데이터는 GitHub에 커밋하지 않는다. SDK가 로그인 세션 갱신을 관리한다.

`calendar-schema.sql`은 적용된 최종 스키마의 검토용 원본이다. 이미 적용된 운영 DB에서 그대로 재실행하지 않는다. 호스팅 DB에 MCP apply_migration으로 `create_disclosure_calendar_sync`, `enforce_calendar_version_for_missing_rows` 두 이력을 적용했다. 향후 스키마 변경은 Supabase CLI `migration new` 또는 연결 도구의 마이그레이션 기능을 사용한다.

## 검증 (2026-11-18)

- authenticated 역할과 JWT claim으로 RPC 생성→조회→변경→삭제 tombstone, 오래된 버전 거부, 다른 사용자 claim에서 비노출을 검증했다. 트랜잭션을 rollback하여 검증 데이터는 남기지 않았다.
- anon 테이블 SELECT·RPC 실행 권한 없음 확인. 새 테이블 RLS 활성화. 새 함수는 invoker이며 빈 search_path를 사용한다.
- 보안 advisor에 새 캘린더 테이블·함수 관련 지적은 없었다. 기존 다른 앱 함수의 SECURITY DEFINER 공개 실행 경고와 프로젝트의 유출 비밀번호 보호 비활성 경고는 이번 범위에서 변경하지 않았다. [함수 권한 안내](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [비밀번호 보호 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- 기존 앱 계정의 비밀번호를 제공받지 않았으므로 실제 브라우저 로그인 후 저장·기기 간 재접속 검증은 미실시. 사용자 로그인 이후 확인이 필요하다. 비밀번호를 코드나 대화에 저장하지 않는다.

공식 자료: [비밀번호 로그인](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [변경 이력](https://supabase.com/changelog.md).
