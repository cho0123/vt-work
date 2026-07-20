/**
 * 백업 JSON 을 개발(스테이징) Firestore(B) 에 밀어넣는다.
 *
 * ★ 안전장치: 대상이 운영 프로젝트면 실행을 거부한다. (아래 하드 가드)
 *
 * 실행: npm run seed-dev
 */
import fs from 'fs';
import path from 'path';
import { initDb, deserialize, BACKUP_DIR, PROD_PROJECT_ID, DEV_PROJECT_ID, DEV_KEY } from './lib/common.js';

const { db, projectId } = initDb(DEV_KEY, 'target');

// ── 하드 가드 ────────────────────────────────────────────────
// 어떤 경우에도 운영 프로젝트에 쓰지 않는다.
if (projectId === PROD_PROJECT_ID) {
    console.error(`\n🛑 중단: 대상이 운영 프로젝트(${projectId})입니다.`);
    console.error(`   이 스크립트는 운영 DB에 쓸 수 없습니다.\n`);
    process.exit(1);
}
if (projectId !== DEV_PROJECT_ID) {
    console.error(`\n🛑 중단: 대상이 등록된 개발 프로젝트가 아닙니다.`);
    console.error(`   기대: ${DEV_PROJECT_ID}`);
    console.error(`   실제: ${projectId}\n`);
    process.exit(1);
}
// ─────────────────────────────────────────────────────────────

function latestBackup() {
    if (!fs.existsSync(BACKUP_DIR)) return null;
    const files = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('prod-') && f.endsWith('.json'))
        .sort();
    return files.length ? path.join(BACKUP_DIR, files[files.length - 1]) : null;
}

async function main() {
    const file = process.argv[2] ? path.resolve(process.argv[2]) : latestBackup();
    if (!file || !fs.existsSync(file)) {
        console.error('✖ 백업 파일이 없습니다. 먼저 `npm run backup` 을 실행하세요.');
        process.exit(1);
    }

    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`\n📥 대상 프로젝트: ${projectId}  (개발용)`);
    console.log(`   원본 백업: ${path.basename(file)}`);
    console.log(`   내보낸 시각: ${payload.exportedAt}`);
    console.log(`   문서 수: ${payload.docCount}\n`);

    // 배치 커밋. Firestore 는 배치당 500건 / 요청 10MB 제한이 있는데
    // 영수증 이미지(base64)가 문서당 최대 ~900KB 라 건수만으로는 부족하다.
    // 건수와 누적 용량 중 먼저 걸리는 쪽에서 끊는다.
    const MAX_DOCS = 300;
    const MAX_BYTES = 5 * 1024 * 1024;

    let batch = db.batch();
    let batchDocs = 0;
    let batchBytes = 0;
    let written = 0;

    const flush = async () => {
        if (batchDocs === 0) return;
        await batch.commit();
        written += batchDocs;
        console.log(`   ${written} / ${payload.docs.length} 기록`);
        batch = db.batch();
        batchDocs = 0;
        batchBytes = 0;
    };

    for (const d of payload.docs) {
        const size = JSON.stringify(d.data).length;
        if (batchDocs > 0 && (batchDocs >= MAX_DOCS || batchBytes + size > MAX_BYTES)) {
            await flush();
        }
        batch.set(db.doc(d.path), deserialize(d.data, db));
        batchDocs++;
        batchBytes += size;
    }
    await flush();

    console.log(`\n✅ 완료 — 개발 DB에 ${written}건 복사됨\n`);
}

main().catch((e) => {
    console.error('\n✖ 실패:', e.message);
    process.exit(1);
});
