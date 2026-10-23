// 추가결제(초과분) ↔ 누적 입금(부분결제 임시 보관) 맞추기.
//
// 결제 폼의 '추가결제' 칸에 넣은 금액은 학생 문서의 `depositList` 에 한 줄로 적립된다.
// 그 줄에는 `sourcePaymentId` 가 붙어 있어 결제와 짝을 이룬다(어느 쪽을 지워도 짝이 정리된다).
//
// ⚠️ 예전에는 **새 결제일 때만** 적립했다. 중복 적립을 막으려던 것인데, 그 바람에
// 결제를 '수정' 해서 추가결제를 넣거나 바꾸면 **리스트 배지만 바뀌고 임시보관은 그대로**였다.
// 이제는 등록·수정 모두 이 함수 한 곳을 쓴다. 금액을 더하는 게 아니라
// **그 결제에 딸린 줄을 추가결제 금액과 같게 맞추므로**, 같은 결제를 여러 번 저장해도 안 쌓인다.
//
// ⚠️ 순수 함수다. DB·화면을 모르며, 넘겨준 목록만 보고 새 목록을 돌려준다.

export const EXTRA_MEMO = '추가결제';

/** 날짜 오름차순. 기존 저장 순서 규칙 그대로. */
const byDate = (a, b) => (a.date < b.date ? -1 : 1);

/** 이 결제에서 자동 적립된 누적 입금 줄들. */
export function linkedDeposits(depositList, paymentId) {
    if (!paymentId) return [];
    return (depositList || []).filter((d) => d && d.sourcePaymentId && String(d.sourcePaymentId) === String(paymentId));
}

/** 누적 입금 합계. */
export function depositTotal(depositList) {
    return (depositList || []).reduce((acc, d) => acc + Number(d?.amount || 0), 0);
}

/**
 * 추가결제 금액에 맞춰 누적 입금 목록을 맞춘다.
 *
 * @param depositList 지금 저장돼 있는 누적 입금 목록
 * @param paymentId   이 결제의 문서 id
 * @param extra       저장할 추가결제 금액(0 이면 없음)
 * @param prevExtra   저장 전에 그 결제에 적혀 있던 추가결제 금액(신규면 0)
 * @param date        적립 줄에 적을 날짜(보통 결제일)
 * @param newId       새로 만들 줄의 id (호출부에서 만들어 넘긴다 — 트랜잭션 재시도에도 같게)
 *
 * @returns { list, changed, action, delta, shortfall }
 *   action 'none'    바뀐 것 없음 (같은 결제를 다시 저장해도 여기로 온다)
 *          'add'     새로 적립
 *          'update'  금액을 바꿔 맞춤
 *          'remove'  적립 줄을 지움
 *          'readd'   예전에 정리된 적립이라 **늘어난 만큼만** 새로 적립
 *          'blocked' 뺄 적립 줄이 없어 줄이지 못함 (목록은 그대로, shortfall 에 못 뺀 금액)
 */
export function reconcileExtraDeposit(depositList, { paymentId, extra, prevExtra = 0, date, newId }) {
    const list = [...(depositList || [])];
    const amount = Math.max(0, Number(extra) || 0);
    const before = Math.max(0, Number(prevExtra) || 0);
    const linked = linkedDeposits(list, paymentId);
    const linkedSum = depositTotal(linked);
    const same = { list: depositList || [], changed: false, action: 'none', delta: 0, shortfall: 0 };

    if (!paymentId) return same;

    if (linked.length > 0) {
        if (amount === linkedSum) return same; // 이미 맞다
        const rest = list.filter((d) => !linked.includes(d));
        if (amount === 0) {
            return { list: rest, changed: true, action: 'remove', delta: -linkedSum, shortfall: 0 };
        }
        // 줄 하나만 남기고 금액을 맞춘다(옛 데이터에 여러 줄이 있어도 한 줄로 정리된다).
        const keep = { ...linked[0], amount, date: date || linked[0].date, memo: linked[0].memo || EXTRA_MEMO };
        return {
            list: [...rest, keep].sort(byDate),
            changed: true,
            action: 'update',
            delta: amount - linkedSum,
            shortfall: 0,
        };
    }

    // 딸린 줄이 없다 — 아직 적립한 적이 없거나, 이미 쓰고 지운 경우다.
    if (amount === before) return same;
    if (amount < before) {
        // 뺄 줄이 없다. 마이너스 줄을 만들지 않고 그대로 두고 알리기만 한다.
        return { list: depositList || [], changed: false, action: 'blocked', delta: 0, shortfall: before - amount };
    }
    const add = amount - before; // before 는 이미 정리된 것으로 보고 '늘어난 만큼만' 적립한다
    const row = { id: newId, amount: add, date, memo: EXTRA_MEMO, sourcePaymentId: paymentId };
    return {
        list: [...list, row].sort(byDate),
        changed: true,
        action: before > 0 ? 'readd' : 'add',
        delta: add,
        shortfall: 0,
    };
}
