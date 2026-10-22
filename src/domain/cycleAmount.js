// 사이클(로테이션 한 바퀴) 금액 — 그 사이클에 속한 수업 각각의 단가를 더한다.
//
// 왜 필요한가: 예전에는 재등록 청구 금액을 학생의 '4주 계획'(schedule × 단가)으로만 냈다.
// 사이클 도중에 수업 종류가 바뀌면(마스터 → 보컬) 계획과 실제가 어긋나 금액이 틀어진다.
// 이제는 **그 사이클에 실제로 들어간 수업의 단가 합**으로 낸다.
//
// 단가 규칙은 utils/money.js 그대로다 — 마스터는 30분도 정가, 보컬은 30분·하프가 반값.
// 사이클 묶기(어느 수업이 몇 번째 사이클인지)는 domain/rotation.js 그대로 쓴다.
//
// ⚠️ 순수 함수다. DB·화면을 모르며, 넘겨준 목록만 본다.

import { vocalRateFactor, vocalRateFactorFor, calculateTotalAmount } from '../utils/money.js';
import {
    getRotationInfo, computeRequirementOf, scheduleForDate, sortByDateTime, isMasterSched, weightOf,
} from './rotation.js';

/** 수업 한 건의 단가. */
export function lessonAmountOf(lesson, student) {
    const rateM = Number(student?.rates?.master || 0);
    const rateV = Number(student?.rates?.vocal || 0);
    return isMasterSched(lesson) ? rateM : rateV * vocalRateFactorFor(lesson, student);
}

/**
 * 그 날짜 시점 설정의 '정가 한 바퀴' 와, 아직 안 잡힌 수업 1회분 단가.
 *
 * ⚠️ 보컬은 '횟수' 와 '금액' 의 단위가 다르다 — 30분은 1회로 세지만 금액은 반값이고,
 * 하프는 0.5회에 반값이다. 그래서 남은 횟수를 돈으로 바꿀 때는 전체 평균이 아니라
 * **종류별 1회분**(unitM / unitV)을 써야 한다. (전체 평균을 쓰면 하프 위주 학생에게
 * 금액이 틀어진다 — 백대현 실측)
 */
export function planUnitsAt(student, dateStr) {
    const plan = scheduleForDate(student, dateStr);
    const { reqM, reqV } = computeRequirementOf(plan);
    const rateM = Number(student?.rates?.master || 0);
    const rateV = Number(student?.rates?.vocal || 0);
    let planV = 0;
    (plan || []).forEach((w) => {
        planV += Number(w.vocal || 0) * rateV + Number(w.vocal30 || 0) * rateV * vocalRateFactor('30');
    });
    return {
        reqM,
        reqV,
        size: reqM + reqV,
        unitM: rateM,
        unitV: reqV > 0 ? planV / reqV : rateV,
        planAmount: calculateTotalAmount({ schedule: plan, rates: student?.rates }),
    };
}

/**
 * 사이클별 금액.
 *
 * @param scheds   그 학생의 수업 목록 — 진행된 것(완료·결석) + 아직 안 한 예정 수업.
 *                 연기 원본(reschedule*)처럼 회차에서 빠지는 것은 **넣지 말 것**
 *                 (회차 계산과 같은 목록이어야 사이클이 어긋나지 않는다).
 * @param student  단가(rates)·설정(schedule/scheduleHistory)을 가진 학생
 * @returns Map(사이클 시작일 'YYYY-MM-DD' -> { amount, lessonCount, size, remaining, planAmount })
 *          amount = 들어 있는 수업들의 단가 합 + 아직 안 잡힌 남은 횟수 × 종류별 1회분
 */
export function cycleAmountsOf(scheds, student) {
    const out = new Map();
    if (!student) return out;

    const list = sortByDateTime(scheds || []);
    const groups = new Map(); // 사이클 번호 -> 수업들

    for (const s of list) {
        const { reqM, reqV } = computeRequirementOf(scheduleForDate(student, s.date));
        // 그 시점에 그 종류를 안 하기로 돼 있으면 어느 사이클에도 안 들어간다(계산 대상 아님).
        if ((isMasterSched(s) ? reqM : reqV) <= 0) continue;
        const { index } = getRotationInfo(list, s.id, student);
        if (index < 0) continue;
        const g = groups.get(index);
        if (g) g.push(s);
        else groups.set(index, [s]);
    }

    for (const lessons of groups.values()) {
        const start = lessons.reduce((m, s) => (s.date < m ? s.date : m), lessons[0].date);
        const u = planUnitsAt(student, start); // 사이클 크기·단가는 시작 시점 설정 기준

        let done = 0;
        let wM = 0;
        let wV = 0;
        for (const s of lessons) {
            done += lessonAmountOf(s, student);
            if (isMasterSched(s)) wM += weightOf(s, true);
            else wV += weightOf(s, false);
        }

        // 남은 횟수: 전체로 몇 회가 비었는지 먼저 보고, 그걸 종류별 부족분에 나눠 담는다.
        // (사이클 도중에 종류가 바뀌면 종류별 부족분의 합이 전체 부족분보다 커질 수 있다 —
        //  마스터 3 + 보컬 1 로 4회를 채운 경우 마스터는 1회 모자라 보이지만 실제로는 다 찼다)
        const remainTotal = Math.max(0, u.size - (wM + wV));
        let remM = Math.max(0, u.reqM - wM);
        let remV = Math.max(0, u.reqV - wV);
        const rawRem = remM + remV;
        if (rawRem > 0) {
            const f = Math.min(1, remainTotal / rawRem);
            remM *= f;
            remV *= f;
        }

        out.set(start, {
            amount: Math.round(done + remM * u.unitM + remV * u.unitV),
            lessonCount: lessons.length,
            size: u.size,
            remaining: remainTotal,
            planAmount: u.planAmount,
        });
    }
    return out;
}
