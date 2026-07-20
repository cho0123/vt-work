import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage"; // ★ 추가됨

const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: import.meta.env.VITE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_APP_ID
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
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
