import { useState, useEffect, Fragment, useMemo, useRef } from 'react';
import {
    FaPlus,
    FaSearch,
    FaSignOutAlt,
    FaEdit,
    FaTrash,
    FaChevronLeft,
    FaChevronRight,
    FaUserSlash,
    FaUserCheck,
    FaExclamationCircle,
    FaChevronDown,
    FaChevronUp,
    FaCheckCircle,
    FaHistory,
    FaCreditCard,
    FaTimesCircle,
    FaCamera,
    FaImage,
    FaStar,
    FaUndo,
    FaMoneyBillWave,
    FaFileInvoiceDollar,
    FaCalculator,
    FaStickyNote,
    FaExternalLinkAlt,
    FaCalendarCheck,
    FaCheck,
    FaThumbtack,
    FaClock,
    FaSort,
    FaMagic,
    FaLock,
    FaLockOpen,
    FaHourglassHalf,
    FaCalendarAlt,
    FaList,
} from 'react-icons/fa';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    deleteDoc,
    doc,
    updateDoc,
    getDocs,
    where,
    getDoc,
    setDoc,
    limit,
    writeBatch,
    runTransaction,
} from 'firebase/firestore';
import { backupToFirestore, backupToLocalFile, getLastBackup } from './utils/backup.js';
import { bulkCompleteTargets } from './domain/bulkComplete.js';
import {
    formatDateLocal,
    formatMonthDay,
    getStartOfWeek,
    getRotationWeek,
    getWeekDays,
    get12Weeks,
    getWeeksInMonth,
    getMonthWeeksForView,
    getDaysPassed,
    shiftMonth,
} from './utils/date.js';
import { compressImage } from './utils/image.js';
import { calculateTotalAmount, formatCurrency } from './utils/money.js';
import { getBadgeStyle } from './utils/badgeStyle.js';
import { MemoInput } from './components/MemoInput.jsx';
import { LoginScreen } from './components/LoginScreen.jsx';
import { ImagePreviewModal } from './components/ImagePreviewModal.jsx';
import { StudentHistoryModal } from './components/StudentHistoryModal.jsx';
import { StudentFormModal } from './components/StudentFormModal.jsx';
import { ScheduleModal } from './components/ScheduleModal.jsx';
import { ScheduleTab } from './components/ScheduleTab.jsx';
import { AttendanceTab } from './components/AttendanceTab.jsx';
import { SettlementTab } from './components/SettlementTab.jsx';
import { StudentsTab } from './components/StudentsTab.jsx';
import { VotizTab } from './components/VotizTab.jsx';
import { ROTATION_COLORS } from './constants/theme.js';
import { expenseDefaults } from './constants/expenses.js';
import { DEFAULT_PERSONAL_CATEGORIES } from './constants/personalCategories.js';
import {
    computeRequirement,
    getRotationInfo,
    findRotationStarts,
    resolveAnchorDate,
    rotationBufferDate,
    sortByDateTime,
} from './domain/rotation.js';
import { fixedScheduleOccursOn } from './domain/fixedRecurrence.js';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** 화면에 보여줄 날짜/시각 (예: 7월 22일(수) 오후 06:40). 값이 없으면 null. */
function formatWhen(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    return `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY_LABELS[d.getDay()]}) ${time}`;
}

/** 하루(24시간) 안에 있었던 일인지. 백업을 또 할지 말지 판단하는 공통 기준. */
function isWithin24h(value) {
    if (!value) return false;
    const d = value instanceof Date ? value : new Date(value);
    return !isNaN(d.getTime()) && Date.now() - d.getTime() < 24 * 60 * 60 * 1000;
}

/** 파일 다운로드가 마땅치 않은 기기(핸드폰·태블릿)인지. 로컬 백업을 건너뛸 때 쓴다. */
function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

/**
 * 학생 한 명의 로테이션 시작일(재등록 시점) 집합.
 *
 * 원래는 학생마다 전체 스케쥴(3,000건 이상)을 처음부터 훑었다. 학생관리 탭은 한 화면에
 * 30명이라 한 번 그릴 때마다 10만 번을 돌았고, 검색어를 한 글자 칠 때마다 그게 다시 돌았다.
 * 그래서 완료·결석 수업을 학생별로 미리 묶어둔 Map 을 받아 쓴다. 계산 내용은 그대로다.
 *
 * @param schedsByStudent  학생ID -> 완료·결석 수업 배열 (App 안에서 useMemo 로 만든다)
 */
function rotationStartsFor(student, schedsByStudent) {
    const { reqM, reqV } = computeRequirement(student);
    if (reqM === 0 && reqV === 0) return new Set();

    // 전체 수강생 목록에서 '재등록 요망' 뱃지를 띄우기 위한 진성 신규 학생 판별(동기식)
    const isNewNoPayment =
        student.hasPayment === false || (student.hasPayment === undefined && student.lastDate <= student.firstDate);
    const anchorDate = resolveAnchorDate(student, isNewNoPayment, formatDateLocal);

    const bufferDateStr = rotationBufferDate(student.firstDate, formatDateLocal);
    const scheds = sortByDateTime((schedsByStudent.get(student.id) || []).filter((s) => s.date >= bufferDateStr));

    return findRotationStarts(scheds, { reqM, reqV, anchorDate, student });
}

function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const getWeightRemainderSuffix = (student) => {
        if (!student) return '';
        let mWeight = 0;
        let vWeight = 0;

        // 현재 캐시된 출석부 데이터에서 완료된 수업들의 가중치 합산
        const relevantScheds = attSchedules.filter(
            (s) =>
                s.studentId === student.id && (s.status === 'completed' || s.status === 'late' || s.status === 'absent')
        );

        relevantScheds.forEach((s) => {
            if (s.gridType === 'master' || !s.gridType) mWeight += s.masterType === '30' ? 0.5 : 1;
            // [FIX] vocalType '30'은 1로 계산, 'half'만 0.5로 계산
            else if (s.gridType === 'vocal') vWeight += s.vocalType === 'half' ? 0.5 : 1;
        });

        if (mWeight % 1 !== 0 || vWeight % 1 !== 0) return ' (30분)';
        return '';
    };

    const handleLogin = async (email, pw) => {
        try {
            await signInWithEmailAndPassword(auth, email, pw);
        } catch {
            // 계정 존재 여부를 구분해 알려주지 않는다.
            alert('아이디 또는 비밀번호를 확인해주세요.');
        }
    };

    const handleLogout = () => {
        if (window.confirm('로그아웃 하시겠습니까?')) signOut(auth);
    };

    // [NEW] 정산 마감 토글 핸들러
    const handleToggleSettlementStatus = async () => {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const yearMonth = `${year}-${month}`;

        // 완료 처리 시 유효성 검사 (모든 스케줄 완료 여부)
        if (settlementStatus === 'pending') {
            // [FIX] '개인일정' 등은 제외하고 '레슨' 스케줄만 완료 여부 체크
            const pendingSchedules = monthlySchedules.filter(
                (s) => s.category === '레슨' && (!s.status || s.status === 'pending')
            );
            if (pendingSchedules.length > 0) {
                alert(
                    `[정산 마감 불가]\n아직 상태 처리가 되지 않은 스케줄이 ${pendingSchedules.length}건 있습니다.\n모든 스케줄을 완료/결석/취소 처리 후 마감해주세요.`
                );
                return;
            }
            if (
                !window.confirm(
                    `${year}년 ${month}월 정산을 '마감(완료)' 처리하시겠습니까?\n마감 후에는 해당 월의 모든 스케줄 수정이 차단됩니다.`
                )
            )
                return;

            try {
                await setDoc(doc(db, 'settlement_memos', yearMonth), { status: 'completed' }, { merge: true });
                setSettlementStatus('completed');
                if (paymentsCacheRef.current.completed) paymentsCacheRef.current.completed.add(yearMonth);
                setPendingSettlementMonths(computePendingMonths());
                alert('정산이 마감되었습니다.');
            } catch (e) {
                console.error(e);
                alert('처리 중 오류가 발생했습니다.');
            }
        } else {
            // 완료 -> 예정으로 복구
            if (
                !window.confirm(
                    `${year}년 ${month}월 정산 마감을 취소하고 '예정' 상태로 변경하시겠습니까?\n다시 스케줄 수정이 가능해집니다.`
                )
            )
                return;

            try {
                await setDoc(doc(db, 'settlement_memos', yearMonth), { status: 'pending' }, { merge: true });
                setSettlementStatus('pending');
                if (paymentsCacheRef.current.completed) paymentsCacheRef.current.completed.delete(yearMonth);
                setPendingSettlementMonths(computePendingMonths());
                alert("정산 상태가 '예정'으로 변경되었습니다.");
            } catch (e) {
                console.error(e);
                alert('처리 중 오류가 발생했습니다.');
            }
        }
    };

    // [수정] 월정산 청구 요청 핸들러 (해당 월 1일로 날짜 고정)
    const handleMonthlySettlementRequest = async (student, amount, targetYearMonth) => {
        // 0원이나 음수는 청구 불가
        if (amount <= 0) return alert('청구할 금액이 없습니다.');

        // [핵심 변경] 미결제일을 '해당 월의 1일'로 설정
        // targetYearMonth 형식: "2025.11" -> 2025년 11월 1일 생성
        const [yearStr, monthStr] = targetYearMonth.split('.');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const billingDateObj = new Date(year, month - 1, 1); // month는 0부터 시작하므로 -1
        const billingDate = formatDateLocal(billingDateObj); // "2025-11-01" 형식 변환

        if (
            !window.confirm(
                `[${student.name}] 학생의 ${targetYearMonth}월 수강료 ${formatCurrency(amount)}원을 청구하시겠습니까?\n(미결제일은 ${billingDate}로 기록됩니다.)`
            )
        )
            return;

        try {
            const newItem = {
                id: Date.now().toString(),
                targetDate: billingDate, // 오늘 날짜가 아닌 '1일'로 저장
                amount: amount,
                createdAt: new Date().toISOString(),
                memo: `${targetYearMonth}월 월정산 청구`,
            };

            // 기존 미수금 리스트에 추가 (최신 목록을 트랜잭션 안에서 읽는다)
            await updateStudentTx(student.id, (sData) => {
                const list = [...(sData.unpaidList || []), newItem].sort(
                    (a, b) => new Date(a.targetDate) - new Date(b.targetDate)
                );
                return { patch: { unpaidList: list, isPaid: false } };
            });

            // 후처리
            await updateStudentLastDate(student.id);

            // [FIX] 현재 청구한 '그 달'의 데이터를 다시 불러와야 함 (안 그러면 currentDate 기준인 오늘 날짜로 불러와서 화면 갱신 시 데이터 증발)
            fetchSettlementData(billingDateObj);

            alert(`청구가 완료되었습니다.\n(${billingDate}일자 미결제 내역 생성)`);
        } catch (e) {
            console.error(e);
            alert('청구 처리 중 오류가 발생했습니다.');
        }
    };

    // --- [2] 데이터 상태 ---
    const [activeTab, setActiveTab] = useState('schedule');
    const [viewStatus, setViewStatus] = useState('active');
    // 학생 목록 상단 빠른 필터: 'all' | 'unpaid'(미결제 있음) | 'reregister'(재등록 요망)
    const [listFilter, setListFilter] = useState('all');
    const [students, setStudents] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    // [NEW] 개인별 출석부 보기 상태
    const [viewingStudentAtt, setViewingStudentAtt] = useState(null); // 선택된 학생 객체
    const [studentFullHistory, setStudentFullHistory] = useState([]); // 해당 학생의 전체 기록
    const [viewingStudentHasPayment, setViewingStudentHasPayment] = useState(null); // 신규 수강생 결제 유무

    // [수정] 학생 개인 출석부 데이터 로딩 (실시간 연동 적용)
    useEffect(() => {
        if (!viewingStudentAtt) {
            setStudentFullHistory([]);
            setViewingStudentHasPayment(null);
            return;
        }

        // 1. 스케쥴 데이터 실시간 구독 (onSnapshot 사용)
        const q = query(collection(db, 'schedules'), where('studentId', '==', viewingStudentAtt.id));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

            // 날짜순 정렬
            list.sort((a, b) => {
                const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
                const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
                return dateA - dateB;
            });

            setStudentFullHistory(list);
        });

        // 2. 신규 결제 유무 판별 (Payment Status)
        const fetchPaymentStatus = async () => {
            // 명시적으로 결제 이력 보유/미보유 상태가 저장된 경우
            if (viewingStudentAtt.hasPayment !== undefined) {
                setViewingStudentHasPayment(viewingStudentAtt.hasPayment);
                return;
            }
            // Excel 마이그레이션 예외: lastDate가 firstDate보다 미래라면 무조건 결제한 적이 있음
            if (
                viewingStudentAtt.lastDate &&
                viewingStudentAtt.firstDate &&
                viewingStudentAtt.lastDate > viewingStudentAtt.firstDate
            ) {
                setViewingStudentHasPayment(true);
                return;
            }
            // DB 실제결제 내역 쿼리
            try {
                const payQ = query(collection(db, 'students', viewingStudentAtt.id, 'payments'), limit(1));
                const paySnap = await getDocs(payQ);
                setViewingStudentHasPayment(!paySnap.empty);
            } catch (e) {
                setViewingStudentHasPayment(true); // 에러 시 기존 동작 유지
            }
        };
        fetchPaymentStatus();

        return () => unsubscribe();
    }, [viewingStudentAtt?.id]);

    // [추가] 학생 정보(미수금, 카운트 등) 실시간 동기화
    useEffect(() => {
        if (viewingStudentAtt) {
            const latestStudent = students.find((s) => s.id === viewingStudentAtt.id);

            // 학생 리스트(students)가 업데이트 되었을 때, 현재 보고 있는 학생 정보도 최신으로 교체
            if (latestStudent && JSON.stringify(latestStudent) !== JSON.stringify(viewingStudentAtt)) {
                setViewingStudentAtt(latestStudent);
            }
        }
    }, [students]);

    // [NEW] 개인 출석부 닫기 핸들러
    const closeStudentAttView = () => {
        setViewingStudentAtt(null);
        setStudentFullHistory([]);
    };

    // 수강생 관리
    const [expandedStudentId, setExpandedStudentId] = useState(null);
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [historyPage, setHistoryPage] = useState(1);
    const historyPerPage = 15;
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 30;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    // 로테이션 이력이 있는 학생 저장 시, 팝업을 닫지 않고 그 자리서 반영을 확인시켜 주는 안내
    const [studentSaveNotice, setStudentSaveNotice] = useState('');
    // 수정 모달을 열 때의 학생 원본. 저장 시 '사용자가 실제로 바꾼 필드'만
    // 가려내는 기준으로 쓴다. (아래 handleSubmit 주석 참고)
    const [editingOriginal, setEditingOriginal] = useState(null);
    const [tempDates, setTempDates] = useState({});
    // 누적 입금(부분결제 임시 보관) 입력칸. 학생ID -> { amount, date, memo }
    const [tempDeposit, setTempDeposit] = useState({});
    const [paymentFile, setPaymentFile] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);

    // 내역 정렬 상태
    const [historySort, setHistorySort] = useState('targetDate');

    // 정산 관리
    const [currentDate, setCurrentDate] = useState(new Date());
    const [settlementIncome, setSettlementIncome] = useState([]);
    const [settlementUnpaid, setSettlementUnpaid] = useState([]);
    const [monthlySchedules, setMonthlySchedules] = useState([]); // [NEW] 정산용 월별 스케줄 데이터
    const [movingSchedule, setMovingSchedule] = useState(null); // [NEW] 일정 이동(보류) 상태
    const [expenses, setExpenses] = useState([]);
    const [settlementMemo, setSettlementMemo] = useState('');
    const [studentMemo, setStudentMemo] = useState(''); // [NEW] 학생관리 탭 메모
    // 입금확인 처리 시점 / 그때 받은 로컬 백업 시점. 학생관리 탭 설정 문서에 같이 들어 있다.
    const [paymentCheckedAt, setPaymentCheckedAt] = useState(null);
    const [localBackupAt, setLocalBackupAt] = useState(null);
    const [paymentCheckBusy, setPaymentCheckBusy] = useState(false);

    // [NEW] 학생관리 탭 메모 로딩 & 저장 (TDZ 방지를 위해 State 선언 후 위치)
    useEffect(() => {
        const fetchStudentMemo = async () => {
            if (!user || activeTab !== 'students') return;
            try {
                const docRef = doc(db, 'site_settings', 'student_tab');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setStudentMemo(data.memo || '');
                    setPaymentCheckedAt(data.paymentCheckedAt || null);
                    setLocalBackupAt(data.localBackupAt || null);
                }
            } catch (e) {
                console.error('학생 메모 로딩 실패', e);
            }
        };
        fetchStudentMemo();
    }, [user, activeTab]);

    /**
     * '입금확인 처리' — 여기까지 입금을 다 확인했다는 시점을 남기고,
     * 겸사겸사 데이터를 이 컴퓨터에 파일로 백업한다(주간마감의 클라우드 백업과 짝).
     *
     * 백업을 건너뛰는 경우:
     *   - 핸드폰·태블릿: 파일 다운로드가 마땅치 않다
     *   - 24시간 안에 이미 받은 적이 있다: 전체 읽기가 4,600여 건이라 무료 한도를 아낀다
     * 어느 경우든 '확인 시점' 기록은 그대로 남는다.
     */
    const handlePaymentCheckDone = async () => {
        if (paymentCheckBusy) return;
        if (!window.confirm('지금까지의 입금 내역을 모두 확인한 것으로 처리할까요?\n확인 시점이 기록됩니다.')) return;

        setPaymentCheckBusy(true);
        try {
            const now = new Date();
            const patch = { paymentCheckedAt: now.toISOString() };
            let note = '';

            if (isMobileDevice()) {
                note = '\n(핸드폰에서는 파일 백업을 건너뜁니다. PC 에서 누르면 파일로 받습니다)';
            } else if (isWithin24h(localBackupAt)) {
                note = `\n(${formatWhen(localBackupAt)} 에 파일로 받아둬서 이번엔 백업을 건너뜁니다)`;
            } else {
                try {
                    const { count } = await backupToLocalFile(db);
                    patch.localBackupAt = now.toISOString();
                    note = `\n데이터 ${count.toLocaleString()}건을 파일로 내려받았습니다.`;
                } catch (e) {
                    console.error('로컬 백업 실패', e);
                    note = '\n(다만 파일 백업에는 실패했습니다. 데이터에는 이상 없습니다)';
                }
            }

            await setDoc(doc(db, 'site_settings', 'student_tab'), patch, { merge: true });
            setPaymentCheckedAt(patch.paymentCheckedAt);
            if (patch.localBackupAt) setLocalBackupAt(patch.localBackupAt);

            alert(`입금확인 처리했습니다. (${formatWhen(now)})${note}`);
        } catch (e) {
            console.error('입금확인 처리 실패', e);
            alert('입금확인 처리에 실패했습니다. 다시 시도해 주세요.');
        } finally {
            setPaymentCheckBusy(false);
        }
    };

    /**
     * 학생 문서를 트랜잭션 안에서 갱신한다.
     *
     * 미수금 목록(unpaidList)과 등록 회차(count)는 "읽어서 → 고쳐서 → 통째로 쓰기"
     * 방식이라, 두 군데서 동시에 건드리면 나중에 쓴 쪽이 먼저 쓴 쪽의 변경을
     * 통째로 날려버린다. 화면에 그려질 때 받은 낡은 학생 객체를 기준으로 쓰는
     * 경로도 있어서, 저장 버튼 연타만으로도 미수금이 유실될 수 있었다.
     * 트랜잭션 안에서 항상 최신 문서를 다시 읽고 계산한다.
     *
     * @param studentId 대상 학생
     * @param mutate    최신 학생 데이터를 받아 { patch, info } 를 돌려주는 함수.
     *                  patch 는 실제로 쓸 필드, info 는 호출부가 알림 등에 쓸 부가 정보.
     *                  ※ 트랜잭션은 충돌 시 재시도되므로 mutate 안에서 alert/confirm 같은
     *                    부수효과를 내면 안 된다. 알림은 반환된 info 로 바깥에서 처리할 것.
     * @returns info (문서가 없으면 null)
     */
    const updateStudentTx = async (studentId, mutate) => {
        let info = null;
        await runTransaction(db, async (tx) => {
            const ref = doc(db, 'students', studentId);
            const snap = await tx.get(ref);
            if (!snap.exists()) {
                info = null;
                return;
            }
            const { patch = {}, info: mutInfo = null } = mutate(snap.data()) || {};
            info = mutInfo;
            if (Object.keys(patch).length > 0) tx.update(ref, patch);
        });
        return info;
    };

    const handleStudentMemoSave = async (text) => {
        try {
            await setDoc(doc(db, 'site_settings', 'student_tab'), { memo: text }, { merge: true });
            setStudentMemo(text);
            alert('학생관리 메모가 저장되었습니다.');
        } catch (e) {
            console.error(e);
            alert('저장 실패');
        }
    };
    const [expenseForm, setExpenseForm] = useState({ date: '', category: '기타', amount: '', memo: '' });
    const [editingExpenseId, setEditingExpenseId] = useState(null);
    // [NEW] 고정 지출 항목 목록. { id, name, amount, variable }
    //  - variable=false: 고정금액(불러오기 때 금액까지 등록)
    //  - variable=true : 변동(불러오기 때 금액 0 + '입력필요' 표시 → 그 달 금액만 채움)
    const [fixedExpenses, setFixedExpenses] = useState([]);

    // 스케쥴 관리
    const [scheduleDate, setScheduleDate] = useState(new Date());
    const [schedules, setSchedules] = useState([]);
    const [fixedSchedules, setFixedSchedules] = useState([]);
    const [historySchedules, setHistorySchedules] = useState([]);
    // 미해제 당겨오기 알림. 주간 데이터와 무관하게 항상(전 기간) 실시간 구독한다.
    // 해제할 때까지 어느 주를 보든 팝업에 떠야 하기 때문.
    const [pendingBroughtForward, setPendingBroughtForward] = useState([]);
    // 사용자가 추가한 개인일정 항목. { master: [...], vocal: [...] }
    // 기본 항목(DEFAULT_PERSONAL_CATEGORIES)과 합쳐서 팝업에 보여준다.
    const [userPersonalCategories, setUserPersonalCategories] = useState({ master: [], vocal: [] });
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState({
        date: '',
        time: '',
        minute: '00',
        dayOfWeek: 0,
        gridType: 'master',
    });
    const [selectedMinute, setSelectedMinute] = useState('00');

    // 주차 잠금 상태
    const [isWeekLocked, setIsWeekLocked] = useState(false);
    // 모바일(768px 미만)에서는 기본적으로 잠금 활성화
    const [isScheduleLocked, setIsScheduleLocked] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < 768 : false
    );
    // [NEW] 고정 스케줄 취소 내역
    const [scheduleCancellations, setScheduleCancellations] = useState([]);

    const [scheduleTab, setScheduleTab] = useState('lesson');
    const [scheduleForm, setScheduleForm] = useState({
        studentId: '',
        studentName: '',
        memo: '',
        category: '레슨',
        isFixed: false,
        recurrence: 'weekly',
        dayOfMonth: null,
        monthOfYear: null,
        status: '',
        gridType: 'master',
        isVocalProgress: false,
        broughtForward: false, // 다음 회차를 당겨서 진행하는 수업
        vocalType: '60',
        masterType: '60',
    });
    const [selectedMakeupId, setSelectedMakeupId] = useState(null);

    const [weeklyMemo, setWeeklyMemo] = useState('');
    const [availableStudents, setAvailableStudents] = useState([]);

    // --- [출석 관리 상태] ---
    const [attCategory, setAttCategory] = useState('basic');
    const [isAttendanceLocked, setIsAttendanceLocked] = useState(true);
    const [attViewMode, setAttViewMode] = useState('12weeks');
    const [attMonth, setAttMonth] = useState(new Date());

    const [attBaseDate, setAttBaseDate] = useState(getStartOfWeek(new Date()));
    const [periodAttendance, setPeriodAttendance] = useState({});
    const [attSchedules, setAttSchedules] = useState([]);

    // [NEW] 출석부 기준 년도 변경 핸들러
    const handleAttYearChange = (e) => {
        const year = parseInt(e.target.value);
        const d = new Date(attBaseDate);
        d.setFullYear(year);
        d.setMonth(0); // 해당 년도 1월 1일 기준 주차로 이동
        d.setDate(1);
        setAttBaseDate(getStartOfWeek(d));
    };

    const initialPaymentForm = {
        id: null,
        targetDate: '',
        paymentDate: formatDateLocal(new Date()),
        method: 'card',
        amount: '',
        extraAmount: '', // 추가결제(초과분) — 저장 시 누적 입금(depositList)으로 자동 적립
        isCashReceipt: false,
        receiptMemo: '',
    };
    const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
    const [selectedUnpaidId, setSelectedUnpaidId] = useState(null);

    const initialFormState = {
        name: '',
        isActive: true,
        isMonthly: false,
        isArtist: false,
        phone: '',
        count: '1',
        firstDate: formatDateLocal(new Date()),
        lastDate: formatDateLocal(new Date()),
        memo: '',
        cashReceiptMemo: '',
        clientName: '', // 월정산 정산서 거래처(회사)명
        clientBizNo: '', // 월정산 정산서 거래처 사업자등록번호
        schedule: [
            { week: 1, master: '', vocal: '', vocal30: '' },
            { week: 2, master: '', vocal: '', vocal30: '' },
            { week: 3, master: '', vocal: '', vocal30: '' },
            { week: 4, master: '', vocal: '', vocal30: '' },
        ],
        scheduleHistory: [
            {
                from: '',
                schedule: [
                    { master: '', vocal: '', vocal30: '' },
                    { master: '', vocal: '', vocal30: '' },
                    { master: '', vocal: '', vocal30: '' },
                    { master: '', vocal: '', vocal30: '' },
                ],
            },
        ],
        rates: { master: '', vocal: '' },
        unpaidList: [],
        isPaid: true,
        hasPayment: false,
    };
    const [formData, setFormData] = useState(initialFormState);
    const [settlementStatus, setSettlementStatus] = useState('pending'); // [NEW] 정산 상태 (pending | completed)
    // [NEW] 아직 '정산완료(마감)' 안 된 지난 달 목록('YYYY-MM' 오름차순). null=아직 계산 전.
    const [pendingSettlementMonths, setPendingSettlementMonths] = useState(null);

    // --- [Data Fetching & Functions] ---

    // [수정] 정산 데이터 불러오기 (날짜 오버라이드 지원)
    // [성능] 결제내역(payments 하위컬렉션)은 결제 추가/수정/삭제 때만 바뀐다.
    // fetchSettlementData 는 17곳에서 불리는데, 매번 학생 전원의 결제 '전체'를 다시 읽으면
    // (날짜 포맷 이슈로 기간 쿼리를 못 써서 전수 조회) 읽기 한도를 크게 먹는다.
    // 그래서 원본 결제 문서를 메모리에 캐시하고, 월 필터/이름은 매 호출 때 최신 students 로 붙인다.
    // 무효화(다시 읽기): 결제 저장/삭제 시 + 정산탭을 열 때(항상 최신 보장). 그 외(일정 저장 등)엔 캐시 재사용.
    const paymentsCacheRef = useRef({ valid: false, byStudent: new Map() });
    const invalidatePaymentsCache = () => {
        paymentsCacheRef.current.valid = false;
    };

    // [NEW] '정산완료(마감)' 안 된 지난 달들 계산. 메모리 데이터만 사용해 추가 읽기가 없다.
    // 데이터가 있는 달 = 결제(캐시) 또는 미수금(students.unpaidList)의 targetDate 가 그 달인 것.
    // 완료 여부는 결제캐시 채울 때 함께 읽어둔 paymentsCacheRef.current.completed 집합을 쓴다.
    // 이번 달(및 미래)은 아직 진행 중이라 제외한다.
    const computePendingMonths = () => {
        const byStudent = paymentsCacheRef.current.byStudent || new Map();
        const completed = paymentsCacheRef.current.completed || new Set();
        const dataMonths = new Set();
        for (const student of students) {
            for (const data of byStudent.get(student.id) || []) {
                const ym = (data.targetDate || '').replace(/\./g, '-').slice(0, 7);
                if (/^\d{4}-\d{2}$/.test(ym)) dataMonths.add(ym);
            }
            for (const item of student.unpaidList || []) {
                const ym = (item.targetDate || '').replace(/\./g, '-').slice(0, 7);
                if (/^\d{4}-\d{2}$/.test(ym)) dataMonths.add(ym);
            }
        }
        const now = new Date();
        const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        // 2026년 1월부터만 표시(그 이전 옛 달은 잠금 기록이 없어 너무 많음 → 상단 년/월로 직접 이동).
        const FROM_YM = '2026-01';
        return [...dataMonths]
            .filter((ym) => ym >= FROM_YM && ym < currentYM && !completed.has(ym))
            .sort();
    };

    // [NEW] 정산탭에서 특정 달로 이동(미마감 배지 클릭)
    const goToSettlementMonth = (ym) => {
        const [y, m] = ym.split('-').map(Number);
        if (!y || !m) return;
        setCurrentDate(new Date(y, m - 1, 1));
    };

    const fetchSettlementData = async (dateOverride = null) => {
        // [FIX] 데이터 로딩 중 기존 상태 유지 (UI 깜빡임 방지)
        // setSettlementIncome([]);
        // setSettlementUnpaid([]);
        // setMonthlySchedules([]);

        const targetDate = dateOverride || currentDate;
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const yearMonth = `${year}-${month}`;

        try {
            const memoDoc = await getDoc(doc(db, 'settlement_memos', yearMonth));
            if (memoDoc.exists()) {
                const data = memoDoc.data();
                setSettlementMemo(data.text || '');
                setSettlementStatus(data.status || 'pending'); // [NEW] 상태 로드
            } else {
                setSettlementMemo('');
                setSettlementStatus('pending');
            }

            const schedQ = query(
                collection(db, 'schedules'),
                where('date', '>=', `${yearMonth}-01`),
                where('date', '<=', `${yearMonth}-31`)
            );
            const schedSnap = await getDocs(schedQ);
            setMonthlySchedules(schedSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        } catch (e) {
            console.error('Settlement Data Fetch Error:', e);
        }

        /* [FIX] 전역 expenses 상태를 덮어쓰지 않음 (Blocking Logic을 위해 전역 상태 유지)
  const expenseQ = query(collection(db, "expenses"), where("date", ">=", `${yearMonth}-01`), where("date", "<=", `${yearMonth}-31`));
  const expenseSnap = await getDocs(expenseQ);
  const expenseList = expenseSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  expenseList.sort((a, b) => new Date(a.date) - new Date(b.date));
  setExpenses(expenseList);
  */

        // 결제내역 캐시 채우기(무효화됐거나 아직 없을 때만 학생 전원 전수 조회).
        // 학생이 아직 로드 안 된 상태(0명)면 캐시를 유효로 굳히지 않는다(다음 호출에서 다시 시도).
        if (!paymentsCacheRef.current.valid && students.length > 0) {
            try {
                const byStudent = new Map();
                await Promise.all(
                    students.map(async (student) => {
                        // 날짜 포맷(. 또는 -) 이슈로 기간 쿼리를 못 써서 전체 조회 후 메모리 필터링한다.
                        const paySnap = await getDocs(collection(db, 'students', student.id, 'payments'));
                        byStudent.set(
                            student.id,
                            paySnap.docs.map((d) => d.data())
                        );
                    })
                );
                // [NEW] 정산완료(마감)된 월 집합도 함께 캐시(월 이동마다 다시 읽지 않도록 여기서 한 번만).
                const completed = new Set();
                try {
                    const memosSnap = await getDocs(collection(db, 'settlement_memos'));
                    memosSnap.forEach((d) => {
                        if (d.data().status === 'completed') completed.add(d.id);
                    });
                } catch (e) {
                    console.error('정산 마감상태 조회 실패:', e);
                }
                paymentsCacheRef.current = { valid: true, byStudent, completed };
            } catch (e) {
                console.error('Settlement Payments Fetch Error:', e);
                return; // 부분 결과로 화면을 덮어쓰지 않는다
            }
        }

        // 이달 결제/미수금 추출 — 현재 students 기준으로 캐시에서 뽑고, 이름 등은 최신값을 붙인다.
        const byStudent = paymentsCacheRef.current.byStudent;
        const allPayments = [];
        const allUnpaid = [];
        for (const student of students) {
            const docs = byStudent.get(student.id) || [];
            for (const data of docs) {
                const normTDate = (data.targetDate || '').replace(/\./g, '-');
                if (normTDate.startsWith(yearMonth)) {
                    allPayments.push({ ...data, studentName: student.name, studentId: student.id });
                }
            }
            (student.unpaidList || [])
                .filter((item) => item.targetDate && item.targetDate.startsWith(yearMonth))
                .forEach((item) => allUnpaid.push({ ...item, studentName: student.name, studentId: student.id }));
        }

        allPayments.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
        allUnpaid.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
        setSettlementIncome(allPayments);
        setSettlementUnpaid(allUnpaid);

        // [NEW] '미마감' 배너 갱신 — 정산탭에서만. 메모리 계산이라 읽기 비용 없음.
        if (activeTab === 'settlement') {
            setPendingSettlementMonths(computePendingMonths());
        }
    };

    // --- [UseEffects] ---

    // [NEW] 미수금이 남아있는 달 목록('YYYY-MM' 오름차순). 학생 unpaidList 만 쓰므로 추가 읽기 없음.
    // 미마감 배너와 같은 하한(2025-01)만 적용하고, 이번 달도 포함한다(받을 돈은 이번 달도 표시).
    const unpaidMonths = useMemo(() => {
        const set = new Set();
        for (const student of students) {
            for (const item of student.unpaidList || []) {
                const ym = (item.targetDate || '').replace(/\./g, '-').slice(0, 7);
                if (/^\d{4}-\d{2}$/.test(ym) && ym >= '2025-01') set.add(ym);
            }
        }
        return [...set].sort();
    }, [students]);

    // [FIX] 정산 탭 계산 로직: 전역 expenses(전체역사)에서 현재 월 데이터만 필터링 및 계산
    const currentMonthPrefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    const currentMonthExpenses = useMemo(() => {
        return expenses.filter((e) => e.date && e.date.startsWith(currentMonthPrefix));
    }, [expenses, currentMonthPrefix]);

    const currentMonthTotalExpense = useMemo(() => {
        return currentMonthExpenses.reduce((acc, cur) => acc + Number(cur.amount || 0), 0);
    }, [currentMonthExpenses]);

    const currentMonthTotalRevenue = useMemo(() => {
        const paid = settlementIncome.reduce(
            (acc, cur) => acc + Number(String(cur.amount || 0).replace(/[^0-9]/g, '')),
            0
        );
        const unpaid = settlementUnpaid.reduce(
            (acc, cur) => acc + Number(String(cur.amount || 0).replace(/[^0-9]/g, '')),
            0
        );
        return paid + unpaid;
    }, [settlementIncome, settlementUnpaid]);

    const currentMonthNetProfit = useMemo(() => {
        return currentMonthTotalRevenue - currentMonthTotalExpense;
    }, [currentMonthTotalRevenue, currentMonthTotalExpense]);

    // [NEW] Master/Vocal 매출 상세 분석
    const currentMonthRevenueBreakdown = useMemo(() => {
        let accMaster = 0;
        let accVocal = 0;

        const processItem = (item) => {
            // 숫자만 추출 (문자열일 경우 대비)
            const amount = Number(String(item.amount || 0).replace(/[^0-9]/g, ''));
            if (amount === 0) return;

            const student = students.find((s) => s.id === item.studentId);
            if (!student) {
                accMaster += amount; // 학생 정보 없으면 기본 Master로 집계
                return;
            }

            // 학생의 수강료 비율 계산
            let tm = 0,
                tv = 0,
                tv30 = 0;
            if (student.schedule && Array.isArray(student.schedule)) {
                student.schedule.forEach((w) => {
                    tm += Number(w.master || 0);
                    tv += Number(w.vocal || 0);
                    tv30 += Number(w.vocal30 || 0);
                });
            }

            const rateM = Number(student.rates?.master || 0);
            const rateV = Number(student.rates?.vocal || 0);

            const expectedMaster = tm * rateM;
            const expectedVocal = tv * rateV + tv30 * (rateV * 0.5);
            const totalExpected = expectedMaster + expectedVocal;

            if (totalExpected > 0) {
                // 비율대로 분배
                const ratioM = expectedMaster / totalExpected;
                const ratioV = expectedVocal / totalExpected;
                accMaster += amount * ratioM;
                accVocal += amount * ratioV;
            } else {
                // 예상 금액이 0인 경우 (스케줄 미설정 등), 단가 설정에 따라 분배
                if (rateM > 0 && rateV === 0) {
                    accMaster += amount;
                } else if (rateM === 0 && rateV > 0) {
                    accVocal += amount;
                } else {
                    // 둘 다 있거나 둘 다 없으면... 그냥 Master로 (또는 5:5?) -> Master Default
                    accMaster += amount;
                }
            }
        };

        settlementIncome.forEach(processItem);
        settlementUnpaid.forEach(processItem);

        return { master: Math.round(accMaster), vocal: Math.round(accVocal) };
    }, [settlementIncome, settlementUnpaid, students]);

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'students'), orderBy('lastDate', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setStudents(list);
        });
        return () => unsubscribe();
    }, [user]);

    // 미해제 당겨오기 알림 구독 (전 기간). 어느 주를 보든, 해제 전까지 팝업에 뜬다.
    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'schedules'), where('broughtForward', '==', true));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((s) => !s.bfAcknowledged);
            setPendingBroughtForward(list);
        });
        return () => unsubscribe();
    }, [user]);

    // 사용자가 추가한 개인일정 항목 구독
    useEffect(() => {
        if (!user) return;
        const ref = doc(db, 'site_settings', 'personal_categories');
        const unsubscribe = onSnapshot(ref, (snap) => {
            const data = snap.exists() ? snap.data() : {};
            setUserPersonalCategories({
                master: Array.isArray(data.master) ? data.master : [],
                vocal: Array.isArray(data.vocal) ? data.vocal : [],
            });
        });
        return () => unsubscribe();
    }, [user]);

    // 개인일정 항목 추가 (기본 항목/중복은 막는다)
    const handleAddPersonalCategory = async (gridType, rawName) => {
        const name = (rawName || '').trim();
        if (!name) return;
        const key = gridType === 'master' ? 'master' : 'vocal';
        if (DEFAULT_PERSONAL_CATEGORIES[key].includes(name) || userPersonalCategories[key].includes(name)) {
            alert('이미 있는 항목입니다.');
            return;
        }
        try {
            await setDoc(
                doc(db, 'site_settings', 'personal_categories'),
                { [key]: [...userPersonalCategories[key], name] },
                { merge: true }
            );
        } catch (e) {
            console.error('항목 추가 실패:', e);
            alert('항목 추가에 실패했습니다: ' + e.message);
        }
    };

    // 개인일정 항목 삭제 (사용자 추가 항목만 가능. 기본 항목은 호출 자체를 안 함)
    const handleRemovePersonalCategory = async (gridType, name) => {
        const key = gridType === 'master' ? 'master' : 'vocal';
        try {
            await setDoc(
                doc(db, 'site_settings', 'personal_categories'),
                { [key]: userPersonalCategories[key].filter((c) => c !== name) },
                { merge: true }
            );
        } catch (e) {
            console.error('항목 삭제 실패:', e);
            alert('항목 삭제에 실패했습니다: ' + e.message);
        }
    };

    // ── 고정 지출 항목 (site_settings/fixed_expenses) ──────────────────
    // 구독. 문서가 없으면 최초 1회 기존 하드코딩 기본값에서 seed 한다(임대료·통신료 등은 고정,
    // 전기료·임금처럼 금액 0 이던 항목은 '변동(입력필요)'으로 넣는다).
    useEffect(() => {
        if (!user) return;
        const ref = doc(db, 'site_settings', 'fixed_expenses');
        const unsubscribe = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                const items = snap.data().items;
                setFixedExpenses(Array.isArray(items) ? items : []);
            } else {
                const seed = Object.entries(expenseDefaults)
                    .filter(([name]) => name !== '기타')
                    .map(([name, amt], i) => ({
                        id: `fx${i}`,
                        name,
                        amount: Number(amt) || 0,
                        variable: Number(amt) > 0 ? false : true, // 금액 0 이던 항목은 변동으로
                    }));
                setDoc(ref, { items: seed }).catch((e) => console.error('고정지출 seed 실패:', e));
            }
        });
        return () => unsubscribe();
    }, [user]);

    const persistFixedExpenses = async (items) => {
        await setDoc(doc(db, 'site_settings', 'fixed_expenses'), { items });
    };

    // 고정 항목 추가
    const handleAddFixedExpense = async (rawName, rawAmount, variable) => {
        const name = (rawName || '').trim();
        if (!name) return alert('항목명을 입력하세요.');
        if (fixedExpenses.some((it) => it.name === name)) return alert('이미 있는 항목입니다.');
        const amount = variable ? 0 : Number(rawAmount);
        if (!variable && (!amount || amount <= 0)) return alert('금액을 올바르게 입력하세요.');
        const items = [
            ...fixedExpenses,
            { id: `fx${Date.now().toString(36)}`, name, amount, variable: !!variable },
        ];
        try {
            await persistFixedExpenses(items);
        } catch (e) {
            console.error('고정항목 추가 실패:', e);
            alert('고정항목 추가에 실패했습니다: ' + e.message);
        }
    };

    // 고정 항목 수정 (금액/변동여부). patch = { amount?, variable? }
    const handleUpdateFixedExpense = async (id, patch) => {
        const next = { ...patch };
        if ('variable' in next) next.variable = !!next.variable;
        if (next.variable) next.amount = 0;
        else if ('amount' in next) {
            const amt = Number(next.amount);
            if (!amt || amt <= 0) return alert('금액을 올바르게 입력하세요.');
            next.amount = amt;
        }
        const items = fixedExpenses.map((it) => (it.id === id ? { ...it, ...next } : it));
        try {
            await persistFixedExpenses(items);
        } catch (e) {
            console.error('고정항목 수정 실패:', e);
            alert('고정항목 수정에 실패했습니다: ' + e.message);
        }
    };

    // 고정 항목 삭제
    const handleDeleteFixedExpense = async (id, name) => {
        if (!window.confirm(`고정 항목 '${name}'을(를) 삭제하시겠습니까?`)) return;
        const items = fixedExpenses.filter((it) => it.id !== id);
        try {
            await persistFixedExpenses(items);
        } catch (e) {
            console.error('고정항목 삭제 실패:', e);
            alert('고정항목 삭제에 실패했습니다: ' + e.message);
        }
    };

    // '이달 고정지출 불러오기' — 지금 보는 달에 고정항목을 한 번에 등록(이미 있는 항목명은 건너뜀).
    //  고정금액=금액까지 등록, 변동=금액 0 + memo '입력필요'.
    const handleLoadFixedExpensesForMonth = async () => {
        if (fixedExpenses.length === 0) {
            return alert('등록된 고정 지출 항목이 없습니다. 먼저 고정항목을 추가하세요.');
        }
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const ym = `${year}-${month}`;
        const existing = new Set(
            expenses.filter((e) => e.date && e.date.startsWith(ym)).map((e) => e.category)
        );
        const toAdd = fixedExpenses.filter((it) => !existing.has(it.name));
        if (toAdd.length === 0) {
            return alert(`${year}년 ${Number(month)}월에는 이미 모든 고정지출이 등록돼 있습니다.`);
        }
        if (
            !window.confirm(
                `${year}년 ${Number(month)}월에 고정지출 ${toAdd.length}건을 등록하시겠습니까?\n(${toAdd
                    .map((it) => it.name + (it.variable ? '(입력필요)' : ''))
                    .join(', ')})`
            )
        )
            return;
        try {
            const dateStr = `${ym}-01`;
            await Promise.all(
                toAdd.map((it) =>
                    addDoc(collection(db, 'expenses'), {
                        date: dateStr,
                        category: it.name,
                        amount: it.variable ? 0 : Number(it.amount) || 0,
                        memo: it.variable ? '입력필요' : '고정',
                        createdAt: new Date(),
                    })
                )
            );
            fetchSettlementData();
            const skipped = fixedExpenses.length - toAdd.length;
            const varCount = toAdd.filter((it) => it.variable).length;
            alert(
                `고정지출 ${toAdd.length}건을 등록했습니다.` +
                    (varCount > 0 ? `\n변동항목 ${varCount}건은 금액을 '입력필요'로 두었습니다.` : '') +
                    (skipped > 0 ? `\n(${skipped}건은 이미 있어 건너뜀)` : '')
            );
        } catch (e) {
            console.error('고정지출 등록 실패:', e);
            alert('고정지출 등록 중 오류가 발생했습니다: ' + e.message);
        }
    };

    useEffect(() => {
        if (!expandedStudentId) {
            setPaymentHistory([]);
            return;
        }
        setHistoryPage(1);
        const q = query(collection(db, 'students', expandedStudentId, 'payments'), orderBy('paymentDate', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const history = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setPaymentHistory(history);
        });
        return () => unsubscribe();
    }, [expandedStudentId]);

    // [NEW] 전역 데이터 구독 (지출, 스케줄 취소)
    useEffect(() => {
        if (!user) return;

        // Expenses
        const qExp = query(collection(db, 'expenses'), orderBy('date', 'desc'));
        const unsubExpenses = onSnapshot(qExp, (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setExpenses(list);
        });

        // Cancellations
        const unsubCancel = onSnapshot(collection(db, 'schedule_cancellations'), (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setScheduleCancellations(list);
        });

        return () => {
            unsubExpenses();
            unsubCancel();
        };
    }, [user]);

    // 정산 재조회 트리거.
    //
    // students 배열 자체를 의존성에 넣으면 onSnapshot 이 돌 때마다 새 배열이 되어,
    // 학생 문서가 하나만 바뀌어도 학생 수만큼의 결제 조회가 통째로 다시 돌았다.
    // 정산 계산이 students 에서 실제로 읽는 것은 id / 이름 / 미수금뿐이므로,
    // 그 부분만 문자열로 요약해 실제 변화가 있을 때만 재조회한다.
    const studentsSettlementKey = useMemo(
        () =>
            students
                .map(
                    (s) =>
                        `${s.id}~${s.name}~${(s.unpaidList || []).map((u) => `${u.targetDate}:${u.amount}`).join(',')}`
                )
                .join(';'),
        [students]
    );

    useEffect(() => {
        if (!user || activeTab !== 'settlement') return;
        fetchSettlementData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, activeTab, currentDate, studentsSettlementKey]);

    useEffect(() => {
        if (!user || activeTab !== 'schedule') return;
        const startOfWeek = getStartOfWeek(scheduleDate);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);

        const startStr = formatDateLocal(startOfWeek);
        const endStr = formatDateLocal(endOfWeek);

        getDoc(doc(db, 'weekly_memos', startStr)).then((docSnap) =>
            setWeeklyMemo(docSnap.exists() ? docSnap.data().text : '')
        );

        const fetchLockStatus = async () => {
            const lockDoc = await getDoc(doc(db, 'weekly_locks', startStr));
            setIsWeekLocked(lockDoc.exists() ? lockDoc.data().locked : false);
        };
        fetchLockStatus();

        const q = query(collection(db, 'schedules'), where('date', '>=', startStr), where('date', '<=', endStr));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setSchedules(list);
        });
        const fixedQ = query(collection(db, 'schedules'), where('isFixed', '==', true));
        const unsubscribeFixed = onSnapshot(fixedQ, (snapshot) => {
            const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setFixedSchedules(list);
        });

        const fetchHistory = async () => {
            const threeMonthsAgo = new Date(startOfWeek);
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            const threeMonthsAgoStr = formatDateLocal(threeMonthsAgo);

            const histQ = query(
                collection(db, 'schedules'),
                where('date', '>=', threeMonthsAgoStr),
                where('date', '<', startStr),
                orderBy('date', 'desc')
            );
            const histSnap = await getDocs(histQ);
            const histList = histSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
            setHistorySchedules(histList);
        };
        fetchHistory();

        return () => {
            unsubscribe();
            unsubscribeFixed();
        };
    }, [user, activeTab, scheduleDate]);

    // --- [기간제/월별 출석부 데이터 & 스케쥴 로딩] ---
    useEffect(() => {
        if (!user || (activeTab !== 'attendance' && activeTab !== 'students')) return;

        let startStr, endStr;

        // 1. 날짜 범위 계산 (화면 표시용)
        if (attViewMode === '12weeks') {
            const start = new Date(attBaseDate);
            const end = new Date(start);
            end.setDate(end.getDate() + 7 * 12 - 1);
            startStr = formatDateLocal(start);
            endStr = formatDateLocal(end);
        } else {
            const year = attMonth.getFullYear();
            const month = attMonth.getMonth();
            const start = new Date(year, month, 1);
            const end = new Date(year, month + 1, 0);

            const adjustedStart = getStartOfWeek(start);
            const adjustedEnd = new Date(end);
            const day = adjustedEnd.getDay();
            const diff = 6 - day;
            adjustedEnd.setDate(adjustedEnd.getDate() + diff);

            startStr = formatDateLocal(adjustedStart);
            endStr = formatDateLocal(adjustedEnd);
        }

        // 2. 미래 버퍼 계산 (45일)
        const bufferEndDate = new Date(endStr);
        bufferEndDate.setDate(bufferEndDate.getDate() + 45);
        const bufferEndStr = formatDateLocal(bufferEndDate);

        // 3. [핵심 수정] safeStartStr 변수 대신 아래 쿼리에서 직접 문자열 사용

        // 4. 출석 체크 데이터 구독 (Attendance)
        const qAtt = query(collection(db, 'attendance'), where('date', '>=', startStr), where('date', '<=', endStr));
        const unsubAtt = onSnapshot(qAtt, (snapshot) => {
            const map = {};
            snapshot.docs.forEach((doc) => {
                const d = doc.data();
                const key = `${d.studentId}_${d.date}_${d.type || 'M'}_${d.index || 0}`;
                map[key] = { id: doc.id, ...d };
            });
            setPeriodAttendance(map);
        });

        // 5. 스케줄 데이터 구독 (Schedules)
        //
        // 화면에 보이는 기간만 받으면 될 것 같지만 그렇지 않다. 로테이션(R1, R2...)
        // 계산과 재등록 시점 판정이 학생의 '전체' 완료 이력을 필요로 하기 때문에,
        // 범위를 좁히면 화면 밖 수업이 빠져 회차가 어긋난다.
        //
        // 그래서 범위는 넓게 두되, 반복 방문 시의 읽기 비용은 firebase.js 의
        // 로컬 지속 캐시로 줄인다(두 번째 방문부터는 변경분만 받아온다).
        //
        // 상한을 '2030-12-31' 로 박아두면 2031년부터 스케쥴이 조용히 사라지므로,
        // 현재 연도를 기준으로 넉넉히 잡는다.
        const SCHED_RANGE_START = '2000-01-01';
        const SCHED_RANGE_END = `${new Date().getFullYear() + 5}-12-31`;
        const qSched = query(
            collection(db, 'schedules'),
            where('date', '>=', SCHED_RANGE_START),
            where('date', '<=', SCHED_RANGE_END)
        );
        const unsubSched = onSnapshot(qSched, (snapshot) => {
            const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

            setAttSchedules(list);
        });

        // [NEW] 고정 스케줄 취소 내역 구독
        const unsubCancel = onSnapshot(collection(db, 'schedule_cancellations'), (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setScheduleCancellations(list);
        });

        return () => {
            unsubAtt();
            unsubSched();
            unsubCancel();
        };
    }, [user, activeTab, attBaseDate, attViewMode, attMonth]);

    // [NEW] 출석부 월별 보기 시 정산 데이터 동기화
    // (위와 같은 이유로 students 대신 요약 키를 쓴다)
    useEffect(() => {
        if (activeTab === 'attendance' && attViewMode === 'month') {
            fetchSettlementData(attMonth);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, attViewMode, attMonth, studentsSettlementKey]);

    // --- [Logic: Ghost Schedules] ---
    const getGhostSchedules = (gridType = 'master') => {
        const weekStart = getStartOfWeek(scheduleDate);

        // [New] 해당 주차 월요일 자정(00:00)이 지났다면, 해당 주차의 예정 스케쥴 숨김
        const mondayMidnight = new Date(weekStart);
        mondayMidnight.setHours(0, 0, 0, 0);

        if (new Date() >= mondayMidnight) {
            return [];
        }

        weekStart.setHours(12, 0, 0, 0);

        const ghosts = [];
        const scheduledStudentIds = new Set(
            schedules
                .filter((s) => (s.gridType || 'master') === gridType)
                .map((s) => s.studentId)
                .filter(Boolean)
        );

        students.forEach((student) => {
            if (scheduledStudentIds.has(student.id)) return;
            if (!student.isActive) return;

            const weekStr = formatDateLocal(weekStart);
            const rotationWeek = getRotationWeek(student.firstDate, weekStr);
            const weekConfig = student.schedule && student.schedule[rotationWeek - 1];

            let hasLessonThisWeek = false;
            if (gridType === 'master') {
                hasLessonThisWeek = weekConfig && Number(weekConfig.master || 0) >= 1;
            } else {
                // vocal
                const vCount = Number(weekConfig?.vocal || 0);
                const v30Count = Number(weekConfig?.vocal30 || 0);
                hasLessonThisWeek = vCount + v30Count >= 1;
            }

            if (hasLessonThisWeek) {
                // 고스트(직전 수업 미리보기)는 최근 4주 이내 수업만 참고한다.
                // historySchedules 자체는 3개월치를 들고 있지만(사이클 잔여량 계산에 필요),
                // 너무 오래된 수업을 고스트로 띄우지 않도록 여기서만 범위를 좁힌다.
                const ghostLimit = new Date(weekStart);
                ghostLimit.setDate(ghostLimit.getDate() - 28);
                const ghostLimitStr = formatDateLocal(ghostLimit);

                // historySchedules 는 날짜 내림차순이라 .find 가 가장 최근 수업을 먼저 잡는다.
                const lastRecord = historySchedules.find(
                    (h) =>
                        h.studentId === student.id &&
                        (h.category === '레슨' || h.category === '상담') &&
                        (h.gridType || 'master') === gridType &&
                        h.date >= ghostLimitStr
                );

                if (lastRecord) {
                    const [ly, lm, ld] = lastRecord.date.split('-').map(Number);
                    const lastDateObj = new Date(ly, lm - 1, ld, 12, 0, 0);
                    const lastDayOfWeek = lastDateObj.getDay();

                    const dayOffset = (lastDayOfWeek + 6) % 7;

                    const targetDateObj = new Date(weekStart);
                    targetDateObj.setDate(weekStart.getDate() + dayOffset);

                    const targetDateStr = formatDateLocal(targetDateObj);

                    ghosts.push({
                        id: `ghost-${student.id}-${gridType}`,
                        isGhost: true,
                        isFixed: false,
                        studentId: student.id,
                        studentName: student.name,
                        time: lastRecord.time,
                        date: targetDateStr,
                        category: lastRecord.category,
                        memo: lastRecord.memo,
                        dayOfWeek: lastDayOfWeek,
                        gridType: gridType,
                        vocalType:
                            gridType === 'vocal' &&
                            Number(weekConfig?.vocal30 || 0) > 0 &&
                            Number(weekConfig?.vocal || 0) === 0
                                ? '30'
                                : '60',
                    });
                }
            }
        });
        return ghosts;
    };

    // --- [Handlers] ---
    const handleGoToStudent = (sid, sname) => {
        setActiveTab('students');
        setSearchTerm(sname);
        setExpandedStudentId(sid);
    };

    // 당겨오기 알림 '해제' — 알림만 끈다(bfAcknowledged=true). 수업 데이터는 유지.
    const handleAcknowledgeBroughtForward = async (schedId) => {
        try {
            await updateDoc(doc(db, 'schedules', schedId), { bfAcknowledged: true });
        } catch (e) {
            console.error('당겨오기 알림 해제 실패:', e);
            alert('알림 해제에 실패했습니다: ' + e.message);
        }
    };
    const handleWeeklyMemoSave = async (text) => {
        try {
            await setDoc(
                doc(db, 'weekly_memos', formatDateLocal(getStartOfWeek(scheduleDate))),
                { text },
                { merge: true }
            );
            setWeeklyMemo(text);
            alert('주간 메모 저장 완료');
        } catch (e) {
            console.error(e);
            alert('주간 메모 저장 실패');
        }
    };
    const handleSettlementMemoSave = async (text) => {
        try {
            const ym = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            await setDoc(doc(db, 'settlement_memos', ym), { text }, { merge: true });
            setSettlementMemo(text);
            alert('저장됨');
        } catch (e) {
            console.error(e);
            alert('메모 저장 실패');
        }
    };

    // [수정] 등록 모달 학생 리스트 생성 함수 (고정 스케쥴 규칙에 의한 '유령 차단' 방지)
    // [수정] 등록 모달 학생 리스트 생성 함수 (30분 잔여량 표시 로직 추가)
    // [수정] 등록 모달 학생 리스트 생성 함수 (30분 잔여량 표시 로직 추가 - 주차 무관 노출)
    const generateAvailableStudents = (selectedDateStr, editingItemName = null, gridType = 'master') => {
        const weekStart = getStartOfWeek(selectedDateStr);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const weekStartStr = formatDateLocal(weekStart);
        const weekEndStr = formatDateLocal(weekEnd);

        // [Refactor] 예약 횟수(count)와 예약 가치(value)를 모두 계산
        // Master: M30=0.5 value. Vocal: V30=1 count.
        const bookedUsage = {}; // { studentId: { count: 0, value: 0 } }

        const addUsage = (sid, mType, vType, gType) => {
            if (!bookedUsage[sid]) bookedUsage[sid] = { count: 0, value: 0 };
            bookedUsage[sid].count += 1;

            let val = 1;
            if (gType === 'master') {
                if (mType === '30') val = 0.5;
            } else {
                // [New] Vocal Half Split -> 0.5 value
                // [FIX] vocalType '30'은 1로 계산, 'half'만 0.5로 계산
                if (vType === 'half') val = 0.5;
                else val = 1; // V60, V30 -> 1.0 value
            }
            bookedUsage[sid].value += val;
        };

        // 1. 일반 스케쥴
        schedules.forEach((s) => {
            const sType = s.gridType || 'master';
            if (sType !== gridType) return;
            if (editingItemName && s.studentName === editingItemName) return;

            const isSpecialClass = s.memo && (s.memo.includes('보강') || s.memo.includes('추가'));
            if (!isSpecialClass && s.date >= weekStartStr && s.date <= weekEndStr && s.studentId) {
                addUsage(s.studentId, s.masterType, s.vocalType, sType);
            }
        });

        // 2. 고정 스케쥴
        fixedSchedules.forEach((s) => {
            const sType = s.gridType || 'master';
            if (sType !== gridType) return;
            if (!s.studentId) return;
            if (s.fixedStartDate && s.fixedStartDate > weekEndStr) return;

            const rec = s.recurrence || 'weekly';

            if (rec === 'weekly') {
                // ── 매주 고정 (기존 로직 그대로) ──
                const dayIndex = s.dayOfWeek === 0 ? 6 : s.dayOfWeek - 1;
                const targetDate = new Date(weekStart);
                targetDate.setDate(weekStart.getDate() + dayIndex);
                const targetDateStr = formatDateLocal(targetDate);

                const isOverridden = schedules.some((sch) => sch.date === targetDateStr && sch.time === s.time);
                const isCancelled = scheduleCancellations.some(
                    (c) => c.date === targetDateStr && c.time === s.time && c.studentId === s.studentId
                );

                if (!isOverridden && !isCancelled) {
                    addUsage(s.studentId, s.masterType, s.vocalType, sType);
                }
            } else {
                // ── 매월 고정: 이번 주 7일 중 규칙에 걸리는 날을 찾는다 (주가 두 달에 걸칠 수 있음) ──
                for (let i = 0; i < 7; i++) {
                    const targetDate = new Date(weekStart);
                    targetDate.setDate(weekStart.getDate() + i);
                    if (!fixedScheduleOccursOn(s, targetDate)) continue;

                    const targetDateStr = formatDateLocal(targetDate);
                    if (s.fixedStartDate && s.fixedStartDate > targetDateStr) continue;
                    if (s.fixedEndDate && s.fixedEndDate < targetDateStr) continue;

                    const isOverridden = schedules.some((sch) => sch.date === targetDateStr && sch.time === s.time);
                    const isCancelled = scheduleCancellations.some(
                        (c) => c.date === targetDateStr && c.time === s.time && c.studentId === s.studentId
                    );

                    if (!isOverridden && !isCancelled) {
                        addUsage(s.studentId, s.masterType, s.vocalType, sType);
                    }
                }
            }
        });

        const options = [];
        students
            .filter((s) => s.isActive)
            .forEach((student) => {
                const currentRotationWeek = getRotationWeek(student.firstDate, weekStartStr);
                const weekConfig = student.schedule && student.schedule[currentRotationWeek - 1];

                if (weekConfig) {
                    const usage = bookedUsage[student.id] || { count: 0, value: 0 };
                    // Value 기반 차감 공통 로직 (Master & Vocal)
                    // Master: Quota=master. Vocal: Quota=vocal+vocal30.
                    let totalQuota = 0;
                    if (gridType === 'master') {
                        totalQuota = Number(weekConfig.master || 0);
                    } else {
                        // Vocal
                        const vCount = Number(weekConfig.vocal || 0);
                        const v30Count = Number(weekConfig.vocal30 || 0);
                        totalQuota = Math.floor(vCount + v30Count);
                    }

                    // [Fix] 부동소수점 오차 방지를 위해 반올림 처리
                    const remainingValue = Math.round((totalQuota - usage.value) * 10) / 10;

                    // 1) 온전한 1시간 슬롯: 남은 쿼터가 있을 때만 생성
                    // 1) 온전한 1시간 슬롯: 남은 쿼터가 있을 때만 생성
                    const fullSlots = Math.floor(remainingValue);

                    // 2) 0.5 짜투리: 쿼터와 상관없이, '사용량'이 0.5단위로 끝나면 짝을 맞추기 위해 무조건 노출
                    // (사용자가 할당량을 초과해서 추가 수업을 잡는 경우 고려)
                    const usageDecimal = Math.round((usage.value % 1) * 10) / 10;
                    const hasHalf = usageDecimal === 0.5;

                    for (let i = 1; i <= fullSlots; i++) {
                        // [Revert] Total 표시 제거
                        const displayName = totalQuota > 1 ? `${student.name} (${usage.count + i})` : student.name;
                        options.push({ id: student.id, name: displayName, originalName: student.name });
                    }

                    // [FIX] Total Quota가 0인 경우(이월 학생)는 Week Logic에서 짝맞추기 강요하지 않음 (Global Logic에서 처리)
                    if (hasHalf && totalQuota > 0) {
                        const halfName = `${student.name} (30분)`;
                        if (!options.some((o) => o.name === halfName)) {
                            options.push({ id: student.id, name: halfName, originalName: student.name });
                        }
                    }
                }

                // 2) [Refactor] 로테이션 사이클 전체 잔여량 계산 (Global Remainder)
                // Master & Vocal 공통 적용 (단, Vocal 0.5 지원 위해)
                if (student.firstDate) {
                    // [FIX] 사이클 계산 기준을 '등록일이 속한 주의 월요일'로 통일 (달력 주차와 일치시키기 위함)
                    const effectiveFirstDate = getStartOfWeek(student.firstDate);

                    const diffDays = Math.floor((new Date(weekStart) - new Date(effectiveFirstDate)) / 86400000);
                    const safeDiff = Math.max(0, diffDays);
                    const cycleIndex = Math.floor(Math.floor(safeDiff / 7) / 4);

                    const cycleStartDate = new Date(effectiveFirstDate);
                    cycleStartDate.setDate(cycleStartDate.getDate() + cycleIndex * 4 * 7);

                    const cycleEndDate = new Date(cycleStartDate);
                    cycleEndDate.setDate(cycleEndDate.getDate() + 27);

                    const cycleStartStr = formatDateLocal(cycleStartDate);
                    const cycleEndStr = formatDateLocal(cycleEndDate);

                    // 전체 쿼터 계산
                    let cycleQuota = 0;
                    (student.schedule || []).forEach((w) => {
                        if (gridType === 'master') {
                            cycleQuota += Number(w.master || 0);
                        } else {
                            cycleQuota += Number(w.vocal || 0) + Number(w.vocal30 || 0);
                        }
                    });

                    // 전체 사용량 계산
                    let cycleUsage = 0;
                    const allRelevantSchedules = [...historySchedules, ...schedules].filter(
                        (s) =>
                            s.studentId === student.id &&
                            (s.gridType || 'master') === gridType &&
                            s.date >= cycleStartStr &&
                            s.date <= cycleEndStr
                    );

                    allRelevantSchedules.forEach((s) => {
                        const isSpecial = s.memo && (s.memo.includes('보강') || s.memo.includes('추가'));
                        if (!isSpecial) {
                            let u = 1;
                            if (gridType === 'master') {
                                if (s.masterType === '30') u = 0.5;
                            } else {
                                // Vocal
                                // [FIX] vocalType '30'은 1로 계산, 'half'만 0.5로 계산
                                if (s.vocalType === 'half') u = 0.5;
                                // V60, V30 is 1.0.
                            }
                            cycleUsage += u;
                        }
                    });

                    const remaining = Math.round((cycleQuota - cycleUsage) * 10) / 10;

                    // [New Logic] Global에서도 사용량의 .5 여부를 확인하여 노출 (오버부킹 대응)
                    const globalUsageDecimal = Math.round((cycleUsage % 1) * 10) / 10;
                    const globalHasHalf = globalUsageDecimal === 0.5;

                    // 0.5 짜투리가 남았으면 노출 (쿼터 잔여가 있거나, 아니면 사용량이 .5로 끝나서 짝이 안맞을 때)
                    if (globalHasHalf || (remaining > 0 && remaining % 1 === 0.5)) {
                        // [Revert] Total 표시 제거
                        const halfName = `${student.name} (30분)`;
                        if (!options.some((o) => o.name === halfName)) {
                            options.push({ id: student.id, name: halfName, originalName: student.name });
                        }
                    }
                }
            });

        return options.sort((a, b) => a.name.localeCompare(b.name));
    };

    const updateStudentLastDate = async (sid) => {
        try {
            const paymentsRef = collection(db, 'students', sid, 'payments');
            const paymentsSnap = await getDocs(query(paymentsRef, orderBy('targetDate', 'desc')));
            const paidDates = paymentsSnap.docs
                .map((d) => d.data().targetDate)
                .filter((d) => d)
                .sort()
                .reverse();
            const lastPaid = paidDates.length > 0 ? paidDates[0] : null;
            const studentDoc = await getDoc(doc(db, 'students', sid));
            if (!studentDoc.exists()) return;
            const studentData = studentDoc.data();
            let finalDate = lastPaid || studentData.firstDate;
            await updateDoc(doc(db, 'students', sid), { lastDate: finalDate, hasPayment: paidDates.length > 0 });
        } catch (error) {
            console.error('LastDate Update Error:', error);
        }
    };
    const handleExpenseChange = async (e) => {
        const { name, value } = e.target;
        let newForm = { ...expenseForm, [name]: value };
        if (name === 'category') {
            let newDate = newForm.date;
            if (['임대료', '전기료', '통신료', '세콤', '단말기', '정수기'].includes(value)) {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth() + 1;
                const lastDay = new Date(year, month, 0).getDate();
                newDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            }
            let newAmount = expenseDefaults[value] || '';
            if (value === '임대료') {
                try {
                    const q = query(collection(db, 'expenses'), where('category', '==', '임대료'));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const list = snap.docs.map((doc) => doc.data());
                        list.sort((a, b) => new Date(b.date) - new Date(a.date));
                        newAmount = list[0].amount;
                    } else {
                        newAmount = 5005000;
                    }
                } catch (err) {
                    newAmount = 5005000;
                }
            }
            newForm = { ...newForm, category: value, amount: newAmount, date: newDate };
        }
        setExpenseForm(newForm);
    };
    const handleExpenseSubmit = async () => {
        if (!expenseForm.date || !expenseForm.amount) return alert('날짜/금액 입력');
        try {
            const payload = { ...expenseForm };
            // 변동(입력필요) 항목을 금액 채워 저장하면 메모의 '입력필요'를 '입력완료'로 바꾼다.
            if (payload.memo === '입력필요' && Number(payload.amount) > 0) {
                payload.memo = '입력완료';
            }
            if (editingExpenseId) await updateDoc(doc(db, 'expenses', editingExpenseId), payload);
            else await addDoc(collection(db, 'expenses'), { ...payload, createdAt: new Date() });
            setExpenseForm({ date: '', category: '기타', amount: '', memo: '' });
            setEditingExpenseId(null);
            fetchSettlementData();
        } catch (e) {
            alert('오류');
        }
    };
    const handleEditExpenseClick = (item) => {
        setEditingExpenseId(item.id);
        setExpenseForm(item);
    };
    const cancelExpenseEdit = () => {
        setEditingExpenseId(null);
        setExpenseForm({ date: '', category: '기타', amount: '', memo: '' });
    };
    // 확인창은 호출부(SettlementTab)에서 띄운다. 지출 내용과 지급 여부를
    // 알고 있어야 제대로 된 경고를 보여줄 수 있기 때문이다.
    const handleExpenseDelete = async (id) => {
        try {
            await deleteDoc(doc(db, 'expenses', id));
            fetchSettlementData();
        } catch (e) {
            console.error('지출 삭제 실패:', e);
            alert('지출 삭제에 실패했습니다: ' + e.message);
        }
    };
    const handleYearChange = (e) => {
        const d = new Date(currentDate);
        d.setFullYear(parseInt(e.target.value));
        setCurrentDate(d);
    };
    const handleMonthChange = (e) => {
        const d = new Date(currentDate);
        d.setMonth(parseInt(e.target.value) - 1);
        setCurrentDate(d);
    };
    const changeMonth = (offset) => {
        const d = new Date(currentDate);
        d.setMonth(d.getMonth() + offset);
        setCurrentDate(d);
    };
    const handleScheduleYearChange = (e) => {
        const d = new Date(scheduleDate);
        d.setFullYear(parseInt(e.target.value));
        setScheduleDate(d);
    };
    const handleScheduleMonthChange = (e) => {
        const d = new Date(scheduleDate);
        d.setMonth(parseInt(e.target.value) - 1);
        setScheduleDate(d);
    };
    const handleScheduleWeekChange = (e) => {
        setScheduleDate(new Date(e.target.value));
    };

    const handleSlotClick = async (dateStr, hourStr, dayOfWeek, existingItem = null, gridType = 'master') => {
        const editingName = existingItem ? existingItem.studentName : null;

        // [NEW] 월정산 마감(Lock) 여부 확인 (최우선 차단)
        try {
            const targetDate = new Date(dateStr);
            const yStr = targetDate.getFullYear();
            const mStr = String(targetDate.getMonth() + 1).padStart(2, '0');
            const lockDocRef = doc(db, 'settlement_memos', `${yStr}-${mStr}`);
            const lockSnap = await getDoc(lockDocRef);
            if (lockSnap.exists() && lockSnap.data().status === 'completed') {
                alert(
                    `[${yStr}년 ${mStr}월]은 정산이 마감(완료)되어 수정할 수 없습니다.\n수정이 필요하면 정산 관리에서 '정산완료'를 해제해주세요.`
                );
                return;
            }
        } catch (e) {
            // 마감 여부를 확인하지 못한 상태에서 통과시키면 마감된 달이 수정될 수 있다.
            // 확인 실패는 차단으로 처리한다.
            console.error('Lock Check Error', e);
            alert('정산 마감 여부를 확인하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.');
            return;
        }

        // [New] 보컬 정산 완료 여부 체크
        if (gridType === 'vocal') {
            const targetDate = new Date(dateStr);
            // 포맷 정규화 (YYYY-MM)
            const targetMonthNorm = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

            // [FIX] 상태 의존성 제거 -> DB에서 직접 최신 정산 내역 조회 (강력한 차단)
            try {
                const expensesRef = collection(db, 'expenses');
                const qCheck = query(expensesRef, where('category', '==', '임금'), where('isVocalWage', '==', true));
                const qSnap = await getDocs(qCheck);

                let foundSettlement = false;
                qSnap.forEach((doc) => {
                    const data = doc.data();
                    let eMonth = data.targetMonth || data.date;
                    if (!eMonth) return;
                    const eMonthNorm = eMonth.replace(/\./g, '-').substring(0, 7);
                    if (eMonthNorm === targetMonthNorm) foundSettlement = true;
                });

                if (foundSettlement && existingItem && existingItem.isVocalProgress) {
                    alert(
                        `[DB확인됨] 해당 월(${targetMonthNorm})의 보컬 정산 내역이 존재합니다.\n이미 정산이 진행되어 '보컬진행(추가수업)'을 수정할 수 없습니다.`
                    );
                    return;
                }
            } catch (err) {
                // 위와 같은 이유로 확인 실패는 차단.
                console.error('Blocking Check Failed:', err);
                alert('보컬 정산 상태를 확인하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.');
                return;
            }
        }

        const options = generateAvailableStudents(dateStr, editingName, gridType);
        setAvailableStudents(options);

        setSelectedMakeupId(null);

        if (existingItem) {
            const timeParts = existingItem.time.split(':');
            const isGhost = existingItem.isGhost;

            setSelectedSlot({
                date: dateStr,
                time: timeParts[0],
                minute: timeParts[1],
                dayOfWeek,
                id: isGhost ? null : existingItem.id, // Ghost는 ID가 없음 (혹은 가상ID)
                gridType: existingItem.gridType || 'master',
            });
            setSelectedMinute(timeParts[1]);

            // [FIX] 이동 중(movingSchedule)일 때, Ghost 스케줄(existingItem)을 클릭하면
            // Ghost의 학생 정보가 아닌 '이동 중인 학생' 정보로 폼을 채워야 함.
            if (movingSchedule) {
                setScheduleTab(
                    movingSchedule.category === '레슨' || movingSchedule.category === '상담' ? 'lesson' : 'personal'
                );
                setScheduleForm({
                    studentId: movingSchedule.studentId || '',
                    studentName: movingSchedule.studentName || '',
                    memo: movingSchedule.memo || '',
                    category: movingSchedule.category || '레슨',
                    isFixed: movingSchedule.isFixed || false,
                    recurrence: movingSchedule.recurrence || 'weekly',
                    dayOfMonth: movingSchedule.dayOfMonth || null,
                    status: movingSchedule.status || '',
                    gridType: existingItem.gridType || 'master', // GridType은 타겟 슬롯 따름
                    isVocalProgress: movingSchedule.isVocalProgress || false,
                    broughtForward: movingSchedule.broughtForward || false,
                    vocalType: movingSchedule.vocalType || '60',
                    masterType: movingSchedule.masterType || '60',
                });
            } else {
                // 일반 클릭 (수정/생성)
                setScheduleTab(
                    existingItem.category === '레슨' || existingItem.category === '상담' ? 'lesson' : 'personal'
                );
                setScheduleForm({
                    studentId: existingItem.studentId || '',
                    studentName: existingItem.studentName || '',
                    memo: existingItem.memo || '',
                    category: existingItem.category || '레슨',
                    isFixed: existingItem.isFixed || false,
                    recurrence: existingItem.recurrence || 'weekly',
                    dayOfMonth: existingItem.dayOfMonth || null,
                    monthOfYear: existingItem.monthOfYear || null,
                    status: existingItem.status || '',
                    gridType: existingItem.gridType || 'master',
                    isVocalProgress: existingItem.isVocalProgress || false,
                    broughtForward: existingItem.broughtForward || false,
                    vocalType: existingItem.vocalType || '60',
                    masterType: existingItem.masterType || '60',
                });
            }
        } else {
            // [NEW] 이동 중인 스케줄이 있다면 해당 정보로 폼 초기화
            if (movingSchedule) {
                setScheduleTab(
                    movingSchedule.category === '레슨' || movingSchedule.category === '상담' ? 'lesson' : 'personal'
                );
                setScheduleForm({
                    studentId: movingSchedule.studentId || '',
                    studentName: movingSchedule.studentName || '',
                    memo: movingSchedule.memo || '',
                    category: movingSchedule.category || '레슨',
                    isFixed: movingSchedule.isFixed || false,
                    recurrence: movingSchedule.recurrence || 'weekly',
                    dayOfMonth: movingSchedule.dayOfMonth || null,
                    status: movingSchedule.status || '',
                    gridType: gridType, // 이동하려는 새 슬롯의 gridType 적용
                    isVocalProgress: movingSchedule.isVocalProgress || false,
                    broughtForward: movingSchedule.broughtForward || false,
                    vocalType: movingSchedule.vocalType || '60',
                    masterType: movingSchedule.masterType || '60',
                });
            } else {
                setScheduleTab('lesson');
                setScheduleForm({
                    studentId: '',
                    studentName: '',
                    memo: '',
                    category: '레슨',
                    isFixed: false,
                    recurrence: 'weekly',
                    dayOfMonth: null,
                    status: '',
                    gridType,
                    isVocalProgress: false,
                    broughtForward: false,
                    vocalType: '60',
                    masterType: '60',
                });
            }
            setSelectedSlot({ date: dateStr, time: hourStr, minute: '00', dayOfWeek, id: null, gridType });
            setSelectedMinute('00');
        }
        setIsScheduleModalOpen(true);
    };

    const handleTabChange = (tab) => {
        setScheduleTab(tab);
        if (tab === 'personal') {
            const defaultCategory = scheduleForm.gridType === 'master' ? '야구' : '상담';
            setScheduleForm((prev) => ({
                ...prev,
                category: defaultCategory,
                studentId: '',
                studentName: '',
                status: '',
            }));
        } else {
            // 수업(레슨)에는 고정 기능을 쓰지 않는다. 개인일정에서 켜둔 채 넘어와도 해제한다.
            setScheduleForm((prev) => ({
                ...prev,
                category: '레슨',
                status: '',
                isFixed: false,
                recurrence: 'weekly',
            }));
            // 레슨은 정시/30분만 쓴다. 개인일정에서 세밀한 분(예: 20)을 골랐다면 정시로 되돌린다.
            setSelectedMinute((prev) => (prev === '00' || prev === '30' ? prev : '00'));
        }
    };

    // [NEW] 특정 지난 날짜의 '미처리' 학생 수업을 한꺼번에 완료 처리한다.
    // - 대상: 그 날짜의 학생 수업(studentId 있음) 중 아직 아무 상태도 없는 것.
    //   완료·결석·보강·지각 등 이미 처리된 건 상태가 있으므로 자동으로 제외된다.
    // - 개인일정(studentId 없음)·고정(핀)·예정(유령)은 제외한다.
    // - 개별 완료와 동일하게 상태를 '완료'로 바꾸고, 아티스트 학생은 count 를 올린다.
    //   단, 개별 저장 시의 '미수금 자동정리'는 하지 않는다. 여러 건을 한 번에 완료할 때
    //   학생의 미수금이 의도치 않게 대량 삭제되는 것을 막기 위함이다.
    const handleBulkCompleteDay = async (dateStr) => {
        if (isWeekLocked || isScheduleLocked) {
            alert('이번 주가 마감되어 있어 완료 처리할 수 없습니다.');
            return;
        }

        // 정산이 마감된 달이면 개별 완료와 동일하게 차단한다.
        try {
            const [y, m] = dateStr.split('-');
            const lockSnap = await getDoc(doc(db, 'settlement_memos', `${y}-${m}`));
            if (lockSnap.exists() && lockSnap.data().status === 'completed') {
                alert(`[${y}년 ${m}월]은 정산이 마감되어 완료 처리할 수 없습니다.`);
                return;
            }
        } catch (e) {
            console.error('정산 마감 확인 실패', e);
            alert('정산 마감 여부를 확인하지 못해 완료 처리를 중단합니다.');
            return;
        }

        const targets = bulkCompleteTargets(schedules, dateStr);

        if (targets.length === 0) {
            alert('완료 처리할 미처리 수업이 없습니다.');
            return;
        }

        const list = [...targets]
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((s) => `· ${s.time} ${s.studentName || ''}${s.gridType === 'vocal' ? ' (보컬)' : ''}`)
            .join('\n');
        if (!window.confirm(`${dateStr} 미처리 수업 ${targets.length}건을 완료 처리합니다:\n\n${list}\n\n계속할까요?`))
            return;

        try {
            // 1. 상태를 한꺼번에 '완료'로 (원자적 일괄 쓰기)
            const batch = writeBatch(db);
            targets.forEach((s) => batch.update(doc(db, 'schedules', s.id), { status: 'completed' }));
            await batch.commit();

            // 2. 아티스트 학생은 완료 건수만큼 count 를 올린다 (학생별로 합산해 1회 트랜잭션).
            const perStudent = {};
            targets.forEach((s) => {
                perStudent[s.studentId] = (perStudent[s.studentId] || 0) + 1;
            });
            for (const [sid, cnt] of Object.entries(perStudent)) {
                const stu = students.find((x) => x.id === sid);
                if (stu && stu.isArtist) {
                    await updateStudentTx(sid, (sData) => ({
                        patch: { count: String(parseInt(sData.count || '0') + cnt) },
                    }));
                }
            }

            alert(`${targets.length}건을 완료 처리했습니다.`);
        } catch (e) {
            console.error('일괄 완료 처리 실패', e);
            alert('일괄 완료 처리 중 오류가 발생했습니다. 일부만 처리되었을 수 있습니다.');
        }
    };

    // [수정] 스케쥴 저장 함수 (당일 포함 미래 미수금 삭제)
    const handleScheduleSave = async () => {
        if (isWeekLocked || isScheduleLocked) return;
        const timeToSave = `${selectedSlot.time}:${selectedMinute}`;
        const finalGridType = selectedSlot.gridType || scheduleForm.gridType || 'master';
        const saveDate = scheduleForm.isFixed ? formatDateLocal(new Date()) : selectedSlot.date;

        // [NEW] 월정산 청구 여부 확인 (청구가 생성된 달은 스케줄 수정 차단)
        if (scheduleForm.studentId) {
            const targetStudent = students.find((s) => s.id === scheduleForm.studentId);
            if (targetStudent && targetStudent.isMonthly) {
                const sDateObj = new Date(saveDate);
                const sYear = sDateObj.getFullYear();
                const sMonth = sDateObj.getMonth() + 1;
                const settlementMemoKey = `${sYear}.${sMonth}월 월정산 청구`;

                const hasSettlement = (targetStudent.unpaidList || []).some((item) => item.memo === settlementMemoKey);

                if (hasSettlement) {
                    alert(
                        `[${sYear}년 ${sMonth}월]은 이미 월정산 청구가 진행되었습니다.\n내역이 생성된 이후에는 스케줄을 추가/수정할 수 없습니다.`
                    );
                    return;
                }
            }
        }

        // [NEW] 보컬 정산(지급) 완료된 달에는 '보컬진행(추가수업)' 생성/수정 불가
        if (finalGridType === 'vocal' && scheduleForm.isVocalProgress) {
            const vDateObj = new Date(saveDate);
            const vMonthNorm = `${vDateObj.getFullYear()}-${String(vDateObj.getMonth() + 1).padStart(2, '0')}`;

            try {
                const expensesRef = collection(db, 'expenses');
                const qCheck = query(expensesRef, where('category', '==', '임금'), where('isVocalWage', '==', true));
                const qSnap = await getDocs(qCheck);

                let foundSettlement = false;
                qSnap.forEach((doc) => {
                    const data = doc.data();
                    let eMonth = data.targetMonth || data.date;
                    if (!eMonth) return;
                    const eMonthNorm = eMonth.replace(/\./g, '-').substring(0, 7);
                    if (eMonthNorm === vMonthNorm) foundSettlement = true;
                });

                if (foundSettlement) {
                    alert(
                        `[DB확인됨] 해당 월(${vMonthNorm})의 보컬 정산 내역이 이미 존재합니다.\n'보컬진행(추가수업)'을 추가하거나 수정할 수 없습니다.`
                    );
                    return;
                }
            } catch (err) {
                console.error('Save Blocking Check Failed:', err);
                alert('보컬 정산 상태를 확인하지 못했습니다. 저장을 중단합니다.');
                return;
            }
        }

        // [NEW] 월정산 마감(Lock) 여부 확인 (저장 시 최우선 차단)
        try {
            const sDateObj = new Date(saveDate);
            const lyStr = sDateObj.getFullYear();
            const lmStr = String(sDateObj.getMonth() + 1).padStart(2, '0');
            const lockDocRef = doc(db, 'settlement_memos', `${lyStr}-${lmStr}`);
            const lockSnap = await getDoc(lockDocRef);
            if (lockSnap.exists() && lockSnap.data().status === 'completed') {
                alert(`[${lyStr}년 ${lmStr}월]은 정산이 마감(완료)되어 스케줄을 저장할 수 없습니다.`);
                return;
            }
        } catch (e) {
            console.error('Save Lock Check Error', e);
            alert('정산 마감 여부를 확인하지 못했습니다. 저장을 중단합니다.');
            return;
        }

        // [New] 보컬 정산 완료 여부 체크 (기존 로직 유지)
        if (scheduleForm.studentId) {
            try {
                // 아티스트 카운트 증감은 트랜잭션 밖에서 미리 정한다(기존 스케쥴 상태 비교라 학생 문서와 무관).
                let countChange = 0;
                {
                    const newStatus = scheduleForm.status;
                    let oldStatus = ''; // 기존 상태
                    if (selectedSlot.id) {
                        const oldSchedule = schedules.find((s) => s.id === selectedSlot.id);
                        if (oldSchedule) oldStatus = oldSchedule.status;
                    }
                    if (newStatus === 'completed' && oldStatus !== 'completed') countChange = 1;
                    else if (newStatus !== 'completed' && oldStatus === 'completed') countChange = -1;
                }

                const deletedCount = await updateStudentTx(scheduleForm.studentId, (sData) => {
                    const patch = {};

                    // A. 아티스트 카운트
                    if (sData.isArtist && countChange !== 0) {
                        patch.count = String(parseInt(sData.count || '0') + countChange);
                    }

                    // B. [핵심 변경] 저장일(포함) 및 미래 미수금 삭제
                    let removed = 0;
                    if (sData.unpaidList && sData.unpaidList.length > 0) {
                        // [수정] <= 에서 < 로 변경 (당일 날짜도 삭제 대상에 포함)
                        // 저장하려는 날짜(saveDate)보다 "엄격하게 과거인 것"만 남김
                        const filteredUnpaidList = sData.unpaidList.filter((item) => item.targetDate < saveDate);

                        if (filteredUnpaidList.length !== sData.unpaidList.length) {
                            removed = sData.unpaidList.length - filteredUnpaidList.length;
                            patch.unpaidList = filteredUnpaidList;
                            patch.isPaid = filteredUnpaidList.length === 0;
                        }
                    }

                    return { patch, info: removed };
                });

                if (deletedCount > 0) {
                    alert(`[자동정리] 일정 변경으로 인해 ${saveDate}일 포함, 이후의 내역이 정리되었습니다.`);
                }
            } catch (err) {
                console.error('학생 정보 업데이트 실패:', err);
                alert('데이터 저장 중 오류가 발생했습니다.');
                return;
            }
        }

        // [NEW] V30 자동 감지 로직 (UI 토글 없음 해결)
        let finalVocalType = scheduleForm.vocalType;
        // 'vocal' 스케줄이고, 수강생이 선택되어 있으면 학생 정보를 조회하여 V30 여부 판단
        if (finalGridType === 'vocal' && scheduleForm.studentId) {
            // 1. students 배열에서 정보 찾기 (handleScheduleSave 내 접근 가능 가정)
            const targetStudent = students.find((s) => s.id === scheduleForm.studentId);
            if (targetStudent && targetStudent.firstDate) {
                // 2. 현재 주차의 config 가져오기
                const weekStartStr = formatDateLocal(getStartOfWeek(selectedSlot.date || scheduleDate)); // formatDateLocal 등 helper 필요
                const currentRotationWeek = getRotationWeek(targetStudent.firstDate, weekStartStr);
                const weekConfig = targetStudent.schedule && targetStudent.schedule[currentRotationWeek - 1];

                // 3. vocal30 할당량 확인 (vocal30 > 0 && vocal == 0 이면 30분으로 강제)
                if (weekConfig) {
                    const v30 = Number(weekConfig.vocal30 || 0);
                    const v60 = Number(weekConfig.vocal || 0);
                    if (v30 > 0 && v60 === 0) {
                        finalVocalType = '30';
                    }
                }
            }
        }

        // 2. 스케쥴 저장
        // 고정 반복 방식(recurrence)에 따라 저장 필드가 갈린다.
        //  - weekly       : dayOfWeek 사용 (기존 방식)
        //  - monthlyDate  : dayOfMonth 사용. 신규/이동은 클릭한 칸 날짜로, 편집이면 기존 값 유지
        //                   (말일로 당겨 표시된 칸을 편집할 때 지정일이 바뀌지 않도록)
        //  - monthlyLast  : 날짜 필드 불필요 (말일은 매달 계산)
        const recurrence = scheduleForm.isFixed ? scheduleForm.recurrence || 'weekly' : null;
        const clickedDayOfMonth = selectedSlot.date ? Number(selectedSlot.date.split('-')[2]) : null;
        const clickedMonthOfYear = selectedSlot.date ? Number(selectedSlot.date.split('-')[1]) : null;
        // monthlyDate·yearlyDate 는 '일'을 쓴다. 편집이면 기존 값 유지, 신규/이동은 클릭한 칸 날짜.
        const savedDayOfMonth =
            selectedSlot.id && scheduleForm.dayOfMonth ? Number(scheduleForm.dayOfMonth) : clickedDayOfMonth;
        const data = {
            time: timeToSave,
            ...scheduleForm,
            vocalType: finalVocalType, // [NEW] Use inferred vocal type
            gridType: finalGridType,
            date: scheduleForm.isFixed ? 'FIXED' : selectedSlot.date,
            recurrence,
            dayOfWeek: recurrence === 'weekly' ? selectedSlot.dayOfWeek : null,
            dayOfMonth:
                recurrence === 'monthlyDate' || recurrence === 'yearlyDate' ? savedDayOfMonth : null,
            // 매년 반복은 '월'도 필요하다. 편집이면 기존 값 유지, 아니면 클릭한 칸의 월.
            monthOfYear:
                recurrence === 'yearlyDate'
                    ? selectedSlot.id && scheduleForm.monthOfYear
                        ? Number(scheduleForm.monthOfYear)
                        : clickedMonthOfYear
                    : null,
            fixedStartDate: scheduleForm.isFixed ? selectedSlot.date || formatDateLocal(new Date()) : null,
            relatedScheduleId: selectedMakeupId || null,
        };

        if (scheduleTab === 'personal') {
            data.studentId = '';
            data.studentName = '';
        }

        // [NEW] 당겨오기: 다음 회차를 이번 주로 앞당겨 진행하는 수업.
        // memo 를 '당겨오기'로 두면 로테이션 사용량 계산에서 '추가'/'보강'처럼
        // 제외되지 않아 정규 1회로 세어진다(원하는 동작). 본수업 학생 선택 위에
        // 알림으로 띄우기 위해 broughtForward 플래그도 남긴다.
        if (scheduleTab === 'lesson' && data.studentId && scheduleForm.broughtForward) {
            data.memo = '당겨오기';
            data.broughtForward = true;
            data.bfAcknowledged = false;
        } else {
            data.broughtForward = false;
        }

        // [NEW] 본수업 우선 규칙
        // '추가수업'으로 잡으려는데 이 학생의 이번 주 본수업(정규 로테이션 수업)이
        // 아직 배정 안 됐으면, 추가수업이 아니라 본수업으로 등록한다.
        // 본수업 미배정 = generateAvailableStudents 목록에 이 학생의 정규 슬롯이
        // 남아있는 것(추가수업/보강은 그 계산에서 제외되므로 남아있게 된다).
        // 추가수업 드롭다운 오선택, '추가수업' 메모가 붙은 고스트 확정 둘 다 여기서 잡힌다.
        if (scheduleTab === 'lesson' && data.studentId && typeof data.memo === 'string' && data.memo.includes('추가')) {
            const candidates = generateAvailableStudents(saveDate, null, finalGridType);
            // 정규 슬롯만(30분 짝맞추기 '(30분)' 항목은 제외) 본수업 미배정으로 본다.
            const mainUnassigned = candidates.some((o) => o.id === data.studentId && !String(o.name).includes('(30분'));
            if (mainUnassigned) {
                data.memo = '';
                data.isVocalProgress = false;
                alert(`${data.studentName} 학생의 이번 주 본수업이 아직 없어, 추가수업이 아닌 본수업으로 등록합니다.`);
            }
        }

        try {
            if (selectedSlot.id) {
                await updateDoc(doc(db, 'schedules', selectedSlot.id), data);
            } else {
                await addDoc(collection(db, 'schedules'), data);
            }
        } catch (error) {
            console.error('스케쥴 저장 에러:', error);
            alert('스케쥴 저장에 실패했습니다.');
            return;
        }

        // 3. 보강 처리
        if (selectedMakeupId) {
            try {
                await updateDoc(doc(db, 'schedules', selectedMakeupId), { status: 'reschedule_assigned' });
                setHistorySchedules((prev) =>
                    prev.map((h) => (h.id === selectedMakeupId ? { ...h, status: 'reschedule_assigned' } : h))
                );
            } catch (e) {
                console.error('보강 상태 업데이트 실패', e);
            }
        }

        // 4. 후처리
        if (scheduleForm.studentId) {
            await updateStudentLastDate(scheduleForm.studentId);
            fetchSettlementData();
        }

        setIsScheduleModalOpen(false);
    };

    // [수정] 스케쥴 삭제 함수 (월정산 청구 내역 삭제 로직 추가)
    const handleScheduleDelete = async () => {
        if (isWeekLocked || isScheduleLocked) return;
        if (
            !selectedSlot.id ||
            !window.confirm('일정을 삭제하시겠습니까?\n(관련된 미수금/월정산 청구 내역도 함께 정리됩니다.)')
        )
            return;

        try {
            const scheduleRef = doc(db, 'schedules', selectedSlot.id);
            const scheduleSnap = await getDoc(scheduleRef);

            if (!scheduleSnap.exists()) {
                alert('이미 삭제된 일정입니다.');
                setIsScheduleModalOpen(false);
                return;
            }
            const scheduleData = scheduleSnap.data();

            if (scheduleData.studentId) {
                // 삭제하려는 일정의 년.월 계산 (예: "2025.11")
                const d = new Date(scheduleData.date);
                const targetYM = `${d.getFullYear()}.${d.getMonth() + 1}`;
                const monthlyMemo = `${targetYM}월 월정산 청구`;

                const removed = await updateStudentTx(scheduleData.studentId, (sData) => {
                    const patch = {};
                    let removedCount = 0;

                    if (sData.unpaidList && sData.unpaidList.length > 0) {
                        const beforeCount = sData.unpaidList.length;

                        // [필터 로직 보강]
                        // 1. 삭제일 포함 미래 날짜의 미수금 제거 (targetDate < deletedDate 가 아닌 것들)
                        // 2. 삭제하는 일정이 속한 달의 '월정산 청구' 내역 제거 (memo 비교)
                        const filteredList = sData.unpaidList.filter((item) => {
                            const isFutureOrToday = item.targetDate >= scheduleData.date;
                            const isThisMonthSettlement = item.memo === monthlyMemo;

                            // 미래 내역이 아니고, 이번 달 월정산 내역도 아닌 것만 남김
                            return !isFutureOrToday && !isThisMonthSettlement;
                        });

                        if (filteredList.length !== beforeCount) {
                            patch.unpaidList = filteredList;
                            patch.isPaid = filteredList.length === 0;
                            removedCount = beforeCount - filteredList.length;
                        }
                    }

                    // 아티스트 카운트 복구
                    if (sData.isArtist && scheduleData.status === 'completed') {
                        const currentCount = parseInt(sData.count || '0');
                        patch.count = String(Math.max(0, currentCount - 1));
                    }

                    return { patch, info: removedCount };
                });

                if (removed > 0) {
                    alert(`[자동정리] 일정 삭제로 인해 관련 미수금/월정산 내역 ${removed}건이 삭제되었습니다.`);
                }
            }

            // 스케쥴 삭제 및 후처리
            await deleteDoc(scheduleRef);

            // 보강 상태 복구 로직 (생략 - 기존과 동일)
            let targetId = scheduleData.relatedScheduleId;
            if (!targetId && scheduleData.memo && scheduleData.memo.startsWith('보강(')) {
                const match = scheduleData.memo.match(/보강\(([^)]+)\)/);
                if (match) {
                    const originalDate = match[1];
                    const q = query(
                        collection(db, 'schedules'),
                        where('studentId', '==', scheduleData.studentId),
                        where('date', '==', originalDate),
                        where('status', '==', 'reschedule_assigned')
                    );
                    const snap = await getDocs(q);
                    if (!snap.empty) targetId = snap.docs[0].id;
                }
            }
            if (targetId) {
                await updateDoc(doc(db, 'schedules', targetId), { status: 'reschedule' });
                setHistorySchedules((prev) =>
                    prev.map((h) => (h.id === targetId ? { ...h, status: 'reschedule' } : h))
                );
            }

            if (scheduleData.studentId) {
                await updateStudentLastDate(scheduleData.studentId);
                fetchSettlementData();
            }

            setIsScheduleModalOpen(false);
        } catch (error) {
            console.error('삭제 중 오류:', error);
            alert('삭제 처리에 실패했습니다.');
        }
    };

    // [NEW] 일정 이동(보류 -> 이동) 처리 함수
    const handleMoveSchedule = async () => {
        if (isWeekLocked || isScheduleLocked) return;

        // A. Ghost Schedule (ID 없음) -> 그냥 새로 생성 (기존 handleScheduleSave 사용)
        if (movingSchedule && !movingSchedule.id) {
            handleScheduleSave();
            setMovingSchedule(null);
            return;
        }

        // B. Real Schedule (ID 있음) -> Update Doc
        try {
            const scheduleRef = doc(db, 'schedules', movingSchedule.id);

            const timeToSave = `${selectedSlot.time}:${selectedMinute}`;
            const saveDate = selectedSlot.date; // New Date

            // [New] 보컬 정산 완료 여부 체크 (이동 시에도 체크)
            const isTargetVocal = selectedSlot.gridType === 'vocal' || movingSchedule.gridType === 'vocal';
            if (isTargetVocal) {
                const targetDateObj = new Date(saveDate);
                const targetMonthPrefix = `${targetDateObj.getFullYear()}-${String(targetDateObj.getMonth() + 1).padStart(2, '0')}`;
                const wagePaid = expenses.some(
                    (e) => e.category === '임금' && e.isVocalWage && e.targetMonth === targetMonthPrefix && e.paidDate
                );
                if (wagePaid) {
                    alert('해당 월의 보컬 정산(지급)이 완료되어 일정을 이동할 수 없습니다.');
                    return;
                }
            }

            const updates = {
                ...scheduleForm,
                date: saveDate,
                time: timeToSave,
                dayOfWeek: selectedSlot.dayOfWeek,
                relatedScheduleId: selectedMakeupId || null,
            };

            if (scheduleForm.studentId) {
                let countChange = 0;
                {
                    const newStatus = scheduleForm.status;
                    const oldStatus = movingSchedule.status;
                    if (newStatus === 'completed' && oldStatus !== 'completed') countChange = 1;
                    else if (newStatus !== 'completed' && oldStatus === 'completed') countChange = -1;
                }

                const cleaned = await updateStudentTx(scheduleForm.studentId, (sData) => {
                    const patch = {};

                    // 1. 아티스트 카운트 조정
                    if (sData.isArtist && countChange !== 0) {
                        patch.count = String(parseInt(sData.count || '0') + countChange);
                    }

                    // 2. 미수금/청구 내역 정리
                    let didClean = false;
                    if (sData.unpaidList && sData.unpaidList.length > 0) {
                        const filteredUnpaidList = sData.unpaidList.filter((item) => item.targetDate < saveDate);
                        if (filteredUnpaidList.length !== sData.unpaidList.length) {
                            patch.unpaidList = filteredUnpaidList;
                            patch.isPaid = filteredUnpaidList.length === 0;
                            didClean = true;
                        }
                    }

                    return { patch, info: didClean };
                });

                if (cleaned) {
                    alert(`[자동정리] 일정 이동으로 인해 ${saveDate}일 포함, 이후의 청구 내역이 정리되었습니다.`);
                }
            }

            await updateDoc(scheduleRef, updates);

            // 후처리
            if (scheduleForm.studentId) {
                if (typeof updateStudentLastDate === 'function') {
                    await updateStudentLastDate(scheduleForm.studentId);
                }
                fetchSettlementData();
            }

            setMovingSchedule(null);
            setIsScheduleModalOpen(false);
        } catch (e) {
            console.error('이동 저장 실패', e);
            alert('일정 이동 처리에 실패했습니다: ' + e.message);
        }
    };

    // [NEW] 고정 스케줄 '이번 주만 취소' 핸들러
    const handleCancelFixedOneTime = async () => {
        if (!window.confirm('이번 주만 스케줄을 취소하시겠습니까?\n(다음 주부터는 정상 표시됩니다.)')) return;

        try {
            await addDoc(collection(db, 'schedule_cancellations'), {
                date: selectedSlot.date, // 클릭한 날짜
                time: `${selectedSlot.time}:${selectedMinute}`,
                studentId: scheduleForm.studentId,
                createdAt: new Date().toISOString(),
            });
            setIsScheduleModalOpen(false);
        } catch (e) {
            console.error('Cancel Error:', e);
            alert('취소 처리 중 오류가 발생했습니다.');
        }
    };

    // [NEW] 고정 스케줄 '멈춤' (종료일 설정) 핸들러
    const handleStopFixedSchedule = async () => {
        if (!selectedSlot.id) return;

        // 클릭한 날짜의 하루 전날을 종료일로 설정하여 오늘부터 안 보이게 함
        const selectedDate = new Date(selectedSlot.date);
        selectedDate.setDate(selectedDate.getDate() - 1);
        const stopDateStr = formatDateLocal(selectedDate);

        if (
            !window.confirm(
                `이 고정 스케쥴을 ${selectedSlot.date}부터 중단하시겠습니까?\n(${stopDateStr}일자 기록까지만 보존되고 이후로는 사라집니다.)`
            )
        )
            return;

        try {
            await updateDoc(doc(db, 'schedules', selectedSlot.id), {
                fixedEndDate: stopDateStr,
            });
            alert('해당 고정 스케쥴이 성공적으로 중단되었습니다.');
            setIsScheduleModalOpen(false);
        } catch (e) {
            console.error('고정 스케쥴 중단 에러:', e);
            alert('중단 처리 중 오류가 발생했습니다.');
        }
    };
    const handleToggleWeekLock = async () => {
        const startStr = formatDateLocal(getStartOfWeek(scheduleDate));
        const newStatus = !isWeekLocked;

        if (newStatus && !window.confirm('이번 주 스케쥴을 최종 마감하시겠습니까?\n마감 후에는 수정이 불가능합니다.'))
            return;
        if (!newStatus && !window.confirm('마감을 해제하시겠습니까?')) return;

        // 마감할 때는 데이터 스냅샷을 클라우드에 백업한다(안전장치).
        // 단, 최근(24시간 이내)에 백업한 적이 있으면 백업은 건너뛰고 마감만 한다.
        // (마감을 풀었다 다시 누를 때 같은 데이터가 두 번 쌓이는 걸 막기 위함.
        //  백업 1회 = 4,600여 읽기라 무료 한도도 아낀다)
        let skipBackup = false;
        if (newStatus) {
            let last = null;
            try {
                last = await getLastBackup(db);
            } catch (e) {
                // 조회 실패는 안전장치일 뿐이라, 그냥 백업을 진행한다.
                console.error('최근 백업 조회 실패', e);
            }

            if (isWithin24h(last?.at)) {
                skipBackup = true;
                const when = formatWhen(last.at);
                alert(
                    `마지막 백업: ${when}${last.reason ? ` (${last.reason})` : ''}\n` +
                        `${last.docCount ? `${last.docCount.toLocaleString()}건 저장됨\n` : ''}` +
                        `\n최근에 이미 백업했습니다.\n이번에는 백업 없이 마감만 진행합니다.`
                );
            }
        }

        await setDoc(doc(db, 'weekly_locks', startStr), { locked: newStatus }, { merge: true });
        setIsWeekLocked(newStatus);

        // 마감을 막지 않도록 백업은 배경에서 진행하고, 끝나면 결과만 알린다.
        if (newStatus && !skipBackup) {
            backupToFirestore(db, '주간마감')
                .then(({ count }) => alert(`백업 완료 (${count}건 저장됨).`))
                .catch((e) => {
                    console.error('데이터 백업 실패', e);
                    alert('주간 마감은 완료되었습니다.\n다만 데이터 백업에 실패했습니다(데이터에는 이상 없음).');
                });
        }
    };

    const handleNextDueDateChange = async (sid, date) =>
        updateDoc(doc(db, 'students', sid), { nextDueDate: date, isPaid: false });
    const handleAddUnpaid = async (s) => {
        const d = tempDates[s.id];
        if (!d) return alert('날짜선택');
        const item = {
            id: Date.now().toString(),
            targetDate: d,
            amount: calculateTotalAmount(s),
            createdAt: new Date().toISOString(),
        };
        // 화면에 그려질 때의 s.unpaidList 가 아니라 트랜잭션 안에서 최신 목록을 읽어 덧붙인다.
        await updateStudentTx(s.id, (sData) => {
            const list = [...(sData.unpaidList || []), item].sort(
                (a, b) => new Date(a.targetDate) - new Date(b.targetDate)
            );
            return { patch: { unpaidList: list, isPaid: false } };
        });
        await updateStudentLastDate(s.id);
        setTempDates({ ...tempDates, [s.id]: '' });
        fetchSettlementData();
    };
    const handleDeleteUnpaid = async (s, id) => {
        if (!window.confirm('삭제?')) return;
        await updateStudentTx(s.id, (sData) => {
            const list = (sData.unpaidList || []).filter((i) => i.id !== id);
            return { patch: { unpaidList: list, isPaid: list.length === 0 } };
        });
        await updateStudentLastDate(s.id);
        if (selectedUnpaidId === id) {
            setSelectedUnpaidId(null);
            resetPaymentForm(calculateTotalAmount(s));
        }
        fetchSettlementData();
    };

    // ── 누적 입금(부분결제 임시 보관) ────────────────────────────────
    // 한 사이클 금액을 한 번에 못 내는 학생이 20만·100만씩 나눠 낼 때, 받은 만큼
    // 여기에 쌓아둔다. 순수 메모라 매출·정산·회차·로테이션에는 전혀 잡히지 않는다.
    // 모여서 한 사이클이 되면 원장이 평소처럼 '결제 처리'를 하고, 이 내역은 '비우기'로 지운다.
    // 저장 위치: 학생 문서의 depositList = [{ id, amount, date, memo }]
    const handleAddDeposit = async (s) => {
        const t = tempDeposit[s.id] || {};
        const amount = Number(t.amount);
        if (!amount || amount <= 0) return alert('입금 금액을 입력해주세요.');
        const item = {
            id: Date.now().toString(),
            amount,
            date: t.date || formatDateLocal(new Date()),
            memo: (t.memo || '').trim(),
        };
        await updateStudentTx(s.id, (sData) => {
            const list = [...(sData.depositList || []), item].sort((a, b) => (a.date < b.date ? -1 : 1));
            return { patch: { depositList: list } };
        });
        // 입력칸은 비우되 날짜는 오늘로 되돌린다
        setTempDeposit((prev) => ({ ...prev, [s.id]: { amount: '', date: formatDateLocal(new Date()), memo: '' } }));
    };

    const handleDeleteDeposit = async (s, id) => {
        // 추가결제로 자동 적립된 항목이면, 짝인 결제 기록의 배지(extraAmount)도 0으로 지운다.
        const target = (s.depositList || []).find((i) => i.id === id);
        if (target?.sourcePaymentId) {
            try {
                await updateDoc(doc(db, 'students', s.id, 'payments', target.sourcePaymentId), { extraAmount: 0 });
            } catch (e) {
                console.error('연결된 결제 배지 정리 실패', e);
            }
        }
        await updateStudentTx(s.id, (sData) => {
            const list = (sData.depositList || []).filter((i) => i.id !== id);
            return { patch: { depositList: list } };
        });
    };

    const handleClearDeposits = async (s) => {
        const total = (s.depositList || []).reduce((acc, i) => acc + Number(i.amount || 0), 0);
        if (
            !window.confirm(
                `누적 입금 내역을 모두 비웁니다.\n(누적 ${total.toLocaleString()}원 · 결제 처리와는 별개입니다)`
            )
        )
            return;
        await updateStudentTx(s.id, () => ({ patch: { depositList: [] } }));
    };
    const handlePaymentSave = async (s) => {
        if (!paymentForm.amount) return alert('금액을 입력해주세요.');
        if (!window.confirm('결제를 처리하시겠습니까?')) return;

        // TODO: 디버깅용 Alert
        // alert(`결제 시작: ${!!paymentFile ? '사진있음' : '사진없음'}`);

        try {
            let url = paymentForm.imageUrl || '';
            if (paymentFile) {
                try {
                    // alert("이미지 압축 시작...");
                    const dataUrl = await compressImage(paymentFile);
                    // alert("이미지 압축 완료! 길이: " + dataUrl.length);

                    if (dataUrl.length > 900000) {
                        // 900KB Checks
                        if (!window.confirm('이미지 용량이 큽니다. 그래도 저장하시겠습니까? (실패 가능성 있음)'))
                            return;
                    }
                    url = dataUrl;
                } catch (imgError) {
                    console.error('이미지 압축 실패:', imgError);
                    alert('이미지 처리 실패: ' + imgError.message);
                    return;
                }
            }
            // 추가결제(초과분)는 숫자로 정규화해 결제 문서에 남긴다(전체 내역 배지용).
            const extra = Number(paymentForm.extraAmount) || 0;
            const data = {
                ...paymentForm,
                extraAmount: extra,
                paymentMethod: paymentForm.method,
                imageUrl: url,
                createdAt: new Date(),
            };
            delete data.method;
            delete data.id;

            // alert("DB 저장 시도...");
            let newPaymentId = null;
            if (paymentForm.id) await updateDoc(doc(db, 'students', s.id, 'payments', paymentForm.id), data);
            else {
                const ref = await addDoc(collection(db, 'students', s.id, 'payments'), data);
                newPaymentId = ref.id;
            }
            // alert("DB 저장 완료");

            if (!paymentForm.id) {
                // 최신 문서를 트랜잭션 안에서 다시 읽는다.
                // 예전에는 화면에 그려질 때의 s.unpaidList / s.count 를 기준으로 덮어써서,
                // 저장 연타나 다른 창에서의 동시 작업 시 미수금·회차가 유실될 수 있었다.
                // 추가결제가 있으면 같은 트랜잭션에서 누적 입금(depositList)으로 적립한다.
                // (신규 결제일 때만. 수정 시에는 중복 적립을 막으려 건드리지 않는다)
                await updateStudentTx(s.id, (sData) => {
                    let list = sData.unpaidList || [];
                    if (selectedUnpaidId) list = list.filter((i) => i.id !== selectedUnpaidId);
                    const newCount = parseInt(sData.count || '0', 10) + 1;
                    const patch = {
                        unpaidList: list,
                        isPaid: list.length === 0,
                        count: newCount,
                    };
                    if (extra > 0) {
                        const deposit = {
                            id: `${Date.now()}-extra`,
                            amount: extra,
                            date: paymentForm.paymentDate || formatDateLocal(new Date()),
                            memo: '추가결제',
                            // 이 결제에서 자동 적립됐음을 표시 → 결제/누적 어느 쪽을 지워도 짝을 같이 지운다
                            sourcePaymentId: newPaymentId,
                        };
                        patch.depositList = [...(sData.depositList || []), deposit].sort((a, b) =>
                            a.date < b.date ? -1 : 1
                        );
                    }
                    return { patch };
                });
            }
            await updateStudentLastDate(s.id);
            invalidatePaymentsCache();
            fetchSettlementData();
            alert('결제 처리가 완료되었습니다.');
            resetPaymentForm(calculateTotalAmount(s));
        } catch (e) {
            console.error(e);
            alert('결제 처리에 실패했습니다: ' + e.message);
        }
    };

    const handleRetroactivePhotoUpload = async (sid, pid, f) => {
        if (!f) return;

        try {
            alert(
                '서버 연결 문제 우회를 위해, 사진을 압축하여 데이터베이스에 직접 저장합니다. 확인을 누르고 잠시만 기다려주세요.'
            );

            const dataUrl = await compressImage(f);

            // Firestore 문서 제한(1MB) 체크
            if (dataUrl.length > 1000000) {
                throw new Error('이미지 용량이 너무 큽니다. 더 작은 사진을 사용해주세요.');
            }

            await updateDoc(doc(db, 'students', sid, 'payments', pid), { imageUrl: dataUrl });

            alert('성공적으로 저장되었습니다!');
            invalidatePaymentsCache();
            setTimeout(() => fetchSettlementData(), 500);
        } catch (e) {
            console.error(e);
            alert('저장 실패: ' + e.message);
        }
    };

    const handleDeleteRetroactivePhoto = async () => {
        if (!previewImage || !previewImage.sid || !previewImage.pid) return;
        if (!window.confirm('정말로 사진을 삭제하시겠습니까?')) return;

        try {
            await updateDoc(doc(db, 'students', previewImage.sid, 'payments', previewImage.pid), { imageUrl: null });
            alert('사진이 삭제되었습니다.');
            setPreviewImage(null);
            invalidatePaymentsCache();
            setTimeout(() => fetchSettlementData(), 500);
        } catch (e) {
            console.error(e);
            alert('삭제 실패: ' + e.message);
        }
    };

    // 닫는 중괄호 확인 (이전 코드에 맞추어)
    const handleDeletePayment = async (sid, pid) => {
        if (window.confirm('삭제하시겠습니까?')) {
            await deleteDoc(doc(db, 'students', sid, 'payments', pid));
            // 이 결제에서 자동 적립된 누적 입금 항목이 있으면 같이 지운다.
            await updateStudentTx(sid, (sData) => {
                const list = sData.depositList || [];
                const next = list.filter((i) => i.sourcePaymentId !== pid);
                return next.length === list.length ? { patch: {} } : { patch: { depositList: next } };
            });
            await updateStudentLastDate(sid);
            invalidatePaymentsCache();
            setTimeout(() => fetchSettlementData(), 500);
        }
    };
    const handleUnpaidChipClick = (s, i) => {
        setSelectedUnpaidId(i.id);
        setPaymentForm((p) => ({
            ...p,
            id: null,
            targetDate: i.targetDate,
            amount: i.amount,
            paymentDate: formatDateLocal(new Date()),
        }));
        document.getElementById('payment-form-area')?.scrollIntoView({ behavior: 'smooth' });
    };
    const resetPaymentForm = (amt = '') => {
        setPaymentForm({ ...initialPaymentForm, amount: amt, targetDate: formatDateLocal(new Date()) });
        setPaymentFile(null);
        setSelectedUnpaidId(null);
    };
    const handlePaymentFormChange = (e) => setPaymentForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    const handleEditHistoryClick = (p) => {
        setPaymentForm({ ...p, method: p.paymentMethod, receiptMemo: p.receiptMemo || '', extraAmount: p.extraAmount || '' });
        setPaymentFile(null);
        document.getElementById('payment-form-area')?.scrollIntoView({ behavior: 'smooth' });
    };
    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    const handlePhoneChange = (e) => {
        const v = e.target.value.replace(/[^0-9]/g, '');
        let f = v;
        if (v.length > 3 && v.length <= 7) f = `${v.slice(0, 3)}-${v.slice(3)}`;
        else if (v.length > 7) f = `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7, 11)}`;
        setFormData({ ...formData, phone: f });
    };
    const handleRateChange = (f, v) => {
        const r = v.replace(/,/g, '');
        if (!isNaN(r)) setFormData({ ...formData, rates: { ...formData.rates, [f]: r } });
    };
    const handleSubmit = async () => {
        if (!formData.name) return alert('이름을 입력해주세요.');
        if (!formData.firstDate) return alert('등록일을 입력해주세요.');

        // 로테이션 변경 이력 정리 + '현재 설정'(최신 구간) 도출.
        // 구간이 2개 이상이면 각 구간에 적용일이 있어야 하고, 적용일 순으로 정렬한다.
        const rawPeriods = Array.isArray(formData.scheduleHistory) ? formData.scheduleHistory : [];
        let normHistory = rawPeriods;
        if (rawPeriods.length >= 2) {
            if (rawPeriods.some((p) => !p.from)) return alert('로테이션 변경 이력의 각 구간에 "적용일"을 입력해주세요.');
            const froms = rawPeriods.map((p) => p.from);
            if (new Set(froms).size !== froms.length) return alert('로테이션 변경 이력의 적용일이 겹칩니다.');
            normHistory = [...rawPeriods].sort((a, b) => (a.from < b.from ? -1 : 1));
        }
        const effSchedule =
            normHistory.length && normHistory[normHistory.length - 1].schedule
                ? normHistory[normHistory.length - 1].schedule
                : formData.schedule;
        // 아래 저장 로직들은 이 정리된 값을 기준으로 한다(현재 설정 = 최신 구간).
        const formData2 = { ...formData, schedule: effSchedule, scheduleHistory: normHistory };

        try {
            if (editingId) {
                // [수정]
                //
                // 사용자가 실제로 바꾼 필드만 쓴다.
                //
                // 예전에는 formData 를 통째로 updateDoc 했다. 그런데 모달을 열 때
                // 학생 문서 전체(unpaidList, count, lastDate, isPaid, hasPayment ...)를
                // 폼 상태로 복사해두기 때문에, 저장하는 순간 그 낡은 값들이 다시 쓰였다.
                // 모달을 열어둔 사이에 결제가 처리되면 전화번호만 고치고 저장해도
                // 미수금이 되살아나고 회차가 되돌아갔다.
                //
                // 편집 대상 필드만 추린 뒤, 그중에서도 모달을 열 때와 값이 달라진
                // 것만 보낸다. 특히 '등록 회차(count)'는 폼에서도 고칠 수 있고 결제
                // 처리로도 올라가기 때문에, 손대지 않았다면 건드리지 말아야 한다.
                const EDITABLE = [
                    'name',
                    'phone',
                    'isMonthly',
                    'isArtist',
                    'firstDate',
                    'count',
                    'schedule',
                    'scheduleHistory',
                    'rates',
                    'memo',
                    'cashReceiptMemo',
                    'clientName',
                    'clientBizNo',
                ];
                const patch = {};
                for (const k of EDITABLE) {
                    const now = formData2[k];
                    const was = editingOriginal ? editingOriginal[k] : undefined;
                    if (JSON.stringify(now) !== JSON.stringify(was)) patch[k] = now;
                }

                // 시작일이 바뀌었으면 최초 등록금 미수금도 옮길지 먼저 물어본다.
                // (트랜잭션은 충돌 시 재시도되므로 그 안에서 confirm 을 띄우면 안 된다)
                const beforeSnap = await getDoc(doc(db, 'students', editingId));
                const oldFirstDate = beforeSnap.exists() ? beforeSnap.data().firstDate : null;
                const firstDateChanged = oldFirstDate && oldFirstDate !== formData.firstDate;
                const moveInitialUnpaid =
                    firstDateChanged &&
                    window.confirm('수강 시작일이 변경되었습니다.\n최초 미수금 내역의 날짜도 함께 변경하시겠습니까?');

                const newAmount = calculateTotalAmount(formData2); // 현재 단가 등 기준 재계산
                const movedUnpaidId = Date.now().toString();

                const moved = await updateStudentTx(editingId, (sData) => {
                    if (!moveInitialUnpaid) return { patch };

                    // 미수금 목록은 트랜잭션 안에서 읽은 최신 값을 기준으로 고친다.
                    let list = [...(sData.unpaidList || [])];

                    // 1. 기존 날짜의 '최초 등록금' 내역 삭제
                    list = list.filter((item) => !(item.targetDate === sData.firstDate && item.memo === '최초 등록금'));

                    // 2. 새로운 날짜로 내역 생성
                    list.push({
                        id: movedUnpaidId,
                        targetDate: formData.firstDate,
                        amount: newAmount,
                        createdAt: new Date().toISOString(),
                        memo: '최초 등록금',
                    });

                    list.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));

                    return {
                        patch: { ...patch, unpaidList: list, isPaid: false },
                        info: true,
                    };
                });

                if (moved) alert('최초 미수금 내역이 갱신되었습니다.');
            } else {
                // [신규 등록]
                const amt = calculateTotalAmount(formData2);

                // [NEW] 최초 등록 시 미수금 내역 자동 생성
                const initialUnpaid = {
                    id: Date.now().toString(),
                    targetDate: formData.firstDate, // 등록일 기준
                    amount: amt,
                    createdAt: new Date().toISOString(),
                    memo: '최초 등록금', // 명시적 메모 추가
                };

                const newStudentData = {
                    ...formData2,
                    lastDate: formData2.firstDate,
                    isActive: true,
                    isPaid: false,
                    unpaidList: [initialUnpaid], // 리스트에 추가
                    createdAt: new Date(),
                };

                await addDoc(collection(db, 'students'), newStudentData);
            }

            fetchSettlementData(); // 데이터 갱신

            // 로테이션 변경 이력이 있는 학생을 '수정' 저장한 경우엔 팝업을 닫지 않고
            // 그 자리서 반영을 확인할 수 있게 한다(다시 열어 확인하는 번거로움 제거).
            const keepOpen = editingId && Array.isArray(normHistory) && normHistory.length >= 2;
            if (keepOpen) {
                // 저장된 값(정리된 이력)을 폼과 비교기준에 반영해 두어야 이후 수정 비교가 맞는다.
                setFormData(formData2);
                setEditingOriginal(formData2);
                setStudentSaveNotice('저장되었습니다. 아래에서 변경 이력을 확인하세요. (계속 수정하거나 닫아도 됩니다)');
            } else {
                closeModal();
            }
        } catch (e) {
            console.error(e);
            alert('저장 중 오류가 발생했습니다: ' + e.message);
        }
    };
    const handleDelete = async (id, n) => {
        if (window.confirm('삭제?')) await deleteDoc(doc(db, 'students', id));
    };
    const toggleStatus = async (s) => await updateDoc(doc(db, 'students', s.id), { isActive: !s.isActive });
    const handleEditClick = (s) => {
        setEditingId(s.id);
        const sch = (s.schedule || initialFormState.schedule).map((w) => ({ ...w, vocal30: w.vocal30 || '' }));
        // 로테이션 변경 이력: 있으면 그대로, 없으면 현재 설정 하나(등록일부터)로 시작.
        const history =
            Array.isArray(s.scheduleHistory) && s.scheduleHistory.length
                ? s.scheduleHistory.map((h) => ({
                      from: h.from || '',
                      schedule: (h.schedule || []).map((w) => ({
                          master: w?.master ?? '',
                          vocal: w?.vocal ?? '',
                          vocal30: w?.vocal30 ?? '',
                      })),
                  }))
                : [
                      {
                          from: s.firstDate || '',
                          schedule: sch.map((w) => ({
                              master: w.master ?? '',
                              vocal: w.vocal ?? '',
                              vocal30: w.vocal30 ?? '',
                          })),
                      },
                  ];
        const filled = {
            ...initialFormState,
            ...s,
            schedule: sch,
            scheduleHistory: history,
            rates: s.rates || initialFormState.rates,
        };
        setFormData(filled);
        setEditingOriginal(filled); // 저장 시 변경 여부 비교용
        setIsModalOpen(true);
    };
    const closeModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setEditingOriginal(null);
        setFormData(initialFormState);
        setStudentSaveNotice('');
    };

    // --- [NEW] 재등록 예정일 자동 등록 핸들러 (학생 이름 포함 수정) ---
    const handleRegisterRotation = async (student, targetDateStr) => {
        // [수정] 메시지에 student.name 추가
        if (!window.confirm(`[${student.name}] 학생을 ${targetDateStr} 일자로 재등록(미수금) 생성하시겠습니까?`))
            return;

        try {
            const amount = calculateTotalAmount(student);
            const newItem = {
                id: Date.now().toString(),
                targetDate: targetDateStr,
                amount: amount,
                createdAt: new Date().toISOString(),
            };

            await updateStudentTx(student.id, (sData) => {
                const list = [...(sData.unpaidList || []), newItem].sort(
                    (a, b) => new Date(a.targetDate) - new Date(b.targetDate)
                );
                return { patch: { unpaidList: list, isPaid: false } };
            });
            await updateStudentLastDate(student.id);
            fetchSettlementData();
            alert('재등록(미수금) 처리가 완료되었습니다.');
        } catch (e) {
            console.error(e);
            alert('처리 중 오류가 발생했습니다.');
        }
    };

    // 완료·결석 수업을 학생별로 한 번만 묶어둔다. (스케쥴이 바뀔 때만 다시 만든다)
    const attSchedulesByStudent = useMemo(() => {
        const m = new Map();
        for (const s of attSchedules) {
            if (s.status !== 'completed' && s.status !== 'absent') continue;
            const arr = m.get(s.studentId);
            if (arr) arr.push(s);
            else m.set(s.studentId, [s]);
        }
        return m;
    }, [attSchedules]);

    // 학생별 로테이션 시작일을 미리 계산해 둔다.
    // 학생 목록이나 스케쥴이 실제로 바뀔 때만 돌기 때문에, 검색어를 치거나 다른 곳을
    // 눌러 화면이 다시 그려지는 것만으로는 재계산되지 않는다.
    const rotationStartsCache = useMemo(() => {
        const m = new Map();
        for (const st of students) m.set(st.id, rotationStartsFor(st, attSchedulesByStudent));
        return m;
    }, [students, attSchedulesByStudent]);

    // 학생별 로테이션 시작일 (M/V 중 '먼저' 시작하는 수업 기준)
    // 목록에 없는 학생(예: 방금 지운 학생)이 들어와도 안전하도록 그때만 직접 계산한다.
    const calculateRotationStarts = (student) => {
        if (!student) return new Set();
        return rotationStartsCache.get(student.id) ?? rotationStartsFor(student, attSchedulesByStudent);
    };

    // 로테이션 정보 계산 (시각화용, M/V 독립 카운트 방식)
    // targetSched: 대상 수업 객체(예전엔 id만 받았으나, pending 대상도 포함하려면 객체가 편하다).
    // [성능] 전체 attSchedules 를 매번 훑지 않고, 미리 학생별로 묶어둔 완료/결석 인덱스
    //        (attSchedulesByStudent)를 쓴다. 대상이 완료/결석이 아니면(그 인덱스에 없음) 직접 더한다.
    //        결과는 기존 로직(studentId + 버퍼일 + (완료|결석|대상))과 동일하다.
    const getScheduleRotationInfo = (student, targetSched) => {
        if (!student || !targetSched) return { index: -1, label: '' };
        const targetSchedId = targetSched.id;

        const bufferDateStr = rotationBufferDate(student.firstDate, formatDateLocal);
        const base = attSchedulesByStudent.get(student.id) || []; // 그 학생의 완료/결석 수업만
        let list = base.filter((s) => s.date >= bufferDateStr);
        if (targetSched.date >= bufferDateStr && !list.some((s) => s.id === targetSchedId)) {
            list = [...list, targetSched];
        }

        return getRotationInfo(sortByDateTime(list), targetSchedId, student);
    };

    // --- [기간제 출석 토글 핸들러] ---
    const handlePeriodAttendanceToggle = async (studentId, dateStr, type, index) => {
        // 잠금 상태면 수정 불가
        if (isAttendanceLocked) return;

        // Key에 type과 index를 추가하여 중복 방지
        const key = `${studentId}_${dateStr}_${type}_${index}`;
        const existing = periodAttendance[key];

        let nextStatus = 'present';
        if (existing) {
            if (existing.status === 'present') nextStatus = 'late';
            else if (existing.status === 'late') nextStatus = 'absent';
            else if (existing.status === 'absent') nextStatus = 'none';
        }

        if (nextStatus === 'none') {
            if (existing) await deleteDoc(doc(db, 'attendance', existing.id));
        } else {
            // 저장할 때 type과 index 함께 저장
            const data = { date: dateStr, studentId, status: nextStatus, type, index };
            if (existing) {
                await updateDoc(doc(db, 'attendance', existing.id), { status: nextStatus });
            } else {
                await addDoc(collection(db, 'attendance'), data);
            }
        }
    };

    const filteredStudents = students.filter((s) => {
        let m = true;
        if (viewStatus === 'active') m = s.isActive;
        else if (viewStatus === 'inactive') m = !s.isActive;
        else if (viewStatus === 'artist') m = s.isArtist;

        // 상단 빠른 필터. 재등록 판정은 화면 배지와 같은 캐시를 써서 어긋나지 않게 한다.
        if (m && listFilter === 'unpaid') {
            m = (s.unpaidList || []).length > 0;
        } else if (m && listFilter === 'reregister') {
            const starts = rotationStartsCache.get(s.id);
            m = !s.isMonthly && !s.isArtist && !!starts && starts.size > 0;
        }

        return m && ((s.name && s.name.includes(searchTerm)) || (s.phone && s.phone.includes(searchTerm)));
    });
    const currentItems = filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

    // 상단 '재등록' 필터 버튼에 표시할 인원수. 현재 보기(수강중/종료/아티스트) 기준이며,
    // 검색어·빠른필터 선택과 무관하게 재등록 요망 학생 수를 센다(위 filteredStudents 의 재등록 판정과 동일).
    const reregisterCount = students.filter((s) => {
        let inView = true;
        if (viewStatus === 'active') inView = s.isActive;
        else if (viewStatus === 'inactive') inView = !s.isActive;
        else if (viewStatus === 'artist') inView = s.isArtist;
        if (!inView) return false;
        const starts = rotationStartsCache.get(s.id);
        return !s.isMonthly && !s.isArtist && !!starts && starts.size > 0;
    }).length;
    const paginate = (n) => setCurrentPage(n);
    const totalRevenueIncludingUnpaid =
        settlementIncome.reduce((a, c) => a + Number(c.amount), 0) +
        settlementUnpaid.reduce((a, c) => a + Number(c.amount), 0);
    const totalExpense = expenses.reduce((a, c) => a + Number(c.amount), 0);
    const netProfitIncludingUnpaid = totalRevenueIncludingUnpaid - totalExpense;
    const totalUnpaid = settlementUnpaid.reduce((a, c) => a + Number(c.amount), 0);
    const weekDays = getWeekDays(scheduleDate);
    const hours = Array.from({ length: 12 }, (_, i) => i + 13);
    const weeksInMonth = getWeeksInMonth(scheduleDate);

    if (loading) return <div className="h-screen flex justify-center items-center">Loading...</div>;
    if (!user) return <LoginScreen onLogin={handleLogin} />;

    return (
        // [수정] 부모 컨테이너에 p-2 md:p-6 추가 (화면 안쪽으로 여백 확보)
        <div className="h-screen w-full bg-gray-100 font-sans flex justify-center overflow-hidden p-2 md:p-6">
            {/* [수정] 마진(my-, mx-) 제거, h-full로 부모 패딩 내부를 꽉 채움 */}
            <div className="w-full max-w-[1600px] h-full flex flex-col bg-white md:rounded-[3rem] shadow-2xl overflow-hidden">
                {/* 상단 헤더 (로고, 탭) - 고정 높이 */}
                <header className="flex-none px-4 py-4 md:px-12 md:py-6 border-b border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4 bg-white z-20">
                    <div className="text-xl md:text-2xl font-extrabold cursor-pointer">
                        VT<span className="text-orange-500">Work</span>
                    </div>
                    <nav className="flex p-1 bg-gray-100/50 rounded-full">
                        {['schedule', 'students', 'attendance', 'settlement', 'votiz'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => {
                                    setActiveTab(tab);
                                    // 정산탭을 열 때는 항상 최신(다른 기기 변경 포함)을 보장하려고 캐시를 비우고 새로 읽는다.
                                    if (tab === 'settlement') {
                                        invalidatePaymentsCache();
                                        fetchSettlementData();
                                    }
                                }}
                                className={`px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-full ${activeTab === tab ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                {tab === 'schedule'
                                    ? '스케쥴'
                                    : tab === 'attendance'
                                      ? '출석부'
                                      : tab === 'students'
                                        ? '학생관리'
                                        : tab === 'settlement'
                                          ? '보튜-정산'
                                          : '보티즈-정산'}
                            </button>
                        ))}
                    </nav>

                    <div className="flex items-center gap-4">
                        {activeTab === 'schedule' &&
                            (() => {
                                const ghostsMaster = getGhostSchedules('master');
                                const ghostsVocal = getGhostSchedules('vocal');
                                const weekStartStr = formatDateLocal(getStartOfWeek(scheduleDate));
                                const weekEnd = new Date(weekStartStr);
                                weekEnd.setDate(weekEnd.getDate() + 6);
                                const weekEndStr = formatDateLocal(weekEnd);

                                const relevantSchedules = schedules.filter(
                                    (s) => s.date >= weekStartStr && s.date <= weekEndStr && s.category === '레슨'
                                );
                                const now = new Date();
                                const hasGhosts = [...ghostsMaster, ...ghostsVocal].some(
                                    (g) => new Date(`${g.date}T${g.time}:00`) > now
                                );
                                const hasPending = relevantSchedules.some((s) => !s.status || s.status === 'pending');

                                const isAllProcessed = !hasGhosts && !hasPending && relevantSchedules.length > 0;

                                return (
                                    <button
                                        onClick={handleToggleWeekLock}
                                        disabled={!isWeekLocked && !isAllProcessed}
                                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs md:text-sm font-semibold shadow-sm transition-all active:scale-95 ${
                                            isWeekLocked
                                                ? 'bg-orange-500 text-white hover:bg-orange-600'
                                                : isAllProcessed
                                                  ? 'bg-gray-900 text-white hover:bg-gray-700'
                                                  : 'cursor-not-allowed bg-gray-100 text-gray-300 shadow-none active:scale-100'
                                        }`}
                                    >
                                        {isWeekLocked ? (
                                            <>
                                                <FaLockOpen /> 해제
                                            </>
                                        ) : (
                                            <>
                                                <FaLock /> 최종
                                            </>
                                        )}
                                    </button>
                                );
                            })()}
                        {activeTab === 'schedule' && (
                            <button
                                onClick={() => setIsScheduleLocked(!isScheduleLocked)}
                                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs md:text-sm font-semibold shadow-sm transition-all active:scale-95 ${
                                    isScheduleLocked
                                        ? 'bg-red-500 text-white hover:bg-red-600'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                {isScheduleLocked ? (
                                    <>
                                        <FaLock /> 잠금
                                    </>
                                ) : (
                                    <>
                                        <FaLockOpen /> 편집
                                    </>
                                )}
                            </button>
                        )}
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-xs md:text-sm font-bold text-gray-400 hover:text-red-500"
                        >
                            <FaSignOutAlt /> 로그아웃
                        </button>
                    </div>
                </header>

                {/* 메인 컨텐츠 영역 - 남은 공간 차지 (flex-1) & 내부 스크롤 제어 */}
                <main className="flex-1 flex flex-col overflow-hidden relative">
                    {activeTab === 'schedule' && (
                        <ScheduleTab
                            scheduleDate={scheduleDate}
                            setScheduleDate={setScheduleDate}
                            handleScheduleYearChange={handleScheduleYearChange}
                            handleScheduleMonthChange={handleScheduleMonthChange}
                            handleScheduleWeekChange={handleScheduleWeekChange}
                            weekDays={weekDays}
                            weeksInMonth={weeksInMonth}
                            hours={hours}
                            schedules={schedules}
                            fixedSchedules={fixedSchedules}
                            scheduleCancellations={scheduleCancellations}
                            getGhostSchedules={getGhostSchedules}
                            handleSlotClick={handleSlotClick}
                            handleBulkCompleteDay={handleBulkCompleteDay}
                            weeklyMemo={weeklyMemo}
                            handleWeeklyMemoSave={handleWeeklyMemoSave}
                        />
                    )}

                    {/* ----- 출석부 탭 ----- */}
                    {activeTab === 'attendance' && (
                        <AttendanceTab
                            attViewMode={attViewMode}
                            setAttViewMode={setAttViewMode}
                            attCategory={attCategory}
                            setAttCategory={setAttCategory}
                            attBaseDate={attBaseDate}
                            setAttBaseDate={setAttBaseDate}
                            attMonth={attMonth}
                            setAttMonth={setAttMonth}
                            handleAttYearChange={handleAttYearChange}
                            attSchedules={attSchedules}
                            periodAttendance={periodAttendance}
                            isAttendanceLocked={isAttendanceLocked}
                            setIsAttendanceLocked={setIsAttendanceLocked}
                            students={students}
                            settlementIncome={settlementIncome}
                            calculateRotationStarts={calculateRotationStarts}
                            getScheduleRotationInfo={getScheduleRotationInfo}
                            getWeightRemainderSuffix={getWeightRemainderSuffix}
                            handlePeriodAttendanceToggle={handlePeriodAttendanceToggle}
                            handleRegisterRotation={handleRegisterRotation}
                            handleMonthlySettlementRequest={handleMonthlySettlementRequest}
                        />
                    )}

                    {/* ----- 학생 관리 탭 (기존 유지) ----- */}
                    {activeTab === 'students' && (
                        <StudentsTab
                            students={students}
                            filteredStudents={filteredStudents}
                            currentItems={currentItems}
                            currentPage={currentPage}
                            setCurrentPage={setCurrentPage}
                            totalPages={totalPages}
                            itemsPerPage={itemsPerPage}
                            paginate={paginate}
                            viewStatus={viewStatus}
                            setViewStatus={setViewStatus}
                            listFilter={listFilter}
                            setListFilter={setListFilter}
                            reregisterCount={reregisterCount}
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            studentMemo={studentMemo}
                            handleStudentMemoSave={handleStudentMemoSave}
                            paymentCheckedAt={paymentCheckedAt}
                            paymentCheckBusy={paymentCheckBusy}
                            handlePaymentCheckDone={handlePaymentCheckDone}
                            formatWhen={formatWhen}
                            expandedStudentId={expandedStudentId}
                            setExpandedStudentId={setExpandedStudentId}
                            setViewingStudentAtt={setViewingStudentAtt}
                            calculateRotationStarts={calculateRotationStarts}
                            toggleStatus={toggleStatus}
                            handleDelete={handleDelete}
                            handleEditClick={handleEditClick}
                            setIsModalOpen={setIsModalOpen}
                            setEditingId={setEditingId}
                            setFormData={setFormData}
                            initialFormState={initialFormState}
                            tempDates={tempDates}
                            setTempDates={setTempDates}
                            handleAddUnpaid={handleAddUnpaid}
                            handleDeleteUnpaid={handleDeleteUnpaid}
                            tempDeposit={tempDeposit}
                            setTempDeposit={setTempDeposit}
                            handleAddDeposit={handleAddDeposit}
                            handleDeleteDeposit={handleDeleteDeposit}
                            handleClearDeposits={handleClearDeposits}
                            handleUnpaidChipClick={handleUnpaidChipClick}
                            selectedUnpaidId={selectedUnpaidId}
                            paymentForm={paymentForm}
                            handlePaymentFormChange={handlePaymentFormChange}
                            handlePaymentSave={handlePaymentSave}
                            paymentFile={paymentFile}
                            setPaymentFile={setPaymentFile}
                            resetPaymentForm={resetPaymentForm}
                            paymentHistory={paymentHistory}
                            historyPage={historyPage}
                            setHistoryPage={setHistoryPage}
                            historyPerPage={historyPerPage}
                            historySort={historySort}
                            setHistorySort={setHistorySort}
                            handleEditHistoryClick={handleEditHistoryClick}
                            handleDeletePayment={handleDeletePayment}
                            handleRetroactivePhotoUpload={handleRetroactivePhotoUpload}
                            setPreviewImage={setPreviewImage}
                        />
                    )}

                    {/* ----- 정산 탭 (기존 유지) ----- */}
                    {activeTab === 'settlement' && (
                        <SettlementTab
                            currentDate={currentDate}
                            handleYearChange={handleYearChange}
                            handleMonthChange={handleMonthChange}
                            changeMonth={changeMonth}
                            fetchSettlementData={fetchSettlementData}
                            settlementStatus={settlementStatus}
                            handleToggleSettlementStatus={handleToggleSettlementStatus}
                            pendingSettlementMonths={pendingSettlementMonths}
                            unpaidMonths={unpaidMonths}
                            goToSettlementMonth={goToSettlementMonth}
                            fixedExpenses={fixedExpenses}
                            handleAddFixedExpense={handleAddFixedExpense}
                            handleUpdateFixedExpense={handleUpdateFixedExpense}
                            handleDeleteFixedExpense={handleDeleteFixedExpense}
                            handleLoadFixedExpensesForMonth={handleLoadFixedExpensesForMonth}
                            settlementMemo={settlementMemo}
                            handleSettlementMemoSave={handleSettlementMemoSave}
                            settlementIncome={settlementIncome}
                            settlementUnpaid={settlementUnpaid}
                            totalUnpaid={totalUnpaid}
                            monthlySchedules={monthlySchedules}
                            currentMonthExpenses={currentMonthExpenses}
                            currentMonthTotalExpense={currentMonthTotalExpense}
                            currentMonthTotalRevenue={currentMonthTotalRevenue}
                            currentMonthNetProfit={currentMonthNetProfit}
                            currentMonthRevenueBreakdown={currentMonthRevenueBreakdown}
                            currentMonthPrefix={currentMonthPrefix}
                            expenses={expenses}
                            expenseForm={expenseForm}
                            editingExpenseId={editingExpenseId}
                            handleExpenseChange={handleExpenseChange}
                            handleExpenseSubmit={handleExpenseSubmit}
                            handleExpenseDelete={handleExpenseDelete}
                            handleEditExpenseClick={handleEditExpenseClick}
                            cancelExpenseEdit={cancelExpenseEdit}
                            handleGoToStudent={handleGoToStudent}
                            handleDeletePayment={handleDeletePayment}
                            students={students}
                        />
                    )}
                    {activeTab === 'votiz' && <VotizTab user={user} />}
                </main>
                {/* [FIX] 학생 개인별 전체 출석부 (재등록 버튼 계산 로직 수정) */}
                <StudentHistoryModal
                    viewingStudentAtt={viewingStudentAtt}
                    studentFullHistory={studentFullHistory}
                    viewingStudentHasPayment={viewingStudentHasPayment}
                    closeStudentAttView={closeStudentAttView}
                    handleRegisterRotation={handleRegisterRotation}
                    getWeightRemainderSuffix={getWeightRemainderSuffix}
                />

                {/* 모달들 (스케쥴, 수강생 등록) */}
                <ScheduleModal
                    isScheduleModalOpen={isScheduleModalOpen}
                    setIsScheduleModalOpen={setIsScheduleModalOpen}
                    scheduleTab={scheduleTab}
                    handleTabChange={handleTabChange}
                    scheduleForm={scheduleForm}
                    setScheduleForm={setScheduleForm}
                    selectedSlot={selectedSlot}
                    selectedMinute={selectedMinute}
                    setSelectedMinute={setSelectedMinute}
                    setSelectedMakeupId={setSelectedMakeupId}
                    availableStudents={availableStudents}
                    students={students}
                    schedules={schedules}
                    historySchedules={historySchedules}
                    movingSchedule={movingSchedule}
                    setMovingSchedule={setMovingSchedule}
                    isScheduleLocked={isScheduleLocked}
                    isWeekLocked={isWeekLocked}
                    handleScheduleSave={handleScheduleSave}
                    handleScheduleDelete={handleScheduleDelete}
                    handleMoveSchedule={handleMoveSchedule}
                    handleStopFixedSchedule={handleStopFixedSchedule}
                    handleCancelFixedOneTime={handleCancelFixedOneTime}
                    onGoToStudent={handleGoToStudent}
                    onAcknowledgeBroughtForward={handleAcknowledgeBroughtForward}
                    pendingBroughtForward={pendingBroughtForward}
                    defaultPersonalCategories={DEFAULT_PERSONAL_CATEGORIES}
                    userPersonalCategories={userPersonalCategories}
                    onAddPersonalCategory={handleAddPersonalCategory}
                    onRemovePersonalCategory={handleRemovePersonalCategory}
                />

                {/* 수강생 등록/수정 모달 (단가 입력 0 제거 로직 적용) */}
                <StudentFormModal
                    isModalOpen={isModalOpen}
                    editingId={editingId}
                    formData={formData}
                    setFormData={setFormData}
                    closeModal={closeModal}
                    handleChange={handleChange}
                    handlePhoneChange={handlePhoneChange}
                    handleRateChange={handleRateChange}
                    handleSubmit={handleSubmit}
                    calculateTotalAmount={calculateTotalAmount}
                    saveNotice={studentSaveNotice}
                    clearSaveNotice={() => setStudentSaveNotice('')}
                />

                {/* 이미지 미리보기 모달 (모바일 개선) */}
                {/* 이미지 미리보기 모달 (모바일 개선 + 삭제 기능) */}
                <ImagePreviewModal
                    image={previewImage}
                    onClose={() => setPreviewImage(null)}
                    onDelete={handleDeleteRetroactivePhoto}
                />
            </div>
        </div>
    );
}

export default App;
