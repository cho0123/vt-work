/**
 * 보안 규칙이 실제로 동작하는지 확인한다. (개발 프로젝트 전용)
 *
 * 웹 SDK(일반 클라이언트와 동일한 경로)로 접근해서:
 *   1) 로그인하지 않은 상태 -> 거부되어야 함
 *   2) 새로 만든(허용 목록에 없는) 계정 -> 거부되어야 함
 *   3) 허용 목록에 있는 계정 -> 통과해야 함  (비밀번호가 필요하므로 생략)
 *
 * 3번은 사람이 앱에서 직접 로그인해 확인한다. 이 스크립트는 비밀번호를
 * 다루지 않는다.
 *
 * 실행: node scripts/verify-rules.js
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { loadKey, PROD_PROJECT_ID, DEV_KEY, DEV_PROJECT_ID } from './lib/common.js';

const adminKey = loadKey(DEV_KEY);
if (adminKey.project_id === PROD_PROJECT_ID || adminKey.project_id !== DEV_PROJECT_ID) {
    console.error(`🛑 등록된 개발 프로젝트가 아닙니다: ${adminKey.project_id}`);
    process.exit(1);
}

// .env.development 에서 웹 설정 읽기
import fs from 'fs';
import path from 'path';
import { ROOT } from './lib/common.js';
const env = Object.fromEntries(
    fs
        .readFileSync(path.join(ROOT, '.env.development'), 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => {
            const i = l.indexOf('=');
            return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        })
);

const web = initializeApp({
    apiKey: env.VITE_API_KEY,
    authDomain: env.VITE_AUTH_DOMAIN,
    projectId: env.VITE_PROJECT_ID,
});
const db = getFirestore(web);
const auth = getAuth(web);

console.log(`\n대상: ${env.VITE_PROJECT_ID}\n`);

// 1) 미로그인 상태
try {
    await getDocs(collection(db, 'students'));
    console.log('1) 미로그인 접근      : ⚠ 통과됨 (규칙이 막지 못함)');
} catch (e) {
    console.log(`1) 미로그인 접근      : ✅ 차단됨 (${e.code})`);
}

// 2) 새로 만든 계정 (허용 목록에 없음) — 가입이 열려 있는지도 함께 확인된다
const tempEmail = `ruletest-${Date.now()}@example.com`;
let tempUid = null;
try {
    const cred = await createUserWithEmailAndPassword(auth, tempEmail, 'Test-1234!');
    tempUid = cred.user.uid;
    console.log(`   (신규 가입 가능 — uid ${tempUid.slice(0, 8)}...)`);
    try {
        await getDocs(collection(db, 'students'));
        console.log('2) 미승인 계정 접근   : ⚠ 통과됨 (규칙이 막지 못함)');
    } catch (e) {
        console.log(`2) 미승인 계정 접근   : ✅ 차단됨 (${e.code})`);
    }
    await signOut(auth);
} catch (e) {
    console.log(`2) 미승인 계정 접근   : 계정 생성 자체가 막힘 (${e.code}) — 가입이 차단된 상태`);
}

// 뒷정리: 테스트 계정 삭제
if (tempUid) {
    const admin = initAdmin({ credential: cert(adminKey) }, 'rule-verify');
    await getAdminAuth(admin).deleteUser(tempUid);
    console.log(`\n테스트 계정 삭제 완료 (${tempEmail})`);
}

console.log('\n3) 허용 계정 접근     : 앱에서 직접 로그인해 확인하세요 (비밀번호를 다루지 않음)\n');
process.exit(0);
