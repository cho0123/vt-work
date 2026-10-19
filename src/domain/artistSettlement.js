// 아티스트 정산 계산 — 순수 함수만. Firestore·React 를 모르게 둔다.
//
// 여기서 정하는 것
//   1) 금액 기준(부가세 포함/공급가)      → AMOUNT_BASIS 한 곳
//   2) 원 단위 정리 방식                 → toWon 한 곳 (반올림)
//   3) 선정산 후배분 계산                → computeGeneralSettlement
//   4) 콜라보(제작비 회수 후 공유)        → computeCollab
//   5) 별도정산 건                       → computeCaseSettlement
//
// 쓰지 않는 것: 저작권(division 'copyright')은 어떤 계산에도 넣지 않는다.
import { mappedCategoryId, rootIdOf, catFullPath } from './mgmtCategories.js';

// ──[ 설정 ]──────────────────────────────────────────────────────────────
// 금액 기준. 'totalAmount' = 부가세 포함 합계, 'amount' = 공급가.
// 바꾸려면 이 한 줄만 고치면 화면·정산서·검증이 전부 따라온다.
export const AMOUNT_BASIS = 'totalAmount';

export const AMOUNT_BASIS_LABEL = {
    totalAmount: '합계 (부가세 포함)',
    amount: '공급가 (부가세 별도)',
};

// 한 줄에서 쓸 금액을 고른다. 기준 필드가 없는 옛 데이터는 공급가로 떨어진다.
export const amountOf = (row, basis = AMOUNT_BASIS) => {
    if (!row) return 0;
    const v = row[basis];
    if (v === undefined || v === null || v === '') return Number(row.amount || 0);
    return Number(v || 0);
};

// 원 단위 정리는 여기서만 한다. 반올림(Math.round) — 0.5 는 올린다.
// 아티스트 몫에만 적용하고, 중간 집계는 반올림하지 않는다(오차 누적 방지).
export const toWon = (n) => Math.round(Number(n) || 0);

// ──[ 기간 ]──────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');

// 정산주기별 기간 개수. 월=12, 분기=4, 반기=2, 연=1
export const periodCount = (cycle) =>
    cycle === 'month' ? 12 : cycle === 'quarter' ? 4 : cycle === 'half' ? 2 : 1;

// 그 기간에 속한 'YYYY-MM' 목록. index 는 1부터.
export const monthsOfPeriod = (cycle, year, index) => {
    const y = Number(year);
    const i = Number(index) || 1;
    let start;
    let len;
    if (cycle === 'month') { start = i; len = 1; }
    else if (cycle === 'quarter') { start = (i - 1) * 3 + 1; len = 3; }
    else if (cycle === 'half') { start = (i - 1) * 6 + 1; len = 6; }
    else { start = 1; len = 12; }
    const out = [];
    for (let k = 0; k < len; k++) out.push(y + '-' + pad2(start + k));
    return out;
};

export const periodLabel = (cycle, year, index) => {
    const i = Number(index) || 1;
    if (cycle === 'month') return year + '년 ' + i + '월';
    if (cycle === 'quarter') return year + '년 ' + i + '분기';
    if (cycle === 'half') return year + '년 ' + (i === 1 ? '상반기' : '하반기');
    return year + '년';
};

// 저장·비교용 키. 같은 기간이면 항상 같은 문자열.
export const periodKey = (cycle, year, index) => {
    const i = Number(index) || 1;
    if (cycle === 'month') return year + '-M' + pad2(i);
    if (cycle === 'quarter') return year + '-Q' + i;
    if (cycle === 'half') return year + '-H' + i;
    return year + '-Y';
};

// 기간 순서 비교용(최근 확정 찾기). 그 기간의 마지막 달.
export const periodEndMonth = (cycle, year, index) => {
    const ms = monthsOfPeriod(cycle, year, index);
    return ms[ms.length - 1];
};

// startMonth 부터 months 개월 치 'YYYY-MM' 목록.
export const monthRange = (startMonth, months) => {
    const [y, m] = String(startMonth || '').split('-').map(Number);
    if (!y || !m) return [];
    const out = [];
    for (let k = 0; k < Number(months || 0); k++) {
        const d = new Date(y, m - 1 + k, 1);
        out.push(d.getFullYear() + '-' + pad2(d.getMonth() + 1));
    }
    return out;
};

export const ymOf = (dateStr) => String(dateStr || '').slice(0, 7);

// 'YYYY-MM' 에 n 개월 더하기(음수도 된다).
export const addMonths = (ym, n) => {
    const [y, m] = String(ym || '').split('-').map(Number);
    if (!y || !m) return '';
    const d = new Date(y, m - 1 + Number(n || 0), 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
};

// ──[ 콜라보 '종료' 표시 여유 ]────────────────────────────────────────────
// 공유 기간이 끝나도 유통사 정산이 몇 달 늦게 들어오므로, **화면에서 '종료'로 접기 전에**
// 몇 달 더 진행 중으로 보여준다. 여유 개월 수는 여기 한 줄만 고치면 된다.
// ⚠️ **표시 전용이다.** 공유 대상 계산(공유 기간 안의 음원수익만)·자동 배분 조건·정산 계산은
//    이 값을 보지 않는다 — computeCollab 의 periodMonths 는 그대로다.
export const COLLAB_GRACE_MONTHS = 3;

/** 여유까지 포함한 마지막 달. 종료월 2024-06 + 3 → 2024-09 */
export const collabGraceUntil = (endMonth, grace = COLLAB_GRACE_MONTHS) =>
    (endMonth ? addMonths(endMonth, grace) : '');

/** 화면에서 '종료'로 접을지. 여유 달까지 지나야 종료다. */
export const collabDisplayEnded = (endMonth, thisMonth, grace = COLLAB_GRACE_MONTHS) => {
    if (!endMonth || !thisMonth) return false;
    return collabGraceUntil(endMonth, grace) < thisMonth;
};

/** 공유 기간은 끝났지만 아직 여유 기간 안인가(= 정산 마무리 기간). */
export const collabInGrace = (endMonth, thisMonth, grace = COLLAB_GRACE_MONTHS) => {
    if (!endMonth || !thisMonth) return false;
    return endMonth < thisMonth && !collabDisplayEnded(endMonth, thisMonth, grace);
};

// ──[ 비율 ]──────────────────────────────────────────────────────────────
// 그 수익항목에서 아티스트가 가져가는 %. 일괄이면 항목과 무관하게 같은 값.
export const artistPercentFor = (artist, categoryId) => {
    if (!artist) return 0;
    if (artist.ratioUniform) return Number((artist.uniformRatio || {}).artist || 0);
    const r = (artist.ratios || {})[categoryId];
    return r ? Number(r.artist || 0) : 0;
};

// ──[ 곡 연결 ]───────────────────────────────────────────────────────────
// 2단계 데이터에는 type 이 없다 — 그때는 전부 소속(member)이었으므로 그렇게 본다.
export const linkTypeOf = (link) => (link && link.type) || 'member';

export const memberLinksOf = (project) =>
    (Array.isArray(project.artists) ? project.artists : []).filter((a) => linkTypeOf(a) === 'member');

// 소속 아티스트의 지분(%). 비어 있으면 그 곡의 소속 인원수로 균등 분배.
// ⚠️ '정산하는 시점의 인원수' 로 계산한다. 확정할 때 스냅샷으로 굳힌다.
export const memberSharePercent = (project, artistId) => {
    const members = memberLinksOf(project);
    const mine = members.find((a) => a.artistId === artistId);
    if (!mine) return 0;
    const blank = (v) => v === '' || v === null || v === undefined;
    if (blank(mine.share)) return members.length > 0 ? 100 / members.length : 0;
    return Number(mine.share) || 0;
};

/**
 * 소속으로 연결된 곡의 보티즈 내역을, 지분을 적용한 '장부 비슷한 줄' 로 바꾼다.
 * 장부에 복사하지 않는다 — 계산할 때만 합친다.
 *
 * 넣을 항목을 정하는 순서
 *   1) 보티즈 분류 연결표(votizMap) 에 그 분류가 있으면 그 항목
 *   2) 없으면 곡-아티스트 연결에서 고른 '수익항목/지출항목' (기존 동작)
 *   둘 다 없으면 집계하지 않는다.
 * 수익배분(마이너스 수익)도 같은 순서를 따른다 — 분류가 'payout' 일 뿐이다.
 *
 * @param votizMap { 'income:source': '<항목id>', ... } — 없으면 예전과 똑같이 동작한다.
 * @returns [{ projectId, projectName, date, ym, type, categoryId, sharePercent, rawAmount, amount,
 *            votizCategory, mapped }]
 */
export const buildSongRows = ({ projects, transactions, artistId, months, basis = AMOUNT_BASIS, votizMap = null }) => {
    const monthSet = new Set(months || []);
    const out = [];
    (projects || []).forEach((p) => {
        const links = Array.isArray(p.artists) ? p.artists : [];
        const mine = links.find((a) => a.artistId === artistId);
        if (!mine || linkTypeOf(mine) !== 'member') return;
        const pct = memberSharePercent(p, artistId);
        (transactions || []).forEach((t) => {
            if (t.projectId !== p.id) return;
            if (t.division !== 'votiz') return;             // 저작권·보이스튜닝·유튜브 제외
            if (monthSet.size && !monthSet.has(ymOf(t.date))) return;
            const fallback = t.type === 'income' ? mine.incomeCategoryId : mine.expenseCategoryId;
            const mappedId = mappedCategoryId(votizMap, t);
            const categoryId = mappedId || fallback;
            if (!categoryId) return;                        // 넣을 항목이 없으면 집계하지 않는다
            const raw = amountOf(t, basis);
            out.push({
                projectId: p.id,
                projectName: p.name,
                date: t.date,
                ym: ymOf(t.date),
                type: t.type,
                categoryId,
                sharePercent: pct,
                rawAmount: raw,
                amount: raw * (pct / 100),
                votizCategory: t.category || '',
                votizSubDetail: t.subDetail || '',
                mapped: !!mappedId,
            });
        });
    });
    return out;
};

/**
 * 연결표에 없어서 기본 항목(곡 연결에서 고른 수익/지출항목)으로 들어간 분류들.
 * 화면에 "연결 안 된 분류: ○○" 로 알려준다.
 * @returns [{ type, category }]
 */
export const unmappedVotizCategories = (songRows = []) => {
    const seen = new Set();
    const out = [];
    songRows.forEach((r) => {
        if (r.mapped) return;
        // 하위 단계까지 알려준다 — '제작비 > 곡비-작사' 가 연결 안 됐는지 보이게.
        const k = r.type + ':' + (r.votizCategory || '') + '|' + (r.votizSubDetail || '');
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ type: r.type, category: r.votizCategory || '', subDetail: r.votizSubDetail || '' });
    });
    return out;
};

// 곡 연결에서 '넣을 항목' 을 안 고른 소속 연결 — 화면 경고용.
export const membersMissingCategory = (projects, artistId) =>
    (projects || [])
        .map((p) => {
            const mine = (Array.isArray(p.artists) ? p.artists : []).find((a) => a.artistId === artistId);
            if (!mine || linkTypeOf(mine) !== 'member') return null;
            const miss = [];
            if (!mine.incomeCategoryId) miss.push('수익항목');
            if (!mine.expenseCategoryId) miss.push('지출항목');
            return miss.length ? { projectId: p.id, projectName: p.name, missing: miss } : null;
        })
        .filter(Boolean);

// ──[ 일반 정산 (선정산 후배분) ]──────────────────────────────────────────
/**
 * @param artist        아티스트 문서(ratioUniform / uniformRatio / ratios)
 * @param categories    mgmtCategories 목록
 * @param ledgerRows    artistLedger 줄(별도정산 건 제외된 것)
 * @param songRows      buildSongRows 결과
 * @param carryIn       직전 확정에서 넘어온 이월액(0 또는 음수)
 * @param allowCarryOut false 면 이월을 만들지 않는다(별도정산 건)
 */
export const computeGeneralSettlement = ({
    artist, categories, ledgerRows = [], songRows = [],
    carryIn = 0, allowCarryOut = true, basis = AMOUNT_BASIS,
}) => {
    const catById = {};
    (categories || []).forEach((c) => { catById[c.id] = c; });

    const byCategory = {};
    // 집계는 **최상위 항목 기준**이다 — 세부항목 금액은 부모 항목에 합쳐진다.
    // parentId 가 없는 기존 항목은 자기 자신이 최상위라 결과가 예전과 같다.
    const touch = (rawCategoryId) => {
        const categoryId = rootIdOf(categories, rawCategoryId);
        if (!byCategory[categoryId]) {
            const c = catById[categoryId];
            byCategory[categoryId] = {
                categoryId,
                name: c ? c.name : '(삭제된 항목)',
                kind: c ? c.kind : '',
                order: c ? Number(c.order || 0) : 999,
                ledgerIncome: 0, songIncome: 0, income: 0,
                ledgerExpense: 0, songExpense: 0, expense: 0,
                artistPercent: artistPercentFor(artist, categoryId),
            };
        }
        return byCategory[categoryId];
    };

    (ledgerRows || []).forEach((r) => {
        const b = touch(r.categoryId);
        const v = amountOf(r, basis);
        if (r.type === 'income') { b.ledgerIncome += v; b.income += v; }
        else { b.ledgerExpense += v; b.expense += v; }
    });
    (songRows || []).forEach((r) => {
        const b = touch(r.categoryId);
        if (r.type === 'income') { b.songIncome += r.amount; b.income += r.amount; }
        else { b.songExpense += r.amount; b.expense += r.amount; }
    });

    const rows = Object.values(byCategory).sort((a, b) => a.order - b.order);
    const totalIncome = rows.reduce((a, c) => a + c.income, 0);
    const totalExpense = rows.reduce((a, c) => a + c.expense, 0);
    const netBefore = totalIncome - totalExpense;
    const netAfter = netBefore + Number(carryIn || 0);

    // 아티스트 비율 = 수익 금액으로 가중한 평균. 단순 평균이 아니다.
    let weighted = 0;
    rows.forEach((r) => { if (r.income > 0) weighted += r.income * (r.artistPercent / 100); });
    const artistRate = totalIncome > 0 ? weighted / totalIncome : 0;

    let artistShare = 0;
    let carryOut = 0;
    if (totalIncome <= 0) {
        // 수익이 없으면 비율을 따지지 않는다. 적자면 이월만 한다.
        artistShare = 0;
        carryOut = allowCarryOut && netAfter < 0 ? netAfter : 0;
    } else if (netAfter > 0) {
        artistShare = toWon(netAfter * artistRate);
        carryOut = 0;
    } else {
        artistShare = 0;
        carryOut = allowCarryOut ? netAfter : 0;
    }

    return {
        basis,
        rows,
        totalIncome, totalExpense,
        netBefore, carryIn: Number(carryIn || 0), netAfter,
        artistRate,                       // 0~1
        artistRatePercent: artistRate * 100,
        artistShare, carryOut,
    };
};

// ──[ 별도정산 건 ]────────────────────────────────────────────────────────
// 그 건에 묶인 장부만. 이월을 주고받지 않는다.
export const computeCaseSettlement = ({ artist, categories, ledgerRows = [], basis = AMOUNT_BASIS }) =>
    computeGeneralSettlement({
        artist, categories, ledgerRows, songRows: [],
        carryIn: 0, allowCarryOut: false, basis,
    });

// ──[ 콜라보 (제작비 회수 후 공유) ]───────────────────────────────────────
/**
 * 곡의 '수익만' 본다. 지출은 반영하지 않는다(제작비는 recoupAmount 로 이미 들어가 있다).
 *
 * @param transactions acc_transactions 전체(또는 그 곡 것)
 * @param projectId    곡 id
 * @param link         { recoupAmount, sharePercent, startMonth, periodMonths }
 * @returns { months:[{ym, income, cumulative, shareable, share}], ... }
 */
export const computeCollab = ({ transactions = [], projectId, link = {}, basis = AMOUNT_BASIS }) => {
    const recoupAmount = Number(link.recoupAmount || 0);
    const sharePercent = Number(link.sharePercent || 0);
    const periodMonths = Number(link.periodMonths || 36);
    const startMonth = link.startMonth || '';
    const months = monthRange(startMonth, periodMonths);
    const inPeriod = new Set(months);

    const incomeRows = (transactions || []).filter(
        (t) => t.projectId === projectId && t.division === 'votiz' && t.type === 'income'
    );

    // 공유 시작월 이전 수익 — 공유 대상이 아니다. 있으면 화면에서 알려준다.
    const beforeStart = incomeRows.filter((t) => startMonth && ymOf(t.date) < startMonth);
    const afterEnd = incomeRows.filter((t) => months.length > 0 && ymOf(t.date) > months[months.length - 1]);

    const byMonth = {};
    incomeRows.forEach((t) => {
        const ym = ymOf(t.date);
        if (!inPeriod.has(ym)) return;
        byMonth[ym] = (byMonth[ym] || 0) + amountOf(t, basis);
    });

    let cumulative = 0;
    let shareableTotal = 0;
    const rowsOut = months.map((ym) => {
        const income = byMonth[ym] || 0;
        const before = cumulative;
        cumulative += income;
        // 회수선(recoupAmount)을 넘긴 부분만 공유 대상이다.
        const shareable = Math.max(0, cumulative - Math.max(recoupAmount, before));
        shareableTotal += shareable;
        return { ym, income, cumulative, shareable, share: toWon(shareable * (sharePercent / 100)) };
    });

    const recoveredAmount = Math.min(cumulative, recoupAmount);
    return {
        basis,
        startMonth,
        endMonth: months.length ? months[months.length - 1] : '',
        periodMonths,
        recoupAmount, sharePercent,
        months: rowsOut,
        totalIncome: cumulative,
        recoveredAmount,
        remainingRecoup: Math.max(0, recoupAmount - cumulative),
        recoupProgress: recoupAmount > 0 ? Math.min(1, cumulative / recoupAmount) : 1,
        shareableTotal,
        artistShare: toWon(shareableTotal * (sharePercent / 100)),
        incomeBeforeStart: beforeStart.reduce((a, c) => a + amountOf(c, basis), 0),
        incomeBeforeStartCount: beforeStart.length,
        incomeAfterEnd: afterEnd.reduce((a, c) => a + amountOf(c, basis), 0),
        incomeAfterEndCount: afterEnd.length,
    };
};

// ──[ 확정 스냅샷 ]────────────────────────────────────────────────────────
// 확정 뒤 곡 금액이 바뀌었는지 비교할 때 쓴다(곡 내역은 잠글 수 없다).
//
// categories 를 주면 그 곡이 어느 매니지먼트 항목으로 들어갔는지 **전체 경로**를
// `paths` 에 함께 담는다(정산서 표시용). 안 주면 예전과 똑같이 동작한다 —
// **이미 확정된 스냅샷에는 paths 가 없으므로 그때는 지금처럼 곡 이름만 나온다.**
export const songSummaryOf = (songRows = [], categories = null) => {
    const by = {};
    songRows.forEach((r) => {
        if (!by[r.projectId]) {
            by[r.projectId] = {
                projectId: r.projectId, projectName: r.projectName,
                sharePercent: r.sharePercent, rawIncome: 0, rawExpense: 0, income: 0, expense: 0,
            };
            if (categories) by[r.projectId].paths = [];
        }
        const b = by[r.projectId];
        if (r.type === 'income') { b.rawIncome += r.rawAmount; b.income += r.amount; }
        else { b.rawExpense += r.rawAmount; b.expense += r.amount; }
        if (categories) {
            const label = catFullPath(categories, r.categoryId);
            if (!b.paths.includes(label)) b.paths.push(label);
        }
    });
    return Object.values(by);
};

// 스냅샷과 지금 값이 다른 곡을 찾는다(1원 이상 차이).
export const diffSongSummary = (snapshot = [], current = []) => {
    const cur = {};
    current.forEach((s) => { cur[s.projectId] = s; });
    const out = [];
    snapshot.forEach((s) => {
        const c = cur[s.projectId];
        if (!c) { out.push({ projectId: s.projectId, projectName: s.projectName, reason: '연결이 해제됨' }); return; }
        if (Math.abs(c.income - s.income) >= 1 || Math.abs(c.expense - s.expense) >= 1) {
            out.push({
                projectId: s.projectId, projectName: s.projectName, reason: '금액이 달라짐',
                was: { income: s.income, expense: s.expense },
                now: { income: c.income, expense: c.expense },
            });
        }
    });
    current.forEach((c) => {
        if (!snapshot.some((s) => s.projectId === c.projectId)) {
            out.push({ projectId: c.projectId, projectName: c.projectName, reason: '연결이 새로 생김' });
        }
    });
    return out;
};

// 확정된 일반 정산 중 가장 최근 것(기간 끝 달 기준).
export const latestGeneral = (settlements = []) =>
    settlements
        .filter((s) => s.kind === 'general')
        .slice()
        .sort((a, b) => String(a.periodEnd || '').localeCompare(String(b.periodEnd || '')))
        .pop() || null;

// 그 날짜가 확정된 일반 정산 기간 안에 드는지(장부 잠금 판정).
export const isDateLocked = (dateStr, settlements = []) => {
    const ym = ymOf(dateStr);
    return (settlements || []).some(
        (s) => s.kind === 'general' && Array.isArray(s.months) && s.months.includes(ym)
    );
};
