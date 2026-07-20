import { ROTATION_COLORS, GRAY_SPLIT_BG } from '../constants/theme.js';

/**
 * 수업 배지의 Tailwind 클래스를 결정한다.
 *
 * @param gridType      'master' | 'vocal'
 * @param classType     '30' | 'half' | '60'
 * @param rotationIndex 로테이션 회차 (없으면 undefined/null/-1)
 * @param status        '' | 'pending' | 'completed' | 'absent' | 'reschedule' | 'reschedule_assigned' | ...
 * @param ctx           'calendar' | 'history' | 'dashboard'
 */
export const getBadgeStyle = (gridType, classType, rotationIndex, status, ctx = 'calendar') => {
    const isVocal = gridType === 'vocal';
    const is30 = String(classType) === '30';
    const isHalf = String(classType) === 'half';
    // [MOD] reschedule을 Special Status에서 제외하여 로테이션 배경색 적용 허용
    const isSpecialStatus =
        status &&
        status !== 'completed' &&
        status !== 'absent' &&
        status !== 'pending' &&
        status !== 'reschedule' &&
        status !== 'reschedule_assigned';

    // [FIX] 보컬 30분(vocalType='30')은 온전한 1개 수업이므로 Split 처리하지 않음 (half만 Split)
    const isSplitClass = (gridType === 'master' && is30) || (gridType === 'vocal' && isHalf);

    // 1. [History 전용] 배정만 된 경우(Pending) 또는 상태 없음 -> 연한 그레이
    if (ctx === 'history' && (status === 'pending' || !status)) {
        if (isSplitClass) {
            return `${GRAY_SPLIT_BG} border-gray-300 text-gray-400 font-bold opacity-80 shadow-none`;
        } else {
            return 'bg-gray-100 border-gray-200 text-gray-400 font-bold opacity-80 shadow-none';
        }
    }

    // 2. [공통] 로테이션 정보가 있으면 최우선 적용 (단, 출석부/전체기록 컨텍스트에서만 적용)
    // [FIX] 캘린더(스케줄) 화면에서는 로테이션 색상을 쓰지 않고 오렌지/블루 기본색을 유지해야 함
    const shouldApplyRotationColor =
        rotationIndex !== undefined &&
        rotationIndex !== null &&
        rotationIndex !== -1 &&
        !isSpecialStatus &&
        (ctx === 'history' || ctx === 'dashboard');

    if (shouldApplyRotationColor) {
        const idx = Math.max(0, parseInt(rotationIndex)) % ROTATION_COLORS.length;
        const colors = ROTATION_COLORS[idx];

        if (colors) {
            let baseClass = '';
            if (isSplitClass) {
                const borderClass =
                    colors.m.split(' ').find((c) => c.startsWith('border-')) ||
                    (isVocal ? 'border-blue-400' : 'border-orange-400');
                const gradientClass = (isVocal ? colors.two_tone_vocal : colors.two_tone) || '';
                const distinctClass = isVocal ? 'ring-1 ring-white/50' : '';
                baseClass = `${gradientClass} ${borderClass} border-[1.5px] font-bold text-gray-800 ${distinctClass}`;
            } else {
                baseClass = `${isVocal ? colors.v : colors.m} font-bold text-gray-800`;
            }

            // [NEW] 보강 예정인 경우 테두리 점선 + 노란색 텍스트 강제 적용 (THIN 1px로 강제 변경 - 빨간 원 부분)
            if (status === 'reschedule' || status === 'reschedule_assigned') {
                return (
                    baseClass
                        .replace(/border-\[?[a-z0-9.]+\]?/g, '')
                        .replace(/border-[a-z]+-\d+/g, '')
                        .replace('border-solid', '') +
                    ' border-yellow-500 border-dashed border-[1px] !text-yellow-700'
                );
            }
            return baseClass;
        }
    }

    // 2.5 [Fallback for Reschedule] 로테이션 정보가 없는 경우에도 보강 예정 스타일 적용 (1px 점선)
    if (status === 'reschedule' || status === 'reschedule_assigned') {
        const fallbackBg = isVocal ? 'bg-blue-100' : 'bg-orange-100';
        return `${fallbackBg} border-dashed border-yellow-500 border-[1px] !text-yellow-700 font-bold`;
    }

    // 3. [Calendar 전용] 완료/결석/지각 상태의 Split 수업 처리
    // Vocal: History context에서는 Blue 2-tone, Calendar에서는 Gray 2-tone
    if (isSplitClass && (status === 'completed' || status === 'absent')) {
        if (gridType === 'master') {
            if (ctx === 'history') {
                return 'bg-[linear-gradient(135deg,#fed7aa_50%,#fff7ed_50%)] border-orange-300 text-orange-900 font-bold';
            }
            return 'bg-[linear-gradient(135deg,#030712_50%,#374151_50%)] border-black text-white font-bold';
        }
        if (gridType === 'vocal') {
            if (ctx === 'history') {
                return 'bg-[linear-gradient(135deg,#60a5fa_50%,#dbeafe_50%)] border-blue-600 text-blue-950 font-bold';
            }
            return 'bg-[linear-gradient(135deg,#9ca3af_50%,#f3f4f6_50%)] border-gray-400 text-gray-800 font-bold';
        }
    }

    // [FIX] Vocal 30분(Solid) 수업 완료 시 회색 처리 (Calendar 전용)
    // History에서는 그냥 파란색 유지 (or as per design), Calendar에서는 완료 느낌(회색) 필요
    if (gridType === 'vocal' && is30 && (status === 'completed' || status === 'absent')) {
        if (ctx !== 'history') {
            return 'bg-gray-200 border-gray-400 text-gray-700 font-bold';
        }
    }

    // Default styles
    if (isVocal) {
        if (isHalf) return 'bg-[linear-gradient(135deg,#60a5fa_50%,#dbeafe_50%)] border-blue-600 text-blue-950 font-bold';
        return 'bg-blue-100 text-blue-700 border-blue-300';
    } else {
        if (is30) return 'bg-[linear-gradient(135deg,#fed7aa_50%,#fff7ed_50%)] border-orange-300 text-orange-900 font-bold';
        // Master 60 -> Solid Orange
        return 'bg-orange-200 text-orange-950 border-orange-400 font-black';
    }
};
