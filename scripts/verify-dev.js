/**
 * 개발 DB(B) 내용이 백업 JSON 과 일치하는지 대조한다. (개발 DB 읽기만 함)
 * 실행: npm run verify-dev
 */
import fs from 'fs';
import path from 'path';
import { initDb, serialize, BACKUP_DIR, PROD_PROJECT_ID, DEV_KEY } from './lib/common.js';

const { db, projectId } = initDb(DEV_KEY, 'verify');
if (projectId === PROD_PROJECT_ID) {
    console.error('🛑 대상이 운영 프로젝트입니다. 중단합니다.');
    process.exit(1);
}

const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('prod-') && f.endsWith('.json'))
    .sort();
const backup = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, files[files.length - 1]), 'utf8'));

const actual = new Map();

async function walk(colRef) {
    const snap = await colRef.get();
    for (const doc of snap.docs) {
        actual.set(doc.ref.path, doc.data());
        for (const sub of await doc.ref.listCollections()) await walk(sub);
    }
}

async function main() {
    console.log(`\n🔍 개발 DB 확인 중: ${projectId}\n`);
    for (const col of await db.listCollections()) await walk(col);

    const expected = new Map(backup.docs.map((d) => [d.path, d.data]));

    const missing = [...expected.keys()].filter((p) => !actual.has(p));
    const extra = [...actual.keys()].filter((p) => !expected.has(p));

    console.log(`백업 문서 수 : ${expected.size}`);
    console.log(`개발 DB 문서 : ${actual.size}`);
    console.log(`누락        : ${missing.length}`);
    console.log(`백업에 없음  : ${extra.length}`);

    // 내용 대조 (직렬화 결과 비교)
    let mismatch = 0;
    const samples = [];
    for (const [p, exp] of expected) {
        const act = actual.get(p);
        if (!act) continue;
        if (JSON.stringify(serialize(act)) !== JSON.stringify(exp)) {
            mismatch++;
            if (samples.length < 5) samples.push(p);
        }
    }
    console.log(`내용 불일치  : ${mismatch}`);
    if (samples.length) console.log(`  예: ${samples.join(', ')}`);

    const ok = missing.length === 0 && mismatch === 0;
    console.log(ok ? '\n✅ 개발 DB가 운영 백업과 완전히 일치합니다.\n' : '\n⚠ 차이가 있습니다. 위 항목을 확인하세요.\n');
    process.exit(ok ? 0 : 1);
}

main().catch((e) => {
    console.error('\n✖ 실패:', e.message);
    process.exit(1);
});
