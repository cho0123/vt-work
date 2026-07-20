import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { loadKey, PROD_PROJECT_ID } from './lib/common.js';

const key = loadKey('key-B.json');
if (key.project_id === PROD_PROJECT_ID) { console.error('🛑 운영 프로젝트입니다.'); process.exit(1); }

const app = initializeApp({ credential: cert(key) }, 'auth-check');
const list = await getAuth(app).listUsers(20);

console.log(`\n프로젝트: ${key.project_id}`);
console.log(`등록된 사용자: ${list.users.length}명\n`);
for (const u of list.users) {
    console.log(`  ${u.email}  (provider: ${u.providerData.map(p => p.providerId).join(',') || '없음'})`);
}
console.log();
