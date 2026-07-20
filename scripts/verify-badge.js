/**
 * 스케쥴 화면(calendar)에서 회차 값을 넘기지 않아도 배지 색이 같은지 확인한다.
 * (Firestore 접근 없음 — 순수 함수만 검사)
 *
 * 실행: npm run verify-badge
 */
import { getBadgeStyle } from '../src/utils/badgeStyle.js';

const gridTypes = ['master', 'vocal'];
const classTypes = ['30', 'half', '60', undefined];
const statuses = ['', 'pending', 'completed', 'absent', 'late', 'reschedule', 'reschedule_assigned', '상담'];
const rotationIndexes = [undefined, null, -1, 0, 1, 2, 5, 9, 13];

let checked = 0;
let diff = 0;

for (const g of gridTypes) {
    for (const c of classTypes) {
        for (const st of statuses) {
            // 기준: 회차를 넘기지 않은 경우 (변경 후 동작)
            const base = getBadgeStyle(g, c, undefined, st);
            for (const r of rotationIndexes) {
                // 변경 전 동작: 회차를 넘기던 경우
                const withRotation = getBadgeStyle(g, c, r, st);
                checked++;
                if (base !== withRotation) {
                    diff++;
                    if (diff <= 10) {
                        console.log(`  차이 — gridType=${g} classType=${c} status="${st}" rotation=${r}`);
                        console.log(`     회차 없음: ${base}`);
                        console.log(`     회차 있음: ${withRotation}`);
                    }
                }
            }
        }
    }
}

console.log(`\n스케쥴 화면(ctx=calendar) 조합 ${checked}건 비교, 차이 ${diff}건`);

// 참고: 출석부/개인기록에서는 회차가 실제로 색을 바꾼다는 것도 함께 확인
let historyDiff = 0;
for (const g of gridTypes) {
    const a = getBadgeStyle(g, '60', undefined, 'completed', 'history');
    const b = getBadgeStyle(g, '60', 3, 'completed', 'history');
    if (a !== b) historyDiff++;
}
console.log(`참고: history 화면에서는 회차가 색을 바꿈 — ${historyDiff}/2 확인`);

const ok = diff === 0 && historyDiff === 2;
console.log(
    ok
        ? '\n✅ 스케쥴 화면 배지 색은 회차와 무관합니다. 제거해도 화면이 바뀌지 않습니다.\n'
        : '\n⚠ 예상과 다릅니다. 확인이 필요합니다.\n'
);
process.exit(ok ? 0 : 1);
