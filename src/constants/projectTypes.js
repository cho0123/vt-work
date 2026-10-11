// 보티즈 곡(acc_projects)의 종류.
//
// 표시·분류용이다. 곡별 수입·지출 계산, 상단 카드, 아티스트 연결에는 쓰지 않는다.
// 옛 곡 문서에는 projectType 이 없다 → '미지정' 으로 보여주고 데이터는 고치지 않는다.
// (원장이 곡 상세에서 직접 고른다)

export const PROJECT_TYPES = [
    { key: 'collab', label: '콜라보', badge: 'bg-violet-50 text-violet-700 ring-violet-200' },
    { key: 'own', label: '자체', badge: 'bg-blue-50 text-blue-700 ring-blue-200' },
    { key: 'sale', label: '곡 판매', badge: 'bg-amber-50 text-amber-700 ring-amber-200' },
];

export const UNSET_TYPE = {
    key: 'none',
    label: '미지정',
    badge: 'bg-gray-100 text-gray-500 ring-gray-200',
};

/** 곡 문서 → 종류 키. 없거나 모르는 값이면 'none'(미지정). */
export const projectTypeOf = (p) => {
    const t = p && p.projectType;
    return PROJECT_TYPES.some((x) => x.key === t) ? t : UNSET_TYPE.key;
};

export const projectTypeInfo = (p) => {
    const key = projectTypeOf(p);
    return PROJECT_TYPES.find((x) => x.key === key) || UNSET_TYPE;
};

export const isSaleProject = (p) => projectTypeOf(p) === 'sale';

// 목록 위 필터 버튼(전체 + 종류 4개).
export const PROJECT_TYPE_FILTERS = [
    { key: 'all', label: '전체' },
    ...PROJECT_TYPES.map((t) => ({ key: t.key, label: t.label })),
    { key: UNSET_TYPE.key, label: UNSET_TYPE.label },
];
