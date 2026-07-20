/**
 * 지정한 문서만 백업과 대조한다. (읽기 최소화 — 전체 스캔 안 함)
 * 실행: node scripts/diff-docs.js <문서경로> [<문서경로> ...]
 */
import fs from 'fs';
import path from 'path';
import { initDb, serialize, BACKUP_DIR, PROD_PROJECT_ID, DEV_KEY } from './lib/common.js';

const { db, projectId } = initDb(DEV_KEY, 'diff-docs');
if (projectId === PROD_PROJECT_ID) {
    console.error('🛑 운영 프로젝트입니다.');
    process.exit(1);
}

const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('prod-') && f.endsWith('.json'))
    .sort();
const backup = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, files[files.length - 1]), 'utf8'));
const expected = new Map(backup.docs.map((d) => [d.path, d.data]));

const targets = process.argv.slice(2);
const mask = (v) => {
    const s = v === undefined ? '(없음)' : typeof v === 'string' ? v : JSON.stringify(v);
    return s && s.length > 150 ? s.slice(0, 150) + `... (${s.length}자)` : s;
};

for (const p of targets) {
    const snap = await db.doc(p).get();
    const exp = expected.get(p);
    console.log(`\n──── ${p}`);
    if (!snap.exists) {
        console.log('   개발 DB에 없음 (삭제됨)');
        continue;
    }
    const act = serialize(snap.data());
    if (!exp) {
        console.log('   백업에 없음 (새로 생성됨)');
        console.log('   ' + mask(act));
        continue;
    }
    const keys = [...new Set([...Object.keys(exp), ...Object.keys(act)])];
    let diff = 0;
    for (const k of keys) {
        const before = JSON.stringify(exp[k]);
        const after = JSON.stringify(act[k]);
        if (before !== after) {
            diff++;
            console.log(`   ${k}`);
            console.log(`      백업: ${mask(before)}`);
            console.log(`      현재: ${mask(after)}`);
        }
    }
    if (diff === 0) console.log('   차이 없음');
}
console.log();
