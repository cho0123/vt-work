/**
 * 개발 DB 와 백업 JSON 의 차이를 항목별로 보여준다. (읽기만 함)
 * 실행: node scripts/diff-dev.js
 */
import fs from 'fs';
import path from 'path';
import { initDb, serialize, BACKUP_DIR, PROD_PROJECT_ID, DEV_KEY } from './lib/common.js';

const { db, projectId } = initDb(DEV_KEY, 'diff-dev');
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

const actual = new Map();
async function walk(colRef) {
    const snap = await colRef.get();
    for (const doc of snap.docs) {
        actual.set(doc.ref.path, doc.data());
        for (const sub of await doc.ref.listCollections()) await walk(sub);
    }
}
for (const col of await db.listCollections()) await walk(col);

const mask = (v) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (s && s.length > 120) return s.slice(0, 120) + `... (${s.length}자)`;
    return s;
};

console.log(`\n백업: ${path.basename(files[files.length - 1])}\n`);

// 누락
for (const p of expected.keys()) {
    if (!actual.has(p)) console.log(`[삭제됨] ${p}`);
}
// 추가
for (const p of actual.keys()) {
    if (!expected.has(p)) console.log(`[새로 생김] ${p}`);
}
// 내용 차이
for (const [p, exp] of expected) {
    const act = actual.get(p);
    if (!act) continue;
    const a = serialize(act);
    if (JSON.stringify(a) === JSON.stringify(exp)) continue;

    console.log(`\n[변경됨] ${p}`);
    const keys = new Set([...Object.keys(exp || {}), ...Object.keys(a || {})]);
    for (const k of keys) {
        const before = JSON.stringify(exp?.[k]);
        const after = JSON.stringify(a?.[k]);
        if (before !== after) {
            console.log(`   ${k}`);
            console.log(`      전: ${mask(before)}`);
            console.log(`      후: ${mask(after)}`);
        }
    }
}
console.log();
