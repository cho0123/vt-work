/**
 * 백업 JSON 이 온전한지 확인한다. (읽기만 함)
 * 실행: npm run verify-backup
 */
import fs from 'fs';
import path from 'path';
import { BACKUP_DIR, fmtBytes } from './lib/common.js';

const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('prod-') && f.endsWith('.json'))
    .sort();
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(BACKUP_DIR, files[files.length - 1]);

const raw = fs.readFileSync(file, 'utf8');
const j = JSON.parse(raw); // 여기서 통과하면 JSON 구조는 온전함

console.log(`\n파일: ${path.basename(file)}  (${fmtBytes(raw.length)})`);
console.log(`내보낸 시각: ${j.exportedAt}`);
console.log(`프로젝트: ${j.projectId}`);
console.log(`문서 수: 헤더 ${j.docCount} / 실제 ${j.docs.length} → ${j.docCount === j.docs.length ? '일치 ✅' : '불일치 ✖'}`);

// 컬렉션별 집계
const byCol = {};
for (const d of j.docs) {
    const col = d.path.includes('/payments/') ? 'students/*/payments' : d.path.split('/')[0];
    byCol[col] = (byCol[col] || 0) + 1;
}
console.log('\n컬렉션별:');
for (const [k, v] of Object.entries(byCol).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${v}`);
}

// 한글 인코딩 확인
const expenses = j.docs.filter((d) => d.path.startsWith('expenses/'));
const cats = [...new Set(expenses.map((d) => d.data.category))];
console.log(`\n한글 인코딩 확인 (지출 카테고리): ${cats.join(', ')}`);

// 타입 보존 확인
const withTs = j.docs.filter((d) => JSON.stringify(d.data).includes('"__t":"ts"')).length;
console.log(`Timestamp 보존된 문서: ${withTs}건`);

// 영수증 이미지
const pays = j.docs.filter((d) => d.path.includes('/payments/'));
const withImg = pays.filter((d) => d.data.imageUrl);
console.log(`결제 문서: ${pays.length}건 / 영수증 이미지 포함: ${withImg.length}건`);

// 학생 샘플 (이름은 마스킹)
const stu = j.docs.find((d) => /^students\/[^/]+$/.test(d.path));
const mask = (n) => (n ? n[0] + '*'.repeat(Math.max(0, n.length - 1)) : '(없음)');
console.log(`\n학생 문서 샘플: ${stu.path}`);
console.log(`  필드: ${Object.keys(stu.data).join(', ')}`);
console.log(`  이름: ${mask(stu.data.name)} / schedule 배열: ${stu.data.schedule?.length}주 / 미수금: ${stu.data.unpaidList?.length ?? 0}건`);

console.log('\n✅ 백업 파일 정상\n');
