/**
 * votiz-acc(짱구 어카운트)의 projects / transactions 를 스케쥴 Firebase 로 복사한다.
 *   projects     → acc_projects
 *   transactions → acc_transactions
 * 문서 id 는 유지하고, uid 는 대상 프로젝트의 '허용 계정' uid 로 바꾼다.
 * (스케쥴 앱은 로그인 계정이 달라서, uid 를 안 바꾸면 옮겨도 화면에 안 보인다)
 *
 * 사용:
 *   node scripts/migrate-votiz.js <votiz키경로>            # 개발 DB(vt-work-dev-eeeaa)로
 *   node scripts/migrate-votiz.js <votiz키경로> --prod     # 운영 DB(vt-schedule-12568)로
 *   ... --force   # 대상에 이미 acc_* 문서가 있어도 덮어쓰기(기본은 중단)
 *
 * 읽기(votiz)는 항상 읽기 전용. 대상에는 acc_* 컬렉션에만 쓴다(기존 스케쥴 데이터 불변).
 */
import fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadKey, PROD_PROJECT_ID, DEV_KEY, DEV_PROJECT_ID } from './lib/common.js';

const votizKeyPath = process.argv[2];
const toProd = process.argv.includes('--prod');
const force = process.argv.includes('--force');

if (!votizKeyPath) {
    console.error('votiz 서비스계정 키 경로를 첫 인자로 주세요.');
    process.exit(1);
}

// 대상 프로젝트별 '허용 계정' uid (firestore.rules 의 isAllowedUser 목록과 동일)
const OWNER_UID = {
    'vt-schedule-12568': 'xA6nm0L4uBTyRBctRRNqzKND1oW2', // 운영 voicetuning@nate.com
    'vt-work-dev-eeeaa': 'dLFgRjqJIzOdBjFBcozMvB36uAx1', // 개발 wlusa2@nate.com
};

const COL_MAP = { projects: 'acc_projects', transactions: 'acc_transactions' };

async function main() {
    // 1) 소스(votiz-acc) — 읽기 전용
    const votizKey = JSON.parse(fs.readFileSync(votizKeyPath, 'utf8'));
    if (votizKey.project_id !== 'votiz-acc') {
        throw new Error(`votiz-acc 키가 아닙니다: ${votizKey.project_id}`);
    }
    const src = getFirestore(initializeApp({ credential: cert(votizKey) }, 'votiz'));

    // 2) 대상(스케쥴) — 개발이 기본, --prod 일 때만 운영
    const targetKeyFile = toProd ? 'key-A.json' : DEV_KEY;
    const targetKey = loadKey(targetKeyFile);
    const targetProject = targetKey.project_id;
    const expected = toProd ? PROD_PROJECT_ID : DEV_PROJECT_ID;
    if (targetProject !== expected) {
        throw new Error(`대상 키가 예상과 다릅니다. 기대 ${expected}, 실제 ${targetProject}`);
    }
    const ownerUid = OWNER_UID[targetProject];
    if (!ownerUid) throw new Error(`대상 프로젝트의 소유자 uid 를 모릅니다: ${targetProject}`);
    const dst = getFirestore(initializeApp({ credential: cert(targetKey) }, 'target'));

    console.log(`\n소스 : votiz-acc`);
    console.log(`대상 : ${targetProject} ${toProd ? '(운영)' : '(개발)'}`);
    console.log(`uid  : 모든 문서를 ${ownerUid} 로 태그\n`);

    for (const [srcCol, dstCol] of Object.entries(COL_MAP)) {
        const srcSnap = await src.collection(srcCol).get();

        // 이미 데이터가 있으면(중복 방지) 기본 중단
        const dstExisting = await dst.collection(dstCol).limit(1).get();
        if (!dstExisting.empty && !force) {
            console.error(`✖ 대상 ${dstCol} 에 이미 문서가 있습니다. 덮어쓰려면 --force. 중단.`);
            process.exit(1);
        }

        let n = 0;
        let batch = dst.batch();
        for (const doc of srcSnap.docs) {
            const data = { ...doc.data(), uid: ownerUid };
            batch.set(dst.collection(dstCol).doc(doc.id), data);
            if (++n % 400 === 0) {
                await batch.commit();
                batch = dst.batch();
            }
        }
        await batch.commit();
        console.log(`  ${srcCol} → ${dstCol} : ${n}건 복사`);
    }

    console.log('\n✅ 완료');
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
