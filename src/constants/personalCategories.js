// 개인 일정의 기본 항목.
//
// 이 항목들은 삭제할 수 없다(앱이 늘 기대하는 값). 사용자가 추가한 항목은
// Firestore(site_settings/personal_categories)에 따로 저장하고 삭제도 가능하다.
// 화면에는 [기본 항목] + [사용자 추가 항목]을 합쳐서 보여준다.

export const DEFAULT_PERSONAL_CATEGORIES = {
    // 쌤일정(마스터)
    master: ['야구', '야구1:1', '작곡', '합주', '미팅', '병원', '기타'],
    // 짱구일정(보컬)
    vocal: ['상담', 'PT', '피부과', '병원', '월말정산', '기타'],
};
