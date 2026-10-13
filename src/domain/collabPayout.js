// 콜라보 음원수익 자동 배분 — 수익 1건에 대해 그 아티스트에게 넘길 금액.
//
// ⚠️ 계산을 새로 짜지 않는다. 매니지먼트 콜라보 정산이 쓰는 `computeCollab` 을 그대로 부르고,
//    '이 수익까지 누적' 에서 '이 수익 앞까지 누적' 을 빼서 그 한 건 몫을 뽑는다.
//    (공유 대상 누계는 max(0, 누적 − 제작비) 라서 차를 내면 그 건이 기여한 몫만 남는다)
//    computeCollab 자체는 손대지 않았다 — 정산 결과가 달라지면 안 되기 때문.
//
// 공유 대상은 **음원수익(category 'source')만** 이다 — 확정된 규칙.
// 수익배분(마이너스 수익)·공연수익·곡 판매·기타수익은 회수 누적에 넣지 않는다.
// 매니지먼트 콜라보 정산도 같은 기준을 쓴다(호출하는 쪽에서 sourceIncomeOnly 로 걸러 넘긴다).
// computeCollab 자체는 분류를 가리지 않으므로, 거르는 책임은 부르는 쪽에 있다.
import { computeCollab, linkTypeOf, monthRange, ymOf, toWon } from './artistSettlement.js';

// 자동 배분으로 만드는 줄의 분류 키.
// ⚠️ 지출이 아니라 **수입의 마이너스 금액**으로 만든다 → votizCategories.income 에 넣는다.
export const PAYOUT_CATEGORY = 'payout';
export const PAYOUT_CATEGORY_LABEL = '수익배분';

// 누적 대상이 되는 수입 분류 (votizCategories.income 의 '음원수익')
export const SOURCE_INCOME_CATEGORY = 'source';

// 새 수익(아직 문서 id 가 없는 것)을 가리키는 임시 id
export const NEW_INCOME_ID = '__new__';

// 그 곡에 '콜라보(제작비 회수 후 공유)' 로 연결된 아티스트들
export const collabLinksOf = (project) =>
    (project && Array.isArray(project.artists) ? project.artists : [])
        .filter((a) => linkTypeOf(a) === 'collab_recoup');

// 그 날짜가 공유 기간(시작월부터 기간 개월 수) 안인가
export const isWithinShareWindow = (link, date) => {
    if (!link || !link.startMonth || !date) return false;
    return monthRange(link.startMonth, Number(link.periodMonths || 36)).includes(ymOf(date));
};

// 날짜 → id 순. 같은 달 안에서도 순서가 흔들리지 않게 한다.
const orderKey = (t) => String(t.date || '') + '|' + String(t.id || '');

/**
 * 수익 한 건에 대한 공유 대상 금액과 배분액.
 *
 * @param transactions acc_transactions 전체(또는 그 곡 것)
 * @param projectId    곡 id
 * @param link         { recoupAmount, sharePercent, startMonth, periodMonths }
 * @param income       { id, date, totalAmount, amount } — 입력 중인 값도 그대로 넣는다
 * @returns {{ inWindow, shareable, amount, sharePercent, recoupAmount,
 *             cumulativeBefore, cumulativeAfter, remainingRecoup }}
 */
export const allocationForIncome = ({ transactions = [], projectId, link = {}, income = {} }) => {
    const sharePercent = Number(link.sharePercent || 0);
    const recoupAmount = Number(link.recoupAmount || 0);
    const incomeId = income.id || NEW_INCOME_ID;

    const empty = {
        inWindow: false, shareable: 0, amount: 0,
        sharePercent, recoupAmount,
        cumulativeBefore: 0, cumulativeAfter: 0, remainingRecoup: recoupAmount,
    };
    // 음원수익이 아니면 공유 대상이 아니다. (분류를 안 넘기면 음원수익으로 본다 —
    //  부르는 쪽이 이미 음원수익일 때만 쓰기 때문)
    if (income.category !== undefined && income.category !== SOURCE_INCOME_CATEGORY) return empty;
    if (!isWithinShareWindow(link, income.date)) return empty;

    // 누적 대상 — 이 곡의 음원수익만. 편집 중인 건은 화면에 입력된 값으로 갈아끼운다.
    const pool = sourceIncomeOnly(
        (transactions || []).filter((t) => t.projectId === projectId && t.division === 'votiz' && t.id !== incomeId)
    );
    const mine = {
        id: incomeId,
        projectId,
        division: 'votiz',
        type: 'income',
        category: SOURCE_INCOME_CATEGORY,
        date: income.date,
        amount: Number(income.amount || 0),
        totalAmount: Number(income.totalAmount === undefined || income.totalAmount === null
            ? income.amount || 0
            : income.totalAmount),
    };

    const sorted = pool.concat([mine]).sort((a, b) => orderKey(a).localeCompare(orderKey(b)));
    const idx = sorted.findIndex((t) => t.id === incomeId);
    const upTo = sorted.slice(0, idx + 1);
    const before = sorted.slice(0, idx);

    const after = computeCollab({ transactions: upTo, projectId, link });
    const prior = computeCollab({ transactions: before, projectId, link });

    const shareable = Math.max(0, after.shareableTotal - prior.shareableTotal);
    return {
        inWindow: true,
        shareable,
        amount: toWon(shareable * (sharePercent / 100)),
        sharePercent,
        recoupAmount,
        cumulativeBefore: prior.totalIncome,
        cumulativeAfter: after.totalIncome,
        remainingRecoup: after.remainingRecoup,
    };
};

/**
 * 배분 줄의 금액. **마이너스 수익**이라 전부 음수로 돌려준다.
 * 세무 유형이 세금계산서면 배분 금액이 '부가세 포함' 이다
 * (매니지먼트 지급과 같은 규칙 — 몫 위에 더하지 않고 안에서 쪼갠다).
 * 반올림이 한쪽으로 쏠리지 않게 양수로 계산한 뒤 부호만 뒤집는다.
 * @param taxType 'invoice' | 'withholding'
 */
export const payoutAmounts = (total, taxType) => {
    const gross = Math.abs(Number(total) || 0);
    if (taxType === 'invoice') {
        const supply = toWon(gross / 1.1);
        return { amount: -supply, vat: -(gross - supply), totalAmount: -gross };
    }
    return { amount: -gross, vat: 0, totalAmount: -gross };
};

/**
 * 공유 회차 — 공유 시작월이 1회차. 분모는 공유 기간 개월 수.
 * 기간 밖이면 null. **표시 전용**이다(계산에는 쓰지 않는다).
 * @returns { round, total, label } | null
 */
export const shareRoundOf = (link, date) => {
    if (!link || !link.startMonth || !date) return null;
    const months = monthRange(link.startMonth, Number(link.periodMonths || 36));
    const idx = months.indexOf(ymOf(date));
    if (idx < 0) return null;
    return { round: idx + 1, total: months.length, label: (idx + 1) + '/' + months.length };
};

// 배분 지출 메모 — 어디서 왔는지 한 줄로 남긴다.
// ⚠️ 새로 만드는 줄에만 쓴다. 이미 저장된 메모는 고치지 않는다.
export const payoutMemo = ({ artistName, sharePercent, incomeDate, round }) =>
    '자동배분 · ' + (artistName || '(이름없음)') + ' ' + Number(sharePercent || 0) + '%'
    + (round ? ' · ' + round : '')
    + ' · ' + (incomeDate || '') + ' 음원수익';

// 이 수익에 딸린 배분 줄 찾기 (수익 1건 × 아티스트 1명 = 1건)
export const findPayoutExpense = (transactions, sourceId, artistId) =>
    (transactions || []).find(
        (t) => t.payoutSourceId === sourceId && t.payoutArtistId === artistId
    ) || null;

// 이 수익에 딸린 배분 줄 전부
export const payoutExpensesOf = (transactions, sourceId) =>
    (transactions || []).filter((t) => t.payoutSourceId === sourceId);

export const isAutoPayout = (t) => !!(t && t.payoutSourceId);

// 만든 순서(= 곡에 연결된 아티스트 순서). 없으면 null.
const createdSec = (t) => {
    const c = t && t.createdAt;
    if (!c) return null;
    if (typeof c.seconds === 'number') return c.seconds;              // Firestore Timestamp
    if (c instanceof Date) return c.getTime() / 1000;
    return null;
};

/**
 * 페이지 나누기 — 묶음(원본 수익 + 그 아래 자동배분 줄)을 쪼개지 않는다.
 * 경계에 걸리면 그 묶음을 통째로 지금 페이지에 넣는다(그래서 한 페이지가 perPage 를 조금 넘을 수 있다).
 * ⚠️ 표시 전용이다. 줄을 더하거나 빼지 않는다.
 *
 * @param rows  groupPayoutsUnderSource 로 늘어놓은 줄
 * @param kinds { [id]: 'normal' | 'child' | 'orphan' } — 없으면 그냥 perPage 씩 자른다
 * @returns [[row, ...], ...]
 */
export const paginateGrouped = (rows, kinds, perPage) => {
    const list = rows || [];
    const size = Math.max(1, Number(perPage) || 25);
    const kindOf = (r) => (kinds || {})[r.id] || 'normal';
    const pages = [];
    let cur = [];
    let i = 0;
    while (i < list.length) {
        // 이 줄부터 딸린 자동배분 줄까지가 한 묶음이다.
        let len = 1;
        while (i + len < list.length && kindOf(list[i + len]) === 'child') len += 1;
        if (cur.length >= size) { pages.push(cur); cur = []; }
        for (let k = 0; k < len; k++) cur.push(list[i + k]);
        i += len;
    }
    if (cur.length) pages.push(cur);
    return pages;
};

/**
 * 내역 목록을 **보여주기 좋게** 다시 늘어놓는다 — 자동배분 줄을 원본 수익 바로 아래로.
 * ⚠️ 표시 전용이다. 저장 데이터·금액·계산에는 아무 영향이 없다.
 *
 * - 원본이 이 목록에 있으면 그 바로 아래에 붙인다(저장 순서·날짜와 무관).
 *   한 수익에 여러 명이면 만든 순서(= 아티스트 연결 순서)대로 줄줄이 붙인다.
 * - 원본이 목록에 없으면(삭제됐거나 기간·분류 필터로 빠졌으면) 제자리에 두고 'orphan' 으로 표시한다.
 * - 그 밖의 줄 순서는 들어온 그대로 둔다(날짜 정렬 등 기존 규칙 유지).
 *
 * @returns [{ row, kind: 'normal' | 'child' | 'orphan' }]
 */
export const groupPayoutsUnderSource = (list) => {
    const rows = list || [];
    const ids = new Set(rows.map((r) => r.id));
    const bySource = new Map();
    const orphan = new Set();

    rows.forEach((r) => {
        if (!isAutoPayout(r)) return;
        if (ids.has(r.payoutSourceId)) {
            if (!bySource.has(r.payoutSourceId)) bySource.set(r.payoutSourceId, []);
            bySource.get(r.payoutSourceId).push(r);
        } else {
            orphan.add(r.id);
        }
    });

    // 만든 순서대로. 시각이 없는 옛 줄은 들어온 순서를 지킨다.
    bySource.forEach((arr) => {
        arr.forEach((r, i) => { r.__i = i; });
        arr.sort((a, b) => {
            const ca = createdSec(a);
            const cb = createdSec(b);
            if (ca !== null && cb !== null && ca !== cb) return ca - cb;
            return a.__i - b.__i;
        });
        arr.forEach((r) => { delete r.__i; });
    });

    const out = [];
    rows.forEach((r) => {
        if (isAutoPayout(r) && !orphan.has(r.id)) return;    // 원본 아래에서 그린다
        out.push({ row: r, kind: orphan.has(r.id) ? 'orphan' : 'normal' });
        (bySource.get(r.id) || []).forEach((p) => out.push({ row: p, kind: 'child' }));
    });
    return out;
};

// 콜라보 공유 대상만 남긴다 — 음원수익 수입만. (지출은 콜라보 계산이 어차피 안 보지만
// 기준을 한눈에 보이게 여기서 같이 걸러 둔다)
export const sourceIncomeOnly = (transactions) =>
    (transactions || []).filter(
        (t) => t.type === 'income' && t.category === SOURCE_INCOME_CATEGORY
    );

// ── '배분 안 함' 기억 ─────────────────────────────────────────────────
// 표시는 **원본 수익 문서**에 담는다(`payoutSkipArtistIds` = 아티스트 id 배열).
// ⚠️ 화면 동작 전용이다 — 곡별 계산(projectTrans/pIncome/totalExp)·상단 카드·
//    매니지먼트 정산은 이 필드를 보지 않는다. 어디서도 금액으로 쓰이지 않는다.
export const SKIP_FIELD = 'payoutSkipArtistIds';

export const skipIdsOf = (income) => {
    const v = income && income[SKIP_FIELD];
    return Array.isArray(v) ? v.filter(Boolean).map(String) : [];
};

export const isPayoutSkipped = (income, artistId) =>
    skipIdsOf(income).includes(String(artistId));

/**
 * 저장할 새 목록.
 * 화면에 줄이 보이는 아티스트(`shownIds`)만 갱신하고, 안 보이는 기록은 그대로 남긴다 —
 * 날짜를 공유 기간 밖으로 옮겨 줄이 사라진 사이에 표시가 지워지면 안 되기 때문.
 */
export const mergeSkipIds = (prevIds, shownIds, skippedIds) => {
    const shown = (shownIds || []).map(String);
    const kept = (prevIds || []).map(String).filter((id) => !shown.includes(id));
    const out = [];
    kept.concat((skippedIds || []).map(String)).forEach((id) => {
        if (id && !out.includes(id)) out.push(id);
    });
    return out;
};
