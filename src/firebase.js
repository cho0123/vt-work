import { initializeApp } from 'firebase/app';
import {
    initializeFirestore,
    getFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage'; // ★ 추가됨

const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: import.meta.env.VITE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_APP_ID,
};

// 운영 프로젝트 ID. 어느 DB에 붙었는지 판별하는 기준값.
const PROD_PROJECT_ID = 'vt-schedule-12568';

export const IS_PROD_DB = firebaseConfig.projectId === PROD_PROJECT_ID;

// 개발 중 실수로 운영 DB에 붙는 것을 막기 위한 표시.
// 탭 제목에 붙여서 화면만 봐도 바로 알 수 있게 한다.
if (!IS_PROD_DB) {
    document.title = `[개발DB] ${document.title}`;
    console.warn(
        `%c개발용 데이터베이스에 연결됨: ${firebaseConfig.projectId}\n여기서 무엇을 하든 운영 데이터에 영향이 없습니다.`,
        'background:#1e40af;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold'
    );
} else if (import.meta.env.DEV) {
    // 로컬 개발인데 운영 DB에 붙은 상황 — 있어서는 안 되는 조합이므로 강하게 경고한다.
    document.title = `⚠️운영DB⚠️ ${document.title}`;
    console.error(
        `%c경고: 로컬 개발 환경인데 운영 데이터베이스(${firebaseConfig.projectId})에 연결되었습니다.\n.env.development 파일을 확인하세요.`,
        'background:#b91c1c;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold'
    );
}

const app = initializeApp(firebaseConfig);

/**
 * Firestore 로컬 지속 캐시(IndexedDB)를 켠다.
 *
 * 출석부·학생관리 탭은 로테이션 계산 때문에 학생들의 전체 수업 이력이
 * 필요해서, 탭을 열 때마다 스케쥴 3,000건 이상을 읽었다. 하루 읽기 한도가
 * 5만 건이라 탭을 열댓 번만 오가도 한도에 닿는 구조였다.
 *
 * 캐시를 켜면 두 번째 방문부터는 IndexedDB 에서 즉시 읽고, 서버에서는
 * 바뀐 문서만 받아온다. 계산 로직은 그대로 두고 읽기 횟수만 줄인다.
 * (덤으로 초기 렌더가 빨라지고, 잠시 오프라인이어도 화면이 유지된다)
 *
 * 여러 탭을 동시에 열 수 있으므로 multi-tab 매니저를 쓴다.
 * 브라우저가 IndexedDB 를 막아둔 경우(사생활 보호 모드 등) 실패할 수 있어
 * 그때는 캐시 없이 동작하도록 되돌린다.
 */
function createDb() {
    try {
        return initializeFirestore(app, {
            localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        });
    } catch (e) {
        // IndexedDB 를 못 쓰는 브라우저/사생활 보호 모드이거나,
        // 이미 초기화된 경우(개발 중 핫리로드)에 여기로 온다.
        // 어느 쪽이든 기본 인스턴스를 그대로 쓰면 된다.
        console.warn('로컬 캐시를 켜지 못했습니다. 캐시 없이 동작합니다.', e?.message || e);
        return getFirestore(app);
    }
}

export const db = createDb();
export const auth = getAuth(app);
export const storage = getStorage(app);
