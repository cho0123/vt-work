/**
 * 현재 배포된 Firestore 보안 규칙을 조회한다. (읽기 전용)
 *
 * 실행: node scripts/show-rules.js key-A.json    (운영)
 *       node scripts/show-rules.js key-C.json    (개발)
 */
import { GoogleAuth } from 'google-auth-library';
import { loadKey } from './lib/common.js';

const keyFile = process.argv[2] || 'key-A.json';
const key = loadKey(keyFile);

const auth = new GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const project = key.project_id;

console.log(`\n대상 프로젝트: ${project}\n`);

try {
    const rel = await client.request({
        url: `https://firebaserules.googleapis.com/v1/projects/${project}/releases`,
    });
    const releases = rel.data.releases || [];
    const fs = releases.find((r) => r.name.endsWith('cloud.firestore'));
    if (!fs) {
        console.log('배포된 Firestore 규칙 릴리스를 찾지 못했습니다.');
        console.log('릴리스 목록:', releases.map((r) => r.name).join(', ') || '(없음)');
        process.exit(0);
    }

    console.log(`릴리스: ${fs.name}`);
    console.log(`갱신: ${fs.updateTime}\n`);

    const rs = await client.request({
        url: `https://firebaserules.googleapis.com/v1/${fs.rulesetName}`,
    });
    for (const f of rs.data.source.files) {
        console.log(`──── ${f.name}`);
        console.log(f.content);
    }
} catch (e) {
    const msg = e?.response?.data?.error?.message || e.message;
    console.error(`조회 실패: ${msg}`);
    console.error('\n(서비스 계정에 권한이 없으면 Firebase 콘솔 → Firestore → 규칙 탭에서 직접 확인하세요)');
    process.exit(1);
}
