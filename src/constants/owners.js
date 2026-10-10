// 원장(운영자) 계정 UID 목록.
//
// 이 앱의 실제 접근 통제는 firestore.rules 의 isAllowedUser() 가 한다.
// 목록에 없는 계정은 로그인해도 Firestore 에서 아무것도 읽거나 쓸 수 없다.
// 아래 목록은 그 규칙과 '같은 목록'이고, 화면에서 매니지먼트 탭을 숨기는 데만 쓴다.
//
// ⚠️ 화면에서 탭을 숨기는 것은 보안이 아니다(번들을 뜯으면 보인다).
//    차단은 firestore.rules 가 한다. 계정을 추가·변경할 때는
//    firestore.rules 의 isAllowedUser() 와 이 파일을 반드시 '같이' 고칠 것.
export const OWNER_UIDS = [
    'xA6nm0L4uBTyRBctRRNqzKND1oW2', // 운영 vt-schedule-12568  voicetuning@nate.com
    'dLFgRjqJIzOdBjFBcozMvB36uAx1', // 개발 vt-work-dev-eeeaa   wlusa2@nate.com
];

export const isOwner = (user) => !!user && OWNER_UIDS.includes(user.uid);
