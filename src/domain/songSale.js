// 곡 판매(acc_projects.sale) 값과 계산. 순수 함수만 — 화면 코드와 분리해 둔다.
//
// 판매 정보는 곡 문서 안의 `sale` 한 덩어리에 들어간다(새 컬렉션 없음 → 보티즈 묶음 백업에 자동 포함).
// 대금 일정(schedule)은 참고용이고, 수입 내역을 자동으로 만들지 않는다.

export const EMPTY_SALE = {
    buyerName: '', contactName: '', phone: '', bizNo: '',
    contractDate: '', amount: '', rights: '', memo: '', schedule: [],
};

/** 화면에서 받은 금액 문자열 → 숫자. */
export const parseSaleMoney = (v) => {
    if (typeof v === 'number') return v;
    return Number(String(v || '').replace(/[^0-9-]/g, '')) || 0;
};

/**
 * 이 곡에 실제로 들어온 판매 대금 합계.
 * 보티즈 수입 내역 중 **분류가 '곡 판매'(sale)** 인 것만 더한다.
 * 금액 기준은 보티즈 다른 집계와 같은 totalAmount(없으면 amount) — 부가세 포함 합계.
 * 기간 선택과 무관하게 전체를 본다(미수금을 봐야 하므로).
 */
export const salePaidAmount = (allTransactions, projectId) =>
    (allTransactions || [])
        .filter(
            (t) =>
                t.projectId === projectId &&
                t.division === 'votiz' &&
                t.type === 'income' &&
                t.category === 'sale'
        )
        .reduce((a, c) => a + Number(c.totalAmount || c.amount || 0), 0);
