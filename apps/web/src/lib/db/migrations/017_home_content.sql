CREATE TABLE home_content (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('hero', 'concept', 'guide', 'story')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link_label TEXT NOT NULL DEFAULT '',
  link_href TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX home_content_display_idx ON home_content (kind, active, sort_order, id);

INSERT INTO home_content (id, kind, title, body, link_label, link_href, sort_order) VALUES
  ('hero', 'hero', '듣는 음악에서, 다음 취향으로', 'TIDAL 플레이리스트를 연결하고 내 취향을 살펴보세요. 새로운 음악을 발견하는 공간이 이어집니다.', '음악 둘러보기', '/ems', 0),
  ('concept', 'concept', '음악을 모으고, 취향을 읽고, 다시 발견하세요', 'EMS는 새로운 음악을 탐색하는 카탈로그, GMS는 내 취향을 바탕으로 한 추천, MMS는 좋아하는 음악과 플레이리스트를 모아 두는 공간입니다.', '내 음악 공간 보기', '/mms', 0),
  ('guide-connect', 'guide', '플레이리스트 연결', 'TIDAL 계정을 연결하고 분석에 사용할 플레이리스트를 선택하세요.', '연결 시작', '/onboarding', 0),
  ('guide-discover', 'guide', '새 음악 만나기', 'EMS 선곡을 듣고 GMS에서 내 취향에 맞는 추천을 확인하세요.', 'EMS 둘러보기', '/ems', 1),
  ('guide-keep', 'guide', '좋아하는 곡 모으기', '마음에 드는 곡에 하트를 눌러 MMS에서 다시 찾아보세요.', 'MMS 열기', '/mms', 2),
  ('story-listening', 'story', '오늘의 재생 목록은 어디서 시작할까요?', '새로운 음악이 필요할 때는 EMS의 편집 선곡부터 살펴보세요. 한 곡을 재생하면 다음 곡도 자연스럽게 이어집니다.', '선곡 둘러보기', '/ems', 0),
  ('story-taste', 'story', '좋아요가 쌓일수록 선명해지는 취향', '좋아하는 곡은 MMS에 모으고, GMS에서 새로운 추천을 확인하세요. 추천의 출발점은 내 플레이리스트입니다.', '추천 살펴보기', '/gms', 1);
