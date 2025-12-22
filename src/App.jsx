import { useState, useEffect, Fragment, useMemo } from 'react';
import {
  FaPlus, FaSearch, FaSignOutAlt, FaEdit, FaTrash,
  FaChevronLeft, FaChevronRight, FaUserSlash, FaUserCheck,
  FaExclamationCircle, FaChevronDown, FaChevronUp, FaCheckCircle,
  FaHistory, FaCreditCard, FaTimesCircle, FaCamera, FaImage, FaStar,
  FaUndo, FaMoneyBillWave, FaFileInvoiceDollar, FaCalculator,
  FaStickyNote, FaSave, FaExternalLinkAlt, FaCalendarCheck, FaCheck, FaThumbtack, FaClock, FaSort, FaMagic, FaLock, FaLockOpen, FaHourglassHalf, FaCalendarAlt, FaList
} from 'react-icons/fa';
import { auth, db, storage } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc, getDocs, where, getDoc, setDoc, limit, writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';

// 로컬 시간 기준 날짜 포맷터 (YYYY-MM-DD)
const formatDateLocal = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 날짜 포맷 (MM.DD)
const formatMonthDay = (dateStr) => {
  if (!dateStr) return '';
  return dateStr.substring(5).replace('-', '.');
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPw, setLoginPw] = useState('');

  // [VISUALIZATION] 로테이션 색상 정의 (M은 진하게, V는 연하게)
  const ROTATION_COLORS = [
    { v: 'bg-blue-50 border-blue-200', m: 'bg-blue-200 border-blue-300' },   // 1. 파랑
    { v: 'bg-orange-50 border-orange-200', m: 'bg-orange-200 border-orange-300' }, // 2. 주황
    { v: 'bg-green-50 border-green-200', m: 'bg-green-200 border-green-300' },   // 3. 초록
    { v: 'bg-purple-50 border-purple-200', m: 'bg-purple-200 border-purple-300' }, // 4. 보라
    { v: 'bg-pink-50 border-pink-200', m: 'bg-pink-200 border-pink-300' },     // 5. 핑크
    { v: 'bg-yellow-50 border-yellow-200', m: 'bg-yellow-200 border-yellow-300' }, // 6. 노랑
    { v: 'bg-teal-50 border-teal-200', m: 'bg-teal-200 border-teal-300' },     // 7. 청록
    { v: 'bg-indigo-50 border-indigo-200', m: 'bg-indigo-200 border-indigo-300' }, // 8. 남색
    { v: 'bg-red-50 border-red-200', m: 'bg-red-200 border-red-300' },       // 9. 빨강
    { v: 'bg-gray-100 border-gray-300', m: 'bg-gray-300 border-gray-400' }      // 10. 회색
  ];

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);


  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPw);
    } catch (error) {
      alert('아이디 또는 비밀번호를 확인해주세요.');
    }
  };

  const handleLogout = () => {
    if (window.confirm('로그아웃 하시겠습니까?')) signOut(auth);
  };

  // [수정] 월정산 청구 요청 핸들러 (해당 월 1일로 날짜 고정)
  const handleMonthlySettlementRequest = async (student, amount, targetYearMonth) => {
    // 0원이나 음수는 청구 불가
    if (amount <= 0) return alert("청구할 금액이 없습니다.");

    // [핵심 변경] 미결제일을 '해당 월의 1일'로 설정
    // targetYearMonth 형식: "2025.11" -> 2025년 11월 1일 생성
    const [yearStr, monthStr] = targetYearMonth.split('.');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const billingDateObj = new Date(year, month - 1, 1); // month는 0부터 시작하므로 -1
    const billingDate = formatDateLocal(billingDateObj); // "2025-11-01" 형식 변환

    if (!window.confirm(`[${student.name}] 학생의 ${targetYearMonth}월 수강료 ${formatCurrency(amount)}원을 청구하시겠습니까?\n(미결제일은 ${billingDate}로 기록됩니다.)`)) return;

    try {
      const newItem = {
        id: Date.now().toString(),
        targetDate: billingDate, // 오늘 날짜가 아닌 '1일'로 저장
        amount: amount,
        createdAt: new Date().toISOString(),
        memo: `${targetYearMonth}월 월정산 청구`
      };

      // 기존 미수금 리스트에 추가
      const list = [...(student.unpaidList || []), newItem].sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));

      // DB 업데이트
      await updateDoc(doc(db, "students", student.id), {
        unpaidList: list,
        isPaid: false
      });

      // 후처리
      await updateStudentLastDate(student.id);
      fetchSettlementData();

      alert(`청구가 완료되었습니다.\n(${billingDate}일자 미결제 내역 생성)`);
    } catch (e) {
      console.error(e);
      alert("청구 처리 중 오류가 발생했습니다.");
    }
  };

  // --- [2] 데이터 상태 ---
  const [activeTab, setActiveTab] = useState('schedule');
  const [viewStatus, setViewStatus] = useState('active');
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // [NEW] 개인별 출석부 보기 상태
  const [viewingStudentAtt, setViewingStudentAtt] = useState(null); // 선택된 학생 객체
  const [studentFullHistory, setStudentFullHistory] = useState([]); // 해당 학생의 전체 기록

  // [수정] 학생 개인 출석부 데이터 로딩 (실시간 연동 적용)
  useEffect(() => {
    if (!viewingStudentAtt) {
      setStudentFullHistory([]);
      return;
    }

    // 1. 스케쥴 데이터 실시간 구독 (onSnapshot 사용)
    const q = query(
      collection(db, "schedules"),
      where("studentId", "==", viewingStudentAtt.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 날짜순 정렬
      list.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
        const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
        return dateA - dateB;
      });

      setStudentFullHistory(list);
    });

    return () => unsubscribe();
  }, [viewingStudentAtt?.id]);


  // [추가] 학생 정보(미수금, 카운트 등) 실시간 동기화
  useEffect(() => {
    if (viewingStudentAtt) {
      const latestStudent = students.find(s => s.id === viewingStudentAtt.id);

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
  const [tempDates, setTempDates] = useState({});
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
  const [expenseForm, setExpenseForm] = useState({ date: '', category: '기타', amount: '', memo: '' });
  const [editingExpenseId, setEditingExpenseId] = useState(null);

  // 스케쥴 관리
  const [scheduleDate, setScheduleDate] = useState(new Date());
  const [schedules, setSchedules] = useState([]);
  const [fixedSchedules, setFixedSchedules] = useState([]);
  const [historySchedules, setHistorySchedules] = useState([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState({ date: '', time: '', minute: '00', dayOfWeek: 0, gridType: 'master' });
  const [selectedMinute, setSelectedMinute] = useState('00');

  // 주차 잠금 상태
  const [isWeekLocked, setIsWeekLocked] = useState(false);
  // 모바일(768px 미만)에서는 기본적으로 잠금 활성화
  const [isScheduleLocked, setIsScheduleLocked] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  // [NEW] 고정 스케줄 취소 내역
  const [scheduleCancellations, setScheduleCancellations] = useState([]);

  const [scheduleTab, setScheduleTab] = useState('lesson');
  const [scheduleForm, setScheduleForm] = useState({
    studentId: '', studentName: '', memo: '', category: '레슨',
    isFixed: false, status: '', gridType: 'master', isVocalProgress: false
  });
  const [selectedMakeupId, setSelectedMakeupId] = useState(null);

  const [weeklyMemo, setWeeklyMemo] = useState('');
  const [availableStudents, setAvailableStudents] = useState([]);


  // --- [출석 관리 상태] ---
  const [attCategory, setAttCategory] = useState('basic');
  const [isAttendanceLocked, setIsAttendanceLocked] = useState(true);
  const [attViewMode, setAttViewMode] = useState('12weeks');
  const [attMonth, setAttMonth] = useState(new Date());

  const getStartOfWeek = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

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

  const expenseDefaults = {
    '임대료': 5005000, '임금': 0, '전기료': 0, '통신료': 55000,
    '세콤': 60500, '단말기': 5500, '정수기': 10000, '기타': 0
  };


  const initialPaymentForm = {
    id: null, targetDate: '', paymentDate: formatDateLocal(new Date()),
    method: 'card', amount: '', isCashReceipt: false, receiptMemo: ''
  };
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
  const [selectedUnpaidId, setSelectedUnpaidId] = useState(null);

  const initialFormState = {
    name: '', isActive: true, isMonthly: false, isArtist: false,
    phone: '', count: '1',
    firstDate: formatDateLocal(new Date()),
    lastDate: formatDateLocal(new Date()),
    memo: '',
    schedule: [{ week: 1, master: '', vocal: '', vocal30: '' }, { week: 2, master: '', vocal: '', vocal30: '' }, { week: 3, master: '', vocal: '', vocal30: '' }, { week: 4, master: '', vocal: '', vocal30: '' }],
    rates: { master: '', vocal: '' }, unpaidList: [], isPaid: true,
  };
  const [formData, setFormData] = useState(initialFormState);

  // --- [Data Fetching & Functions] ---

  // [수정] 정산 데이터 불러오기 (날짜 오버라이드 지원)
  const fetchSettlementData = async (dateOverride = null) => {
    setSettlementIncome([]);
    setSettlementUnpaid([]);
    setMonthlySchedules([]);

    const targetDate = dateOverride || currentDate;
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${year}-${month}`;

    try {
      const memoDoc = await getDoc(doc(db, "settlement_memos", yearMonth));
      setSettlementMemo(memoDoc.exists() ? memoDoc.data().text || '' : '');

      const schedQ = query(collection(db, "schedules"), where("date", ">=", `${yearMonth}-01`), where("date", "<=", `${yearMonth}-31`));
      const schedSnap = await getDocs(schedQ);
      setMonthlySchedules(schedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) { console.error("Settlement Data Fetch Error:", e); }

    const expenseQ = query(collection(db, "expenses"), where("date", ">=", `${yearMonth}-01`), where("date", "<=", `${yearMonth}-31`));
    const expenseSnap = await getDocs(expenseQ);
    const expenseList = expenseSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    expenseList.sort((a, b) => new Date(a.date) - new Date(b.date));
    setExpenses(expenseList);

    let allPayments = [];
    let allUnpaid = [];

    if (students.length > 0) {
      for (const student of students) {
        // [FIX] 날짜 포맷(. 또는 -) 이슈로 쿼리 누락 방지를 위해, 기간 필터 없이 전체 조회 후 메모리 필터링
        const payQ = query(collection(db, "students", student.id, "payments"));
        const paySnap = await getDocs(payQ);
        paySnap.forEach(doc => {
          const data = doc.data();
          // 메모리 필터링: YYYY-MM 또는 YYYY.MM 포함 여부 확인
          const tDate = data.targetDate || '';
          const normTDate = tDate.replace(/\./g, '-'); // 전부 대시로 통일
          if (normTDate.startsWith(yearMonth)) {
            allPayments.push({ ...data, studentName: student.name, studentId: student.id });
          }
        });

        if (student.unpaidList) {
          const unpaidInMonth = student.unpaidList.filter(item => item.targetDate && item.targetDate.startsWith(yearMonth));
          unpaidInMonth.forEach(item => {
            allUnpaid.push({ ...item, studentName: student.name, studentId: student.id });
          });
        }
      }
    }
    allPayments.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
    allUnpaid.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
    setSettlementIncome(allPayments); setSettlementUnpaid(allUnpaid);
  };

  // --- [UseEffects] ---
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "students"), orderBy("lastDate", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(list);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!expandedStudentId) { setPaymentHistory([]); return; }
    setHistoryPage(1);
    const q = query(collection(db, "students", expandedStudentId, "payments"), orderBy("paymentDate", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPaymentHistory(history);
    });
    return () => unsubscribe();
  }, [expandedStudentId]);

  // [NEW] 전역 데이터 구독 (지출, 스케줄 취소)
  useEffect(() => {
    if (!user) return;

    // Expenses
    const qExp = query(collection(db, "expenses"), orderBy("date", "desc"));
    const unsubExpenses = onSnapshot(qExp, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setExpenses(list);
    });

    // Cancellations
    const unsubCancel = onSnapshot(collection(db, "schedule_cancellations"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setScheduleCancellations(list);
    });

    return () => {
      unsubExpenses();
      unsubCancel();
    };
  }, [user]);

  useEffect(() => {
    if (!user || activeTab !== 'settlement') return;
    fetchSettlementData();
  }, [user, activeTab, currentDate, students]);

  useEffect(() => {
    if (!user || activeTab !== 'schedule') return;
    const startOfWeek = getStartOfWeek(scheduleDate);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    const startStr = formatDateLocal(startOfWeek);
    const endStr = formatDateLocal(endOfWeek);

    getDoc(doc(db, "weekly_memos", startStr)).then(docSnap => setWeeklyMemo(docSnap.exists() ? docSnap.data().text : ''));

    const fetchLockStatus = async () => {
      const lockDoc = await getDoc(doc(db, "weekly_locks", startStr));
      setIsWeekLocked(lockDoc.exists() ? lockDoc.data().locked : false);
    };
    fetchLockStatus();

    const q = query(collection(db, "schedules"), where("date", ">=", startStr), where("date", "<=", endStr));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSchedules(list);
    });
    const fixedQ = query(collection(db, "schedules"), where("isFixed", "==", true));
    const unsubscribeFixed = onSnapshot(fixedQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFixedSchedules(list);
    });

    const fetchHistory = async () => {
      const threeMonthsAgo = new Date(startOfWeek);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const threeMonthsAgoStr = formatDateLocal(threeMonthsAgo);

      const histQ = query(
        collection(db, "schedules"),
        where("date", ">=", threeMonthsAgoStr),
        where("date", "<", startStr),
        orderBy("date", "desc")
      );
      const histSnap = await getDocs(histQ);
      const histList = histSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setHistorySchedules(histList);
    };
    fetchHistory();

    return () => { unsubscribe(); unsubscribeFixed(); };
  }, [user, activeTab, scheduleDate]);

  // --- [기간제/월별 출석부 데이터 & 스케쥴 로딩] ---
  useEffect(() => {
    if (!user || activeTab !== 'attendance') return;

    let startStr, endStr;

    // 1. 날짜 범위 계산 (화면 표시용)
    if (attViewMode === '12weeks') {
      const start = new Date(attBaseDate);
      const end = new Date(start);
      end.setDate(end.getDate() + (7 * 12) - 1);
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
    const qAtt = query(
      collection(db, "attendance"),
      where("date", ">=", startStr),
      where("date", "<=", endStr)
    );
    const unsubAtt = onSnapshot(qAtt, (snapshot) => {
      const map = {};
      snapshot.docs.forEach(doc => {
        const d = doc.data();
        const key = `${d.studentId}_${d.date}_${d.type || 'M'}_${d.index || 0}`;
        map[key] = { id: doc.id, ...d };
      });
      setPeriodAttendance(map);
    });

    // 5. 스케줄 데이터 구독 (Schedules)
    // [중요] 여기에 변수 쓰지 말고 "2020-01-01"을 직접 넣으세요!
    const qSched = query(
      collection(db, "schedules"),
      where("date", ">=", "2020-01-01"),
      where("date", "<=", bufferEndStr)
    );
    const unsubSched = onSnapshot(qSched, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // [디버깅] 이 로그가 12건보다 훨씬 많이(수백 건) 나와야 정상입니다.
      console.log(`🔥 스케줄 로딩 확인: 총 ${list.length}건 (2020-01-01 부터)`);

      setAttSchedules(list);
    });

    // [NEW] 고정 스케줄 취소 내역 구독
    const unsubCancel = onSnapshot(collection(db, "schedule_cancellations"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setScheduleCancellations(list);
    });

    return () => { unsubAtt(); unsubSched(); unsubCancel(); };
  }, [user, activeTab, attBaseDate, attViewMode, attMonth]);

  // [NEW] 출석부 월별 보기 시 정산 데이터 동기화
  useEffect(() => {
    if (activeTab === 'attendance' && attViewMode === 'month') {
      fetchSettlementData(attMonth);
    } else {
      // 그 외(스케줄 탭 등)는 현재 날짜 기준
      // 필요하다면 여기서 fetchSettlementData()를 호출하거나,
      // 탭 전환 시 호출되는 다른 로직을 확인해야 함.
      // (기존에는 스케줄 변경/삭제 시 등에서 호출됨)
    }
  }, [activeTab, attViewMode, attMonth, students]);
  // --- [Helpers] ---
  const getRotationWeek = (firstDate, targetDate) => {
    if (!firstDate) return 1;
    const start = new Date(firstDate);
    const current = new Date(targetDate);
    const diffTime = current.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 1;
    return (Math.floor(diffDays / 7) % 4) + 1;
  };

  const getWeekDays = (baseDate) => {
    const start = getStartOfWeek(baseDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const get12Weeks = (baseDate) => {
    const start = new Date(baseDate);
    return Array.from({ length: 12 }, (_, i) => {
      const s = new Date(start);
      s.setDate(start.getDate() + (i * 7));
      const e = new Date(s);
      e.setDate(s.getDate() + 6);

      const format = (d) => {
        const yy = d.getFullYear().toString().slice(2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yy}.${mm}.${dd}`;
      };

      return {
        weekNum: i + 1,
        start: s,
        end: e,
        startStr: formatDateLocal(s),
        endStr: formatDateLocal(e),
        label: format(s),
        rangeLabel: `${format(s)} ~ ${format(e)}`
      };
    });
  };

  const getMonthWeeksForView = (date) => {
    const weeks = getWeeksInMonth(date);
    return weeks.map((w, i) => {
      const format = (d) => {
        const yy = d.getFullYear().toString().slice(2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yy}.${mm}.${dd}`;
      };
      return {
        weekNum: i + 1,
        start: w.start,
        end: w.end,
        startStr: formatDateLocal(w.start),
        endStr: formatDateLocal(w.end),
        label: format(w.start),
        rangeLabel: `${format(w.start)} ~ ${format(w.end)}`
      };
    });
  };

  const getWeeksInMonth = (date) => {
    const year = date.getFullYear(); const month = date.getMonth();
    const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0);
    const weeks = []; let current = new Date(firstDay);
    const day = current.getDay(); const diff = current.getDate() - day + (day === 0 ? -6 : 1); current.setDate(diff);
    while (current <= lastDay || (current.getMonth() === month && current.getDate() <= lastDay.getDate())) {
      const start = new Date(current); const end = new Date(current); end.setDate(end.getDate() + 6);
      const startInMonth = start.getMonth() === month; const endInMonth = end.getMonth() === month;
      if (startInMonth || endInMonth) { weeks.push({ start, end }); }
      current.setDate(current.getDate() + 7); if (weeks.length > 6) break;
    }
    return weeks;
  };
  const getDaysPassed = (d) => { if (!d) return 0; return Math.floor((new Date() - new Date(d)) / (1000 * 60 * 60 * 24)); };
  const calculateTotalAmount = (s) => {
    let tm = 0, tv = 0, tv30 = 0; if (s.schedule && Array.isArray(s.schedule)) s.schedule.forEach(w => { tm += Number(w.master || 0); tv += Number(w.vocal || 0); tv30 += Number(w.vocal30 || 0); });
    return (tm * Number(s.rates?.master || 0)) + (tv * Number(s.rates?.vocal || 0)) + (tv30 * (Number(s.rates?.vocal || 0) * 0.5));
  };
  const formatCurrency = (val) => (val ? Number(val).toLocaleString() : '0');

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
        .filter(s => (s.gridType || 'master') === gridType)
        .map(s => s.studentId)
        .filter(Boolean)
    );

    students.forEach(student => {
      if (scheduledStudentIds.has(student.id)) return;
      if (!student.isActive) return;

      const weekStr = formatDateLocal(weekStart);
      const rotationWeek = getRotationWeek(student.firstDate, weekStr);
      const weekConfig = student.schedule && student.schedule[rotationWeek - 1];

      let hasLessonThisWeek = false;
      if (gridType === 'master') {
        hasLessonThisWeek = weekConfig && Number(weekConfig.master || 0) >= 1;
      } else { // vocal
        const vCount = Number(weekConfig?.vocal || 0);
        const v30Count = Number(weekConfig?.vocal30 || 0);
        hasLessonThisWeek = (vCount + v30Count) >= 1;
      }

      if (hasLessonThisWeek) {
        const lastRecord = historySchedules.find(h =>
          h.studentId === student.id &&
          (h.category === '레슨' || h.category === '상담') &&
          (h.gridType || 'master') === gridType
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
            studentId: student.id,
            studentName: student.name,
            time: lastRecord.time,
            date: targetDateStr,
            category: lastRecord.category,
            memo: lastRecord.memo,
            dayOfWeek: lastDayOfWeek,
            gridType: gridType
          });
        }
      }
    });
    return ghosts;
  };

  // --- [Handlers] ---
  const handleGoToStudent = (sid, sname) => { setActiveTab('students'); setSearchTerm(sname); setExpandedStudentId(sid); };
  const handleWeeklyMemoSave = async () => { await setDoc(doc(db, "weekly_memos", formatDateLocal(getStartOfWeek(scheduleDate))), { text: weeklyMemo }, { merge: true }); alert("주간 메모 저장 완료"); };
  const handleSettlementMemoSave = async () => { const ym = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`; await setDoc(doc(db, "settlement_memos", ym), { text: settlementMemo }, { merge: true }); alert("저장됨"); };

  // [수정] 등록 모달 학생 리스트 생성 함수 (고정 스케쥴 규칙에 의한 '유령 차단' 방지)
  // [수정] 스케쥴 등록 모달의 학생 리스트 생성 함수 (고정 스케쥴 오버라이드 체크 추가)
  const generateAvailableStudents = (selectedDateStr, editingItemName = null, gridType = 'master') => {
    const weekStart = getStartOfWeek(selectedDateStr);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = formatDateLocal(weekStart);
    const weekEndStr = formatDateLocal(weekEnd);

    const bookedNames = new Set();

    // 1. 일반 스케쥴(실제 등록된 수업) 체크 -> 중복이면 숨김
    schedules.forEach(s => {
      const sType = s.gridType || 'master';
      if (sType !== gridType) return;

      const isSpecialClass = s.memo && (s.memo.includes('보강') || s.memo.includes('추가'));
      if (!isSpecialClass && s.date >= weekStartStr && s.date <= weekEndStr && s.studentName) {
        bookedNames.add(s.studentName);
      }
    });

    // 2. 고정 스케쥴(Fixed) 체크 (단, 다른 수업으로 덮어씌워진 경우는 무시)
    fixedSchedules.forEach(s => {
      const sType = s.gridType || 'master';

      // 타입이 다르거나, 아직 시작 안 한 고정 스케쥴은 무시
      if (sType !== gridType) return;
      if (!s.studentName) return;
      if (s.fixedStartDate && s.fixedStartDate > weekEndStr) return;

      // [핵심 로직] 이 고정 스케쥴이 이번 주 정확히 며칠인지 계산
      // weekStart는 월요일. s.dayOfWeek는 0(일)~6(토).
      // 월(1)->0, 화(2)->1, ... 일(0)->6 인덱스로 변환
      const dayIndex = (s.dayOfWeek === 0) ? 6 : s.dayOfWeek - 1;

      const targetDate = new Date(weekStart);
      targetDate.setDate(weekStart.getDate() + dayIndex);
      const targetDateStr = formatDateLocal(targetDate);

      // [핵심 로직] 해당 날짜/시간에 '일반 스케쥴'이 이미 존재하는지 확인 (오버라이드 여부)
      // 예: 수요일 8시에 고정M이 있어도, 실제 스케쥴에 V가 등록되어 있다면 고정M은 무시해야 함
      const isOverridden = schedules.some(sch =>
        sch.date === targetDateStr &&
        sch.time === s.time
      );

      // [NEW] 취소 내역 확인 (날짜 + 시간 + 학생ID)
      const isCancelled = scheduleCancellations.some(c =>
        c.date === targetDateStr &&
        c.time === s.time &&
        c.studentId === s.studentId
      );

      // 덮어씌워지지 않고 살아있는 고정 스케쥴만 '예약됨'으로 처리
      if (!isOverridden && !isCancelled) {
        bookedNames.add(s.studentName);
      }
    });

    if (editingItemName) bookedNames.delete(editingItemName);

    const options = [];
    students.filter(s => s.isActive).forEach(student => {
      // [수정 코드] selectedDateStr 대신 weekStartStr(월요일)을 넣으세요!
      // 이렇게 하면 유령 스케줄과 똑같은 기준으로 주차를 계산하게 됩니다.
      const weekStartStr = formatDateLocal(weekStart);
      const rotationWeek = getRotationWeek(student.firstDate, weekStartStr);
      const weekConfig = student.schedule && student.schedule[rotationWeek - 1];
      if (weekConfig) {
        let count = 0;
        if (gridType === 'master') {
          count = Number(weekConfig.master || 0);
        } else {
          count = Number(weekConfig.vocal || 0) + Number(weekConfig.vocal30 || 0);
          if (count > 0 && count < 1) count = 1;
          count = Math.floor(count);
        }

        for (let i = 1; i <= count; i++) {
          const displayName = count > 1 ? `${student.name}(${i})` : student.name;

          // 예약된 이름이 아닐 때만 리스트에 추가 (숨김 기능 유지)
          if (!bookedNames.has(displayName)) {
            options.push({ id: student.id, name: displayName, originalName: student.name });
          }
        }
      }
    });
    return options.sort((a, b) => a.name.localeCompare(b.name));
  };

  const updateStudentLastDate = async (sid) => {
    try {
      const paymentsRef = collection(db, "students", sid, "payments");
      const paymentsSnap = await getDocs(query(paymentsRef, orderBy("targetDate", "desc")));
      const paidDates = paymentsSnap.docs.map(d => d.data().targetDate).filter(d => d).sort().reverse();
      const lastPaid = paidDates.length > 0 ? paidDates[0] : null;
      const studentDoc = await getDoc(doc(db, "students", sid));
      if (!studentDoc.exists()) return;
      const studentData = studentDoc.data();
      let finalDate = lastPaid || studentData.firstDate;
      await updateDoc(doc(db, "students", sid), { lastDate: finalDate });
    } catch (error) { console.error("LastDate Update Error:", error); }
  };
  const handleExpenseChange = async (e) => {
    const { name, value } = e.target;
    let newForm = { ...expenseForm, [name]: value };
    if (name === 'category') {
      let newDate = newForm.date;
      if (['임대료', '전기료', '통신료', '세콤', '단말기', '정수기'].includes(value)) {
        const year = currentDate.getFullYear(); const month = currentDate.getMonth() + 1; const lastDay = new Date(year, month, 0).getDate();
        newDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      }
      let newAmount = expenseDefaults[value] || '';
      if (value === '임대료') {
        try {
          const q = query(collection(db, "expenses"), where("category", "==", "임대료"));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const list = snap.docs.map(doc => doc.data());
            list.sort((a, b) => new Date(b.date) - new Date(a.date));
            newAmount = list[0].amount;
          } else { newAmount = 5005000; }
        } catch (err) { newAmount = 5005000; }
      }
      newForm = { ...newForm, category: value, amount: newAmount, date: newDate };
    }
    setExpenseForm(newForm);
  };
  const handleExpenseSubmit = async () => { if (!expenseForm.date || !expenseForm.amount) return alert("날짜/금액 입력"); try { if (editingExpenseId) await updateDoc(doc(db, "expenses", editingExpenseId), expenseForm); else await addDoc(collection(db, "expenses"), { ...expenseForm, createdAt: new Date() }); setExpenseForm({ date: '', category: '기타', amount: '', memo: '' }); setEditingExpenseId(null); fetchSettlementData(); } catch (e) { alert("오류"); } };
  const handleEditExpenseClick = (item) => { setEditingExpenseId(item.id); setExpenseForm(item); };
  const cancelExpenseEdit = () => { setEditingExpenseId(null); setExpenseForm({ date: '', category: '기타', amount: '', memo: '' }); };
  const handleExpenseDelete = async (id) => { if (window.confirm("삭제?")) { await deleteDoc(doc(db, "expenses", id)); fetchSettlementData(); } };
  const handleYearChange = (e) => { const d = new Date(currentDate); d.setFullYear(parseInt(e.target.value)); setCurrentDate(d); };
  const handleMonthChange = (e) => { const d = new Date(currentDate); d.setMonth(parseInt(e.target.value) - 1); setCurrentDate(d); };
  const changeMonth = (offset) => { const d = new Date(currentDate); d.setMonth(d.getMonth() + offset); setCurrentDate(d); };
  const handleScheduleYearChange = (e) => { const d = new Date(scheduleDate); d.setFullYear(parseInt(e.target.value)); setScheduleDate(d); };
  const handleScheduleMonthChange = (e) => { const d = new Date(scheduleDate); d.setMonth(parseInt(e.target.value) - 1); setScheduleDate(d); };
  const handleScheduleWeekChange = (e) => { setScheduleDate(new Date(e.target.value)); };

  const handleSlotClick = (dateStr, hourStr, dayOfWeek, existingItem = null, gridType = 'master') => {
    const editingName = existingItem ? existingItem.studentName : null;
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
        id: isGhost ? null : existingItem.id,
        gridType: existingItem.gridType || 'master'
      });
      setSelectedMinute(timeParts[1]);

      setScheduleTab(existingItem.isFixed ? 'personal' : (existingItem.category === '레슨' || existingItem.category === '상담' ? 'lesson' : 'personal'));
      setScheduleForm({
        studentId: existingItem.studentId || '',
        studentName: existingItem.studentName || '',
        memo: existingItem.memo || '',
        category: existingItem.category || '레슨',
        isFixed: existingItem.isFixed || false,
        status: existingItem.status || '',
        gridType: existingItem.gridType || 'master',
        isVocalProgress: existingItem.isVocalProgress || false
      });
    } else {
      // [NEW] 이동 중인 스케줄이 있다면 해당 정보로 폼 초기화
      if (movingSchedule) {
        setScheduleTab(movingSchedule.category === '레슨' || movingSchedule.category === '상담' ? 'lesson' : 'personal');
        setScheduleForm({
          studentId: movingSchedule.studentId || '',
          studentName: movingSchedule.studentName || '',
          memo: movingSchedule.memo || '',
          category: movingSchedule.category || '레슨',
          isFixed: movingSchedule.isFixed || false,
          status: movingSchedule.status || '',
          gridType: gridType, // 이동하려는 새 슬롯의 gridType 적용
          isVocalProgress: movingSchedule.isVocalProgress || false
        });
      } else {
        setScheduleTab('lesson');
        setScheduleForm({
          studentId: '', studentName: '', memo: '', category: '레슨',
          isFixed: false, status: '', gridType, isVocalProgress: false
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
      setScheduleForm(prev => ({ ...prev, category: defaultCategory, studentId: '', studentName: '', status: '' }));
    } else {
      setScheduleForm(prev => ({ ...prev, category: '레슨', isFixed: false, status: '' }));
    }
  };

  // [수정] 스케쥴 저장 함수 (당일 포함 미래 미수금 삭제)
  const handleScheduleSave = async () => {
    if (isWeekLocked || isScheduleLocked) return;
    const timeToSave = `${selectedSlot.time}:${selectedMinute}`;
    const finalGridType = selectedSlot.gridType || scheduleForm.gridType || 'master';
    const saveDate = scheduleForm.isFixed ? formatDateLocal(new Date()) : selectedSlot.date;

    // 1. 학생 정보 업데이트
    if (scheduleForm.studentId) {
      try {
        const studentRef = doc(db, "students", scheduleForm.studentId);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
          const sData = studentSnap.data();
          const updates = {};
          let deletedCount = 0;

          // A. 아티스트 카운트
          if (sData.isArtist) {
            let countChange = 0;
            const newStatus = scheduleForm.status;
            let oldStatus = ''; // 기존 상태

            if (selectedSlot.id) {
              const oldSchedule = schedules.find(s => s.id === selectedSlot.id);
              if (oldSchedule) oldStatus = oldSchedule.status;
            }

            if (newStatus === 'completed' && oldStatus !== 'completed') countChange = 1;
            else if (newStatus !== 'completed' && oldStatus === 'completed') countChange = -1;

            if (countChange !== 0) {
              const currentCount = parseInt(sData.count || '0');
              updates.count = String(currentCount + countChange);
            }
          }

          // B. [핵심 변경] 저장일(포함) 및 미래 미수금 삭제
          if (sData.unpaidList && sData.unpaidList.length > 0) {
            // [수정] <= 에서 < 로 변경 (당일 날짜도 삭제 대상에 포함)
            // 저장하려는 날짜(saveDate)보다 "엄격하게 과거인 것"만 남김
            const filteredUnpaidList = sData.unpaidList.filter(item => item.targetDate < saveDate);

            if (filteredUnpaidList.length !== sData.unpaidList.length) {
              deletedCount = sData.unpaidList.length - filteredUnpaidList.length;
              updates.unpaidList = filteredUnpaidList;
              updates.isPaid = filteredUnpaidList.length === 0;
            }
          }

          // DB 업데이트
          if (Object.keys(updates).length > 0) {
            await updateDoc(studentRef, updates);
            if (deletedCount > 0) {
              alert(`[자동정리] 일정 변경으로 인해 ${saveDate}일 포함, 이후의 내역이 정리되었습니다.`);
            }
          }
        }
      } catch (err) {
        console.error("학생 정보 업데이트 실패:", err);
        alert("데이터 저장 중 오류가 발생했습니다.");
        return;
      }
    }

    // 2. 스케쥴 저장
    const data = {
      time: timeToSave,
      ...scheduleForm,
      gridType: finalGridType,
      date: scheduleForm.isFixed ? 'FIXED' : selectedSlot.date,
      dayOfWeek: scheduleForm.isFixed ? selectedSlot.dayOfWeek : null,
      fixedStartDate: scheduleForm.isFixed ? (selectedSlot.date || formatDateLocal(new Date())) : null,
      relatedScheduleId: selectedMakeupId || null
    };

    if (scheduleTab === 'personal') {
      data.studentId = '';
      data.studentName = '';
    }

    try {
      if (selectedSlot.id) {
        await updateDoc(doc(db, "schedules", selectedSlot.id), data);
      } else {
        await addDoc(collection(db, "schedules"), data);
      }
    } catch (error) {
      console.error("스케쥴 저장 에러:", error);
      alert("스케쥴 저장에 실패했습니다.");
      return;
    }

    // 3. 보강 처리
    if (selectedMakeupId) {
      try {
        await updateDoc(doc(db, "schedules", selectedMakeupId), { status: 'reschedule_assigned' });
        setHistorySchedules(prev => prev.map(h => h.id === selectedMakeupId ? { ...h, status: 'reschedule_assigned' } : h));
      } catch (e) { console.error("보강 상태 업데이트 실패", e); }
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
    if (!selectedSlot.id || !window.confirm("일정을 삭제하시겠습니까?\n(관련된 미수금/월정산 청구 내역도 함께 정리됩니다.)")) return;

    try {
      const scheduleRef = doc(db, "schedules", selectedSlot.id);
      const scheduleSnap = await getDoc(scheduleRef);

      if (!scheduleSnap.exists()) {
        alert("이미 삭제된 일정입니다.");
        setIsScheduleModalOpen(false);
        return;
      }
      const scheduleData = scheduleSnap.data();

      if (scheduleData.studentId) {
        const studentRef = doc(db, "students", scheduleData.studentId);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
          const sData = studentSnap.data();
          const updates = {};

          // 삭제하려는 일정의 년.월 계산 (예: "2025.11")
          const d = new Date(scheduleData.date);
          const targetYM = `${d.getFullYear()}.${d.getMonth() + 1}`;
          const monthlyMemo = `${targetYM}월 월정산 청구`;

          if (sData.unpaidList && sData.unpaidList.length > 0) {
            const beforeCount = sData.unpaidList.length;

            // [필터 로직 보강]
            // 1. 삭제일 포함 미래 날짜의 미수금 제거 (targetDate < deletedDate 가 아닌 것들)
            // 2. 삭제하는 일정이 속한 달의 '월정산 청구' 내역 제거 (memo 비교)
            const filteredList = sData.unpaidList.filter(item => {
              const isFutureOrToday = item.targetDate >= scheduleData.date;
              const isThisMonthSettlement = item.memo === monthlyMemo;

              // 미래 내역이 아니고, 이번 달 월정산 내역도 아닌 것만 남김
              return !isFutureOrToday && !isThisMonthSettlement;
            });

            if (filteredList.length !== beforeCount) {
              updates.unpaidList = filteredList;
              updates.isPaid = filteredList.length === 0;
              alert(`[자동정리] 일정 삭제로 인해 관련 미수금/월정산 내역 ${beforeCount - filteredList.length}건이 삭제되었습니다.`);
            }
          }

          // 아티스트 카운트 복구
          if (sData.isArtist && scheduleData.status === 'completed') {
            const currentCount = parseInt(sData.count || '0');
            updates.count = String(Math.max(0, currentCount - 1));
          }

          if (Object.keys(updates).length > 0) {
            await updateDoc(studentRef, updates);
          }
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
          const q = query(collection(db, "schedules"),
            where("studentId", "==", scheduleData.studentId),
            where("date", "==", originalDate),
            where("status", "==", "reschedule_assigned")
          );
          const snap = await getDocs(q);
          if (!snap.empty) targetId = snap.docs[0].id;
        }
      }
      if (targetId) {
        await updateDoc(doc(db, "schedules", targetId), { status: 'reschedule' });
        setHistorySchedules(prev => prev.map(h => h.id === targetId ? { ...h, status: 'reschedule' } : h));
      }

      if (scheduleData.studentId) {
        await updateStudentLastDate(scheduleData.studentId);
        fetchSettlementData();
      }

      setIsScheduleModalOpen(false);

    } catch (error) {
      console.error("삭제 중 오류:", error);
      alert("삭제 처리에 실패했습니다.");
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
      const scheduleRef = doc(db, "schedules", movingSchedule.id);

      const timeToSave = `${selectedSlot.time}:${selectedMinute}`;
      const saveDate = selectedSlot.date; // New Date

      const updates = {
        ...scheduleForm,
        date: saveDate,
        time: timeToSave,
        dayOfWeek: selectedSlot.dayOfWeek,
        relatedScheduleId: selectedMakeupId || null,
      };

      if (scheduleForm.studentId) {
        const studentRef = doc(db, "students", scheduleForm.studentId);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
          const sData = studentSnap.data();
          const stUpdates = {};

          // 1. 아티스트 카운트 조정
          if (sData.isArtist) {
            let countChange = 0;
            const newStatus = scheduleForm.status;
            const oldStatus = movingSchedule.status;

            if (newStatus === 'completed' && oldStatus !== 'completed') countChange = 1;
            else if (newStatus !== 'completed' && oldStatus === 'completed') countChange = -1;

            if (countChange !== 0) {
              stUpdates.count = String(parseInt(sData.count || '0') + countChange);
            }
          }

          // 2. 미수금/청구 내역 정리
          if (sData.unpaidList && sData.unpaidList.length > 0) {
            const filteredUnpaidList = sData.unpaidList.filter(item => item.targetDate < saveDate);
            if (filteredUnpaidList.length !== sData.unpaidList.length) {
              stUpdates.unpaidList = filteredUnpaidList;
              stUpdates.isPaid = filteredUnpaidList.length === 0;
              alert(`[자동정리] 일정 이동으로 인해 ${saveDate}일 포함, 이후의 청구 내역이 정리되었습니다.`);
            }
          }

          if (Object.keys(stUpdates).length > 0) {
            await updateDoc(studentRef, stUpdates);
          }
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
      console.error("이동 저장 실패", e);
      alert("일정 이동 처리에 실패했습니다: " + e.message);
    }
  };

  // [NEW] 고정 스케줄 '이번 주만 취소' 핸들러
  const handleCancelFixedOneTime = async () => {
    if (!window.confirm("이번 주만 스케줄을 취소하시겠습니까?\n(다음 주부터는 정상 표시됩니다.)")) return;

    try {
      await addDoc(collection(db, "schedule_cancellations"), {
        date: selectedSlot.date,   // 클릭한 날짜
        time: `${selectedSlot.time}:${selectedMinute}`,
        studentId: scheduleForm.studentId,
        createdAt: new Date().toISOString()
      });
      setIsScheduleModalOpen(false);
    } catch (e) {
      console.error(e);
      alert("취소 처리 중 오류가 발생했습니다.");
    }
  };
  const handleToggleWeekLock = async () => {
    const startStr = formatDateLocal(getStartOfWeek(scheduleDate));
    const newStatus = !isWeekLocked;

    if (newStatus && !window.confirm("이번 주 스케쥴을 최종 마감하시겠습니까?\n마감 후에는 수정이 불가능합니다.")) return;
    if (!newStatus && !window.confirm("마감을 해제하시겠습니까?")) return;

    await setDoc(doc(db, "weekly_locks", startStr), { locked: newStatus }, { merge: true });
    setIsWeekLocked(newStatus);
  };

  const handleNextDueDateChange = async (sid, date) => updateDoc(doc(db, "students", sid), { nextDueDate: date, isPaid: false });
  const handleAddUnpaid = async (s) => {
    const d = tempDates[s.id]; if (!d) return alert("날짜선택");
    const item = { id: Date.now().toString(), targetDate: d, amount: calculateTotalAmount(s), createdAt: new Date().toISOString() };
    const list = [...(s.unpaidList || []), item].sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
    await updateDoc(doc(db, "students", s.id), { unpaidList: list, isPaid: false });
    await updateStudentLastDate(s.id);
    setTempDates({ ...tempDates, [s.id]: '' });
    fetchSettlementData();
  };
  const handleDeleteUnpaid = async (s, id) => {
    if (!window.confirm("삭제?")) return;
    const list = (s.unpaidList || []).filter(i => i.id !== id);
    await updateDoc(doc(db, "students", s.id), { unpaidList: list, isPaid: list.length === 0 });
    await updateStudentLastDate(s.id);
    if (selectedUnpaidId === id) { setSelectedUnpaidId(null); resetPaymentForm(calculateTotalAmount(s)); }
    fetchSettlementData();
  };
  const handlePaymentSave = async (s) => {
    if (!paymentForm.amount) return alert("금액을 입력해주세요.");
    if (!window.confirm("결제를 처리하시겠습니까?")) return;
    try {
      let url = paymentForm.imageUrl || '';
      if (paymentFile) {
        const snap = await uploadBytes(ref(storage, `receipts/${s.id}_${Date.now()}`), paymentFile);
        url = await getDownloadURL(snap.ref);
      }
      const data = { ...paymentForm, paymentMethod: paymentForm.method, imageUrl: url, createdAt: new Date() };
      delete data.method; delete data.id;
      if (paymentForm.id) await updateDoc(doc(db, "students", s.id, "payments", paymentForm.id), data);
      else await addDoc(collection(db, "students", s.id, "payments"), data);
      if (!paymentForm.id) {
        let list = s.unpaidList || [];
        if (selectedUnpaidId) list = list.filter(i => i.id !== selectedUnpaidId);
        const currentCount = parseInt(s.count || '0', 10);
        const newCount = currentCount + 1;
        await updateDoc(doc(db, "students", s.id), { unpaidList: list, isPaid: list.length === 0, count: newCount });
      }
      await updateStudentLastDate(s.id);
      fetchSettlementData();
      alert("결제 처리가 완료되었습니다."); resetPaymentForm(calculateTotalAmount(s));
    } catch (e) { console.error(e); alert("결제 처리에 실패했습니다."); }
  };
  const handleRetroactivePhotoUpload = async (sid, pid, f) => {
    if (!f) return;

    // 이미지 압축 헬퍼 함수
    const compressImage = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; // 가로 최대 800px
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          // JPEG, 0.6 퀄리티로 압축
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = (err) => reject(new Error("이미지 로드 실패"));
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(new Error("파일 읽기 실패"));
      reader.readAsDataURL(file);
    });

    try {
      alert("서버 연결 문제 우회를 위해, 사진을 압축하여 데이터베이스에 직접 저장합니다. 확인을 누르고 잠시만 기다려주세요.");

      const dataUrl = await compressImage(f);

      // Firestore 문서 제한(1MB) 체크
      if (dataUrl.length > 1000000) {
        throw new Error("이미지 용량이 너무 큽니다. 더 작은 사진을 사용해주세요.");
      }

      await updateDoc(doc(db, "students", sid, "payments", pid), { imageUrl: dataUrl });

      alert("성공적으로 저장되었습니다!");
      setTimeout(() => fetchSettlementData(), 500);

    } catch (e) {
      console.error(e);
      alert("저장 실패: " + e.message);
    }
  };

  const handleDeleteRetroactivePhoto = async () => {
    if (!previewImage || !previewImage.sid || !previewImage.pid) return;
    if (!window.confirm("정말로 사진을 삭제하시겠습니까?")) return;

    try {
      await updateDoc(doc(db, "students", previewImage.sid, "payments", previewImage.pid), { imageUrl: null });
      alert("사진이 삭제되었습니다.");
      setPreviewImage(null);
      setTimeout(() => fetchSettlementData(), 500);
    } catch (e) {
      console.error(e);
      alert("삭제 실패: " + e.message);
    }
  };

  // 닫는 중괄호 확인 (이전 코드에 맞추어)
  const handleDeletePayment = async (sid, pid) => { if (window.confirm("삭제하시겠습니까?")) { await deleteDoc(doc(db, "students", sid, "payments", pid)); await updateStudentLastDate(sid); setTimeout(() => fetchSettlementData(), 500); } };
  const handleUnpaidChipClick = (s, i) => { setSelectedUnpaidId(i.id); setPaymentForm(p => ({ ...p, id: null, targetDate: i.targetDate, amount: i.amount, paymentDate: formatDateLocal(new Date()) })); document.getElementById('payment-form-area')?.scrollIntoView({ behavior: 'smooth' }); };
  const resetPaymentForm = (amt = '') => { setPaymentForm({ ...initialPaymentForm, amount: amt, targetDate: formatDateLocal(new Date()) }); setPaymentFile(null); setSelectedUnpaidId(null); };
  const handlePaymentFormChange = (e) => setPaymentForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const handleEditHistoryClick = (p) => { setPaymentForm({ ...p, method: p.paymentMethod, receiptMemo: p.receiptMemo || '' }); setPaymentFile(null); document.getElementById('payment-form-area')?.scrollIntoView({ behavior: 'smooth' }); };
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handlePhoneChange = (e) => { const v = e.target.value.replace(/[^0-9]/g, ''); let f = v; if (v.length > 3 && v.length <= 7) f = `${v.slice(0, 3)}-${v.slice(3)}`; else if (v.length > 7) f = `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7, 11)}`; setFormData({ ...formData, phone: f }); };
  const handleScheduleChange = (i, f, v) => { const n = [...formData.schedule]; n[i][f] = v; setFormData({ ...formData, schedule: n }); };
  const handleRateChange = (f, v) => { const r = v.replace(/,/g, ''); if (!isNaN(r)) setFormData({ ...formData, rates: { ...formData.rates, [f]: r } }); };
  const handleSubmit = async () => { if (!formData.name) return alert("이름"); try { if (editingId) await updateDoc(doc(db, "students", editingId), formData); else { const amt = calculateTotalAmount(formData); const up = { id: Date.now().toString(), targetDate: formData.firstDate, amount: amt, createdAt: new Date().toISOString() }; await addDoc(collection(db, "students"), { ...formData, lastDate: formData.firstDate, isActive: true, isPaid: false, unpaidList: [up], createdAt: new Date() }); } closeModal(); } catch (e) { alert("오류"); } };
  const handleDelete = async (id, n) => { if (window.confirm("삭제?")) await deleteDoc(doc(db, "students", id)); };
  const toggleStatus = async (s) => await updateDoc(doc(db, "students", s.id), { isActive: !s.isActive });
  const handleEditClick = (s) => { setEditingId(s.id); const sch = (s.schedule || initialFormState.schedule).map(w => ({ ...w, vocal30: w.vocal30 || '' })); setFormData({ ...initialFormState, ...s, schedule: sch, rates: s.rates || initialFormState.rates }); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditingId(null); setFormData(initialFormState); };

  // --- [NEW] 재등록 예정일 자동 등록 핸들러 (학생 이름 포함 수정) ---
  const handleRegisterRotation = async (student, targetDateStr) => {
    // [수정] 메시지에 student.name 추가
    if (!window.confirm(`[${student.name}] 학생을 ${targetDateStr} 일자로 재등록(미수금) 생성하시겠습니까?`)) return;

    try {
      const amount = calculateTotalAmount(student);
      const newItem = {
        id: Date.now().toString(),
        targetDate: targetDateStr,
        amount: amount,
        createdAt: new Date().toISOString()
      };

      const list = [...(student.unpaidList || []), newItem].sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));

      await updateDoc(doc(db, "students", student.id), {
        unpaidList: list,
        isPaid: false
      });
      await updateStudentLastDate(student.id);
      fetchSettlementData();
      alert("재등록(미수금) 처리가 완료되었습니다.");
    } catch (e) {
      console.error(e);
      alert("처리 중 오류가 발생했습니다.");
    }
  };

  // [FIX] 학생별 로테이션 시작일 계산 (M/V 중 '먼저' 시작하는 수업 기준)
  const calculateRotationStarts = (student) => {
    let reqM = 0;
    let reqV = 0;
    (student.schedule || []).forEach(w => {
      reqM += Number(w.master || 0);
      reqV += Number(w.vocal || 0) + Number(w.vocal30 || 0);
    });

    if (reqM === 0 && reqV === 0) return new Set();

    let anchorDate = student.firstDate;
    if (student.lastDate && student.lastDate > anchorDate) anchorDate = student.lastDate;

    if (student.unpaidList && student.unpaidList.length > 0) {
      const sortedUnpaid = [...student.unpaidList].sort((a, b) => new Date(b.targetDate) - new Date(a.targetDate));
      if (sortedUnpaid[0].targetDate > anchorDate) anchorDate = sortedUnpaid[0].targetDate;
    }

    const allScheds = attSchedules
      .filter(s =>
        s.studentId === student.id &&
        s.date >= student.firstDate &&
        (s.status === 'completed' || s.status === 'late' || s.status === 'absent')
      )
      .sort((a, b) => new Date((a.date || '') + 'T' + (a.time || '00:00')) - new Date((b.date || '') + 'T' + (b.time || '00:00')));

    const mScheds = allScheds.filter(s => s.gridType === 'master' || !s.gridType);
    const vScheds = allScheds.filter(s => s.gridType === 'vocal');

    const startDates = new Set();

    // 100회차까지 돌면서 시작일 찾기
    for (let i = 1; i <= 100; i++) {
      let mStartDate = null;
      let vStartDate = null;

      if (reqM > 0) {
        const targetIdx = i * reqM;
        if (targetIdx < mScheds.length) mStartDate = mScheds[targetIdx].date;
      }

      if (reqV > 0) {
        const targetIdx = i * reqV;
        if (targetIdx < vScheds.length) vStartDate = vScheds[targetIdx].date;
      }

      let rotationTriggerDate = null;

      // [핵심] M과 V 중 '먼저' 시작하는 날짜(Min)를 채택하여 버튼 표시
      if (mStartDate && vStartDate) {
        rotationTriggerDate = mStartDate < vStartDate ? mStartDate : vStartDate;
      } else if (mStartDate) {
        rotationTriggerDate = mStartDate;
      } else if (vStartDate) {
        rotationTriggerDate = vStartDate;
      }

      if (rotationTriggerDate && rotationTriggerDate > anchorDate) {
        startDates.add(rotationTriggerDate);
      }
    }

    return startDates;
  };

  // [FIX] 로테이션 정보 계산 (시각화용, M/V 독립 카운트 방식)
  const getScheduleRotationInfo = (student, targetSchedId) => {
    let reqM = 0;
    let reqV = 0;
    (student.schedule || []).forEach(w => {
      reqM += Number(w.master || 0);
      reqV += Number(w.vocal || 0) + Number(w.vocal30 || 0);
    });

    const allScheds = attSchedules
      .filter(s =>
        s.studentId === student.id &&
        s.date >= student.firstDate &&
        (s.status === 'completed' || s.status === 'late' || s.status === 'absent')
      )
      .sort((a, b) => new Date((a.date || '') + 'T' + (a.time || '00:00')) - new Date((b.date || '') + 'T' + (b.time || '00:00')));

    const target = allScheds.find(s => s.id === targetSchedId);
    if (!target) return { index: -1, label: '' };

    const isTargetMaster = (target.gridType === 'master' || !target.gridType);

    let typeScheds = [];
    let limit = 0;

    if (isTargetMaster) {
      if (reqM === 0) return { index: 0, label: 'R1' };
      typeScheds = allScheds.filter(s => (s.gridType === 'master' || !s.gridType));
      limit = reqM;
    } else {
      if (reqV === 0) return { index: 0, label: 'R1' };
      typeScheds = allScheds.filter(s => s.gridType === 'vocal');
      limit = reqV;
    }

    const myIndex = typeScheds.findIndex(s => s.id === targetSchedId);
    if (myIndex === -1) return { index: -1, label: '' };

    const rotationIndex = Math.floor(myIndex / limit);

    return { index: rotationIndex, label: `R${rotationIndex + 1}` };
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
      if (existing) await deleteDoc(doc(db, "attendance", existing.id));
    } else {
      // 저장할 때 type과 index 함께 저장
      const data = { date: dateStr, studentId, status: nextStatus, type, index };
      if (existing) {
        await updateDoc(doc(db, "attendance", existing.id), { status: nextStatus });
      } else {
        await addDoc(collection(db, "attendance"), data);
      }
    }
  };

  const filteredStudents = students.filter(s => { let m = true; if (viewStatus === 'active') m = s.isActive; else if (viewStatus === 'inactive') m = !s.isActive; else if (viewStatus === 'artist') m = s.isArtist; return m && (s.name.includes(searchTerm) || (s.phone && s.phone.includes(searchTerm))); });
  const currentItems = filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginate = (n) => setCurrentPage(n);
  const totalRevenueIncludingUnpaid = settlementIncome.reduce((a, c) => a + Number(c.amount), 0) + settlementUnpaid.reduce((a, c) => a + Number(c.amount), 0);
  const totalExpense = expenses.reduce((a, c) => a + Number(c.amount), 0);
  const netProfitIncludingUnpaid = totalRevenueIncludingUnpaid - totalExpense;
  const totalUnpaid = settlementUnpaid.reduce((a, c) => a + Number(c.amount), 0);
  const weekDays = getWeekDays(scheduleDate);
  const hours = Array.from({ length: 12 }, (_, i) => i + 13);
  const weeksInMonth = getWeeksInMonth(scheduleDate);

  if (loading) return <div className="h-screen flex justify-center items-center">Loading...</div>;
  if (!user) return (
    <div className="h-screen bg-gray-100 font-sans p-2 md:p-8 lg:p-12 flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-2xl">
        <div className="text-center mb-12"><h1 className="text-3xl font-extrabold text-gray-900">VT<span className="text-orange-500">Work</span></h1></div>
        <form onSubmit={handleLogin} className="space-y-6"><input type="email" placeholder="이메일" className="w-full bg-gray-50 border border-gray-200 rounded-2xl h-14 px-5 outline-none" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} /><input type="password" placeholder="비밀번호" className="w-full bg-gray-50 border border-gray-200 rounded-2xl h-14 px-5 outline-none" value={loginPw} onChange={(e) => setLoginPw(e.target.value)} /><button className="w-full bg-gray-900 text-white h-14 rounded-2xl font-bold mt-4 shadow-md">로그인</button></form>
      </div>
    </div>
  );

  return (
    // [수정] 부모 컨테이너에 p-2 md:p-6 추가 (화면 안쪽으로 여백 확보)
    <div className="h-screen w-full bg-gray-100 font-sans flex justify-center overflow-hidden p-2 md:p-6">

      {/* [수정] 마진(my-, mx-) 제거, h-full로 부모 패딩 내부를 꽉 채움 */}
      <div className="w-full max-w-[1600px] h-full flex flex-col bg-white md:rounded-[3rem] shadow-2xl overflow-hidden">

        {/* 상단 헤더 (로고, 탭) - 고정 높이 */}
        <header className="flex-none px-4 py-4 md:px-12 md:py-6 border-b border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4 bg-white z-20">
          <div className="text-xl md:text-2xl font-extrabold cursor-pointer">VT<span className="text-orange-500">Work</span></div>
          <nav className="flex p-1 bg-gray-100/50 rounded-full">
            {['schedule', 'attendance', 'students', 'settlement'].map(tab => (
              <button key={tab} onClick={() => { setActiveTab(tab); if (tab === 'settlement') fetchSettlementData(); }} className={`px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-full ${activeTab === tab ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                {tab === 'schedule' ? '스케쥴' : tab === 'attendance' ? '출석부' : tab === 'students' ? '학생관리' : '정산관리'}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {activeTab === 'schedule' && (
              (() => {
                const ghostsMaster = getGhostSchedules('master');
                const ghostsVocal = getGhostSchedules('vocal');
                const weekStartStr = formatDateLocal(getStartOfWeek(scheduleDate));
                const weekEnd = new Date(weekStartStr); weekEnd.setDate(weekEnd.getDate() + 6);
                const weekEndStr = formatDateLocal(weekEnd);

                const relevantSchedules = schedules.filter(s => s.date >= weekStartStr && s.date <= weekEndStr && s.category === '레슨');
                const now = new Date();
                const hasGhosts = [...ghostsMaster, ...ghostsVocal].some(g => new Date(`${g.date}T${g.time}:00`) > now);
                const hasPending = relevantSchedules.some(s => !s.status || s.status === 'pending');

                const isAllProcessed = !hasGhosts && !hasPending && relevantSchedules.length > 0;

                return (
                  <button
                    onClick={handleToggleWeekLock}
                    disabled={!isWeekLocked && !isAllProcessed}
                    className={`btn btn-sm border-none gap-2 font-bold rounded-2xl shadow-md transition-all px-6 ${isWeekLocked
                      ? 'bg-orange-100 text-orange-600 hover:bg-orange-200 hover:shadow-lg'
                      : (isAllProcessed ? 'bg-black text-white hover:bg-gray-800 hover:shadow-lg' : 'bg-gray-100 text-gray-400 cursor-not-allowed')
                      }`}
                  >
                    {isWeekLocked ? <><FaLockOpen /> 해제</> : <><FaLock /> 최종</>}
                  </button>
                );
              })()
            )}
            {activeTab === 'schedule' && (
              <button
                onClick={() => setIsScheduleLocked(!isScheduleLocked)}
                className={`btn btn-sm border-none gap-2 font-bold rounded-2xl shadow-md transition-all px-6 ${isScheduleLocked
                  ? 'bg-red-100 text-red-600 hover:bg-red-200 hover:shadow-lg'
                  : 'bg-gray-100 text-gray-500 hover:bg-black hover:text-white hover:shadow-lg'
                  }`}
              >
                {isScheduleLocked ? <><FaLock /> 잠금</> : <><FaLockOpen /> 편집</>}
              </button>
            )}
            <button onClick={handleLogout} className="flex items-center gap-2 text-xs md:text-sm font-bold text-gray-400 hover:text-red-500"><FaSignOutAlt /> 로그아웃</button>
          </div>
        </header>

        {/* 메인 컨텐츠 영역 - 남은 공간 차지 (flex-1) & 내부 스크롤 제어 */}
        <main className="flex-1 flex flex-col overflow-hidden relative">



          {activeTab === 'schedule' && (
            <div className="flex flex-col h-full w-full p-4 md:p-8 lg:px-12 gap-4">

              {/* 날짜 선택 및 메모 영역 (고정) */}
              <div className="flex-none flex flex-col gap-4">
                <div className="flex justify-between items-center">

                  {/* [수정됨] 날짜 선택 컨트롤 영역 */}
                  <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100">

                    {/* 년도 선택: 글씨 크기 text-lg로 축소 */}
                    <select
                      className="select select-ghost text-lg font-extrabold focus:bg-gray-50 rounded-xl px-2 h-10 min-w-[100px]"
                      value={scheduleDate.getFullYear()}
                      onChange={handleScheduleYearChange}
                    >
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => <option key={y} value={y}>{y}년</option>)}
                    </select>

                    {/* 월 선택: 글씨 크기 text-lg로 축소 */}
                    <select
                      className="select select-ghost text-lg font-extrabold focus:bg-gray-50 rounded-xl px-2 h-10 text-orange-500"
                      value={scheduleDate.getMonth() + 1}
                      onChange={handleScheduleMonthChange}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                    </select>

                    <div className="w-[2px] h-5 bg-gray-200 mx-2"></div>

                    {/* [추가됨] 이전 주 이동 버튼 */}
                    <button
                      className="btn btn-sm btn-circle btn-ghost text-gray-500"
                      onClick={() => {
                        const d = new Date(scheduleDate);
                        d.setDate(d.getDate() - 7);
                        setScheduleDate(d);
                      }}
                    >
                      <FaChevronLeft />
                    </button>

                    {/* 주차 선택 셀렉트 */}
                    <select
                      className="select select-ghost font-bold text-gray-600 text-sm h-10 min-w-[200px] text-center"
                      onChange={handleScheduleWeekChange}
                      value={formatDateLocal(getStartOfWeek(scheduleDate))}
                    >
                      {weeksInMonth.map((w, i) => (
                        <option key={i} value={formatDateLocal(w.start)}>
                          {i + 1}주차 ({w.start.getMonth() + 1}.{w.start.getDate()} ~ {w.end.getMonth() + 1}.{w.end.getDate()})
                        </option>
                      ))}
                    </select>

                    {/* [추가됨] 다음 주 이동 버튼 */}
                    <button
                      className="btn btn-sm btn-circle btn-ghost text-gray-500"
                      onClick={() => {
                        const d = new Date(scheduleDate);
                        d.setDate(d.getDate() + 7);
                        setScheduleDate(d);
                      }}
                    >
                      <FaChevronRight />
                    </button>

                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setScheduleDate(new Date())} className="btn btn-sm bg-gray-100 text-gray-500 hover:bg-black hover:text-white rounded-2xl shadow-md transition-all px-6">오늘</button>
                  </div>
                </div>

                <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                  {/* ... (메모 영역은 그대로 유지) ... */}


                  <div className="flex items-center gap-2 min-w-fit"><FaStickyNote className="text-blue-500 text-base" /><span className="text-xs font-bold text-gray-500">주간 메모</span></div>
                  <input type="text" className="input input-sm border-none bg-transparent flex-1 text-sm focus:outline-none" placeholder="이번 주 특이사항..." value={weeklyMemo} onChange={(e) => setWeeklyMemo(e.target.value)} />
                  <button
                    className="btn btn-xs bg-gray-100 text-gray-500 border-none hover:bg-black hover:text-white rounded-2xl shadow-md transition-all px-6 hover:shadow-lg"
                    onClick={handleWeeklyMemoSave}
                  >
                    <FaSave className="mr-1" /> 저장
                  </button>
                </div>
              </div>

              {/* 스케쥴 표 영역 (헤더 고정 + 바디 스크롤) */}
              <div className="flex-1 flex flex-col min-h-0 bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">

                {/* 스크롤 가능 영역 */}
                <div className="flex-1 overflow-y-auto">
                  {/* 1. 요일 헤더 (sticky로 고정) */}
                  <div className="sticky top-0 grid grid-cols-8 border-b border-gray-100 bg-gray-50 z-10">
                    <div className="p-4 text-center text-xs font-bold text-gray-400 border-r border-gray-100">Time</div>
                    {weekDays.map((d, i) => {
                      const isToday = formatDateLocal(d) === formatDateLocal(new Date());
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const dayColor = d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-blue-500' : 'text-gray-700';

                      return (
                        <div key={i} className={`text-center py-3 px-2 border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-orange-50 rounded-lg shadow-md' : ''}`}>
                          <div className="text-xs text-gray-400">{['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}</div>
                          <div className={`text-lg font-extrabold ${dayColor}`}>
                            {d.getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 2. 시간표 바디 */}
                  {(() => {
                    const ghostsMaster = getGhostSchedules('master');
                    const ghostsVocal = getGhostSchedules('vocal');

                    return hours.map((hour) => (
                      <div key={hour} className="grid grid-cols-8 border-b border-gray-100 min-h-[80px]">
                        <div className="p-2 text-center text-xs font-bold text-gray-400 border-r border-gray-100 flex flex-col justify-between items-center py-2">
                          <span>{`PM ${hour > 12 ? hour - 12 : hour}`}</span>
                        </div>
                        {weekDays.map((day, i) => {
                          const dateStr = formatDateLocal(day);
                          const dayOfWeek = day.getDay();

                          const getScheduleItems = (gType) => {
                            const ghosts = gType === 'master' ? ghostsMaster : ghostsVocal;

                            // 실제 스케줄 가져오기 (Helper)
                            const getRealItems = (tStr) => {
                              const matchStr = `${tStr}`;
                              const normal = schedules.filter(s => s.date === dateStr && s.time === matchStr && (s.gridType || 'master') === gType);
                              const fixed = fixedSchedules.filter(s =>
                                s.dayOfWeek === dayOfWeek &&
                                s.time === matchStr &&
                                (s.gridType || 'master') === gType &&
                                (!s.fixedStartDate || s.fixedStartDate <= dateStr) &&
                                // [NEW] 취소 내역 확인 (날짜 + 시간 + 학생ID)
                                !scheduleCancellations.some(c => c.date === dateStr && c.time === matchStr && c.studentId === s.studentId)
                              );
                              const merged = [...normal];
                              fixed.forEach(f => { if (!merged.some(n => n.time === f.time)) merged.push(f); });
                              return merged;
                            };

                            const real00 = getRealItems(`${hour}:00`);
                            const real30 = getRealItems(`${hour}:30`);
                            const hasReal = real00.length > 0 || real30.length > 0;

                            let items = [...real00, ...real30];

                            // [수정] 해당 시간대(Hour)에 실제 스케줄이 하나라도 있으면 예정(Ghost)은 표시하지 않음
                            if (!hasReal) {
                              const now = new Date();
                              const filterValidGhost = (g) => {
                                const gTime = new Date(`${g.date}T${g.time}:00`);
                                return gTime > now;
                              };

                              const ghost00 = ghosts.filter(g => g.date === dateStr && g.time === `${hour}:00`).filter(filterValidGhost);
                              const ghost30 = ghosts.filter(g => g.date === dateStr && g.time === `${hour}:30`).filter(filterValidGhost);
                              items.push(...ghost00, ...ghost30);
                            }

                            return items;
                          };

                          const masterItems = getScheduleItems('master');
                          const vocalItems = getScheduleItems('vocal');

                          const renderItems = (items, gType) => (
                            items.length > 0 ? (
                              items.map((item, idx) => {
                                let statusStyle = '';
                                let statusIcon = null;
                                const isVocal = gType === 'vocal';

                                const [itemHour, itemMinute] = item.time.split(':');
                                const targetDateTime = new Date(`${item.date}T${itemHour.padStart(2, '0')}:${itemMinute}:00`);
                                const isPast = new Date() > targetDateTime;

                                if (item.isGhost) {
                                  statusStyle = 'bg-gray-100 text-gray-400 border-dashed border-gray-200 opacity-60';
                                }
                                else if (item.status === 'completed') {
                                  // 완료: 쌤(어두운 회색), 짱구(중간 회색) - 농도 상향
                                  statusStyle = isVocal
                                    ? 'bg-gray-300 text-gray-700 border-gray-400'
                                    : 'bg-gray-800 text-white border-black';
                                  statusIcon = <FaCheckCircle className="text-[9px] text-green-400" />;
                                }
                                else if (item.status === 'reschedule' || item.status === 'reschedule_assigned') {
                                  // 보강: 농도를 50에서 100으로 상향
                                  statusStyle = 'bg-gray-100 text-gray-600 border-dashed border-gray-300';
                                  statusIcon = <FaClock className="text-[9px] text-gray-400" />;
                                }
                                else if (item.status === 'absent') {
                                  statusStyle = isVocal
                                    ? 'bg-red-100 text-red-700 border-red-200'
                                    : 'bg-red-200 text-red-900 border-red-400 ring-1 ring-red-300';
                                  statusIcon = <FaTimesCircle className="text-[9px]" />;
                                }
                                else {
                                  // 일반 상태 (레슨, 상담 등) - 짱구 스케쥴 농도 전체 상향
                                  if (item.isFixed) {
                                    statusStyle = isVocal
                                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                                      : 'bg-purple-100 text-purple-950 border-purple-400';
                                  }
                                  else if (item.category === '상담') {
                                    statusStyle = isVocal
                                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                      : 'bg-emerald-200 text-emerald-950 border-emerald-400';
                                  }
                                  else if (item.category === '레슨') {
                                    // 레슨: 쌤(오렌지 진하게), 짱구(블루 선명하게)
                                    statusStyle = isVocal
                                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                                      : 'bg-orange-200 text-orange-950 border-orange-400 font-black';
                                  }
                                  else {
                                    statusStyle = isVocal
                                      ? 'bg-gray-100 text-gray-700 border-blue-300'
                                      : 'bg-gray-100 text-gray-700 border-orange-400';
                                  }
                                }

                                return (
                                  <div key={idx} onClick={(e) => { e.stopPropagation(); handleSlotClick(dateStr, String(itemHour), item.dayOfWeek, item, gType); }}
                                    className={`w-full rounded-md p-1 text-[12px] flex items-center gap-1 shadow-sm border overflow-hidden shrink-0 transition-all ${statusStyle}`}>

                                    {item.time.endsWith(':30') && (
                                      <span className={`px-1 rounded text-[10px] font-bold shrink-0 ${item.status === 'completed' ? 'bg-black/10' : 'bg-pink-100 text-pink-600'
                                        }`}>
                                        30
                                      </span>
                                    )}

                                    {item.isFixed && <FaThumbtack className="text-[8px] min-w-fit" />}
                                    {statusIcon}

                                    <span className="truncate font-bold">
                                      {item.category === '기타' && item.memo ? (
                                        item.memo
                                      ) : (
                                        <>
                                          {item.studentName || item.category}
                                          {item.isVocalProgress && <span className="text-pink-600 ml-1">V</span>}
                                          {!item.isGhost && item.memo && (
                                            item.memo === "추가수업"
                                              ? <FaPlus className="text-gray-600 ml-1 inline text-[10px]" />
                                              : <span className="font-normal opacity-70 ml-1">({item.memo})</span>
                                          )}
                                        </>
                                      )}
                                    </span>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <FaPlus className="text-gray-300 text-xs" />
                              </div>
                            )
                          );
                          return (
                            <div key={i} className="border-r border-gray-100 last:border-none p-0 flex flex-col h-full">

                              {/* Master 영역 (흰색 유지) */}
                              <div className="flex-auto min-h-[40px] bg-white p-1 flex flex-col gap-1 cursor-pointer relative group hover:bg-gray-50 transition-colors border-b border-gray-100"
                                onClick={() => handleSlotClick(dateStr, String(hour), dayOfWeek, null, 'master')}>
                                {renderItems(masterItems, 'master')}
                              </div>

                              {/* Vocal 영역 (수정됨: 회색 -> 연초록색) */}
                              {/* 기존: bg-gray-50 ... hover:bg-gray-200 */}
                              {/* 변경: bg-green-50 ... hover:bg-green-100 */}
                              <div className="flex-auto min-h-[40px] bg-green-50 p-1 flex flex-col gap-1 cursor-pointer relative group hover:bg-green-100 transition-colors"
                                onClick={() => handleSlotClick(dateStr, String(hour), dayOfWeek, null, 'vocal')}>
                                {renderItems(vocalItems, 'vocal')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ----- 출석부 탭 ----- */}
          {activeTab === 'attendance' && (
            // [수정] pb-20 추가
            <div className="flex flex-col gap-4 h-full p-4 md:p-8 lg:px-12 pb-20 overflow-y-auto">
              {/* 상단 컨트롤 */}
              <div className="flex-none flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">

                {/* 보기 모드 토글 + 초기화 로직 추가 */}
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button
                    onClick={() => {
                      setAttViewMode('12weeks');
                      setAttCategory('basic'); // 12주 보기 기본값
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-bold ${attViewMode === '12weeks' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                  >
                    12주 보기
                  </button>
                  <button
                    onClick={() => {
                      setAttViewMode('month');
                      setAttCategory('all'); // 월별 보기 기본값 (모든수강생)
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-bold ${attViewMode === 'month' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                  >
                    월별 보기
                  </button>
                </div>

                {/* 모드에 따른 탭 구성 변경 */}
                {attViewMode === '12weeks' ? (
                  <div className="tabs tabs-boxed bg-gray-100 p-1 rounded-full">
                    <a className={`tab rounded-full ${attCategory === 'basic' ? 'tab-active bg-black text-white' : ''}`} onClick={() => setAttCategory('basic')}>기본 수강생</a>
                    <a className={`tab rounded-full ${attCategory === 'monthly' ? 'tab-active bg-blue-600 text-white' : ''}`} onClick={() => setAttCategory('monthly')}>월정산</a>
                    <a className={`tab rounded-full ${attCategory === 'artist' ? 'tab-active bg-purple-600 text-white' : ''}`} onClick={() => setAttCategory('artist')}>아티스트</a>
                    <a className={`tab rounded-full ${attCategory === 'inactive' ? 'tab-active bg-gray-500 text-white' : ''}`} onClick={() => setAttCategory('inactive')}>비활성</a>
                  </div>
                ) : (
                  /* 월별 보기일 때: 날짜 네비게이션 + [모든수강생/월정산] 탭 */
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-xl">
                      <button onClick={() => setAttMonth(new Date(attMonth.setMonth(attMonth.getMonth() - 1)))} className="btn btn-xs btn-circle btn-ghost"><FaChevronLeft /></button>
                      <span className="text-sm font-bold text-gray-700 min-w-[80px] text-center">{attMonth.getFullYear()}.{String(attMonth.getMonth() + 1).padStart(2, '0')}</span>
                      <button onClick={() => setAttMonth(new Date(attMonth.setMonth(attMonth.getMonth() + 1)))} className="btn btn-xs btn-circle btn-ghost"><FaChevronRight /></button>
                    </div>

                    {/* 월별 보기용 탭 */}
                    <div className="tabs tabs-boxed bg-gray-100 p-1 rounded-full">
                      <a className={`tab rounded-full px-4 ${attCategory === 'all' ? 'tab-active bg-black text-white' : ''}`} onClick={() => setAttCategory('all')}>모든수강생</a>
                      <a className={`tab rounded-full px-4 ${attCategory === 'monthly' ? 'tab-active bg-blue-600 text-white' : ''}`} onClick={() => setAttCategory('monthly')}>월정산</a>
                    </div>
                  </div>
                )}

                {/* 잠금 버튼 및 12주 이동 버튼 */}
                <div className="flex items-center gap-4">

                  {/* [NEW] 12주 보기일 때 년도 선택 추가 */}
                  {attViewMode === '12weeks' && (
                    <select
                      className="select select-sm bg-transparent border-none font-extrabold text-lg focus:outline-none min-w-[100px]"
                      value={attBaseDate.getFullYear()}
                      onChange={handleAttYearChange}
                    >
                      {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => (
                        <option key={y} value={y}>{y}년</option>
                      ))}
                    </select>
                  )}

                  <button
                    className={`btn btn-sm gap-2 ${isAttendanceLocked ? 'btn-ghost text-gray-400' : 'bg-red-100 text-red-500 border-none'}`}
                    onClick={() => setIsAttendanceLocked(!isAttendanceLocked)}
                  >
                    {isAttendanceLocked ? <><FaLock /> 잠금</> : <><FaLockOpen /> 수정가능</>}
                  </button>

                  {attViewMode === '12weeks' && (
                    <>
                      <div className="w-[1px] h-6 bg-gray-200 mx-2"></div>
                      <button className="btn btn-sm btn-circle btn-ghost" onClick={() => {
                        const d = new Date(attBaseDate);
                        d.setDate(d.getDate() - (7 * 12));
                        setAttBaseDate(d);
                      }}><FaChevronLeft /></button>

                      <div className="text-center flex flex-col items-center justify-center min-w-[140px]">
                        {(() => {
                          const weeks = get12Weeks(attBaseDate);
                          return (
                            <>
                              <span className="font-extrabold text-gray-800 text-sm whitespace-nowrap leading-none mb-1">
                                {weeks[0].label} ~ {weeks[11].end.getFullYear().toString().slice(2)}.{String(weeks[11].end.getMonth() + 1).padStart(2, '0')}.{String(weeks[11].end.getDate()).padStart(2, '0')}
                              </span>
                              <span className="text-[10px] text-gray-400 font-bold leading-none">총 12주 코스</span>
                            </>
                          );
                        })()}
                      </div>

                      <button className="btn btn-sm btn-circle btn-ghost" onClick={() => {
                        const d = new Date(attBaseDate);
                        d.setDate(d.getDate() + (7 * 12));
                        setAttBaseDate(d);
                      }}><FaChevronRight /></button>

                      <button className="btn btn-sm btn-ghost text-xs" onClick={() => setAttBaseDate(getStartOfWeek(new Date()))}>오늘</button>
                    </>
                  )}
                </div>
              </div>

              {/* 메인 그리드 */}
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 flex-1 overflow-auto min-h-0">
                <table className="table w-full border-separate border-spacing-y-4">
                  <thead className="sticky top-0 bg-white z-20 shadow-sm">
                    <tr className="text-center text-gray-500 text-xs font-bold border-b-2 border-gray-100">
                      <th className="sticky left-0 bg-white z-30 min-w-[150px] border-r border-gray-100 pl-6 text-left py-4">이름</th>
                      {/* [추가됨] 출석부 컬럼 */}


                      {attViewMode === '12weeks' ? (
                        get12Weeks(attBaseDate).map((w, i) => (
                          <th key={i} className="min-w-[80px] border-r border-gray-50 last:border-none py-4 bg-white">
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] text-gray-400 mb-1">{w.weekNum}주차</span>
                              <span className="text-xs text-gray-800 font-bold">{w.label}</span>
                            </div>
                          </th>
                        ))
                      ) : (
                        getMonthWeeksForView(attMonth).map((w, i) => (
                          <th key={i} className="min-w-[80px] border-r border-gray-50 last:border-none py-4 bg-white">
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] text-gray-400 mb-1">{w.weekNum}주차</span>
                              <span className="text-xs text-gray-800 font-bold">{w.rangeLabel}</span>
                            </div>
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {students
                      .filter(s => {
                        if (attViewMode === 'month') {
                          // 월별 보기 필터링 로직
                          if (attCategory === 'monthly') {
                            if (!s.isMonthly) return false;
                          }

                          const monthWeeks = getMonthWeeksForView(attMonth);
                          if (monthWeeks.length === 0) return false;

                          const viewStart = monthWeeks[0].startStr;
                          const viewEnd = monthWeeks[monthWeeks.length - 1].endStr;

                          const hasScheduleInView = attSchedules.some(sch =>
                            sch.studentId === s.id &&
                            sch.date >= viewStart &&
                            sch.date <= viewEnd
                          );
                          return hasScheduleInView;

                        } else {
                          // 12주 보기: 카테고리 필터 적용
                          if (attCategory === 'basic') return s.isActive && !s.isMonthly && !s.isArtist;
                          if (attCategory === 'monthly') return s.isActive && s.isMonthly;
                          if (attCategory === 'artist') return s.isActive && s.isArtist;
                          if (attCategory === 'inactive') return !s.isActive;
                          return false;
                        }
                      })
                      .sort((a, b) => new Date(a.firstDate || 0) - new Date(b.firstDate || 0))
                      .map((student, idx) => {
                        const weeks = attViewMode === '12weeks' ? get12Weeks(attBaseDate) : getMonthWeeksForView(attMonth);

                        // [NEW] 기본 수강생 로테이션 시작일 계산 (완료된 수업 기준)
                        const rotationStarts = attCategory === 'basic' ? calculateRotationStarts(student) : new Set();

                        return (
                          <tr key={student.id} className="text-center hover:bg-gray-50 group">
                            <td className="sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-gray-100 text-left pl-6 py-3 font-bold text-gray-800 align-middle border-b-[2px] border-gray-300">
                              <span className="text-gray-400 text-xs mr-2">{idx + 1}</span>
                              {student.name}
                              {/* [NEW] 아티스트 카운트 표시 */}
                              {student.isArtist && <span className="text-[10px] text-purple-600 font-bold ml-1">({student.count || 0}회)</span>}

                              {attViewMode === 'month' && !student.isActive && <span className="ml-1 text-[9px] bg-gray-200 text-gray-500 px-1 rounded">종료</span>}

                              {/* [월별보기 > 월정산 탭 정산 계산 로직 & 청구 버튼] */}
                              {attViewMode === 'month' && attCategory === 'monthly' && (() => {
                                const weeks = getMonthWeeksForView(attMonth);
                                if (weeks.length === 0) return null;
                                const mStart = weeks[0].startStr;
                                const mEnd = weeks[weeks.length - 1].endStr;
                                const targetYearMonth = `${attMonth.getFullYear()}.${attMonth.getMonth() + 1}`; // 현재 보고 있는 월

                                const monthScheds = attSchedules.filter(s => {
                                  const sDate = new Date(s.date);
                                  return (
                                    s.studentId === student.id &&
                                    s.date >= mStart &&
                                    s.date <= mEnd &&
                                    s.status !== 'reschedule' &&
                                    // [핵심 추가] 스케줄 날짜의 '월'이 현재 보고있는 '월'과 일치해야 함
                                    sDate.getMonth() === attMonth.getMonth() &&
                                    sDate.getFullYear() === attMonth.getFullYear()
                                  );
                                });

                                const cntM = monthScheds.filter(s => (s.gridType === 'master' || !s.gridType) && s.category !== '상담').length;
                                const cntV_All = monthScheds.filter(s => s.gridType === 'vocal').length;

                                if (cntM === 0 && cntV_All === 0) return null;

                                const hasPending = monthScheds.some(s => !s.status || s.status === 'pending');
                                const statusLabel = hasPending ? '(진행중)' : '(완료)';
                                const statusColor = hasPending ? 'text-gray-400' : 'text-blue-600';

                                let planV = 0, planV30 = 0;
                                (student.schedule || []).forEach(w => {
                                  planV += Number(w.vocal || 0);
                                  planV30 += Number(w.vocal30 || 0);
                                });
                                const isV30 = planV30 > planV;

                                const rateM = Number(student.rates?.master || 0);
                                const rateV_Base = Number(student.rates?.vocal || 0);
                                const rateV_Final = isV30 ? rateV_Base * 0.5 : rateV_Base;

                                const amountM = cntM * rateM;
                                const amountV = cntV_All * rateV_Final;
                                const totalAmount = amountM + amountV;

                                return (
                                  <div className="mt-1.5 flex flex-col items-start gap-1 p-2 bg-blue-50/80 rounded-lg border border-blue-100 shadow-sm w-full">
                                    <div className="flex flex-wrap gap-x-2 text-[10px] text-gray-500 font-medium">
                                      {cntM > 0 && (
                                        <span className="whitespace-nowrap">
                                          M<span className="text-gray-400">({formatCurrency(rateM)})</span>
                                          ×{cntM}
                                        </span>
                                      )}
                                      {cntV_All > 0 && (
                                        <span className="whitespace-nowrap">
                                          {isV30 ? 'V30' : 'V'}<span className="text-gray-400">({formatCurrency(rateV_Final)})</span>
                                          ×{cntV_All}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center justify-between w-full pt-1 mt-0.5 border-t border-blue-200">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs font-extrabold text-blue-600">
                                          = {formatCurrency(totalAmount)}원
                                        </span>
                                        <span className={`text-[10px] font-bold ${statusColor}`}>
                                          {statusLabel}
                                        </span>
                                      </div>

                                      {/* [추가됨] 청구하기 버튼 */}
                                      {/* [수정됨] 이미 청구된 내역인지 확인 */}
                                      {(() => {
                                        const isAlreadyBilled = (student.unpaidList || []).some(
                                          unpaid => unpaid.memo === `${targetYearMonth}월 월정산 청구`
                                        );

                                        // [FIX] 결제 여부 확인 (최종 개선버전: 타입/포맷 무관하게 비교)
                                        const isPaidCompleted = settlementIncome.some(pay => {
                                          // 1. 학생 ID 비교 (문자열 변환)
                                          if (String(pay.studentId) !== String(student.id)) return false;

                                          // 2. 날짜 비교 완화 ([FIX] 년월 일치 여부, 구분자/자릿수 무관)
                                          // targetYearMonth(2025.3 or 2025.03) -> "2025-03"으로 엄격하게 정규화
                                          const [tYear, tMonth] = targetYearMonth.split(/[.-]/);
                                          const normTargetMonth = `${tYear}-${String(tMonth).padStart(2, '0')}`;

                                          const payDateStr = pay.targetDate || '';
                                          // pay.targetDate가 "2025.3.1"일 수도 있고 "2025-03-01"일 수도 있음 -> 정규화
                                          const [pYear, pMonth] = payDateStr.split(/[.-]/);
                                          const normPayMonth = `${pYear}-${String(pMonth).padStart(2, '0')}`;

                                          if (normPayMonth !== normTargetMonth) return false;

                                          // 3. 금액 비교 (모든 특수문자 제거 후 정수 변환)
                                          // 1000원 단위 차이 무시하고 정확히 일치하는지
                                          const payAmt = Number(String(pay.amount || '0').replace(/[^0-9]/g, ''));
                                          const reqAmt = Number(String(totalAmount || '0').replace(/[^0-9]/g, ''));
                                          return payAmt === reqAmt;
                                        });

                                        if (isPaidCompleted) {
                                          return (
                                            <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-600 text-[10px] font-bold rounded shadow-sm border border-orange-200">
                                              <FaCheckCircle className="text-[10px]" /> 결제완료
                                            </div>
                                          );
                                        }

                                        return isAlreadyBilled ? (
                                          /* 이미 청구된 경우: 비활성화 버튼 표시 */
                                          <div className="flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-500 text-[10px] font-bold rounded shadow-sm">
                                            <FaCheckCircle className="text-[10px]" /> 청구됨
                                          </div>
                                        ) : (
                                          /* 아직 청구 전인 경우: 활성화 버튼 표시 */
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleMonthlySettlementRequest(student, totalAmount, targetYearMonth);
                                            }}
                                            className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded shadow-sm hover:bg-blue-700 transition-colors cursor-pointer"
                                          >
                                            <FaFileInvoiceDollar className="text-[10px]" /> 청구하기
                                          </button>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                            {weeks.map((w, i) => {
                              const rotationWeek = getRotationWeek(student.firstDate, w.startStr);
                              const weekConfig = student.schedule && student.schedule[rotationWeek - 1];

                              // --- [FIX] 상태 표시 우선순위 로직 수정 ---
                              const isBasicStudent = attCategory === 'basic';
                              let uiState = null; // 'paid', 'billed', 'register' 중 하나
                              let targetUiDate = '';

                              if (isBasicStudent) {
                                // 이번 주차(w.start ~ w.end)의 날짜들을 하루씩 확인
                                for (let d = new Date(w.start); d <= w.end; d.setDate(d.getDate() + 1)) {
                                  const dStr = formatDateLocal(d);

                                  // 1순위: 결제 완료 확인 (student.lastDate와 일치하는지)
                                  if (student.lastDate === dStr) {
                                    uiState = 'paid';
                                    targetUiDate = dStr;
                                    break; // 우선순위 가장 높으므로 루프 종료
                                  }

                                  // 2순위: 청구 중(미결제) 확인 (unpaidList에 있는지)
                                  const isUnpaid = (student.unpaidList || []).some(u => u.targetDate === dStr);
                                  if (isUnpaid) {
                                    uiState = 'billed';
                                    targetUiDate = dStr;
                                    break;
                                  }

                                  // 3순위: 재등록 버튼 (계산된 로테이션 시작일인지)
                                  if (rotationStarts.has(dStr)) {
                                    uiState = 'register';
                                    targetUiDate = dStr;
                                    // 주의: 같은 주에 '결제완료'나 '청구중'이 이미 있다면 버튼을 덮어쓰지 않도록 
                                    // 루프를 계속 돌지 않고 여기서 break 할 수도 있지만,
                                    // 날짜가 겹치지 않는다면 버튼이 떠야 하므로 break는 신중해야 함.
                                    // 하지만 보통 한 주에 로테이션 시작이 두 번일 수는 없으므로 break.
                                    break;
                                  }
                                }
                              }
                              // ------------------------------------------------

                              const mCountBasic = Number(weekConfig?.master || 0);
                              const vCountBasic = Number(weekConfig?.vocal || 0) + Number(weekConfig?.vocal30 || 0);

                              /* 수정 후 (월 검증 추가) */
                              const weekSchedules = attSchedules.filter(s => {
                                const sDate = new Date(s.date);
                                return (
                                  s.studentId === student.id &&
                                  s.date >= w.startStr &&
                                  s.date <= w.endStr &&
                                  !s.memo.includes('보강(') &&
                                  // [핵심 추가] 월별 보기 모드일 때만 날짜 엄격 검증
                                  (attViewMode === 'month'
                                    ? (sDate.getMonth() === attMonth.getMonth() && sDate.getFullYear() === attMonth.getFullYear())
                                    : true)
                                );
                              });

                              const extraMCount = weekSchedules.filter(s => (s.gridType === 'master' || !s.gridType) && s.category !== '상담' && s.memo && s.memo.includes('추가')).length;
                              const extraVCount = weekSchedules.filter(s => s.gridType === 'vocal' && s.memo && s.memo.includes('추가')).length;

                              const mTotal = mCountBasic + extraMCount;
                              const vTotal = vCountBasic + extraVCount;

                              const completedM = weekSchedules
                                .filter(s => (s.gridType === 'master' || !s.gridType) && s.category !== '상담')
                                .sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));

                              const completedV = weekSchedules
                                .filter(s => s.gridType === 'vocal')
                                .sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));



                              // ... existing code inside map((student, idx) => { ...
                              const renderSlot = (type, index, actualScheds) => {
                                const sched = actualScheds[index];

                                // [핵심 추가] 데이터가 들어있는 경우, 현재 달의 데이터인지 확인
                                if (attViewMode === 'month' && sched) {
                                  const sDate = new Date(sched.date);
                                  if (sDate.getMonth() !== attMonth.getMonth() || sDate.getFullYear() !== attMonth.getFullYear()) {
                                    return null; // 다른 달 데이터면 그리지 않음
                                  }
                                }

                                const isMaster = type === 'M';

                                // [추가] 현재 선택된 월(attMonth) 정보
                                const currentYear = attMonth.getFullYear();
                                const currentMonth = attMonth.getMonth();

                                // [수정] 스케줄이 존재하더라도, 월별 보기 모드일 때는 해당 월의 날짜인지 한 번 더 검증
                                const isValidMonth = sched ? (
                                  new Date(sched.date).getMonth() === currentMonth &&
                                  new Date(sched.date).getFullYear() === currentYear
                                ) : true;

                                // 만약 월별 보기인데 다른 달의 날짜라면 렌더링하지 않음 (또는 null 반환)
                                if (attViewMode === 'month' && sched && !isValidMonth) {
                                  return null;
                                }

                                // ... (기존 로테이션 및 스타일 로직 동일)
                                let rotationInfo = { index: -1, label: '' };
                                if (sched) {
                                  rotationInfo = getScheduleRotationInfo(student, sched.id);
                                }
                                // ... (이하 동일)
                                const manualKey = `${student.id}_${w.startStr}_${type}_${index}`;
                                const manualRecord = periodAttendance[manualKey];
                                const manualStatus = manualRecord ? manualRecord.status : 'none';

                                // 기본 스타일 (스케줄 없을 때)
                                let boxClass = "bg-white border-dashed border-gray-200 text-gray-300";
                                let content = type + (index + 1);
                                let icon = null;
                                let statusColor = "text-gray-400";

                                if (sched) {
                                  const dateShort = formatMonthDay(sched.date);
                                  content = dateShort;

                                  // --- [VISUALIZATION] 로테이션 배경색 적용 (진하기 구분) ---
                                  if (rotationInfo.index !== -1) {
                                    const colorSet = ROTATION_COLORS[rotationInfo.index % ROTATION_COLORS.length];

                                    // M이면 진한색(m), V면 연한색(v) 적용
                                    const baseColor = isMaster ? colorSet.m : colorSet.v;

                                    // 텍스트 색상도 M은 좀 더 진하게 (선택사항)
                                    const textColor = isMaster ? 'text-gray-800' : 'text-gray-600';

                                    boxClass = `${baseColor} border-solid font-bold ${textColor}`;
                                  } else {
                                    // 로테이션 정보 없음 (기본)
                                    boxClass = isMaster
                                      ? "bg-gray-100 border-solid border-gray-300 text-gray-500"
                                      : "bg-white border-solid border-gray-200 text-gray-500";
                                  }
                                  // ----------------------------------------

                                  // 상태별 아이콘 및 텍스트 색상 처리 (기존 로직 유지)
                                  if (sched.status === 'completed') {
                                    icon = <FaCheck className="text-[9px]" />;
                                    statusColor = "text-green-600";
                                  } else if (sched.status === 'absent') {
                                    icon = <FaTimesCircle className="text-[9px]" />;
                                    statusColor = "text-red-500";
                                    boxClass += " text-red-600";
                                  } else if (sched.status === 'reschedule' || sched.status === 'reschedule_assigned') {
                                    content = "보강";
                                    icon = <FaClock className="text-[9px]" />;
                                    statusColor = "text-yellow-600";
                                    boxClass = "bg-yellow-50 border-dashed border-yellow-300 text-yellow-600";
                                  } else if (sched.status === 'late') {
                                    icon = <FaClock className="text-[9px]" />;
                                    statusColor = "text-yellow-600";
                                  }

                                } else {
                                  // 수동 체크 처리
                                  if (manualStatus === 'present') {
                                    boxClass = isMaster ? "bg-green-100 text-green-900" : "bg-green-50 text-green-700";
                                    icon = <FaCheck className="text-[9px]" />;
                                  } else if (manualStatus === 'late') {
                                    boxClass = isMaster ? "bg-yellow-100 text-yellow-900" : "bg-yellow-50 text-yellow-700";
                                    icon = <FaClock className="text-[9px]" />;
                                  } else if (manualStatus === 'absent') {
                                    boxClass = isMaster ? "bg-red-100 text-red-900" : "bg-red-50 text-red-700";
                                    icon = <FaTimesCircle className="text-[9px]" />;
                                  }
                                }

                                return (
                                  <div
                                    key={`${type}-${index}`}
                                    className={`h-7 w-10 rounded-md text-[9px] flex flex-col items-center justify-center border cursor-pointer leading-none gap-0.5 relative overflow-hidden ${boxClass}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePeriodAttendanceToggle(student.id, w.startStr, type, index);
                                    }}
                                  >
                                    {rotationInfo.label && (
                                      <span className="absolute top-0 right-0 bg-black/10 text-[6px] px-0.5 rounded-bl-sm font-extrabold text-gray-700 opacity-50">
                                        {rotationInfo.label}
                                      </span>
                                    )}

                                    <span className={statusColor}>{icon}</span>
                                    <span>{content}</span>
                                  </div>
                                );
                              };
                              return (
                                <td key={i} className="border-r border-gray-50 p-1 align-top min-h-[60px] border-b-[2px] border-gray-300 relative">

                                  {/* [FIX] 상태에 따른 UI 렌더링 (결제완료 > 청구중 > 재등록버튼) */}
                                  {uiState === 'paid' && (
                                    <div className="absolute top-0 right-0 left-0 -mt-3 flex justify-center z-10">
                                      <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold border border-green-200 flex items-center gap-0.5">
                                        <FaCheckCircle className="text-[7px]" /> 결제완료
                                      </span>
                                    </div>
                                  )}

                                  {uiState === 'billed' && (
                                    <div className="absolute top-0 right-0 left-0 -mt-3 flex justify-center z-10">
                                      <span className="text-[9px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-bold border border-red-200 animate-pulse">
                                        청구중
                                      </span>
                                    </div>
                                  )}

                                  {uiState === 'register' && (
                                    <div className="absolute top-0 right-0 left-0 -mt-3 flex justify-center z-10">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRegisterRotation(student, targetUiDate);
                                        }}
                                        className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold shadow-md hover:bg-blue-700 hover:scale-105 transition-all flex items-center gap-1"
                                      >
                                        <FaPlus className="text-[7px]" /> 재등록
                                      </button>
                                    </div>
                                  )}

                                  <div className="flex flex-col gap-1.5 h-full justify-center py-1 mt-1">
                                    {(mTotal > 0 || vTotal > 0) ? (
                                      <>
                                        {/* 1. Master 라인 (윗줄 고정) */}
                                        {/* min-h-[24px]로 설정하여 M 수업이 0개여도 높이를 확보해 V가 위로 올라오는 것을 방지합니다. */}
                                        <div className="flex gap-1 justify-center flex-wrap min-h-[24px]">
                                          {mTotal > 0 && Array.from({ length: mTotal }).map((_, idx) => renderSlot('M', idx, completedM))}
                                        </div>

                                        {/* 2. Vocal 라인 (아랫줄 고정) */}
                                        <div className="flex gap-1 justify-center flex-wrap min-h-[24px]">
                                          {vTotal > 0 && Array.from({ length: vTotal }).map((_, idx) => renderSlot('V', idx, completedV))}
                                        </div>
                                      </>
                                    ) : (
                                      /* 수업이 아예 없는 주차는 기존처럼 '-' 표시 */
                                      <div className="text-center text-gray-200 text-xs">-</div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-6 text-xs font-bold text-gray-500 px-6 py-2 bg-gray-50 rounded-full mx-4 mb-2">
                <span className="text-gray-400">범례:</span>
                <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-green-200 border border-green-300"></div> M출석</div>
                <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-green-50 border border-green-200"></div> V출석</div>
                <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-yellow-200 border border-yellow-300"></div> 보강완료</div>
                <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-red-200 border border-red-300"></div> 결석</div>
              </div>
            </div>
          )}

          {/* ----- 학생 관리 탭 (기존 유지) ----- */}
          {activeTab === 'students' && (
            // [수정] pb-20 추가
            <div className="flex flex-col h-full w-full p-4 md:p-8 lg:px-12 pb-20 gap-6 overflow-y-auto">
              {/* ... (이전 코드와 동일, 생략 없음) ... */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4"><div><h2 className="text-2xl md:text-3xl font-extrabold mb-2">수강생 리스트</h2><div className="flex gap-2"><button onClick={() => { setViewStatus('active'); setCurrentPage(1) }} className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'active' ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>수강중</button><button onClick={() => { setViewStatus('inactive'); setCurrentPage(1) }} className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'inactive' ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>종료/비활성</button><button onClick={() => { setViewStatus('artist'); setCurrentPage(1) }} className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'artist' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'}`}>아티스트</button></div></div><div className="flex gap-2 w-full md:w-auto"><div className="relative group flex-1 md:flex-none"><FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="검색..." className="input w-full md:w-64 bg-gray-50 border-2 border-gray-100 pl-10 rounded-2xl h-12 outline-none font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div><button onClick={() => { setEditingId(null); setFormData(initialFormState); setIsModalOpen(true) }} className="btn h-12 bg-gray-900 text-white border-none px-6 rounded-2xl font-bold shadow-lg flex items-center gap-2"><FaPlus /> 등록</button></div></div>
              <div className="bg-gray-50 rounded-[1.5rem] md:rounded-[2.5rem] p-2 min-h-[600px] flex flex-col"><div className="overflow-x-auto bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-sm flex-1"><table className="table w-full"><thead className="sticky top-0 bg-white z-10 shadow-sm"><tr className="text-gray-500 text-xs md:text-sm font-bold border-b-2 border-gray-100"><th className="py-4 md:py-6 pl-4 md:pl-10 w-16">No.</th><th className="py-4 md:py-6">이름</th><th className="hidden md:table-cell py-4 md:py-6">클래스 상세</th><th className="hidden md:table-cell py-4 md:py-6">예상 금액 (4주)</th><th className="hidden md:table-cell py-4 md:py-6">등록일 / 재등록예정</th><th className="py-4 md:py-6 pr-4 md:pr-10 text-right">관리</th></tr></thead><tbody>{currentItems.map((student, idx) => {
                const totalAmount = calculateTotalAmount(student); const daysPassed = getDaysPassed(student.lastDate); const isStale = daysPassed >= 29; const isExpanded = expandedStudentId === student.id; const isUnpaid = student.isPaid === false; const unpaidItems = student.unpaidList || []; let displayedHistory = []; let historyTotalPages = 0; let totalPaidAmount = 0; let totalUnpaidAmount = 0; if (isExpanded) { const unpaidRows = unpaidItems.map(item => ({ id: item.id, type: 'unpaid', paymentDate: '-', amount: item.amount || totalAmount, paymentMethod: 'unpaid', targetDate: item.targetDate, isCashReceipt: false, receiptMemo: '미결제 상태' })); const combinedHistory = [...unpaidRows, ...paymentHistory]; combinedHistory.sort((a, b) => { const dateA = a[historySort] || ''; const dateB = b[historySort] || ''; return dateB.localeCompare(dateA); }); historyTotalPages = Math.ceil(combinedHistory.length / historyPerPage); combinedHistory.forEach((item, index) => { item.cycle = combinedHistory.length - index; }); displayedHistory = combinedHistory.slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage); totalPaidAmount = paymentHistory.reduce((acc, cur) => acc + Number(cur.amount || 0), 0); totalUnpaidAmount = unpaidItems.reduce((acc, cur) => acc + Number(cur.amount || 0), 0); } return (<Fragment key={student.id}><tr className={`hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-none ${isUnpaid ? 'bg-red-50 hover:bg-red-50' : ''}`}>
                  <td className="pl-4 md:pl-10 font-bold text-gray-400">{filteredStudents.length - ((currentPage - 1) * itemsPerPage + idx)}</td>
                  {/* [수정됨] 이름 + 달력 아이콘 셀 */}
                  <td className="cursor-pointer" onClick={() => { setExpandedStudentId(isExpanded ? null : student.id); resetPaymentForm(totalAmount); }}>
                    <div className="flex items-center gap-2">
                      {/* 달력 버튼 (왼쪽) */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setViewingStudentAtt(student); }}
                        className="btn btn-sm btn-circle btn-ghost text-gray-400 hover:text-blue-600 hover:bg-blue-50 -ml-2"
                        title="전체 출석부 보기"
                      >
                        <FaCalendarAlt className="text-lg" />
                      </button>
                      {/* 이름 및 아이콘 */}
                      <span className="font-bold text-gray-800 text-base md:text-lg">{student.name}</span>
                      {student.isArtist && <FaStar className="text-purple-500 text-xs" />}
                      {isExpanded ? <FaChevronUp className="text-gray-400 text-xs" /> : <FaChevronDown className="text-gray-400 text-xs" />}
                    </div>
                    {/* 상태 뱃지들 (아래쪽) */}
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${student.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                        {student.isActive ? '수강' : '종료'}
                      </span>
                      {student.isMonthly && <span className="px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">월정산</span>}
                      {isUnpaid && <span className="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-600 font-bold">{unpaidItems.length}건 미결제</span>}
                    </div>
                  </td>
                  <td className="hidden md:table-cell"><div className="flex gap-2">{student.schedule?.map((w, i) => { const hasAny = Number(w.master) > 0 || Number(w.vocal) > 0 || Number(w.vocal30) > 0; return (<div key={i} className={`flex flex-col items-center border rounded-lg p-1 w-16 ${hasAny ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed opacity-50'}`}><span className="text-[10px] text-gray-400 font-bold">{i + 1}주</span>{Number(w.master) > 0 && <span className="text-[10px] text-orange-600 font-bold">M({w.master})</span>}{Number(w.vocal) > 0 && <span className="text-[10px] text-blue-600 font-bold">V({w.vocal})</span>}{Number(w.vocal30) > 0 && <span className="text-[10px] text-cyan-600 font-bold">V30({w.vocal30})</span>}</div>) })}</div></td><td className="hidden md:table-cell font-bold text-gray-800 text-base">{formatCurrency(totalAmount)}원</td><td className="hidden md:table-cell text-xs"><div className="flex items-center gap-1 mb-1"><span className="text-gray-400 w-8">최종:</span><span className="font-bold text-gray-700">{student.lastDate}</span>{isStale && <FaExclamationCircle className="text-red-500 text-sm animate-pulse" />}</div><div className="flex items-center gap-1"><span className="text-gray-400 w-8">예정:</span><input type="date" className="bg-gray-100 border border-gray-200 rounded px-1 py-0.5 text-xs outline-none" value={tempDates[student.id] || ''} onChange={(e) => setTempDates({ ...tempDates, [student.id]: e.target.value })} /><button onClick={() => handleAddUnpaid(student)} className="btn btn-xs btn-square bg-black text-white hover:bg-gray-800 border-none rounded"><FaPlus className="text-[10px]" /></button></div></td><td className="pr-4 md:pr-10 text-right"><div className="md:hidden mb-2 flex justify-end items-center gap-1"><input type="date" className="input input-xs border-gray-200" value={tempDates[student.id] || ''} onChange={(e) => setTempDates({ ...tempDates, [student.id]: e.target.value })} /><button onClick={() => handleAddUnpaid(student)} className="btn btn-xs btn-square bg-black text-white"><FaPlus /></button></div><div className="flex justify-end gap-2"><button onClick={() => toggleStatus(student)} className="btn btn-sm btn-square border-none bg-gray-100 text-gray-400">{student.isActive ? <FaUserSlash /> : <FaUserCheck />}</button><button onClick={() => handleEditClick(student)} className="btn btn-sm btn-square bg-gray-100 border-none text-gray-400 hover:text-orange-500"><FaEdit /></button><button onClick={() => handleDelete(student.id, student.name)} className="btn btn-sm btn-square bg-gray-100 border-none text-gray-400 hover:text-red-500"><FaTrash /></button></div></td></tr>{isExpanded && (<tr className="bg-orange-50/30"><td colSpan="6" className="p-0"><div className="p-4 md:p-6 flex flex-col gap-6" id="payment-form-area"><div className={`bg-white p-4 md:p-6 rounded-2xl shadow-sm border ${paymentForm.id ? 'border-blue-200 ring-2 ring-blue-100' : 'border-orange-100'}`}><h4 className="text-sm font-bold text-gray-800 mb-4 flex justify-between items-center"><div className="flex items-center gap-2"><FaCreditCard className="text-orange-500" />{paymentForm.id ? <span className="text-blue-600">수정중...</span> : '결제 등록'}{selectedUnpaidId && !paymentForm.id && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full animate-pulse">미결제 선택됨</span>}</div></h4><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end"><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">재등록일</label><input type="date" name="targetDate" className="input input-sm border-gray-200 bg-gray-50" value={paymentForm.targetDate} onChange={handlePaymentFormChange} /></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">결제일</label><input type="date" name="paymentDate" className="input input-sm border-gray-200 bg-gray-50" value={paymentForm.paymentDate} onChange={handlePaymentFormChange} /></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">수단</label><select name="method" className="select select-sm border-gray-200 bg-gray-50" value={paymentForm.method} onChange={handlePaymentFormChange}><option value="card">카드</option><option value="transfer">이체</option><option value="cash">현금</option></select></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">금액</label><input type="number" name="amount" className="input input-sm border-gray-200 bg-gray-50 font-bold" value={paymentForm.amount} onChange={handlePaymentFormChange} /></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">증빙</label><label className="flex items-center gap-2 cursor-pointer bg-gray-50 border border-gray-200 rounded-lg px-3 h-8 hover:bg-gray-100 transition-colors"><FaCamera className="text-gray-400" /><span className="text-xs text-gray-600 truncate max-w-[80px]">{paymentFile ? '선택됨' : '사진 첨부'}</span><input type="file" accept="image/*" className="hidden" onClick={(e) => e.target.value = null} onChange={(e) => setPaymentFile(e.target.files[0])} /></label></div></div><div className="mt-4 flex flex-col gap-4"><div className="flex items-center gap-2"><button className={`btn btn-sm ${paymentForm.isCashReceipt ? 'btn-warning text-black border-none font-bold' : 'btn-outline border-gray-300 text-gray-400'}`} onClick={() => setPaymentForm(prev => ({ ...prev, isCashReceipt: !prev.isCashReceipt }))}>현금영수증 {paymentForm.isCashReceipt ? 'ON' : 'OFF'}</button></div><input type="text" name="receiptMemo" placeholder="결제 관련 메모..." className="input input-sm border-gray-200 bg-gray-50 w-full" value={paymentForm.receiptMemo} onChange={handlePaymentFormChange} /><div className="flex gap-2 justify-end">{paymentForm.id && (<button className="btn btn-sm btn-ghost text-gray-500" onClick={() => resetPaymentForm(calculateTotalAmount(student))}><FaUndo className="mr-1" /> 취소</button>)}<button className={`btn btn-sm px-6 h-10 border-none text-white ${paymentForm.id ? 'bg-blue-600' : 'bg-black'}`} onClick={() => handlePaymentSave(student)}><FaCheckCircle className="mr-1" /> {paymentForm.id ? '수정 완료' : '결제 처리'}</button></div></div></div>{unpaidItems.length > 0 && (<div className="bg-red-50 p-4 rounded-2xl border border-red-100"><h4 className="text-xs font-bold text-red-500 mb-2">미결제 / 재등록 예정 내역 (클릭하여 처리)</h4><div className="flex flex-wrap gap-2">{unpaidItems.map((item) => (<div key={item.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm cursor-pointer transition-all ${selectedUnpaidId === item.id ? 'bg-red-100 border-red-300 ring-2 ring-red-200' : 'bg-white border-red-100 hover:bg-red-50'}`} onClick={() => handleUnpaidChipClick(student, item)}><div className="flex flex-col items-center leading-none"><span className="text-[10px] text-gray-400 mb-0.5">예정일</span><span className="text-sm font-bold text-red-600">{item.targetDate}</span></div><div className="w-[1px] h-6 bg-red-100 mx-1"></div><span className="text-xs font-bold text-gray-600">{formatCurrency(item.amount)}원</span><button onClick={(e) => { e.stopPropagation(); handleDeleteUnpaid(student, item.id); }} className="text-gray-300 hover:text-red-500 ml-1"><FaTimesCircle /></button></div>))}</div></div>)}<div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-center mb-3"><h4 className="text-sm font-bold text-gray-700 flex items-center gap-2"><FaHistory className="text-orange-500" /> 전체 내역 <span className="text-xs font-normal text-gray-400">(완료: {paymentHistory.length}건 / {formatCurrency(totalPaidAmount)}원 | 미납: {unpaidItems.length}건 / {formatCurrency(totalUnpaidAmount)}원)</span></h4><div className="flex gap-2 items-center"><button onClick={() => setHistorySort(historySort === 'paymentDate' ? 'targetDate' : 'paymentDate')} className="btn btn-xs bg-gray-100 text-gray-500 hover:bg-gray-200 border-none flex gap-1 items-center"><FaSort /> {historySort === 'paymentDate' ? '결제일순' : '재등록일순'}</button>{historyTotalPages > 1 && (<div className="flex gap-2"><button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1} className="btn btn-xs btn-circle btn-ghost"><FaChevronLeft /></button><span className="text-xs pt-0.5">{historyPage}/{historyTotalPages}</span><button onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages} className="btn btn-xs btn-circle btn-ghost"><FaChevronRight /></button></div>)}</div></div><div className="w-full overflow-x-auto"><table className="table table-xs w-full"><thead><tr className="bg-gray-50 text-gray-500 border-b border-gray-100"><th>회차</th><th>재등록일</th><th>결제일</th><th>금액</th><th>수단</th><th>증빙/메모</th><th className="text-center">사진</th><th className="text-right">관리</th></tr></thead><tbody>{displayedHistory.map((pay, i) => { const isUnpaidItem = pay.type === 'unpaid'; const label = pay.paymentMethod === 'card' ? '카드' : pay.paymentMethod === 'transfer' ? '이체' : pay.paymentMethod === 'cash' ? '현금' : pay.paymentMethod; return (<tr key={pay.id === 'unpaid' ? `unpaid-${i}` : pay.id} className={`border-b border-gray-50 last:border-none ${isUnpaidItem ? 'bg-red-50/50' : ''}`}><td className="font-bold text-gray-700">{pay.cycle}회차</td><td className={`font-bold ${isUnpaidItem ? 'text-red-500' : 'text-gray-500'}`}>{pay.targetDate || '-'}</td><td>{isUnpaidItem ? '-' : <span className="font-bold text-gray-700">{pay.paymentDate}</span>}</td><td><span className="font-bold text-black">{formatCurrency(pay.amount)}원</span></td><td>{isUnpaidItem ? <span className="text-red-500 text-xs font-bold">미결제</span> : <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">{label}</span>}</td><td><div className="flex flex-col">{pay.isCashReceipt && <span className="text-[10px] text-orange-600 font-bold">현금영수증</span>}<span className="text-gray-500 text-xs truncate max-w-[100px]">{pay.receiptMemo}</span></div></td><td className="text-center">{pay.imageUrl ? (<button onClick={() => setPreviewImage({ url: pay.imageUrl, sid: student.id, pid: pay.id })} className="btn btn-xs btn-square btn-ghost text-blue-500"><FaImage /></button>) : (!isUnpaidItem && <label className="cursor-pointer text-gray-300 hover:text-blue-500"><FaCamera /><input type="file" className="hidden" onClick={(e) => e.target.value = null} onChange={(e) => handleRetroactivePhotoUpload(student.id, pay.id, e.target.files[0])} /></label>)}</td><td className="text-right">{!isUnpaidItem ? (<div className="flex justify-end gap-1"><button onClick={() => handleEditHistoryClick(pay)} className="text-gray-300 hover:text-blue-500"><FaEdit className="text-xs" /></button><button onClick={() => handleDeletePayment(student.id, pay.id)} className="text-gray-300 hover:text-red-500"><FaTrash className="text-xs" /></button></div>) : (<span className="text-xs text-gray-400">상단에서 처리</span>)}</td></tr>); })}</tbody></table></div></div></div></td></tr>)}</Fragment>);

              })}</tbody></table></div><div className="flex justify-center mt-6 gap-4"><button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1} className="btn btn-circle btn-sm bg-white border-none shadow-sm disabled:text-gray-300"><FaChevronLeft /></button><span className="font-bold text-gray-600 text-sm">Page {currentPage}</span><button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages} className="btn btn-circle btn-sm bg-white border-none shadow-sm disabled:text-gray-300"><FaChevronRight /></button></div></div>
            </div>
          )}

          {/* ----- 정산 탭 (기존 유지) ----- */}
          {activeTab === 'settlement' && (
            <div className="flex flex-col gap-6 p-4 md:p-8 lg:px-12 pb-20 overflow-y-auto">
              {/* 상단 컨트롤러 */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex items-center bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100">
                    <button onClick={() => changeMonth(-1)} className="btn btn-circle btn-sm btn-ghost"><FaChevronLeft /></button>
                    <div className="flex items-center mx-2">
                      <select className="select select-sm bg-transparent border-none font-extrabold text-lg text-center w-24 focus:outline-none" value={currentDate.getFullYear()} onChange={handleYearChange}>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => <option key={y} value={y}>{y}년</option>)}
                      </select>
                      <select className="select select-sm bg-transparent border-none font-extrabold text-lg text-center w-20 focus:outline-none" value={currentDate.getMonth() + 1} onChange={handleMonthChange}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                      </select>
                    </div>
                    <button onClick={() => changeMonth(1)} className="btn btn-circle btn-sm btn-ghost"><FaChevronRight /></button>
                  </div>
                  <button onClick={fetchSettlementData} className="btn btn-sm btn-ghost text-gray-400"><FaUndo className="mr-1" /> 새로고침</button>
                </div>

                {/* 월별 메모 */}
                <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                  <div className="flex items-center gap-2 min-w-fit">
                    <FaStickyNote className="text-yellow-500 text-base" />
                    <span className="text-xs font-bold text-gray-500">메모</span>
                  </div>
                  <input
                    type="text"
                    className="input input-sm border-none bg-transparent flex-1 text-sm focus:outline-none"
                    placeholder="이달의 정산 특이사항 입력..."
                    value={settlementMemo}
                    onChange={(e) => setSettlementMemo(e.target.value)}
                  />
                  <button
                    onClick={handleSettlementMemoSave}
                    className="btn btn-xs bg-gray-100 text-gray-500 border-none hover:bg-black hover:text-white rounded-2xl shadow-md transition-all px-6 hover:shadow-lg"
                  >
                    <FaSave className="mr-1" /> 저장
                  </button>
                </div>
              </div>

              {/* 요약 카드 (슬림형) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* 1. 총 매출 */}
                <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-xs font-bold text-gray-400 flex items-center gap-2">
                      <FaMoneyBillWave className="text-green-500" /> 총 매출
                    </div>
                    <div className="text-[11px] text-gray-400">
                      (완료 {settlementIncome.length} / 미납 {settlementUnpaid.length})
                    </div>
                  </div>
                  <div className="text-xl font-extrabold text-gray-800 tracking-tight">
                    {formatCurrency(totalRevenueIncludingUnpaid)}원
                  </div>
                </div>

                {/* 2. 총 지출 */}
                <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-xs font-bold text-gray-400 flex items-center gap-2">
                      <FaFileInvoiceDollar className="text-red-500" /> 총 지출
                    </div>
                    <div className="text-[11px] text-gray-400">
                      ({expenses.length}건)
                    </div>
                  </div>
                  <div className="text-xl font-extrabold text-gray-800 tracking-tight">
                    {formatCurrency(totalExpense)}원
                  </div>
                </div>

                {/* 3. 순수익 */}
                <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 bg-blue-50/50">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-xs font-bold text-blue-500 flex items-center gap-2">
                      <FaCalculator /> 순수익 (예상)
                    </div>
                  </div>
                  <div className="text-xl font-extrabold text-blue-600 tracking-tight">
                    {formatCurrency(netProfitIncludingUnpaid)}원
                  </div>
                </div>

                {/* 4. 미수금 */}
                <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-xs font-bold text-gray-400 flex items-center gap-2">
                      <FaExclamationCircle className="text-orange-500" /> 미수금
                    </div>
                    <div className="text-[11px] text-orange-400 font-bold">
                      ({settlementUnpaid.length}건 미결제)
                    </div>
                  </div>
                  <div className="text-xl font-extrabold text-gray-400 tracking-tight">
                    {formatCurrency(totalUnpaid)}원
                  </div>
                </div>
              </div>

              {/* 하단 상세 내역 (수익 내역 / 지출 관리) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* 1. 수익 내역 */}
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[600px]">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800">수익 내역</h3>
                    <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">입금완료</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <table className="table table-sm w-full">
                      <thead>
                        <tr className="text-gray-400">
                          <th>재등록일</th>
                          <th>이름</th>
                          <th>금액</th>
                          <th>결제일(수단)</th>
                          <th className="text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settlementIncome.map((item, i) => (
                          <tr key={i} className="border-b border-gray-50 last:border-none cursor-pointer hover:bg-gray-50" onClick={() => handleGoToStudent(item.studentId, item.studentName)}>
                            <td className="font-bold text-gray-600">{item.targetDate}</td>
                            <td className="font-bold flex items-center gap-1">
                              {item.studentName}
                              <FaExternalLinkAlt className="text-[10px] text-gray-300" />
                            </td>
                            <td className="font-bold text-blue-600">{formatCurrency(item.amount)}</td>
                            <td className="text-xs text-gray-400 flex items-center gap-1">
                              <span className="font-bold text-gray-600">{item.paymentDate}</span>
                              <span>({item.paymentMethod === 'card' ? '카드' : item.paymentMethod === 'transfer' ? '이체' : '현금'})</span>
                            </td>
                            <td className="text-right">
                              <button onClick={(e) => { e.stopPropagation(); handleDeletePayment(item.studentId, item.id); }} className="text-gray-300 hover:text-red-500">
                                <FaTrash />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {settlementIncome.length === 0 && <div className="text-center text-gray-300 py-10">내역이 없습니다.</div>}
                  </div>

                  {/* 미수금 예정 리스트 */}
                  <div className="border-t border-gray-100 bg-gray-50 p-4">
                    <h4 className="text-xs font-bold text-gray-500 mb-2">미수금 예정 리스트</h4>
                    <div className="h-32 overflow-y-auto">
                      <table className="table table-xs w-full">
                        <tbody>
                          {settlementUnpaid.map((item, i) => (
                            <tr key={i} className="border-none cursor-pointer hover:bg-gray-50" onClick={() => handleGoToStudent(item.studentId, item.studentName)}>
                              <td className="text-gray-400">{item.targetDate}</td>
                              <td className="text-gray-600 font-bold flex items-center gap-1">
                                {item.studentName}
                                <FaExternalLinkAlt className="text-[10px] text-gray-300" />
                              </td>
                              <td className="text-gray-400">{formatCurrency(item.amount)}원</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* 2. 지출 관리 */}
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[600px]">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800">지출 관리</h3>
                    <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded-lg">지출등록</span>
                  </div>

                  {/* 지출 입력 폼 */}
                  <div className="p-4 bg-gray-50 m-4 rounded-2xl border border-gray-200">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        type="date"
                        name="date"
                        className="input input-sm bg-white border-gray-200"
                        value={expenseForm.date}
                        onChange={handleExpenseChange}
                      />
                      <select
                        name="category"
                        className="select select-sm bg-white border-gray-200"
                        value={expenseForm.category}
                        onChange={handleExpenseChange}
                      >
                        {/* 동적 카테고리 필터링: 이미 등록된 항목 제외 */}
                        {(() => {
                          const registeredCats = new Set(expenses.filter(e => e.category !== '기타').map(e => e.category));
                          // 현재 수정중인 항목의 카테고리는 선택 가능해야 함
                          if (editingExpenseId) {
                            const editingItem = expenses.find(e => e.id === editingExpenseId);
                            if (editingItem) registeredCats.delete(editingItem.category);
                          }

                          return Object.keys(expenseDefaults).filter(k => k === '기타' || !registeredCats.has(k)).map(k => (
                            <option key={k} value={k}>{k}</option>
                          ));
                        })()}
                      </select>
                    </div>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="number"
                        name="amount"
                        placeholder="금액"
                        className="input input-sm bg-white border-gray-200 w-1/3 font-bold"
                        value={expenseForm.amount}
                        onChange={handleExpenseChange}
                      />
                      <input
                        type="text"
                        name="memo"
                        placeholder="메모"
                        className="input input-sm bg-white border-gray-200 flex-1"
                        value={expenseForm.memo}
                        onChange={handleExpenseChange}
                      />
                    </div>
                    <div className="flex gap-2">
                      {editingExpenseId && <button onClick={cancelExpenseEdit} className="btn btn-sm btn-ghost flex-1">취소</button>}
                      <button
                        onClick={handleExpenseSubmit}
                        className={`btn btn-sm ${editingExpenseId ? 'bg-blue-600' : 'bg-black'} text-white flex-1 border-none shadow-md hover:shadow-lg transition-all rounded-xl`}
                      >
                        {editingExpenseId ? '수정 완료' : '지출 추가'}
                      </button>
                    </div>
                  </div>

                  {/* 지출 리스트 */}
                  <div className="flex-1 p-4 pt-0">
                    <table className="table table-sm w-full">
                      <thead>
                        <tr className="text-gray-400">
                          <th>날짜</th>
                          <th>항목</th>
                          <th>금액</th>
                          <th>메모</th>
                          <th className="text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((item) => (
                          <tr key={item.id} className="border-b border-gray-50 last:border-none">
                            <td className="text-gray-500">{item.date}</td>
                            <td className="font-bold text-gray-700">{item.category}</td>
                            <td className="font-bold text-red-500">-{formatCurrency(item.amount)}</td>
                            <td className="text-xs text-gray-400">{item.memo}</td>
                            <td className="text-right">
                              <div className="flex justify-end gap-1">
                                <button onClick={() => handleEditExpenseClick(item)} className="text-gray-300 hover:text-blue-500">
                                  <FaEdit />
                                </button>
                                <button onClick={() => handleExpenseDelete(item.id)} className="text-gray-300 hover:text-red-500">
                                  <FaTimesCircle />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {expenses.length === 0 && <div className="text-center text-gray-300 py-10">지출 내역이 없습니다.</div>}

                    {/* 보컬 진행 지출 관리 영역 */}
                    {(() => {
                      const currentMonthPrefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

                      const vocalCompletedEvents = monthlySchedules
                        .filter(s => s.gridType === 'vocal' && s.status === 'completed' && s.isVocalProgress && s.date.startsWith(currentMonthPrefix))
                        .sort((a, b) => a.date.localeCompare(b.date));

                      const totalVocalWage = vocalCompletedEvents.length * 30000;

                      const existingWageExpense = expenses.find(e =>
                        e.category === '임금' && e.isVocalWage && e.targetMonth === currentMonthPrefix
                      );

                      return (
                        <div className="mt-4 pt-4 border-t border-gray-100 bg-gray-50 rounded-xl p-4 mb-4">
                          <h4 className="text-sm font-bold text-gray-700 mb-2 flex justify-between items-center">
                            <span>{currentDate.getMonth() + 1}월 보컬 추가 수업</span>
                            <span className="text-blue-600">{formatCurrency(totalVocalWage)}원 <span className="text-xs text-gray-400">({vocalCompletedEvents.length}건)</span></span>
                          </h4>
                          <div className="text-xs text-gray-500 mb-2">
                            {currentDate.getMonth() + 1}월 보컬추가 : 회당 30,000원 x {vocalCompletedEvents.length}건 = {formatCurrency(totalVocalWage)}원
                          </div>

                          <div className="bg-white rounded-lg border border-gray-200 mb-3 max-h-32 overflow-y-auto">
                            {vocalCompletedEvents.length === 0 ? (
                              <div className="text-center text-gray-300 py-3 text-xs">해당 내역 없음</div>
                            ) : (
                              <table className="table table-xs w-full">
                                <tbody>
                                  {vocalCompletedEvents.map((ev, idx) => (
                                    <tr key={idx} className="border-b border-gray-50 last:border-none">
                                      <td className="text-gray-500 w-24 pl-4">
                                        {ev.date.substring(5).replace('-', '월') + '일'}
                                      </td>
                                      <td className="font-bold text-gray-700">
                                        {ev.studentName} 학생
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>

                          {vocalCompletedEvents.length > 0 && (
                            existingWageExpense ? (
                              existingWageExpense.paidDate ? (
                                <button disabled className="btn btn-sm w-full bg-green-100 text-green-600 border-none rounded-xl font-bold">
                                  지급 완료 ({existingWageExpense.paidDate})
                                </button>
                              ) : (
                                <button
                                  onClick={async () => {
                                    if (!window.confirm(`${formatCurrency(totalVocalWage)}원을 지급 처리하시겠습니까?`)) return;
                                    try {
                                      await updateDoc(doc(db, "expenses", existingWageExpense.id), {
                                        paidDate: formatDateLocal(new Date()),
                                        memo: existingWageExpense.memo + " [지급완료]"
                                      });
                                      fetchSettlementData();
                                    } catch (e) { console.error(e); alert("처리 실패"); }
                                  }}
                                  className="btn btn-sm w-full bg-blue-600 text-white border-none hover:bg-blue-700 shadow-md rounded-xl"
                                >
                                  지급 하기
                                </button>
                              )
                            ) : (
                              <button
                                onClick={async () => {
                                  if (!window.confirm(`${currentDate.getMonth() + 1}월 보컬 수업료 ${formatCurrency(totalVocalWage)}원을 지출로 등록하시겠습니까?`)) return;
                                  try {
                                    await addDoc(collection(db, "expenses"), {
                                      date: formatDateLocal(new Date()),
                                      category: '임금',
                                      amount: totalVocalWage,
                                      memo: `${currentDate.getMonth() + 1}월 보컬 수업료 (${vocalCompletedEvents.length}건)`,
                                      isVocalWage: true,
                                      targetMonth: currentMonthPrefix,
                                      paidDate: null
                                    });
                                    fetchSettlementData();
                                  } catch (e) { console.error(e); alert("등록 실패"); }
                                }}
                                className="btn btn-sm w-full bg-black text-white border-none hover:bg-gray-800 shadow-md rounded-xl"
                              >
                                지출 등록
                              </button>
                            )
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
        {/* [FIX] 학생 개인별 전체 출석부 (재등록 버튼 계산 로직 수정) */}
        {viewingStudentAtt && (
          <div className="fixed inset-0 z-[9999] bg-white flex flex-col overflow-hidden animate-fade-in-up">
            {/* 상단 헤더 */}
            <div className="flex-none flex items-center justify-between p-4 md:p-6 border-b border-gray-100 bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <button onClick={closeStudentAttView} className="btn btn-circle btn-ghost text-gray-500">
                  <FaChevronLeft className="text-xl" />
                </button>
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
                    {viewingStudentAtt.name} <span className="text-lg font-normal text-gray-400">전체 히스토리 (20주 보기)</span>
                  </h2>
                  <p className="text-xs text-gray-400 font-bold mt-1 flex gap-2">
                    <span>등록일: {viewingStudentAtt.firstDate}</span>
                    <span className="text-gray-300">|</span>
                    <span className="text-blue-600">첫 수업일: {studentFullHistory.length > 0 ? studentFullHistory[0].date : '-'}</span>
                  </p>
                </div>
              </div>
              <button onClick={closeStudentAttView} className="btn btn-sm bg-gray-900 text-white border-none rounded-xl">
                닫기
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
              {(() => {
                // 1. 데이터 준비
                let startDateStr = viewingStudentAtt.firstDate || formatDateLocal(new Date());
                if (studentFullHistory.length > 0) startDateStr = studentFullHistory[0].date;
                const startMonday = getStartOfWeek(startDateStr);

                const lastSched = studentFullHistory[studentFullHistory.length - 1];
                let endDate = new Date();
                if (lastSched && new Date(lastSched.date) > endDate) endDate = new Date(lastSched.date);
                endDate.setDate(endDate.getDate() + 28);

                // 2. 주차 생성
                const allWeeks = [];
                let current = new Date(startMonday);
                let weekCount = 1;
                while (current <= endDate) {
                  const wStart = new Date(current);
                  const wEnd = new Date(current);
                  wEnd.setDate(wEnd.getDate() + 6);
                  allWeeks.push({
                    id: weekCount,
                    start: wStart,
                    end: wEnd,
                    startStr: formatDateLocal(wStart),
                    endStr: formatDateLocal(wEnd),
                    label: `${wStart.getFullYear().toString().slice(2)}.${String(wStart.getMonth() + 1).padStart(2, '0')}.${String(wStart.getDate()).padStart(2, '0')}`
                  });
                  current.setDate(current.getDate() + 7);
                  weekCount++;
                }

                // 3. 20주 청크
                const chunkedWeeks = [];
                for (let i = 0; i < allWeeks.length; i += 20) {
                  chunkedWeeks.push(allWeeks.slice(i, i + 20));
                }

                // 4. [로컬 전용] 로테이션 정보 계산 (History 데이터 사용)
                const getLocalRotationInfo = (targetSchedId) => {
                  let reqM = 0, reqV = 0;
                  (viewingStudentAtt.schedule || []).forEach(w => {
                    reqM += Number(w.master || 0);
                    reqV += Number(w.vocal || 0) + Number(w.vocal30 || 0);
                  });
                  const allCompleted = studentFullHistory.filter(s =>
                    s.date >= viewingStudentAtt.firstDate &&
                    (s.status === 'completed' || s.status === 'late' || s.status === 'absent')
                  );
                  const target = allCompleted.find(s => s.id === targetSchedId);
                  if (!target) return { index: -1, label: '' };

                  const isTargetMaster = (target.gridType === 'master' || !target.gridType);
                  let typeScheds = [], limit = 0;
                  if (isTargetMaster) {
                    if (reqM === 0) return { index: 0, label: 'R1' };
                    typeScheds = allCompleted.filter(s => (s.gridType === 'master' || !s.gridType));
                    limit = reqM;
                  } else {
                    if (reqV === 0) return { index: 0, label: 'R1' };
                    typeScheds = allCompleted.filter(s => s.gridType === 'vocal');
                    limit = reqV;
                  }
                  const myIndex = typeScheds.findIndex(s => s.id === targetSchedId);
                  if (myIndex === -1) return { index: -1, label: '' };
                  const rotationIndex = Math.floor(myIndex / limit);
                  return { index: rotationIndex, label: `R${rotationIndex + 1}` };
                };

                // 5. [수정됨] 재등록 버튼 날짜 계산 (로컬 데이터 사용)
                const calculateLocalStarts = () => {
                  const s = viewingStudentAtt;
                  // [NEW] 월정산, 아티스트 학생은 재등록 버튼 노출 제외
                  if (s.isMonthly || s.isArtist) return new Set();

                  let reqM = 0, reqV = 0;
                  (s.schedule || []).forEach(w => {
                    reqM += Number(w.master || 0);
                    reqV += Number(w.vocal || 0) + Number(w.vocal30 || 0);
                  });
                  if (reqM === 0 && reqV === 0) return new Set();

                  // 기준일 설정
                  let anchorDate = s.firstDate;
                  if (s.lastDate && s.lastDate > anchorDate) anchorDate = s.lastDate;
                  if (s.unpaidList && s.unpaidList.length > 0) {
                    const sortedUnpaid = [...s.unpaidList].sort((a, b) => new Date(b.targetDate) - new Date(a.targetDate));
                    if (sortedUnpaid[0].targetDate > anchorDate) anchorDate = sortedUnpaid[0].targetDate;
                  }

                  // 완료된 스케쥴만 추출 (여기가 핵심: 전역변수 대신 studentFullHistory 사용)
                  const validScheds = studentFullHistory.filter(sch =>
                    sch.date >= s.firstDate &&
                    (sch.status === 'completed' || sch.status === 'late' || sch.status === 'absent')
                  );

                  const mScheds = validScheds.filter(sch => sch.gridType === 'master' || !sch.gridType);
                  const vScheds = validScheds.filter(sch => sch.gridType === 'vocal');

                  const starts = new Set();
                  for (let i = 1; i <= 100; i++) {
                    let mDate = null, vDate = null;
                    if (reqM > 0) {
                      const idx = i * reqM;
                      if (idx < mScheds.length) mDate = mScheds[idx].date;
                    }
                    if (reqV > 0) {
                      const idx = i * reqV;
                      if (idx < vScheds.length) vDate = vScheds[idx].date;
                    }

                    let trigger = null;
                    if (mDate && vDate) trigger = mDate < vDate ? mDate : vDate;
                    else if (mDate) trigger = mDate;
                    else if (vDate) trigger = vDate;

                    if (trigger && trigger > anchorDate) starts.add(trigger);
                  }
                  return starts;
                };

                const localRotationStarts = calculateLocalStarts();

                return (
                  <div className="flex flex-col gap-6 pb-20">
                    {chunkedWeeks.map((chunk, rowIdx) => (
                      <div key={rowIdx} className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 overflow-x-auto">
                        <div className="min-w-max">
                          {/* 헤더 */}
                          <div className="flex border-b border-gray-100 pb-3 mb-3">
                            <div className="w-24 shrink-0 flex items-center justify-center font-extrabold text-gray-300 text-xs border-r border-gray-100 mr-3">
                              {chunk[0].id}주 ~ {chunk[chunk.length - 1].id}주
                            </div>
                            {chunk.map(w => (
                              <div key={w.id} className="w-16 md:w-20 shrink-0 text-center">
                                <div className="text-[10px] text-gray-400 font-bold mb-0.5">{w.id}주차</div>
                                <div className="text-[11px] text-gray-800 font-extrabold">{w.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* 내용 */}
                          <div className="flex items-start">
                            <div className="w-24 shrink-0 border-r border-gray-100 mr-3 flex items-center justify-center self-stretch">
                              <span className="text-xs font-bold text-gray-400">History</span>
                            </div>

                            {chunk.map(w => {
                              const weekScheds = studentFullHistory.filter(s =>
                                s.date >= w.startStr && s.date <= w.endStr && !s.memo.includes('보강(')
                              );
                              const completedM = weekScheds.filter(s => (s.gridType === 'master' || !s.gridType) && s.category !== '상담');
                              const completedV = weekScheds.filter(s => s.gridType === 'vocal');

                              let uiState = null;
                              let targetUiDate = '';

                              for (let d = new Date(w.start); d <= w.end; d.setDate(d.getDate() + 1)) {
                                const dStr = formatDateLocal(d);
                                if (viewingStudentAtt.lastDate === dStr) { uiState = 'paid'; targetUiDate = dStr; break; }
                                const isUnpaid = (viewingStudentAtt.unpaidList || []).some(u => u.targetDate === dStr);
                                if (isUnpaid) { uiState = 'billed'; targetUiDate = dStr; break; }
                                if (localRotationStarts.has(dStr)) { uiState = 'register'; targetUiDate = dStr; break; }
                              }

                              return (
                                <div key={w.id} className="w-16 md:w-20 shrink-0 flex flex-col items-center min-h-[60px] relative pt-2">
                                  {uiState === 'paid' && <div className="absolute top-[-9px] z-10"><span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold border border-green-200 flex items-center gap-0.5"><FaCheckCircle className="text-[7px]" /> 결제</span></div>}
                                  {uiState === 'billed' && <div className="absolute top-[-9px] z-10"><span className="text-[9px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-bold border border-red-200 animate-pulse">청구중</span></div>}
                                  {uiState === 'register' && (
                                    <div className="absolute top-[-9px] z-10">
                                      <button onClick={(e) => { e.stopPropagation(); handleRegisterRotation(viewingStudentAtt, targetUiDate); }} className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold shadow-md hover:bg-blue-700 flex items-center gap-1"><FaPlus className="text-[7px]" /> 재등록</button>
                                    </div>
                                  )}

                                  <div className="flex flex-col gap-1.5 w-full items-center mt-2">
                                    <div className="flex gap-1 justify-center flex-wrap min-h-[24px]">
                                      {completedM.length > 0 ? completedM.map((s, idx) => {
                                        const rotationInfo = getLocalRotationInfo(s.id);
                                        const dateShort = formatMonthDay(s.date);
                                        let boxClass = rotationInfo.index !== -1 ? `${ROTATION_COLORS[rotationInfo.index % ROTATION_COLORS.length].m} border-solid font-bold text-gray-800` : "bg-gray-100 border-solid border-gray-300 text-gray-500";
                                        let icon = null; let statusColor = "text-gray-400";
                                        if (s.status === 'completed') { icon = <FaCheck className="text-[9px]" />; statusColor = "text-green-700"; }
                                        else if (s.status === 'absent') { icon = <FaTimesCircle className="text-[9px]" />; statusColor = "text-red-600"; boxClass += " text-red-600 bg-red-50 border-red-200"; }
                                        else if (s.status === 'reschedule' || s.status === 'reschedule_assigned') { icon = <FaClock className="text-[9px]" />; statusColor = "text-yellow-700"; boxClass = "bg-yellow-50 border-dashed border-yellow-300 text-yellow-700"; }

                                        return (<div key={idx} className={`h-7 w-10 rounded-md text-[9px] flex flex-col items-center justify-center border cursor-pointer leading-none gap-0.5 relative overflow-hidden shadow-sm ${boxClass}`}>{rotationInfo.label && <span className="absolute top-0 right-0 bg-black/10 text-[6px] px-0.5 rounded-bl-sm font-extrabold text-gray-700 opacity-50">{rotationInfo.label}</span>}<span className={statusColor}>{icon}</span><span>{dateShort}</span></div>);
                                      }) : <div className="h-7 w-10"></div>}
                                    </div>
                                    <div className="flex gap-1 justify-center flex-wrap min-h-[24px]">
                                      {completedV.length > 0 ? completedV.map((s, idx) => {
                                        const rotationInfo = getLocalRotationInfo(s.id);
                                        const dateShort = formatMonthDay(s.date);
                                        let boxClass = rotationInfo.index !== -1 ? `${ROTATION_COLORS[rotationInfo.index % ROTATION_COLORS.length].v} border-solid font-bold text-gray-600` : "bg-white border-solid border-gray-200 text-gray-500";
                                        let icon = null; let statusColor = "text-gray-400";
                                        if (s.status === 'completed') { icon = <FaCheck className="text-[9px]" />; statusColor = "text-green-600"; }
                                        else if (s.status === 'absent') { icon = <FaTimesCircle className="text-[9px]" />; statusColor = "text-red-500"; boxClass += " text-red-600 bg-red-50 border-red-200"; }
                                        else if (s.status === 'reschedule' || s.status === 'reschedule_assigned') { icon = <FaClock className="text-[9px]" />; statusColor = "text-yellow-600"; boxClass = "bg-yellow-50 border-dashed border-yellow-300 text-yellow-600"; }

                                        return (<div key={idx} className={`h-7 w-10 rounded-md text-[9px] flex flex-col items-center justify-center border cursor-pointer leading-none gap-0.5 relative overflow-hidden shadow-sm ${boxClass}`}>{rotationInfo.label && <span className="absolute top-0 right-0 bg-black/10 text-[6px] px-0.5 rounded-bl-sm font-extrabold text-gray-700 opacity-50">{rotationInfo.label}</span>}<span className={statusColor}>{icon}</span><span>{dateShort}</span></div>);
                                      }) : <div className="h-7 w-10"></div>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* 모달들 (스케쥴, 수강생 등록) */}
        {isScheduleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-md p-4">

            {/* [수정됨] gridType이 'master'가 아니면(짱구일정이면) 연한 초록 배경(bg-green-50) 적용 */}
            <div className={`w-full max-w-sm rounded-2xl shadow-xl p-6 relative transition-colors duration-200 ${scheduleForm.gridType === 'master' ? 'bg-white' : 'bg-green-50 border-2 border-green-100'}`}>

              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                {/* 제목 옆에 점으로 색상 힌트 추가 */}
                <div className={`w-2 h-2 rounded-full ${scheduleForm.gridType === 'master' ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                {selectedSlot.date} {selectedSlot.time}:00 {scheduleForm.gridType === 'master' ? '쌤일정' : '짱구일정'}
              </h3>

              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="minute" className="radio radio-sm radio-primary" checked={selectedMinute === '00'} onChange={() => setSelectedMinute('00')} />
                  <span className="font-bold">00분 (정각)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="minute" className="radio radio-sm radio-primary" checked={selectedMinute === '30'} onChange={() => setSelectedMinute('30')} />
                  <span className="font-bold">30분</span>
                </label>
              </div>

              {/* 탭 버튼 색상도 배경에 맞춰 살짝 조정 */}
              <div className={`tabs tabs-boxed p-1 mb-4 ${scheduleForm.gridType === 'master' ? 'bg-gray-100' : 'bg-green-100/50'}`}>
                <a className={`tab flex-1 ${scheduleTab === 'lesson' ? 'tab-active bg-white text-black font-bold shadow-sm' : ''}`} onClick={() => handleTabChange('lesson')}>수강생 레슨</a>
                <a className={`tab flex-1 ${scheduleTab === 'personal' ? 'tab-active bg-white text-black font-bold shadow-sm' : ''}`} onClick={() => handleTabChange('personal')}>개인 일정</a>
              </div>

              <div className="flex flex-col gap-3">
                {scheduleTab === 'lesson' ? (
                  <>
                    <select className="select select-sm border-gray-200 bg-white"
                      onChange={(e) => {
                        const [sId, sName] = e.target.value.split('|');
                        setScheduleForm({ ...scheduleForm, studentId: sId, studentName: sName, category: '레슨' });
                      }}>
                      <option value="">학생 선택</option>
                      {availableStudents.map(s => <option key={s.id} value={`${s.id}|${s.name}`}>{s.name}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <select className="select select-sm border-gray-200 bg-white" value={scheduleForm.category} onChange={(e) => setScheduleForm({ ...scheduleForm, category: e.target.value })}>
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
                          <option value="기타">기타</option>
                        </>
                      )}
                    </select>
                    <div className="form-control">
                      <label className="label cursor-pointer justify-start gap-2">
                        <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={scheduleForm.isFixed} onChange={(e) => setScheduleForm({ ...scheduleForm, isFixed: e.target.checked })} />
                        <span className="label-text font-bold text-gray-700">매주 이 시간 고정</span>
                      </label>
                    </div>
                  </>
                )}
                <input type="text" placeholder="메모" className="input input-sm border-gray-200 bg-white" value={scheduleForm.memo} onChange={(e) => setScheduleForm({ ...scheduleForm, memo: e.target.value })} />

                {scheduleTab === 'lesson' && scheduleForm.gridType === 'vocal' && (
                  <label className="label cursor-pointer justify-start gap-2 mt-2">
                    <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={scheduleForm.isVocalProgress} onChange={(e) => setScheduleForm({ ...scheduleForm, isVocalProgress: e.target.checked })} />
                    <span className="label-text font-bold text-gray-700">보컬진행</span>
                  </label>
                )}

                {scheduleTab === 'lesson' && (
                  <div className="flex flex-col gap-3 mt-2 pt-2 border-t border-gray-200">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-400">추가 수업 ({scheduleForm.gridType === 'master' ? 'Master' : 'Vocal'} 학생)</label>
                      <select className="select select-sm border-gray-200 bg-gray-50"
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const [sid, sname] = e.target.value.split('|');
                          setScheduleForm({ ...scheduleForm, studentId: sid, studentName: sname, category: '레슨', memo: '추가수업' });
                        }}
                        value=""
                      >
                        <option value="">학생 선택...</option>
                        {students.filter(s => {
                          if (!s.isActive) return false;
                          const hasClass = s.schedule && s.schedule.some(w => {
                            if (scheduleForm.gridType === 'master') return Number(w.master || 0) > 0;
                            return Number(w.vocal || 0) > 0 || Number(w.vocal30 || 0) > 0;
                          });
                          return hasClass;
                        }).sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                          <option key={s.id} value={`${s.id}|${s.name}`}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    {(() => {
                      const makeupList = historySchedules.filter(h => h.status === 'reschedule' || h.status === 'reschedule_assigned').reduce((acc, h) => {
                        if (h.status === 'reschedule_assigned') return acc;
                        const s = students.find(st => st.id === h.studentId);
                        if (!s || !s.isActive || !s.schedule?.some(w => {
                          if (scheduleForm.gridType === 'master') return Number(w.master || 0) > 0;
                          return Number(w.vocal || 0) > 0 || Number(w.vocal30 || 0) > 0;
                        })) return acc;
                        const expectedMemo = `보강(${h.date})`;
                        const alreadyAssigned = schedules.some(sch => sch.studentId === h.studentId && sch.memo === expectedMemo);
                        if (!alreadyAssigned) {
                          acc.push({ ...h, studentName: s.name });
                        }
                        return acc;
                      }, []);

                      if (makeupList.length === 0) return null;

                      return (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-red-400">보강 대상</label>
                          <select className="select select-sm border-red-100 bg-red-50"
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const item = JSON.parse(e.target.value);
                              setScheduleForm({
                                ...scheduleForm,
                                studentId: item.studentId,
                                studentName: item.studentName,
                                category: '레슨',
                                memo: `보강(${item.date})`
                              });
                              setSelectedMakeupId(item.id);
                            }}
                            value=""
                          >
                            <option value="">보강 학생 선택...</option>
                            {makeupList.map((h, i) => (
                              <option key={i} value={JSON.stringify(h)}>
                                {h.studentName} ({h.date} {h.time} 결석)
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 수업 상태 체크 버튼 영역 */}
                {scheduleForm.studentName && (
                  <div className="flex flex-col gap-1 mt-3">
                    <label className="text-xs font-bold text-gray-400">수업 상태 체크 ({scheduleForm.studentName})</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(() => {
                        const targetDateTime = new Date(`${selectedSlot.date}T${selectedSlot.time.padStart(2, '0')}:${selectedMinute}:00`);
                        const isPast = new Date() > targetDateTime;
                        const isMakeupAssignment = scheduleForm.memo && scheduleForm.memo.includes('보강');

                        return (
                          <>
                            {/* 완료 버튼: 시간이 지나야 활성화 */}
                            <button
                              disabled={!isPast}
                              onClick={() => setScheduleForm(prev => ({ ...prev, status: prev.status === 'completed' ? '' : 'completed' }))}
                              className={`btn btn-xs h-8 border-none disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed ${scheduleForm.status === 'completed' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600'}`}
                            >
                              {scheduleForm.status === 'completed' && <FaCheckCircle />} 완료
                            </button>

                            {/* 보강 버튼: 시간 상관없이 항상 활성화 (disabled={!isPast} 제거) */}
                            {!isMakeupAssignment && (
                              <button
                                onClick={() => setScheduleForm(prev => ({ ...prev, status: (prev.status === 'reschedule' || prev.status === 'reschedule_assigned') ? '' : 'reschedule' }))}
                                className={`btn btn-xs h-8 border-none ${(scheduleForm.status === 'reschedule' || scheduleForm.status === 'reschedule_assigned') ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-600'}`}
                              >
                                {(scheduleForm.status === 'reschedule' || scheduleForm.status === 'reschedule_assigned') && <FaClock />} 보강
                              </button>
                            )}

                            {/* 결석 버튼: 시간이 지나야 활성화 */}
                            <button
                              disabled={!isPast}
                              onClick={() => setScheduleForm(prev => ({ ...prev, status: prev.status === 'absent' ? '' : 'absent' }))}
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
                  {selectedSlot.id && (
                    <>
                      <button onClick={handleScheduleDelete} disabled={isWeekLocked || isScheduleLocked} className="btn btn-sm bg-red-500 text-white hover:bg-red-600 flex-1 border-none disabled:bg-gray-200 disabled:text-gray-400">삭제</button>
                      <button
                        onClick={() => {
                          setMovingSchedule({
                            ...scheduleForm,
                            id: selectedSlot.id,
                            status: scheduleForm.status
                          });
                          setIsScheduleModalOpen(false);
                        }}
                        disabled={isWeekLocked || isScheduleLocked}
                        className="btn btn-sm bg-orange-400 text-white hover:bg-orange-500 flex-1 border-none disabled:bg-gray-200 disabled:text-gray-400">
                        이동
                      </button>
                    </>
                  )}
                  {scheduleForm.isFixed && <button onClick={handleCancelFixedOneTime} disabled={isWeekLocked || isScheduleLocked} className="btn btn-sm bg-green-500 text-white hover:bg-green-600 flex-1 border-none disabled:bg-gray-200 disabled:text-gray-400">취소</button>}

                  {movingSchedule ? (
                    <div className="flex-[2] flex gap-2">
                      <button onClick={() => setMovingSchedule(null)} className="btn btn-sm bg-gray-400 text-white flex-1 border-none">이동 취소</button>
                      <button onClick={handleMoveSchedule} disabled={isWeekLocked || isScheduleLocked} className="btn btn-sm bg-blue-600 text-white flex-[2] border-none disabled:bg-gray-200 disabled:text-gray-400">
                        이동 완료
                      </button>
                    </div>
                  ) : (
                    <button onClick={handleScheduleSave} disabled={isWeekLocked || isScheduleLocked} className="btn btn-sm bg-black text-white flex-[2] border-none disabled:bg-gray-200 disabled:text-gray-400">저장</button>
                  )}
                </div>
              </div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2">✕</button>
            </div>
          </div>
        )}

        {/* 수강생 등록/수정 모달 (단가 입력 0 제거 로직 적용) */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-8 md:p-10 transform transition-all">

              {/* 헤더 */}
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                  {editingId ? '수강생 정보 수정' : '신규 수강생 등록'}
                </h2>
                <button onClick={closeModal} className="btn btn-sm btn-circle btn-ghost text-gray-400 hover:bg-gray-100">✕</button>
              </div>

              <div className="space-y-6">

                {/* 1. 이름 / 연락처 / 상태 (1열 배치) */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-4">
                    <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">이름</label>
                    <input
                      type="text"
                      name="name"
                      className="input w-full bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-black/5 rounded-2xl font-bold text-lg text-gray-900 h-12 px-5"
                      placeholder="이름"
                      value={formData.name}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">연락처</label>
                    <input
                      type="text"
                      name="phone"
                      className="input w-full bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-black/5 rounded-2xl font-bold text-lg text-gray-900 h-12 px-5"
                      placeholder="010-0000-0000"
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      maxLength="13"
                    />
                  </div>
                  <div className="md:col-span-4 flex gap-2">
                    <label className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 h-12 rounded-2xl border-2 transition-all ${formData.isMonthly ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                      <input type="checkbox" className="checkbox checkbox-xs checkbox-primary rounded-md" checked={formData.isMonthly} onChange={(e) => setFormData({ ...formData, isMonthly: e.target.checked })} />
                      <span className="text-xs font-bold">월정산</span>
                    </label>
                    <label className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 h-12 rounded-2xl border-2 transition-all ${formData.isArtist ? 'bg-purple-50 border-purple-100 text-purple-700' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                      <input type="checkbox" className="checkbox checkbox-xs checkbox-secondary rounded-md" checked={formData.isArtist} onChange={(e) => setFormData({ ...formData, isArtist: e.target.checked })} />
                      <span className="text-xs font-bold">아티스트</span>
                    </label>
                  </div>
                </div>

                {/* 2. 최초등록일 / 회차 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">최초 등록일 <span className="text-[10px] font-normal text-red-400 ml-1">{editingId ? '(수정 불가)' : '(첫 수업일)'}</span></label>
                    <input
                      type="date"
                      name="firstDate"
                      className={`input w-full border-transparent rounded-2xl font-bold text-lg h-12 px-5 ${editingId ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-black/5'}`}
                      value={formData.firstDate}
                      onChange={handleChange}
                      disabled={!!editingId}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">등록 회차</label>
                    <div className="relative">
                      <input
                        type="number"
                        name="count"
                        className="input w-full bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-black/5 rounded-2xl font-bold text-lg text-gray-900 h-12 px-5"
                        value={formData.count}
                        onChange={handleChange}
                      />
                      <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">회차</span>
                    </div>
                  </div>
                </div>

                {/* 3. 수업 회차 설정 (표 형태) */}
                <div>
                  <div className="flex items-center gap-4 mb-2 mt-2 px-1">
                    <h3 className="text-sm font-bold text-gray-900 ml-1">주차별 수업 설정</h3>
                    <div className="h-[1px] flex-1 bg-gray-100"></div>
                  </div>

                  <div className="bg-gray-50 p-5 rounded-[2rem] border border-gray-100">
                    {/* 테이블 헤더 */}
                    <div className="grid grid-cols-7 gap-3 mb-2 text-center">
                      <div className="col-span-1 text-[10px] font-extrabold text-gray-400 uppercase">Week</div>
                      <div className="col-span-2 text-[10px] font-extrabold text-orange-400 uppercase">Master</div>
                      <div className="col-span-2 text-[10px] font-extrabold text-blue-400 uppercase">Vocal</div>
                      <div className="col-span-2 text-[10px] font-extrabold text-cyan-400 uppercase">Vocal(30)</div>
                    </div>

                    {/* 테이블 바디 */}
                    <div className="space-y-2">
                      {formData.schedule.map((week, idx) => (
                        <div key={idx} className="grid grid-cols-7 gap-3 items-center">
                          <div className="col-span-1 flex justify-center">
                            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white border border-gray-200 text-xs font-bold text-gray-500">
                              {idx + 1}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              placeholder="-"
                              className="input input-sm w-full text-center bg-white border-transparent focus:border-orange-400 focus:ring-2 focus:ring-orange-100 rounded-xl font-bold text-gray-800 shadow-sm h-9"
                              value={week.master}
                              onChange={(e) => handleScheduleChange(idx, 'master', e.target.value)}
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              placeholder="-"
                              className="input input-sm w-full text-center bg-white border-transparent focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-xl font-bold text-gray-800 shadow-sm h-9"
                              value={week.vocal}
                              onChange={(e) => handleScheduleChange(idx, 'vocal', e.target.value)}
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              placeholder="-"
                              className="input input-sm w-full text-center bg-white border-transparent focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 rounded-xl font-bold text-gray-800 shadow-sm h-9"
                              value={week.vocal30}
                              onChange={(e) => handleScheduleChange(idx, 'vocal30', e.target.value)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. 마스터 / 보컬 단가 (0 비활성화 처리) */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-bold text-gray-400 mb-1.5 ml-2 block">Master 회당 단가</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="input w-full bg-gray-50 border-none rounded-2xl font-bold text-gray-800 pr-8 text-right h-12 focus:bg-white focus:ring-2 focus:ring-orange-100"
                        placeholder="0"
                        /* [수정] 값이 0이면 빈 문자열로 처리하여 입력 시 0이 사라지게 함 */
                        value={Number(formData.rates.master) === 0 ? '' : Number(formData.rates.master).toLocaleString()}
                        onChange={(e) => handleRateChange('master', e.target.value)}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">원</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 mb-1.5 ml-2 block">Vocal 회당 단가</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="input w-full bg-gray-50 border-none rounded-2xl font-bold text-gray-800 pr-8 text-right h-12 focus:bg-white focus:ring-2 focus:ring-blue-100"
                        placeholder="0"
                        /* [수정] 값이 0이면 빈 문자열로 처리 */
                        value={Number(formData.rates.vocal) === 0 ? '' : Number(formData.rates.vocal).toLocaleString()}
                        onChange={(e) => handleRateChange('vocal', e.target.value)}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">원</span>
                    </div>
                  </div>
                </div>

                {/* 5. 메모 */}
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">메모</label>
                  <input
                    type="text"
                    name="memo"
                    className="input w-full bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-black/5 rounded-2xl font-medium text-gray-800 h-12 px-5"
                    placeholder="특이사항 입력"
                    value={formData.memo}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* 6. 버튼 */}
              <div className="mt-8 flex gap-4">
                <button onClick={closeModal} className="btn btn-lg h-14 min-h-[3.5rem] flex-1 bg-white border-2 border-gray-100 text-gray-500 hover:bg-gray-50 hover:border-gray-300 rounded-2xl font-bold text-base shadow-sm transition-all">
                  취소
                </button>
                <button onClick={handleSubmit} className="btn btn-lg h-14 min-h-[3.5rem] flex-[2] bg-gray-900 border-none text-white hover:bg-black hover:scale-[1.01] active:scale-[0.99] rounded-2xl font-bold text-base shadow-xl shadow-gray-300 transition-all">
                  {editingId ? '저장하기' : '등록하기'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 이미지 미리보기 모달 (모바일 개선) */}
        {/* 이미지 미리보기 모달 (모바일 개선 + 삭제 기능) */}
        {previewImage && (
          <div className="fixed inset-0 z-[9999] bg-black/95 flex justify-center items-center p-4 touch-none" onClick={() => setPreviewImage(null)}>
            <div className="relative max-w-4xl w-full flex justify-center items-center" onClick={e => e.stopPropagation()}>
              <img src={previewImage.url || previewImage} alt="영수증 미리보기" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain" />

              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-2 right-2 md:top-4 md:right-4 btn btn-circle btn-sm bg-black/50 text-white border-2 border-white/20 hover:bg-black hover:border-white shadow-lg z-50">
                <FaTimesCircle className="text-xl" />
              </button>

              {previewImage.sid && (
                <button
                  onClick={handleDeleteRetroactivePhoto}
                  className="absolute bottom-4 right-4 btn btn-error btn-sm text-white shadow-lg z-50 font-bold"
                >
                  <FaTrash className="mr-1" /> 삭제
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;

