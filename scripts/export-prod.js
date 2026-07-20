/**
 * 운영 Firestore(A) 전체를 로컬 JSON 파일로 내려받는다.
 *
 * ★ 이 스크립트는 운영 DB에 읽기만 한다. 쓰기/삭제 코드가 존재하지 않는다.
 *   (set/update/delete/add/batch 를 단 한 번도 호출하지 않음)
 *
 * 실행: npm run backup
 */
import fs from 'fs';
import path from 'path';
import { initDb, serialize, BACKUP_DIR, PROD_PROJECT_ID, fmtBytes } from './lib/common.js';

const { db, projectId } = initDb('key-A.json', 'source');

if (projectId !== PROD_PROJECT_ID) {
    console.error(`\n✖ key-A.json 이 예상과 다른 프로젝트입니다.`);
    console.error(`  기대: ${PROD_PROJECT_ID}`);
    console.error(`  실제: ${projectId}\n`);
    process.exit(1);
}

const docs = [];
let readCount = 0;

/** 컬렉션을 훑으면서 하위 컬렉션까지 재귀적으로 수집한다. */
async function dumpCollection(colRef, depth = 0) {
    const indent = '  '.repeat(depth);
    const snap = await colRef.get();
    console.log(`${indent}├ ${colRef.path}  (${snap.size}건)`);

    for (const doc of snap.docs) {
        docs.push({ path: doc.ref.path, data: serialize(doc.data()) });
        readCount++;

        // 하위 컬렉션 (예: students/{id}/payments)
        const subs = await doc.ref.listCollections();
        for (const sub of subs) {
            await dumpCollection(sub, depth + 1);
        }
    }
}

async function main() {
    console.log(`\n📖 운영 프로젝트에서 읽는 중: ${projectId}`);
    console.log(`   (읽기 전용 — 이 스크립트는 아무것도 쓰지 않습니다)\n`);

    const rootCols = await db.listCollections();
    if (rootCols.length === 0) {
        console.error('✖ 컬렉션이 하나도 없습니다. 키나 프로젝트를 확인하세요.');
        process.exit(1);
    }

    for (const col of rootCols) {
        await dumpCollection(col);
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const outFile = path.join(BACKUP_DIR, `prod-${stamp}.json`);

    const payload = {
        exportedAt: new Date().toISOString(),
        projectId,
        docCount: docs.length,
        docs,
    };
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');

    const size = fs.statSync(outFile).size;
    console.log(`\n✅ 완료`);
    console.log(`   문서 ${readCount}건 → ${outFile}`);
    console.log(`   파일 크기: ${fmtBytes(size)}\n`);
}

main().catch((e) => {
    console.error('\n✖ 실패:', e.message);
    process.exit(1);
});
