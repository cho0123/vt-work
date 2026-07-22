import { useState } from 'react';
import { FaCheckCircle, FaTimesCircle, FaClock, FaPlus, FaTimes } from 'react-icons/fa';
import { StudentRotationInfo } from './StudentRotationInfo.jsx';

/**
 * App.jsx 에서 그대로 옮긴 블록.
 * 본문 JSX 를 손대지 않기 위해 prop 이름도 원래 변수명을 유지한다.
 */
export function ScheduleModal({
    isScheduleModalOpen,
    setIsScheduleModalOpen,
    scheduleTab,
    handleTabChange,
    scheduleForm,
    setScheduleForm,
    selectedSlot,
    selectedMinute,
    setSelectedMinute,
    setSelectedMakeupId,
    availableStudents,
    students,
    schedules,
    historySchedules,
    movingSchedule,
    setMovingSchedule,
    isScheduleLocked,
    isWeekLocked,
    handleScheduleSave,
    handleScheduleDelete,
    handleMoveSchedule,
    handleStopFixedSchedule,
    handleCancelFixedOneTime,
    onGoToStudent,
    onAcknowledgeBroughtForward,
    pendingBroughtForward,
    defaultPersonalCategories,
    userPersonalCategories,
    onAddPersonalCategory,
    onRemovePersonalCategory,
}) {
    if (!isScheduleModalOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-md p-4">
            {/* [수정됨] gridType이 'master'가 아니면(짱구일정이면) 연한 초록 배경(bg-green-50) 적용 */}
            <div
                className={`w-full max-w-sm rounded-2xl shadow-xl p-6 relative transition-colors duration-200 ${scheduleForm.gridType === 'master' ? 'bg-white' : 'bg-green-50 border-2 border-green-100'}`}
            >
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    {/* 제목 옆에 점으로 색상 힌트 추가 */}
                    <div
                        className={`w-2 h-2 rounded-full ${scheduleForm.gridType === 'master' ? 'bg-orange-500' : 'bg-green-500'}`}
                    ></div>
                    [V] {selectedSlot.date} {selectedSlot.time}:{selectedMinute}{' '}
                    {scheduleForm.gridType === 'master' ? '쌤일정' : '짱구일정'}
                </h3>

                {/* 레슨(학생 지정) 수업이면 학생 로테이션 요약을 보여준다 */}
                {scheduleForm.category === '레슨' && scheduleForm.studentId && (
                    <StudentRotationInfo
                        student={students.find((s) => s.id === scheduleForm.studentId)}
                        slotDate={selectedSlot.date}
                        slotId={selectedSlot.id}
                        onNameClick={
                            onGoToStudent &&
                            ((sid, sname) => {
                                setIsScheduleModalOpen(false); // 팝업 닫고 이동
                                onGoToStudent(sid, sname);
                            })
                        }
                    />
                )}

                <div className="flex gap-4 mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="minute"
                            className="radio radio-sm radio-primary"
                            checked={selectedMinute === '00'}
                            onChange={() => setSelectedMinute('00')}
                        />
                        <span className="font-bold">00분 (정각)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="minute"
                            className="radio radio-sm radio-primary"
                            checked={selectedMinute === '30'}
                            onChange={() => setSelectedMinute('30')}
                        />
                        <span className="font-bold">30분</span>
                    </label>
                </div>

                {/* [NEW] Master 30분 진행 체크박스 (Master 그리드일 때만 노출) */}
                {scheduleForm.gridType === 'master' && (
                    <div className="flex bg-orange-100 p-1 rounded-xl w-fit mb-2">
                        <button
                            type="button"
                            onClick={() => setScheduleForm((prev) => ({ ...prev, masterType: '60' }))}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${!scheduleForm.masterType || scheduleForm.masterType === '60' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Full
                        </button>
                        <button
                            type="button"
                            onClick={() => setScheduleForm((prev) => ({ ...prev, masterType: '30' }))}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scheduleForm.masterType === '30' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Half
                        </button>
                    </div>
                )}

                {/* [NEW] Vocal 30분(반갈죽) 진행 체크박스 (Vocal 그리드일 때 노출) */}
                {/* V30(독립)과는 다름. 1시간 수업을 반으로 나누는 기능 */}
                {scheduleForm.gridType !== 'master' && (
                    <div className="flex bg-green-100/50 p-1 rounded-xl w-fit mb-2">
                        <button
                            type="button"
                            onClick={() => setScheduleForm((prev) => ({ ...prev, vocalType: '60' }))}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${!scheduleForm.vocalType || scheduleForm.vocalType === '60' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Full
                        </button>
                        <button
                            type="button"
                            // 'half' 타입으로 설정하여 V30('30')과 구분
                            onClick={() => setScheduleForm((prev) => ({ ...prev, vocalType: 'half' }))}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scheduleForm.vocalType === 'half' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Half
                        </button>
                    </div>
                )}

                {/* [수정] Vocal 추가 수업 시 시간 선택 라디오 */}
                <div
                    className={`tabs tabs-boxed p-1 mb-4 ${scheduleForm.gridType === 'master' ? 'bg-gray-100' : 'bg-green-100/50'}`}
                >
                    <a
                        className={`tab flex-1 ${scheduleTab === 'lesson' ? 'tab-active bg-white text-black font-bold shadow-sm' : ''}`}
                        onClick={() => handleTabChange('lesson')}
                    >
                        수강생 레슨
                    </a>
                    <a
                        className={`tab flex-1 ${scheduleTab === 'personal' ? 'tab-active bg-white text-black font-bold shadow-sm' : ''}`}
                        onClick={() => handleTabChange('personal')}
                    >
                        개인 일정
                    </a>
                </div>

                <div className="flex flex-col gap-3">
                    {scheduleTab === 'lesson' ? (
                        <>
                            <BroughtForwardNotices
                                items={pendingBroughtForward}
                                gridType={scheduleForm.gridType}
                                onAcknowledge={onAcknowledgeBroughtForward}
                            />

                            {/* 본수업: 로테이션에 맞는 학생 목록. 파란 박스로 구분 */}
                            <div className="flex flex-col gap-1.5 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                                <label className="text-xs font-bold text-blue-500">본수업 (로테이션)</label>
                                <select
                                    className="select select-sm w-full border-blue-200 bg-white text-sm"
                                    onChange={(e) => {
                                        const [sId, sName] = e.target.value.split('|');
                                        // [FIX] Checking for '(30분' to assume half type (works with or without total quota suffix)
                                        const isHalfSuffix = sName.includes('(30분');

                                        setScheduleForm((prev) => {
                                            const newState = {
                                                ...prev,
                                                studentId: sId,
                                                studentName: sName,
                                                category: '레슨',
                                            };

                                            // [FIX] 반갈죽(30분) 잔여가 있는 학생 선택 시에만 'Half'로 자동 전환
                                            // 일반 학생 선택 시에는 기존 선택(사용자가 Half를 눌렀을 수 있음)을 유지 (강제 Full 리셋 방지)
                                            // [수정] GridType 조건 없이 양쪽 모두 설정 (상태 업데이트 타이밍 이슈 해결)
                                            if (isHalfSuffix) {
                                                newState.masterType = '30';
                                                newState.vocalType = 'half';
                                            }
                                            return newState;
                                        });
                                    }}
                                >
                                    <option value="">학생 선택</option>
                                    {/* 한 학생이 주 2회면 같은 id로 여러 항목이 나오므로(name 은 '홍길동 (1)'처럼 고유)
                                        key 를 id 대신 name+index 로 잡아 중복을 피한다. */}
                                    {availableStudents.map((s, i) => (
                                        <option key={`${s.name}-${i}`} value={`${s.id}|${s.name}`}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    ) : (
                        <PersonalCategoryPicker
                            gridType={scheduleForm.gridType}
                            value={scheduleForm.category}
                            onChange={(cat) => setScheduleForm({ ...scheduleForm, category: cat })}
                            defaults={
                                (defaultPersonalCategories &&
                                    defaultPersonalCategories[
                                        scheduleForm.gridType === 'master' ? 'master' : 'vocal'
                                    ]) ||
                                []
                            }
                            userItems={
                                (userPersonalCategories &&
                                    userPersonalCategories[scheduleForm.gridType === 'master' ? 'master' : 'vocal']) ||
                                []
                            }
                            onAdd={onAddPersonalCategory}
                            onRemove={onRemovePersonalCategory}
                        />
                    )}

                    {/* 고정 기능은 개인일정 전용 (수업/레슨에는 쓰지 않음) */}
                    {scheduleTab === 'personal' && (
                        <div className="form-control">
                            <label className="label cursor-pointer justify-start gap-2">
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-sm checkbox-primary"
                                    checked={scheduleForm.isFixed}
                                    onChange={(e) =>
                                        setScheduleForm({
                                            ...scheduleForm,
                                            isFixed: e.target.checked,
                                            recurrence: e.target.checked
                                                ? scheduleForm.recurrence || 'weekly'
                                                : 'weekly',
                                        })
                                    }
                                />
                                <span className="label-text font-bold text-gray-700">이 시간 고정</span>
                            </label>
                            {scheduleForm.isFixed && (
                                <select
                                    className="select select-sm border-gray-200 bg-white mt-1 w-full"
                                    value={scheduleForm.recurrence || 'weekly'}
                                    onChange={(e) => setScheduleForm({ ...scheduleForm, recurrence: e.target.value })}
                                >
                                    <option value="weekly">매주 같은 요일</option>
                                    <option value="monthlyDate">
                                        매월{' '}
                                        {scheduleForm.dayOfMonth || Number(selectedSlot?.date?.split('-')[2]) || ''}일
                                    </option>
                                    <option value="monthlyLast">매월 말일</option>
                                </select>
                            )}
                        </div>
                    )}
                    <input
                        type="text"
                        placeholder="메모"
                        className="input input-sm border-gray-200 bg-white"
                        value={scheduleForm.memo}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, memo: e.target.value })}
                    />

                    {/* [FIX] 보컬 진행 시 시간 선택 (1시간 / 30분) */}
                    {scheduleTab === 'lesson' && scheduleForm.gridType === 'vocal' && (
                        <div className="flex flex-col gap-2 mt-2 bg-white/50 p-2 rounded-xl border border-gray-100">
                            <label className="label cursor-pointer justify-start gap-2 pb-0">
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-sm checkbox-primary"
                                    checked={scheduleForm.isVocalProgress}
                                    onChange={(e) =>
                                        setScheduleForm({
                                            ...scheduleForm,
                                            isVocalProgress: e.target.checked,
                                        })
                                    }
                                />
                                <span className="label-text font-bold text-gray-700">보컬진행 (추가수업)</span>
                            </label>

                            {scheduleForm.isVocalProgress && (
                                <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-blue-50">
                                    <span className="text-[10px] font-bold text-blue-400 ml-1">수업 시간 선택</span>
                                    <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
                                        <button
                                            type="button"
                                            onClick={() => setScheduleForm((prev) => ({ ...prev, vocalType: '60' }))}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scheduleForm.vocalType !== '30' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            1시간
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setScheduleForm((prev) => ({ ...prev, vocalType: '30' }))}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scheduleForm.vocalType === '30' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            30분 (1회)
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {scheduleTab === 'lesson' && (
                        <>
                            <div className="mt-1 flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-amber-600">
                                        추가 수업 ({scheduleForm.gridType === 'master' ? 'Master' : 'Vocal'} 학생)
                                    </label>
                                    {/* 당겨오기: 다음 회차를 이번 주로 앞당겨 진행 */}
                                    <label className="flex cursor-pointer items-center gap-1.5">
                                        <input
                                            type="checkbox"
                                            className="checkbox checkbox-xs checkbox-warning"
                                            checked={!!scheduleForm.broughtForward}
                                            onChange={(e) =>
                                                setScheduleForm((prev) => ({
                                                    ...prev,
                                                    broughtForward: e.target.checked,
                                                }))
                                            }
                                        />
                                        <span className="text-xs font-bold text-amber-600">⏪ 당겨오기</span>
                                    </label>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <select
                                        className="select select-sm w-full border-amber-200 bg-white text-sm"
                                        onChange={(e) => {
                                            if (!e.target.value) return;
                                            const [sid, sname] = e.target.value.split('|');
                                            setScheduleForm({
                                                ...scheduleForm,
                                                studentId: sid,
                                                studentName: sname,
                                                category: '레슨',
                                                memo: scheduleForm.broughtForward ? '당겨오기' : '추가수업',
                                            });
                                        }}
                                        value=""
                                    >
                                        <option value="">학생 선택...</option>
                                        {students
                                            .filter((s) => {
                                                if (!s.isActive) return false;
                                                const hasClass =
                                                    s.schedule &&
                                                    s.schedule.some((w) => {
                                                        if (scheduleForm.gridType === 'master')
                                                            return Number(w.master || 0) > 0;
                                                        return Number(w.vocal || 0) > 0 || Number(w.vocal30 || 0) > 0;
                                                    });
                                                return hasClass;
                                            })
                                            .sort((a, b) => a.name.localeCompare(b.name))
                                            .map((s) => (
                                                <option key={s.id} value={`${s.id}|${s.name}`}>
                                                    {s.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>

                            {(() => {
                                const makeupList = historySchedules
                                    .filter((h) => h.status === 'reschedule' || h.status === 'reschedule_assigned')
                                    .reduce((acc, h) => {
                                        if (h.status === 'reschedule_assigned') return acc;
                                        const s = students.find((st) => st.id === h.studentId);
                                        if (
                                            !s ||
                                            !s.isActive ||
                                            !s.schedule?.some((w) => {
                                                if (scheduleForm.gridType === 'master')
                                                    return Number(w.master || 0) > 0;
                                                return Number(w.vocal || 0) > 0 || Number(w.vocal30 || 0) > 0;
                                            })
                                        )
                                            return acc;
                                        const expectedMemo = `보강(${h.date})`;
                                        const alreadyAssigned = schedules.some(
                                            (sch) => sch.studentId === h.studentId && sch.memo === expectedMemo
                                        );
                                        if (!alreadyAssigned) {
                                            acc.push({ ...h, studentName: s.name });
                                        }
                                        return acc;
                                    }, []);

                                if (makeupList.length === 0) return null;

                                return (
                                    <div className="mt-1 flex flex-col gap-1.5 rounded-xl border border-red-200 bg-red-50/60 p-3">
                                        <label className="text-xs font-bold text-red-500">보강 대상 (미룬 수업)</label>
                                        <select
                                            className="select select-sm w-full border-red-200 bg-white text-sm"
                                            onChange={(e) => {
                                                if (!e.target.value) return;
                                                const item = JSON.parse(e.target.value);
                                                setScheduleForm({
                                                    ...scheduleForm,
                                                    studentId: item.studentId,
                                                    studentName: item.studentName,
                                                    category: '레슨',
                                                    memo: `보강(${item.date})`,
                                                });
                                                setSelectedMakeupId(item.id);
                                            }}
                                            value=""
                                        >
                                            <option value="">보강 학생 선택...</option>
                                            {makeupList.map((h, i) => {
                                                const isMaster =
                                                    h.gridType === 'master' || (!h.gridType && !h.vocalType);
                                                const isVocal = h.gridType === 'vocal' || (!h.gridType && h.vocalType);
                                                const typeLabel = isMaster ? '[마]' : isVocal ? '[발]' : '';
                                                return (
                                                    <option key={i} value={JSON.stringify(h)}>
                                                        {h.studentName} {typeLabel} ({h.date} {h.time} 결석)
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                );
                            })()}
                        </>
                    )}

                    {/* 수업 상태 체크 버튼 영역 */}
                    {scheduleForm.studentName && (
                        <div className="flex flex-col gap-1 mt-3">
                            <label className="text-xs font-bold text-gray-400">
                                수업 상태 체크 ({scheduleForm.studentName})
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {(() => {
                                    const targetDateTime = new Date(
                                        `${selectedSlot.date}T${selectedSlot.time.padStart(2, '0')}:${selectedMinute}:00`
                                    );
                                    const isPast = new Date() > targetDateTime;
                                    const isMakeupAssignment = scheduleForm.memo && scheduleForm.memo.includes('보강');

                                    return (
                                        <>
                                            {/* 완료 버튼: 시간이 지나야 활성화 */}
                                            <button
                                                disabled={!isPast}
                                                onClick={() =>
                                                    setScheduleForm((prev) => ({
                                                        ...prev,
                                                        status: prev.status === 'completed' ? '' : 'completed',
                                                    }))
                                                }
                                                className={`flex h-9 items-center justify-center gap-1 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:border-none disabled:bg-gray-100 disabled:text-gray-300 disabled:active:scale-100 ${scheduleForm.status === 'completed' ? 'bg-green-600 text-white shadow-sm' : 'border-2 border-green-500 bg-green-50 text-green-700 hover:bg-green-100'}`}
                                            >
                                                {scheduleForm.status === 'completed' && <FaCheckCircle />} 완료
                                            </button>

                                            {/* 보강 버튼: 시간 상관없이 항상 활성화 (disabled={!isPast} 제거) */}
                                            {!isMakeupAssignment && (
                                                <button
                                                    onClick={() =>
                                                        setScheduleForm((prev) => ({
                                                            ...prev,
                                                            status:
                                                                prev.status === 'reschedule' ||
                                                                prev.status === 'reschedule_assigned'
                                                                    ? ''
                                                                    : 'reschedule',
                                                        }))
                                                    }
                                                    className={`flex h-9 items-center justify-center gap-1 rounded-lg text-xs font-bold transition-all active:scale-95 ${scheduleForm.status === 'reschedule' || scheduleForm.status === 'reschedule_assigned' ? 'bg-yellow-500 text-white shadow-sm' : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'}`}
                                                >
                                                    {(scheduleForm.status === 'reschedule' ||
                                                        scheduleForm.status === 'reschedule_assigned') && (
                                                        <FaClock />
                                                    )}{' '}
                                                    보강
                                                </button>
                                            )}

                                            {/* 결석 버튼: 시간이 지나야 활성화 */}
                                            <button
                                                disabled={!isPast}
                                                onClick={() =>
                                                    setScheduleForm((prev) => ({
                                                        ...prev,
                                                        status: prev.status === 'absent' ? '' : 'absent',
                                                    }))
                                                }
                                                className={`flex h-9 items-center justify-center gap-1 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-300 disabled:active:scale-100 ${scheduleForm.status === 'absent' ? 'bg-red-500 text-white shadow-sm' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                                            >
                                                {scheduleForm.status === 'absent' && <FaTimesCircle />} 결석
                                            </button>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    <div className="mt-4 flex flex-col gap-2">
                        {/* 보조 액션 줄: 삭제 / 이동·멈춤 / 취소 (해당될 때만 표시) */}
                        {(selectedSlot.id || !!scheduleForm.isFixed) && (
                            <div className="flex gap-2">
                                {/* 삭제 (ID가 있을 때만) */}
                                {selectedSlot.id && (
                                    <button
                                        onClick={handleScheduleDelete}
                                        disabled={isWeekLocked || isScheduleLocked}
                                        className="flex-1 rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-600 active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:active:scale-100"
                                    >
                                        삭제
                                    </button>
                                )}

                                {/* 멈춤(고정) vs 이동 (ID가 있을 때만) */}
                                {selectedSlot.id &&
                                    (!!scheduleForm.isFixed ? (
                                        <button
                                            onClick={handleStopFixedSchedule}
                                            disabled={isWeekLocked || isScheduleLocked}
                                            className="flex-1 rounded-xl bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-orange-700 active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:active:scale-100"
                                        >
                                            멈춤
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                setMovingSchedule({
                                                    ...scheduleForm,
                                                    id: selectedSlot.id,
                                                    status: scheduleForm.status,
                                                });
                                                setIsScheduleModalOpen(false);
                                            }}
                                            disabled={isWeekLocked || isScheduleLocked}
                                            className="flex-1 rounded-xl bg-orange-400 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-orange-500 active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:active:scale-100"
                                        >
                                            이동
                                        </button>
                                    ))}

                                {/* 취소 (이미 생성된 고정 스케줄의 일회성 취소) */}
                                {!!scheduleForm.isFixed && (
                                    <button
                                        onClick={handleCancelFixedOneTime}
                                        disabled={isWeekLocked || isScheduleLocked}
                                        className="flex-1 rounded-xl bg-green-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-600 active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:active:scale-100"
                                    >
                                        취소
                                    </button>
                                )}
                            </div>
                        )}

                        {/* 주 액션 줄: 저장 or 이동완료 (항상 한 줄 전체 폭) */}
                        {movingSchedule ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setMovingSchedule(null)}
                                    className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-200 active:scale-95"
                                >
                                    이동 취소
                                </button>
                                <button
                                    onClick={handleMoveSchedule}
                                    disabled={isWeekLocked || isScheduleLocked}
                                    className="flex-[2] rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:active:scale-100"
                                >
                                    이동 완료
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleScheduleSave}
                                disabled={isWeekLocked || isScheduleLocked}
                                className="w-full rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-gray-700 active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:active:scale-100"
                            >
                                저장
                            </button>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setIsScheduleModalOpen(false)}
                    className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

/**
 * 당겨오기 알림 — 본수업 학생 선택 위에 뜬다.
 *
 * items 는 App 에서 전 기간 실시간 구독한 '미해제 당겨오기' 목록이라,
 * 어느 주를 보든 해제 전까지 계속 뜬다. 여기서는 현재 팝업의 종류(gridType)와
 * 같은 것만 골라 한 줄씩 보여준다. '해제'를 누르면 알림만 끈다(수업은 유지).
 */
function BroughtForwardNotices({ items, gridType, onAcknowledge }) {
    if (!onAcknowledge) return null;

    const filtered = (items || [])
        .filter((s) => (s.gridType || 'master') === gridType)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (filtered.length === 0) return null;

    const typeLabel = gridType === 'master' ? '마스터' : '보컬';

    return (
        <div className="flex flex-col gap-1">
            {filtered.map((s) => (
                <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5"
                >
                    <span className="text-xs font-bold text-amber-700">
                        ⏪ {s.studentName}: {typeLabel} 1회 당겨서 진행완료
                    </span>
                    <button
                        type="button"
                        onClick={() => onAcknowledge(s.id)}
                        className="shrink-0 rounded-md bg-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-300"
                    >
                        해제
                    </button>
                </div>
            ))}
        </div>
    );
}

/**
 * 개인 일정 항목 선택 + 관리(추가/삭제).
 *
 * 기본 항목(defaults)은 삭제할 수 없고, 사용자 추가 항목(userItems)만
 * 지울 수 있다. 항목을 고르는 select 아래에 '항목 관리' 영역을 펼쳐
 * 그 자리에서 바로 추가/삭제한다.
 *
 * 마스터는 파란, 보컬(짱구)은 초록 톤 박스로 감싸 다른 영역과 구분.
 */
function PersonalCategoryPicker({ gridType, value, onChange, defaults, userItems, onAdd, onRemove }) {
    const [managing, setManaging] = useState(false);
    const [newName, setNewName] = useState('');

    const isMaster = gridType === 'master';
    const accent = isMaster
        ? { border: 'border-blue-200', bg: 'bg-blue-50/60', text: 'text-blue-500', chip: 'bg-blue-100 text-blue-700' }
        : {
              border: 'border-green-200',
              bg: 'bg-green-50/60',
              text: 'text-green-600',
              chip: 'bg-green-100 text-green-700',
          };

    // '기타'는 항상 맨 아래로. 기본 항목 + 사용자 항목을 합친 뒤 '기타'만 끝으로 뺀다.
    const merged = [...defaults, ...userItems];
    const all = [...merged.filter((c) => c !== '기타'), ...(merged.includes('기타') ? ['기타'] : [])];

    const submitAdd = () => {
        const name = newName.trim();
        if (!name) return;
        onAdd(gridType, name);
        setNewName('');
    };

    return (
        <div className={`flex flex-col gap-1.5 rounded-xl border ${accent.border} ${accent.bg} p-3`}>
            <div className="flex items-center justify-between">
                <label className={`text-xs font-bold ${accent.text}`}>{isMaster ? '쌤일정' : '짱구일정'} 항목</label>
                {onAdd && (
                    <button
                        type="button"
                        onClick={() => setManaging((v) => !v)}
                        className="text-[11px] font-bold text-gray-400 underline underline-offset-2 hover:text-gray-600"
                    >
                        {managing ? '완료' : '항목 관리'}
                    </button>
                )}
            </div>

            <select
                className="select select-sm w-full border-gray-200 bg-white text-sm"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {all.map((cat) => (
                    <option key={cat} value={cat}>
                        {cat}
                    </option>
                ))}
            </select>

            {managing && (
                <div className="mt-1 flex flex-col gap-2 border-t border-gray-200 pt-2">
                    {/* 추가 입력 */}
                    <div className="flex gap-1">
                        <input
                            type="text"
                            className="input input-xs flex-1 border-gray-200 bg-white text-xs"
                            placeholder="새 항목 이름"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    submitAdd();
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={submitAdd}
                            className="flex items-center gap-1 rounded-md bg-gray-900 px-2 text-[11px] font-bold text-white hover:bg-gray-700"
                        >
                            <FaPlus className="text-[9px]" /> 추가
                        </button>
                    </div>

                    {/* 사용자 추가 항목: 삭제 가능한 칩 */}
                    {userItems.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {userItems.map((cat) => (
                                <span
                                    key={cat}
                                    className={`inline-flex items-center gap-1 rounded-full ${accent.chip} px-2 py-0.5 text-[11px] font-bold`}
                                >
                                    {cat}
                                    <button
                                        type="button"
                                        onClick={() => onRemove(gridType, cat)}
                                        title="삭제"
                                        className="text-gray-500 hover:text-red-500"
                                    >
                                        <FaTimes className="text-[9px]" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[11px] text-gray-400">
                            추가한 항목이 없습니다. 기본 항목은 삭제할 수 없어요.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
