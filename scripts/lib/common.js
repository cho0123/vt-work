import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint, DocumentReference } from 'firebase-admin/firestore';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BACKUP_DIR = path.join(ROOT, 'backup');

/** 운영 프로젝트. 이 값은 안전장치의 기준이므로 절대 바꾸지 말 것. */
export const PROD_PROJECT_ID = 'vt-schedule-12568';

/**
 * 개발(스테이징) 프로젝트 목록 — 키 파일 -> 프로젝트 ID.
 * 쓰기 스크립트는 여기 등록된 프로젝트에만 동작한다.
 *
 * 3aec5 는 2026-07-20 검증 중 일일 읽기 한도를 소진해 하루 동안 쓸 수 없게 되어,
 * 예비로 만들어져 있던 eeeaa 로 옮겨왔다.
 */
export const DEV_PROJECTS = {
    'key-B.json': 'vt-work-dev-3aec5',
    'key-C.json': 'vt-work-dev-eeeaa',
};

/** 현재 사용할 개발 프로젝트. 바꾸려면 이 줄만 고치면 된다. */
export const DEV_KEY = process.env.VT_DEV_KEY || 'key-C.json';
export const DEV_PROJECT_ID = DEV_PROJECTS[DEV_KEY];

if (!DEV_PROJECT_ID) {
    throw new Error(`알 수 없는 개발 키 파일: ${DEV_KEY} (DEV_PROJECTS 에 등록하세요)`);
}

export function loadKey(fileName) {
    const p = path.join(ROOT, fileName);
    if (!fs.existsSync(p)) {
        throw new Error(`키 파일이 없습니다: ${p}`);
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 서비스 계정 키로 앱을 초기화하고 Firestore 핸들을 돌려준다. */
export function initDb(keyFile, appName) {
    const key = loadKey(keyFile);
    const app = initializeApp({ credential: cert(key) }, appName);
    return { db: getFirestore(app), projectId: key.project_id };
}

// ── Firestore 특수 타입 <-> JSON 직렬화 ─────────────────────────────
// Timestamp, GeoPoint, DocumentReference, Buffer 는 그대로 JSON 으로 못 담기 때문에
// 태그를 붙여 보존한다. 복원 시 원래 타입으로 되돌린다.

export function serialize(value) {
    if (value === null || value === undefined) return null;

    if (value instanceof Timestamp) {
        return { __t: 'ts', s: value.seconds, n: value.nanoseconds };
    }
    if (value instanceof GeoPoint) {
        return { __t: 'geo', lat: value.latitude, lng: value.longitude };
    }
    if (value instanceof DocumentReference) {
        return { __t: 'ref', path: value.path };
    }
    if (Buffer.isBuffer(value)) {
        return { __t: 'bytes', b64: value.toString('base64') };
    }
    if (value instanceof Date) {
        return { __t: 'ts', s: Math.floor(value.getTime() / 1000), n: (value.getTime() % 1000) * 1e6 };
    }
    if (Array.isArray(value)) {
        return value.map(serialize);
    }
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
        return out;
    }
    return value;
}

export function deserialize(value, db) {
    if (value === null || value === undefined) return null;

    if (Array.isArray(value)) {
        return value.map((v) => deserialize(v, db));
    }
    if (typeof value === 'object') {
        switch (value.__t) {
            case 'ts':
                return new Timestamp(value.s, value.n);
            case 'geo':
                return new GeoPoint(value.lat, value.lng);
            case 'ref':
                return db.doc(value.path);
            case 'bytes':
                return Buffer.from(value.b64, 'base64');
        }
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deserialize(v, db);
        return out;
    }
    return value;
}

export function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
