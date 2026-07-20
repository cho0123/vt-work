/**
 * 운영 규칙이 미로그인 접근을 차단하는지 확인한다.
 *
 * 계정을 만들지도, 로그인하지도 않는다. 로그인 없이 읽기를 시도해
 * permission-denied 가 나오는지만 본다. (운영 데이터를 건드리지 않음)
 *
 * 실행: node scripts/verify-rules-prod.js
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { loadKey } from './lib/common.js';

// 운영 웹 설정은 저장소에 두지 않으므로, 서비스 계정 키에서 project_id 를 얻고
// 나머지는 Firebase 규칙상 필요 없는 값이라 형식만 맞춘다.
const key = loadKey('key-A.json');
const project = key.project_id;

const app = initializeApp({
    apiKey: process.env.VITE_API_KEY || 'AIzaSyA_jADtnfGcgJdDgRBOK_olOgM3md4R1zQ',
    authDomain: `${project}.firebaseapp.com`,
    projectId: project,
});
const db = getFirestore(app);

console.log(`\n대상: ${project} (운영)\n`);

try {
    const snap = await getDocs(collection(db, 'students'));
    console.log(`미로그인 접근 : ⚠ 통과됨 — ${snap.size}건 조회됨. 규칙이 막지 못하고 있습니다.`);
    process.exit(1);
} catch (e) {
    console.log(`미로그인 접근 : ✅ 차단됨 (${e.code})`);
}
console.log('\n로그인 계정으로의 접근은 앱에서 직접 확인하세요.\n');
process.exit(0);
