/**
 * firestore.rules 를 지정한 프로젝트에 배포한다.
 *
 * 실행: node scripts/deploy-rules.js key-C.json          (미리보기만)
 *       node scripts/deploy-rules.js key-C.json --yes    (실제 배포)
 *
 * 운영(key-A.json)에 배포할 때는 --yes 와 함께 --prod 도 필요하다.
 * 잘못된 UID 목록으로 배포하면 본인도 앱에 접근할 수 없게 되므로,
 * 배포 전 목록을 반드시 확인할 것. (되돌리기: Firebase 콘솔 → Firestore
 * → 규칙 → 기록에서 이전 버전 복원)
 */
import fs from 'fs';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';
import { loadKey, ROOT, PROD_PROJECT_ID } from './lib/common.js';

const keyFile = process.argv[2];
const doIt = process.argv.includes('--yes');
const prodAck = process.argv.includes('--prod');

if (!keyFile) {
    console.error('사용법: node scripts/deploy-rules.js <키파일> [--yes] [--prod]');
    process.exit(1);
}

const key = loadKey(keyFile);
const project = key.project_id;
const rulesPath = path.join(ROOT, 'firestore.rules');
const source = fs.readFileSync(rulesPath, 'utf8');

const isProd = project === PROD_PROJECT_ID;

console.log(`\n대상 프로젝트: ${project}${isProd ? '  ⚠ 운영' : '  (개발)'}`);
console.log(`규칙 파일: ${rulesPath}`);

// 허용 UID 목록을 눈으로 확인할 수 있게 뽑아준다
const uids = [...source.matchAll(/'([A-Za-z0-9]{20,})'/g)].map((m) => m[1]);
console.log(`\n허용 UID ${uids.length}개:`);
for (const u of uids) {
    const line = source.split('\n').find((l) => l.includes(u)) || '';
    const comment = (line.split('//')[1] || '').trim();
    console.log(`   ${u}  ${comment}`);
}

if (isProd && !prodAck) {
    console.log('\n운영 배포에는 --prod 플래그가 함께 필요합니다. 중단합니다.\n');
    process.exit(1);
}
if (!doIt) {
    console.log('\n(미리보기입니다. 실제 배포하려면 --yes 를 붙이세요)\n');
    process.exit(0);
}

const auth = new GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const client = await auth.getClient();

// 1) 룰셋 생성
const rs = await client.request({
    url: `https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`,
    method: 'POST',
    data: { source: { files: [{ name: 'firestore.rules', content: source }] } },
});
const rulesetName = rs.data.name;
console.log(`\n룰셋 생성됨: ${rulesetName}`);

// 2) 릴리스 갱신 (cloud.firestore)
// 이미 있으면 PATCH, 없으면 POST 로 새로 만든다.
const releaseName = `projects/${project}/releases/cloud.firestore`;
try {
    await client.request({
        url: `https://firebaserules.googleapis.com/v1/${releaseName}`,
        method: 'PATCH',
        data: { release: { name: releaseName, rulesetName } },
    });
    console.log(`릴리스 갱신됨: ${releaseName}`);
} catch (e) {
    if (e?.response?.status !== 404) throw e;
    await client.request({
        url: `https://firebaserules.googleapis.com/v1/projects/${project}/releases`,
        method: 'POST',
        data: { name: releaseName, rulesetName },
    });
    console.log(`릴리스 생성됨: ${releaseName}`);
}
console.log('\n✅ 배포 완료\n');
