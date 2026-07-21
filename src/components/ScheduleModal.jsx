import { FaCheckCircle, FaTimesCircle, FaClock } from 'react-icons/fa';

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
                            <select
                                className="select select-sm border-gray-200 bg-white"
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
                                {availableStudents.map((s) => (
                                    <option key={s.id} value={`${s.id}|${s.name}`}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </>
                    ) : (
                        <>
                            <select
                                className="select select-sm border-gray-200 bg-white"
                                value={scheduleForm.category}
                                onChange={(e) => setScheduleForm({ ...scheduleForm, category: e.target.value })}
                            >
                                {scheduleForm.gridType === 'master' ? (
                                    <>
                                        <option value="야구">야구</option>
                                        <option value="야구1:1">야구 1:1</option>
                                        <option value="작곡">작곡</option>
                                        <option value="합주">합주</option>
                                        <option value="미팅">미팅</option>
                                        <option value="병원">병원</option>
                                        <option value="기타">기타</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="상담">상담</option>
                                        <option value="PT">PT</option>
                                        <option value="피부과">피부과</option>
                                        <option value="병원">병원</option>
                                        <option value="월말정산">월말정산</option>
                                        <option value="기타">기타</option>
                                    </>
                                )}
                            </select>
                        </>
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
                                    onChange={(e) =>
                                        setScheduleForm({ ...scheduleForm, recurrence: e.target.value })
                                    }
                                >
                                    <option value="weekly">매주 같은 요일</option>
                                    <option value="monthlyDate">
                                        매월 {scheduleForm.dayOfMonth || Number(selectedSlot?.date?.split('-')[2]) || ''}
                                        일
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
                        <div className="flex flex-col gap-3 mt-2 pt-2 border-t border-gray-200">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-gray-400">
                                    추가 수업 ({scheduleForm.gridType === 'master' ? 'Master' : 'Vocal'} 학생)
                                </label>
                                <select
                                    className="select select-sm border-gray-200 bg-gray-50"
                                    onChange={(e) => {
                                        if (!e.target.value) return;
                                        const [sid, sname] = e.target.value.split('|');
                                        setScheduleForm({
                                            ...scheduleForm,
                                            studentId: sid,
                                            studentName: sname,
                                            category: '레슨',
                                            memo: '추가수업',
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
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-bold text-red-400">보강 대상</label>
                                        <select
                                            className="select select-sm border-red-100 bg-red-50"
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
                        </div>
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
                                                className={`btn btn-xs h-8 border-none disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed ${scheduleForm.status === 'completed' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600'}`}
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
                                                    className={`btn btn-xs h-8 border-none ${scheduleForm.status === 'reschedule' || scheduleForm.status === 'reschedule_assigned' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-600'}`}
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
                                                className={`btn btn-xs h-8 border-none disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed ${scheduleForm.status === 'absent' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-600'}`}
                                            >
                                                {scheduleForm.status === 'absent' && <FaTimesCircle />} 결석
                                            </button>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 mt-4">
                        {/* 1. 삭제 버튼 (ID가 있을 때만) */}
                        {selectedSlot.id && (
                            <button
                                onClick={handleScheduleDelete}
                                disabled={isWeekLocked || isScheduleLocked}
                                className="btn btn-sm bg-red-500 text-white hover:bg-red-600 flex-1 border-none disabled:bg-gray-200 disabled:text-gray-400"
                            >
                                삭제
                            </button>
                        )}

                        {/* 2. 멈춤 vs 이동 버튼 (ID가 있을 때만) */}
                        {selectedSlot.id && (
                            <>
                                {!!scheduleForm.isFixed ? (
                                    <button
                                        onClick={handleStopFixedSchedule}
                                        disabled={isWeekLocked || isScheduleLocked}
                                        className="btn btn-sm bg-orange-600 text-white hover:bg-orange-700 flex-1 border-none disabled:bg-gray-200 disabled:text-gray-400"
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
                                        className="btn btn-sm bg-orange-400 text-white hover:bg-orange-500 flex-1 border-none disabled:bg-gray-200 disabled:text-gray-400"
                                    >
                                        이동
                                    </button>
                                )}
                            </>
                        )}

                        {/* 3. 취소 버튼 (이미 생성된 고정 스케줄의 일회성 취소) */}
                        {!!scheduleForm.isFixed && (
                            <button
                                onClick={handleCancelFixedOneTime}
                                disabled={isWeekLocked || isScheduleLocked}
                                className="btn btn-sm bg-green-500 text-white hover:bg-green-600 flex-1 border-none disabled:bg-gray-200 disabled:text-gray-400"
                            >
                                취소
                            </button>
                        )}

                        {/* 4. 저장 / 이동완료 버튼 */}
                        {movingSchedule ? (
                            <div className="flex-[2] flex gap-2">
                                <button
                                    onClick={() => setMovingSchedule(null)}
                                    className="btn btn-sm bg-gray-400 text-white flex-1 border-none"
                                >
                                    이동 취소
                                </button>
                                <button
                                    onClick={handleMoveSchedule}
                                    disabled={isWeekLocked || isScheduleLocked}
                                    className="btn btn-sm bg-blue-600 text-white flex-[2] border-none disabled:bg-gray-200 disabled:text-gray-400"
                                >
                                    이동 완료
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleScheduleSave}
                                disabled={isWeekLocked || isScheduleLocked}
                                className="btn btn-sm bg-black text-white flex-[2] border-none disabled:bg-gray-200 disabled:text-gray-400"
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
