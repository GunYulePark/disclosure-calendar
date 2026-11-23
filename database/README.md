# 공시 캘린더 전용 DB

현재 프로젝트: `vkfdnrqpnzehowsbjmuf` / disclosure-calendar / TEST / 서울. 기존 재무 앱과 Auth·테이블·함수를 분리했다. 사용자별 물리 DB 대신 같은 프로젝트 안의 user_id 기반 데이터 공간을 RLS로 격리한다.

적용 SQL 검토 원본(이미 적용된 DB에서 그대로 재실행하지 않는다):

1. `calendar-schema.sql`: 일정·버전·트랜잭션 RPC.
2. `approval-schema.sql`: 서버 관리 승인 상태와 RLS, 비공개 토큰·감사 기록·메일 제한·승인 함수.
3. `approval-server-config.sql`: 수신자·사이트 주소의 서버 전용 설정. 실제 값은 별도 서버 작업으로 입력하고 저장소에 넣지 않는다.
4. `approval-write-gate.sql`: 빈 변경까지 포함해 모든 쓰기에 승인을 요구한다.
5. `calendar-capacity.sql`: 계정별 행 수·항목 크기 제한.

호스팅 DB 변경은 MCP apply_migration으로 이력에 남겼다. 위 파일은 최종 상태의 검토 원본이며, 이후 변경도 마이그레이션으로 관리한다. Auth 테이블 권한은 확장하지 않았다.

개인 일정은 본인 user_id + approved 상태를 요구한다. 회원 상태는 본인 읽기만 허용하고 서버만 수정한다. 승인 RPC는 SECURITY INVOKER, 빈 search_path, service_role 실행 권한만 사용한다. 비공개 테이블은 RLS와 ACL로 잠그고 service_role만 접근한다. 비공개 서버 전용 테이블에서 RLS 사용자 정책이 없다는 advisor INFO는 의도된 구성이다. [안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

`tests/approval.integration.sql`은 실제 Auth fixture를 트랜잭션 안에서 만들고 모두 롤백하는 DB 검사다. 실제 메일은 보내지 않는다. 상세 결과와 남은 설정은 [SECURITY.md](../SECURITY.md)에 있다.

이전 공유 프로젝트의 개인 캘린더 행은 0개였다. 전환 후 캘린더 테이블·RPC의 일반 사용자 권한은 폐쇄하며 재무 앱의 테이블·정책·함수는 변경하지 않는다.
