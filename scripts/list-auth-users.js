/**
 * 프로젝트의 인증 사용자 목록을 조회한다. (읽기 전용)
 * 보안 규칙 허용 목록(UID)을 만들 때 쓴다.
 *
 * 실행: node scripts/list-auth-users.js key-A.json
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { loadKey } from './lib/common.js';

const keyFile = process.argv[2] || 'key-A.json';
const key = loadKey(keyFile);
const app = initializeApp({ credential: cert(key) }, 'list-users');
const list = await getAuth(app).listUsers(50);

console.log(`\n프로젝트: ${key.project_id}`);
console.log(`사용자 ${list.users.length}명\n`);
for (const u of list.users) {
    console.log(`  uid   : ${u.uid}`);
    console.log(`  email : ${u.email}`);
    console.log(`  생성  : ${u.metadata.creationTime}`);
    console.log(`  최근  : ${u.metadata.lastSignInTime || '(없음)'}\n`);
}
