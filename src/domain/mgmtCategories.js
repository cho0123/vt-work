// 매니지먼트 공통 항목(mgmtCategories) — 항목 / 세부항목 구조와 보티즈 분류 연결표.
// 순수 함수만. Firestore·React 를 모르게 둔다.
//
// 구조 — 최대 3단계 (항목 > 세부 > 세부2)
//   parentId 가 없거나 null  → 1단계 '항목'(최상위)
//   parentId 가 있으면       → 그 항목의 아래 단계
//   ⚠️ 기존 문서에는 parentId 가 없다 → 전부 최상위 항목으로 본다(데이터를 고치지 않는다).
//
// 장부 저장 방식 (기존 데이터와 호환)
//   categoryId    = 항상 **최상위 항목** id (집계 기준)
//   subCategoryId = **가장 깊이 고른 항목** id (2단계든 3단계든 여기 하나만 넣는다)
//   → 2단계만 쓰던 기존 줄은 subCategoryId 가 2단계 id 이므로 그대로 동작한다.
//     중간 단계는 parentId 를 타고 올라가 찾는다(chainOf).
//
// 정산비율은 **최상위 항목 단위로만** 둔다. 세부항목은 부모의 비율을 따른다.
// 그래서 정산 집계도 최상위 항목 기준이다(세부항목 금액은 부모에 합쳐진다).

export const parentIdOf = (c) => (c && c.parentId) || null;
export const isTopLevel = (c) => !parentIdOf(c);

const byId = (cats) => {
    const m = {};
    (cats || []).forEach((c) => { m[c.id] = c; });
    return m;
};

/** 최대 단계 수. 항목 > 세부 > 세부2. */
export const MAX_DEPTH = 3;

/**
 * 그 항목까지의 줄기 [최상위, …, 자기]. 없는 id 면 빈 배열.
 * 부모가 사라졌으면 거기서 멈춘다(그 지점이 최상위가 된다).
 */
export const chainOf = (cats, categoryId) => {
    const m = byId(cats);
    const out = [];
    let cur = m[categoryId];
    let guard = 0;
    while (cur && guard < MAX_DEPTH + 2) {
        out.unshift(cur);
        const p = parentIdOf(cur);
        cur = p ? m[p] : null;
        guard += 1;
    }
    return out;
};

/** 1 = 최상위 항목, 2 = 세부, 3 = 세부2. 없는 id 는 0. */
export const depthOf = (cats, categoryId) => chainOf(cats, categoryId).length;

/** 그 항목이 속한 최상위 항목 id. 최상위면 자기 자신. */
export const rootIdOf = (cats, categoryId) => {
    const ch = chainOf(cats, categoryId);
    // 삭제된 항목은 그대로 둔다(집계에서 '(삭제된 항목)')
    return ch.length ? ch[0].id : categoryId;
};

/** 아래 단계의 구분(수익/지출)은 최상위를 따른다. */
export const kindOf = (cats, c) => {
    if (!c) return '';
    const ch = chainOf(cats, c.id);
    return ch.length ? (ch[0].kind || '') : (c.kind || '');
};

/** 위 단계가 하나라도 숨겨져 있으면 아래 단계도 숨은 것으로 본다. */
export const isHidden = (cats, c) => {
    if (!c) return false;
    if (c.hidden) return true;
    const ch = chainOf(cats, c.id);
    return ch.some((x) => !!x.hidden);
};

export const byOrder = (a, b) => {
    const d = Number(a.order || 0) - Number(b.order || 0);
    if (d !== 0) return d;
    return (a.name || '').localeCompare(b.name || '');
};

/** 최상위 항목 목록. kind 를 주면 그 구분만, includeHidden 이 아니면 숨긴 것은 뺀다. */
export const topLevelCats = (cats, kind = null, includeHidden = false) =>
    (cats || [])
        .filter((c) => isTopLevel(c))
        .filter((c) => (kind ? (c.kind || '') === kind : true))
        .filter((c) => (includeHidden ? true : !c.hidden))
        .sort(byOrder);

/** 그 항목의 세부항목 목록. */
export const childrenOf = (cats, parentId, includeHidden = false) =>
    (cats || [])
        .filter((c) => parentIdOf(c) === parentId)
        .filter((c) => (includeHidden ? true : !c.hidden))
        .sort(byOrder);

export const hasChildren = (cats, parentId) =>
    (cats || []).some((c) => parentIdOf(c) === parentId);

/**
 * 화면에 쓰는 전체 경로. '제작비 > 곡비 > 작사비' / '제작비 > 믹스' / '제작비'.
 * subCategoryId 는 **가장 깊이 고른 항목**이므로 그 줄기를 그대로 펼치면 된다.
 */
export const catPath = (cats, categoryId, subCategoryId) => {
    const m = byId(cats);
    const topName = (m[rootIdOf(cats, categoryId)] || {}).name || '(삭제된 항목)';
    if (!subCategoryId) return topName;
    const ch = chainOf(cats, subCategoryId);
    if (ch.length === 0) return topName + ' > (삭제된 세부항목)';
    return ch.map((c) => c.name).join(' > ');
};

/**
 * 장부 한 줄이 그 항목(어느 단계든)에 걸리는지 — 목록 필터용.
 * 최상위를 고르면 그 아래 세부·세부2 줄도 같이 걸린다.
 */
export const rowMatchesCategory = (cats, row, categoryId) => {
    if (!categoryId) return true;
    if (!row) return false;
    if (row.categoryId === categoryId || row.subCategoryId === categoryId) return true;
    return chainOf(cats, row.subCategoryId).some((c) => c.id === categoryId);
};

/**
 * 이미 쓰고 있는 항목인지 — 쓰고 있으면 지우지 말고 숨기기만 한다.
 * @param usage { ledgerRows, artists }
 */
export const isCategoryInUse = (categoryId, { ledgerRows = [], artists = [] } = {}) => {
    const used = (ledgerRows || []).some(
        (r) => r.categoryId === categoryId || r.subCategoryId === categoryId
    );
    if (used) return true;
    return (artists || []).some((a) => {
        const r = (a && a.ratios) || {};
        return Object.prototype.hasOwnProperty.call(r, categoryId);
    });
};

// ──[ 보티즈 분류 연결표 ]────────────────────────────────────────────────
// 보티즈 고정 분류(수입 음원수익·공연수익…, 지출 제작비·마케팅비…) 하나마다
// 매니지먼트 최상위 항목을 하나 고른다. 소속(member) 정산에서 곡 내역을 집계할 때,
// 곡-아티스트 연결에서 고른 '수익항목/지출항목' 대신 이 표를 먼저 본다.
//
// 저장: mgmtSettings/{VOTIZ_MAP_DOC} = { uid, map: { 'income:source': '<항목id>', ... } }
export const MGMT_SETTINGS_COLLECTION = 'mgmtSettings';
export const VOTIZ_MAP_DOC = 'votiz_category_map';

export const votizMapKey = (type, category) => String(type || '') + ':' + String(category || '');

/** 그 내역에 연결된 매니지먼트 항목 id. 없으면 null. */
export const mappedCategoryId = (votizMap, t) => {
    if (!votizMap || !t) return null;
    const v = votizMap[votizMapKey(t.type, t.category)];
    return v || null;
};

/** 연결표에서 실제로 쓸 수 있는 항목만 남긴다(지워졌거나 세부항목이면 최상위로 올린다). */
export const normalizeVotizMap = (votizMap, cats) => {
    const m = byId(cats);
    const out = {};
    Object.keys(votizMap || {}).forEach((k) => {
        const id = votizMap[k];
        if (!id || !m[id]) return;
        out[k] = rootIdOf(cats, id);
    });
    return out;
};
