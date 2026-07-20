/**
 * Firebase Authentication 의 '신규 가입 허용' 설정을 조회한다. (읽기 전용)
 *
 * 앱에 가입 화면이 없어도 Identity Toolkit REST API 로 계정을 만들 수 있으면,
 * 배포된 JS 에 노출된 API 키만으로 누구나 계정을 만들어 모든 데이터를 볼 수 있다.
 * (규칙이 `request.auth != null` 인 경우)
 *
 * 실행: node scripts/check-signup.js key-A.json
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
    const res = await client.request({
        url: `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
    });
    const cfg = res.data;

    const emailEnabled = cfg?.signIn?.email?.enabled;
    const anonEnabled = cfg?.signIn?.anonymous?.enabled;
    const disableSignup = cfg?.signIn?.allowDuplicateEmails; // 참고용
    const emailProtection = cfg?.emailPrivacyConfig?.enableImprovedEmailPrivacy;

    console.log(`이메일/비밀번호 로그인 : ${emailEnabled ? '사용' : '미사용'}`);
    console.log(`익명 로그인            : ${anonEnabled ? '⚠ 사용 (누구나 로그인 가능)' : '미사용'}`);
    console.log(`이메일 열거 보호       : ${emailProtection ? '켜짐' : '꺼짐'}`);

    // 신규 가입 차단 여부
    const clientCfg = cfg?.client;
    const signUpDisabled = clientCfg?.permissions?.disabledUserSignup;
    const userDeletionDisabled = clientCfg?.permissions?.disabledUserDeletion;
    console.log(`\n신규 가입 차단         : ${signUpDisabled ? '✅ 차단됨' : '⚠ 열려 있음 (누구나 계정 생성 가능)'}`);
    console.log(`사용자 삭제 차단       : ${userDeletionDisabled ? '차단됨' : '열려 있음'}`);

    if (!signUpDisabled) {
        console.log(`
⚠ 앱에 가입 화면이 없어도, 배포된 JS 에 있는 API 키로
   REST API 를 직접 호출해 계정을 만들 수 있는 상태입니다.
   Firestore 규칙이 'request.auth != null' 이므로,
   그렇게 만든 계정으로 모든 데이터를 읽고 쓸 수 있습니다.

   차단: Firebase 콘솔 → Authentication → 설정 → 사용자 작업
        → '만들기(가입)' 체크 해제`);
    }
} catch (e) {
    const msg = e?.response?.data?.error?.message || e.message;
    console.error(`조회 실패: ${msg}`);
    process.exit(1);
}
console.log();
