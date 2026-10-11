// 내역에 붙이는 사진(영수증) — 보티즈 수입·지출, 매니지먼트 장부 공용.
//
// 저장 방식은 **학생 결제 영수증과 똑같다**: Firebase Storage 를 쓰지 않고
// `compressImage`(최대 폭 800px, JPEG 0.6) 로 줄인 base64 문자열을 Firestore 에 넣는다.
// (Storage 를 안 쓰므로 Storage 규칙도 필요 없다. 기존 firestore.rules 의
//  `/{document=**}` 가 하위 컬렉션까지 허용 UID 전용으로 이미 막아준다.)
//
// 다만 **여러 장**이라 학생 결제처럼 문서 안에 바로 넣을 수는 없다.
//   - Firestore 문서 한도가 1MB 라 사진 서너 장이면 넘는다.
//   - 보티즈 목록은 acc_transactions 전체(700건+)를 한 번에 읽는데, 사진이 문서 안에
//     들어 있으면 목록을 열 때마다 사진까지 전부 내려받게 된다.
// 그래서 사진은 **문서 아래 하위 컬렉션 `photos` 에 한 장씩** 넣고, 부모 문서에는
// 장수(`photoCount`)만 숫자로 적는다. 목록은 숫자만 읽고, 사진은 눌러서 열 때만 읽는다.
//
//   acc_transactions/{id}/photos/{photoId}  = { uid, dataUrl, name, createdAt }
//   artistLedger/{id}/photos/{photoId}      = 같음
//
// 부모 문서를 지울 때는 하위 컬렉션이 자동으로 지워지지 않으므로 `deleteAllPhotos` 로
// 먼저 지운다(안 지우면 사진만 남아 떠돈다).
import { collection, doc, addDoc, getDocs, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { compressImage } from './image.js';

// 학생 결제와 같은 기준. 압축 후 이보다 크면 받지 않는다(문서 1MB 한도).
export const MAX_PHOTO_BYTES = 900000;

const photosCol = (db, parentPath, parentId) => collection(db, parentPath, parentId, 'photos');

// 부모 문서의 장수를 맞춰 둔다. 목록은 이 숫자만 보고 📎 를 그린다.
const syncCount = async (db, parentPath, parentId, count) => {
    try {
        await updateDoc(doc(db, parentPath, parentId), { photoCount: count });
    } catch (e) {
        // 장수는 표시용이다. 실패해도 사진 자체는 저장돼 있으므로 막지 않는다.
        console.warn('사진 장수 갱신 실패(표시만 영향):', e && e.message);
    }
};

export async function listPhotos(db, parentPath, parentId) {
    const snap = await getDocs(photosCol(db, parentPath, parentId));
    return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
            const av = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
            const bv = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
            return av - bv;
        });
}

/**
 * 파일 여러 개를 압축해 한 장씩 저장한다.
 * @returns {{ added: number, errors: string[] }} 실패한 파일은 이름과 이유를 돌려준다.
 */
export async function addPhotos(db, parentPath, parentId, files, uid) {
    const list = Array.from(files || []);
    if (list.length === 0) return { added: 0, errors: [] };

    const errors = [];
    let added = 0;
    for (let i = 0; i < list.length; i++) {
        const f = list[i];
        try {
            const dataUrl = await compressImage(f);
            if (dataUrl.length > MAX_PHOTO_BYTES) {
                errors.push((f.name || '사진') + ' — 용량이 너무 큽니다(줄여도 1MB 가까움)');
                continue;
            }
            await addDoc(photosCol(db, parentPath, parentId), {
                uid,
                dataUrl,
                name: f.name || '',
                createdAt: new Date(),
            });
            added++;
        } catch (e) {
            errors.push((f.name || '사진') + ' — ' + (e && e.message ? e.message : '처리 실패'));
        }
    }

    if (added > 0) {
        const now = await listPhotos(db, parentPath, parentId);
        await syncCount(db, parentPath, parentId, now.length);
    }
    return { added, errors };
}

export async function deletePhoto(db, parentPath, parentId, photoId) {
    await deleteDoc(doc(db, parentPath, parentId, 'photos', photoId));
    const now = await listPhotos(db, parentPath, parentId);
    await syncCount(db, parentPath, parentId, now.length);
    return now;
}

// 부모 문서를 지우기 전에 부른다. 사진이 없으면 조회 1번으로 끝난다.
export async function deleteAllPhotos(db, parentPath, parentId) {
    const snap = await getDocs(photosCol(db, parentPath, parentId));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    return snap.size;
}

// 부모 문서의 photoCount 가 실제와 어긋났을 때 쓰는 보정(지금은 화면에서 안 쓴다).
export async function refreshCount(db, parentPath, parentId) {
    const parent = await getDoc(doc(db, parentPath, parentId));
    if (!parent.exists()) return 0;
    const now = await listPhotos(db, parentPath, parentId);
    await syncCount(db, parentPath, parentId, now.length);
    return now.length;
}
