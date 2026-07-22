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
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';

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
];

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
export async function getLastBackup(db) {
    const snap = await getDocs(collection(db, 'backups'));
    if (snap.empty) return null;

    const latest = snap.docs.sort((a, b) => (a.id < b.id ? -1 : 1))[snap.docs.length - 1];
    const data = latest.data();
    const at = new Date(data.createdAt);
    return {
        id: latest.id,
        createdAt: data.createdAt,
        at: isNaN(at.getTime()) ? null : at,
        reason: data.reason || '',
        docCount: data.docCount ?? null,
    };
}

const byteLen = (str) => new TextEncoder().encode(str).length;

// 백업을 Firestore `backups` 컬렉션에 저장하고, 최근 keep 개만 남긴다.
// 성공 시 { count, backupId, chunkCount } 반환. 실패 시 예외를 던진다(호출부에서 처리).
export async function backupToFirestore(db, reason, keep = KEEP_BACKUPS) {
    const allDocs = await buildBackupDocs(db);

    // 문자열 바이트 기준으로 청크 분할 (각 청크가 문서 한도 안에 들도록)
    const chunks = [];
    let cur = [];
    let curBytes = 0;
    for (const d of allDocs) {
        const size = byteLen(JSON.stringify(d));
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

    const batch = writeBatch(db);
    batch.set(doc(db, 'backups', backupId), {
        createdAt: new Date().toISOString(),
        reason: String(reason || 'manual'),
        projectId: PROJECT_ID,
        docCount: allDocs.length,
        chunkCount: chunks.length,
        excludes: ['payments.imageUrl'],
    });
    chunks.forEach((chunk, i) => {
        batch.set(doc(db, 'backups', backupId, 'chunks', String(i)), { json: JSON.stringify(chunk) });
    });
    await batch.commit();

    // 오래된 백업 정리 (id 가 시간순이라 사전순 정렬 = 시간순). 실패해도 백업 자체는 성공.
    try {
        const snap = await getDocs(collection(db, 'backups'));
        const ids = snap.docs.map((d) => d.id).sort();
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

    return { count: allDocs.length, backupId, chunkCount: chunks.length };
}
