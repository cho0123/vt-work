// 앱 데이터 클라우드 백업 (무료 — Firestore 안에 보관).
//
// 로그인한 상태로 전체 데이터를 읽어, 같은 Firestore 프로젝트의 `backups` 컬렉션에
// 스냅샷으로 저장한다. Firebase Storage 는 유료(Blaze) 전환이 필요해서, 무료(Spark)
// 로 쓸 수 있는 Firestore 에 넣는다. 핸드폰에서도 버튼만 누르면 된다.
//
// 보안: 기존 firestore.rules 의 `match /{document=**}` 가 backups 도 '허용된 UID'
//       계정만 접근하게 이미 막아준다(추가 규칙 불필요).
//
// 저장 구조:
//   backups/{id}                 ← 메타(생성시각, 사유, 문서 수, 청크 수)
//   backups/{id}/chunks/{n}       ← { json: "..." } 전체 데이터를 문자열로 나눠 담음
//   (Firestore 문서 1MB 한도 때문에 여러 청크로 쪼갠다. 문자열로 담아
//    '중첩 배열 불가' 같은 Firestore 구조 제약을 피한다)
//
// 트리거: 스케쥴 '최종'(주간마감) 버튼, 이후 학생관리 '입금정리' 버튼 등.
// 안전장치 성격이라 실패하면 예외를 던지고, 호출부에서 주 동작은 계속되게 한다.
//
// ⚠️ 브라우저는 컬렉션 목록을 자동으로 못 가져온다. 새 컬렉션을 추가하면
//    아래 TOP_LEVEL_COLLECTIONS 에도 넣어야 백업에 포함된다.
import { collection, getDocs, writeBatch, doc, query, where } from 'firebase/firestore';

// students 는 하위 payments 까지 따로 처리하므로 아래 목록에서 제외한다.
const TOP_LEVEL_COLLECTIONS = [
    'schedules',
    'attendance',
    'expenses',
    'schedule_cancellations',
    'settlement_memos',
    'site_settings',
    'weekly_locks',
    'weekly_memos',
    'consultations',   // 상담일지(2026-10-18). 사진은 하위 photos 라 여기 안 담긴다.
];

// 백업 묶음(kind) — 백업을 세 갈래로 나눠 쌓는다.
//   academy      학원(스케쥴·학생·결제 …) — 주간마감 '최종' 버튼. ★ 기존 백업 그대로다.
//   voicetuning  보이스튜닝 정산 — 보튜-정산 '정산예정'(= 그 달 마감) 버튼
//   votiz        보티즈·매니지먼트 — 보티즈-정산 '최종정리' 버튼
//
// 24시간 규칙(최근에 받았으면 건너뛰기)과 '최근 20개만 보관'은 **묶음마다 따로** 센다.
// 옛 백업 문서에는 kind 가 없다 → 학원 백업으로 본다(기존 문서는 손대지 않는다).
export const BACKUP_KINDS = {
    ACADEMY: 'academy',
    VOICETUNING: 'voicetuning',
    VOTIZ: 'votiz',
};
export const BACKUP_KIND_LABEL = {
    academy: '학원 데이터',
    voicetuning: '보이스튜닝 정산',
    votiz: '보티즈 · 매니지먼트',
};
const kindOf = (data) => (data && data.kind) || BACKUP_KINDS.ACADEMY;

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || 'unknown';
const CHUNK_BYTES = 850 * 1024; // 청크당 최대 바이트 (Firestore 1MB 한도 안전 여유)
const KEEP_BACKUPS = 20; // 최근 N개만 보관하고 오래된 건 정리

// Firestore 값 → JSON 안전 형태. Timestamp/Date 는 admin 백업과 같은 {__t:'ts',s,n} 로.
function serialize(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object' && typeof value.toDate === 'function' && typeof value.seconds === 'number') {
        return { __t: 'ts', s: value.seconds, n: value.nanoseconds ?? 0 };
    }
    if (value instanceof Date) {
        return { __t: 'ts', s: Math.floor(value.getTime() / 1000), n: (value.getTime() % 1000) * 1e6 };
    }
    if (Array.isArray(value)) return value.map(serialize);
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
        return out;
    }
    return value;
}

// 전체 데이터를 읽어 [{path, data}, ...] 배열로 만든다.
// 결제 영수증 이미지(payments.imageUrl)는 용량이 커서 제외한다.
async function buildBackupDocs(db) {
    const docs = [];

    const studentsSnap = await getDocs(collection(db, 'students'));
    const studentDocs = studentsSnap.docs;
    studentDocs.forEach((s) => docs.push({ path: `students/${s.id}`, data: serialize(s.data()) }));

    const paySnaps = await Promise.all(studentDocs.map((s) => getDocs(collection(db, 'students', s.id, 'payments'))));
    paySnaps.forEach((paySnap, i) => {
        const sid = studentDocs[i].id;
        paySnap.forEach((p) => {
            const rest = { ...p.data() };
            delete rest.imageUrl; // 영수증 이미지 제외
            docs.push({ path: `students/${sid}/payments/${p.id}`, data: serialize(rest) });
        });
    });

    const topSnaps = await Promise.all(TOP_LEVEL_COLLECTIONS.map((c) => getDocs(collection(db, c))));
    topSnaps.forEach((snap, i) => {
        const col = TOP_LEVEL_COLLECTIONS[i];
        snap.forEach((d) => docs.push({ path: `${col}/${d.id}`, data: serialize(d.data()) }));
    });

    return docs;
}

// 전체 데이터를 JSON 파일로 이 컴퓨터에 내려받는다(로컬 백업).
// 컴퓨터에서만 쓰는 동작(예: 학생관리 '입금정리' 버튼)에 붙인다. 핸드폰에선 파일
// 다운로드가 마땅치 않아 주간마감은 클라우드(backupToFirestore)를 쓰고, 이건 로컬로
// 나눠 보관해 양방향 안전장치를 만든다.
// 성공 시 { count } 반환. 실패 시 예외를 던진다(호출부에서 처리).
export async function backupToLocalFile(db) {
    const docs = await buildBackupDocs(db);
    const payload = {
        exportedAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        excludes: ['payments.imageUrl'],
        docCount: docs.length,
        docs,
    };

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vt-backup-${PROJECT_ID}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 바로 해제하면 브라우저가 아직 파일을 다 쓰기 전이라 다운로드가 취소될 수 있다.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

    return { count: docs.length };
}

// 가장 최근 백업 1건의 정보를 가져온다. 백업이 하나도 없으면 null.
// 호출부에서 "방금 백업했는데 또 할까요?" 를 물어볼 때 쓴다.
//
// 메타 문서만 읽는다(최대 KEEP_BACKUPS 개 = 20건). 오래된 백업 정리 쪽과 같은
// 방식으로, id 가 시간순이라 사전순 정렬의 마지막이 최신이다.
// 실패하면 예외를 던진다 — 물어볼지 말지는 호출부가 정한다.
export async function getLastBackup(db, kind = BACKUP_KINDS.ACADEMY) {
    const snap = await getDocs(collection(db, 'backups'));
    if (snap.empty) return null;

    // 묶음이 섞여 있으므로 같은 묶음만 골라서 최신을 찾는다.
    // (안 거르면 보티즈 백업을 보고 '학원도 방금 받았네' 하고 건너뛰게 된다)
    const mine = snap.docs.filter((d) => kindOf(d.data()) === kind);
    if (mine.length === 0) return null;

    const latest = mine.sort((a, b) => (a.id < b.id ? -1 : 1))[mine.length - 1];
    const data = latest.data();
    const at = new Date(data.createdAt);
    return {
        id: latest.id,
        createdAt: data.createdAt,
        at: isNaN(at.getTime()) ? null : at,
        reason: data.reason || '',
        docCount: data.docCount ?? null,
        kind: kindOf(data),
    };
}

const byteLen = (str) => new TextEncoder().encode(str).length;

// 백업을 Firestore `backups` 컬렉션에 저장하고, 최근 keep 개만 남긴다.
// 성공 시 { count, backupId, chunkCount } 반환. 실패 시 예외를 던진다(호출부에서 처리).
export async function backupToFirestore(db, reason, keep = KEEP_BACKUPS) {
    const allDocs = await buildBackupDocs(db);
    // 학원 백업은 지금까지와 똑같이 kind 없이 저장한다(옛 문서와 같은 모양).
    return writeBackup(db, { docs: allDocs, reason, keep, kind: null });
}

/**
 * 보이스튜닝 정산 묶음 — acc_transactions 중 division = voicetuning.
 * '정산예정'(그 달 마감) 버튼이 부른다.
 * 사진(photos 하위)은 담지 않는다 — 사진은 PC 백업(npm run backup)에만 들어간다.
 */
export async function backupVoicetuning(db, reason, keep = KEEP_BACKUPS) {
    const snap = await getDocs(query(collection(db, 'acc_transactions'), where('division', '==', 'voicetuning')));
    const docs = snap.docs.map((d) => ({ path: `acc_transactions/${d.id}`, data: serialize(d.data()) }));
    return writeBackup(db, { docs, reason, keep, kind: BACKUP_KINDS.VOICETUNING });
}

// 보티즈 묶음에 통째로 담는 컬렉션(매니지먼트 포함). 새 컬렉션을 만들면 여기도 넣을 것.
const VOTIZ_COLLECTIONS = [
    'acc_projects',
    'artists',
    'artistPrivate',
    'mgmtCategories',
    'artistLedger',
    'artistCases',
    'artistSettlements',
    'mgmtSettings',        // 보티즈 분류 연결표 (문서 1건)
];
// acc_transactions 중 보티즈 쪽 분야. 보이스튜닝은 위 묶음이 따로 가져간다.
const VOTIZ_DIVISIONS = ['votiz', 'copyright', 'youtube'];

/**
 * 보티즈 · 매니지먼트 묶음 — '최종정리' 버튼이 부른다.
 * 사진(각 내역 아래 photos)은 담지 않는다.
 */
export async function backupVotiz(db, reason, keep = KEEP_BACKUPS) {
    const docs = [];

    // division 한 가지 조건만 걸어 읽는다(조건 하나짜리는 색인을 따로 안 만들어도 된다).
    const txSnap = await getDocs(query(collection(db, 'acc_transactions'), where('division', 'in', VOTIZ_DIVISIONS)));
    txSnap.forEach((d) => docs.push({ path: `acc_transactions/${d.id}`, data: serialize(d.data()) }));

    const snaps = await Promise.all(VOTIZ_COLLECTIONS.map((c) => getDocs(collection(db, c))));
    snaps.forEach((snap, i) => {
        const col = VOTIZ_COLLECTIONS[i];
        snap.forEach((d) => docs.push({ path: `${col}/${d.id}`, data: serialize(d.data()) }));
    });

    return writeBackup(db, { docs, reason, keep, kind: BACKUP_KINDS.VOTIZ });
}

/**
 * 공통 저장 — 문서 1MB 한도 때문에 여러 조각(chunks)으로 나눠 담는다.
 * 복원할 때는 조각을 번호순으로 이어 붙이면 된다.
 *   backups/{id}            메타 (kind 가 없으면 학원 백업)
 *   backups/{id}/chunks/{n} { json: "[...]" }
 */
async function writeBackup(db, { docs: allDocs, reason, keep, kind }) {

    // 문자열 바이트 기준으로 청크 분할 (각 청크가 문서 한도 안에 들도록)
    const chunks = [];
    let cur = [];
    let curBytes = 0;
    let totalBytes = 0;
    for (const d of allDocs) {
        const size = byteLen(JSON.stringify(d));
        totalBytes += size;
        if (cur.length > 0 && curBytes + size > CHUNK_BYTES) {
            chunks.push(cur);
            cur = [];
            curBytes = 0;
        }
        cur.push(d);
        curBytes += size;
    }
    if (cur.length) chunks.push(cur);

    const backupId = new Date().toISOString().replace(/[:.]/g, '-'); // 예: 2026-07-22T05-55-06-123Z (시간순 정렬)

    const meta = {
        createdAt: new Date().toISOString(),
        reason: String(reason || 'manual'),
        projectId: PROJECT_ID,
        docCount: allDocs.length,
        chunkCount: chunks.length,
        excludes: ['payments.imageUrl'],
    };
    // 학원 백업은 예전과 같은 모양을 유지하려고 kind 를 안 넣는다(없으면 학원으로 본다).
    if (kind) {
        meta.kind = kind;
        meta.excludes = ['photos'];
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'backups', backupId), meta);
    chunks.forEach((chunk, i) => {
        batch.set(doc(db, 'backups', backupId, 'chunks', String(i)), { json: JSON.stringify(chunk) });
    });
    await batch.commit();

    // 오래된 백업 정리 (id 가 시간순이라 사전순 정렬 = 시간순). 실패해도 백업 자체는 성공.
    try {
        const snap = await getDocs(collection(db, 'backups'));
        // 같은 묶음끼리만 센다. 안 그러면 다른 묶음 백업이 밀려서 지워진다.
        const myKind = kind || BACKUP_KINDS.ACADEMY;
        const ids = snap.docs.filter((d) => kindOf(d.data()) === myKind).map((d) => d.id).sort();
        const toDelete = ids.slice(0, Math.max(0, ids.length - keep));
        for (const id of toDelete) {
            const chunksSnap = await getDocs(collection(db, 'backups', id, 'chunks'));
            const del = writeBatch(db);
            chunksSnap.docs.forEach((c) => del.delete(c.ref));
            del.delete(doc(db, 'backups', id));
            await del.commit();
        }
    } catch {
        /* 오래된 백업 정리 실패는 무시 */
    }

    return { count: allDocs.length, backupId, chunkCount: chunks.length, bytes: totalBytes };
}
