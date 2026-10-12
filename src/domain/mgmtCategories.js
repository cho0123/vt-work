// 매니지먼트 공통 항목(mgmtCategories) — 항목 / 세부항목 구조와 보티즈 분류 연결표.
// 순수 함수만. Firestore·React 를 모르게 둔다.
//
// 구조
//   parentId 가 없거나 null  → 최상위 '항목'
//   parentId 가 있으면       → 그 항목의 '세부항목'
//   ⚠️ 기존 문서에는 parentId 가 없다 → 전부 최상위 항목으로 본다(데이터를 고치지 않는다).
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

/** 그 항목이 속한 최상위 항목 id. 최상위면 자기 자신. */
export const rootIdOf = (cats, categoryId) => {
    const m = byId(cats);
    const c = m[categoryId];
    if (!c) return categoryId;              // 삭제된 항목은 그대로 둔다(집계에서 '(삭제된 항목)')
    const p = parentIdOf(c);
    return p && m[p] ? p : categoryId;      // 부모가 사라졌으면 자기 자신을 최상위로 본다
};

/** 세부항목의 구분(수익/지출)은 부모를 따른다. */
export const kindOf = (cats, c) => {
    if (!c) return '';
    const p = parentIdOf(c);
    if (!p) return c.kind || '';
    const parent = byId(cats)[p];
    return parent ? (parent.kind || '') : (c.kind || '');
};

/** 부모가 숨겨져 있으면 세부항목도 숨은 것으로 본다. */
export const isHidden = (cats, c) => {
    if (!c) return false;
    if (c.hidden) return true;
    const p = parentIdOf(c);
    if (!p) return false;
    const parent = byId(cats)[p];
    return !!(parent && parent.hidden);
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

/** 화면에 쓰는 이름. '항목 > 세부항목' 또는 '항목'. */
export const catPath = (cats, categoryId, subCategoryId) => {
    const m = byId(cats);
    const top = m[rootIdOf(cats, categoryId)];
    const topName = top ? top.name : '(삭제된 항목)';
    if (!subCategoryId) return topName;
    const sub = m[subCategoryId];
    return topName + ' > ' + (sub ? sub.name : '(삭제된 세부항목)');
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
