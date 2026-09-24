# EMS 수집 모니터링 정합성 수정

## 현상·원인

- 운영 화면의 최신 수동 TIDAL 작업은 `pending`이고 샘플이 시작 시점 1건뿐인데, MusicBrainz 스냅샷 작업은 별도로 `running`이다.
- 화면은 수동 작업의 상태·샘플만 보여주면서 전체 활성곡 증가를 그 수동 작업의 증가량으로 표시한다. 따라서 상태와 두 그래프가 서로 다른 작업을 가리킨다.
- 워커는 이미 시작한 MusicBrainz 작업을 끝낸 뒤 대기 중인 수동 작업을 시작한다. 대기 이유를 화면에 표시하지 않는다.

## 변경 순서

1. `apps/web/src/lib/ems/admin-ingestion.ts`: 실행 중인 EMS run과 대기 중 수동 작업을 별도로 반환한다. 현재 활성곡의 `first_seen_at`, run 후보의 `created_at`·`resolved_at`으로 최근 12시간 누적 추이를 계산한다.
2. `apps/admin/src/lib/api.ts`, `apps/admin/src/pages/Ingestion.tsx`: 전체 카탈로그 추이와 현재 작업의 후보·처리·매칭 추이를 구분한다. MusicBrainz 실행 중 수동 작업이 대기한다는 사유와 각 작업의 상태·진행률·시각을 표시한다. 시작 버튼은 대기 작업 생성임을 드러낸다.
3. 운영 화면과 DB 수치, 요청 상태, Web 빌드·lint·Python 영향 없음, diff를 확인하고 변경 기록을 작성한다.

## 완료 기준

- MusicBrainz가 실행 중이고 수동 작업이 pending일 때 현재 작업은 MusicBrainz로 표시되고, 수동 작업은 대기 중으로 표시된다.
- 전체 활성곡 증가가 수동 작업의 성과로 표시되지 않는다. 그래프는 각 라벨의 실제 원천 데이터와 일치한다.
- 기존 시작·일시정지·재개 API의 권한과 상태 전이는 유지한다.
