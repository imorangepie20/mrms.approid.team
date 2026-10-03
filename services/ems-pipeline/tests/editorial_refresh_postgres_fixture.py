"""격리된 editorial_refresh_check DB 전용. 기존 DB에는 실행하지 않는다."""
import os
import json
import sys
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from ems_pipeline.editorial_sections import SECTION_DEFINITIONS, EditorialMembership
from ems_pipeline.editorial_refresh import SLUGS, SNAPSHOT_SQL, build_preview


def main():
    with psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row, autocommit=True) as c:
        assert c.execute('SELECT current_database() AS db').fetchone()['db'] == 'editorial_refresh_check'
        c.execute("INSERT INTO app_users(auth0_subject) VALUES ('editorial-check-user')")
        members = []
        for index, definition in enumerate(SECTION_DEFINITIONS):
            section = c.execute("INSERT INTO ems_editorial_sections(slug,title,description,sort_order) VALUES (%s,%s,%s,%s) RETURNING id", (definition.slug, definition.title, definition.description, index)).fetchone()
            c.execute("UPDATE ems_screen_sections SET title='custom-' || title,active=(screen='ems' OR %s<3) WHERE section_id=%s", (index,section['id']))
            for rank in range(16):
                tidal_id = str(1000 + index * 100 + rank)
                isrc = f'USCHECK{index:01d}{rank:05d}'
                row = c.execute("INSERT INTO ems_tracks(tidal_id,isrc,title,artist,duration_ms,status,match_confidence) VALUES (%s,%s,%s,'fixture',%s,'active',1) RETURNING id", (tidal_id,isrc,f'{definition.slug}-{rank}',20000 if rank==2 else 180000)).fetchone()
                c.execute("INSERT INTO ems_availability_events(track_id,region,capability,playable,observed_at) VALUES (%s,'KR','STREAM',true,now()-interval '1 minute')", (row['id'],))
                if rank == 0:
                    c.execute("INSERT INTO ems_availability_events(track_id,region,capability,playable) VALUES (%s,'KR','STREAM',false)", (row['id'],))
                if rank == 1:
                    c.execute("UPDATE ems_availability_events SET region='US' WHERE track_id=%s", (row['id'],))
                if rank < 8:
                    c.execute("INSERT INTO ems_track_sections(section_id,track_id,rank,source_playlist_id,source_playlist_name) VALUES (%s,%s,%s,'old','original')", (section['id'],row['id'],rank))
                members.append(EditorialMembership(definition.slug,tidal_id,isrc,rank,'new-'+definition.slug,'TIDAL '+definition.slug))
        before=c.execute(SNAPSHOT_SQL,(SLUGS,SLUGS)).fetchone()['snapshot']
        preview=build_preview(c,members,before)
        after=c.execute(SNAPSHOT_SQL,(SLUGS,SLUGS)).fetchone()['snapshot']
        assert before==after
        assert preview['canApply'] and all(len(s['tracks'])==12 for s in preview['sections'])
        assert all(t['rank'] >= 3 for s in preview['sections'] for t in s['tracks'])
        assert all(s['addedCount']==7 and s['removedCount']==3 for s in preview['sections'])
        job=c.execute("INSERT INTO ems_editorial_refresh_jobs(status,preview,backup,created_by,expires_at) VALUES ('ready',%s,%s,'fixture',now()+interval '30 minutes') RETURNING id",(Jsonb(preview),Jsonb(before))).fetchone()
        blocked=build_preview(c,[],before)
        assert not blocked['canApply'] and all(not s['tracks'] for s in blocked['sections'])
        print(json.dumps({'fixtureJob':str(job['id']),'previewTracks':60,'previewWrites':0,'latestKRFalseExcluded':True,'shortAndUSExcluded':True,'emptyPreviewBlocked':True}))


if __name__ == '__main__': main()
