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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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

  // --- [2] 데이터 상태 ---
  const [activeTab, setActiveTab] = useState('schedule');
  const [viewStatus, setViewStatus] = useState('active');
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

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

  // 내역 정렬 상태
  const [historySort, setHistorySort] = useState('paymentDate');

  // 정산 관리
  const [currentDate, setCurrentDate] = useState(new Date());
  const [settlementIncome, setSettlementIncome] = useState([]);
  const [settlementUnpaid, setSettlementUnpaid] = useState([]);
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

  const [scheduleTab, setScheduleTab] = useState('lesson');
  const [scheduleForm, setScheduleForm] = useState({
    studentId: '', studentName: '', memo: '', category: '레슨',
    isFixed: false, status: '', gridType: 'master'
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

  const fetchSettlementData = async () => {
    setSettlementIncome([]);
    setSettlementUnpaid([]);

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${year}-${month}`;

    try {
      const memoDoc = await getDoc(doc(db, "settlement_memos", yearMonth));
      setSettlementMemo(memoDoc.exists() ? memoDoc.data().text || '' : '');
    } catch (e) { }

    const expenseQ = query(collection(db, "expenses"), where("date", ">=", `${yearMonth}-01`), where("date", "<=", `${yearMonth}-31`));
    const expenseSnap = await getDocs(expenseQ);
    const expenseList = expenseSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    expenseList.sort((a, b) => new Date(a.date) - new Date(b.date));
    setExpenses(expenseList);

    let allPayments = [];
    let allUnpaid = [];

    if (students.length > 0) {
      for (const student of students) {
        const payQ = query(collection(db, "students", student.id, "payments"),
          where("targetDate", ">=", `${yearMonth}-01`),
          where("targetDate", "<=", `${yearMonth}-31`)
        );
        const paySnap = await getDocs(payQ);
        paySnap.forEach(doc => {
          allPayments.push({ ...doc.data(), studentName: student.name, studentId: student.id });
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

    const bufferEndDate = new Date(endStr);
    bufferEndDate.setDate(bufferEndDate.getDate() + 45);
    const bufferEndStr = formatDateLocal(bufferEndDate);

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

    const qSched = query(
      collection(db, "schedules"),
      where("date", ">=", startStr),
      where("date", "<=", bufferEndStr)
    );
    const unsubSched = onSnapshot(qSched, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAttSchedules(list);
    });

    return () => { unsubAtt(); unsubSched(); };
  }, [user, activeTab, attBaseDate, attViewMode, attMonth]);


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

  const generateAvailableStudents = (selectedDateStr, editingItemName = null, gridType = 'master') => {
    const weekStart = getStartOfWeek(selectedDateStr);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = formatDateLocal(weekStart);
    const weekEndStr = formatDateLocal(weekEnd);

    const bookedNames = new Set();

    // 일반 스케쥴 체크
    schedules.forEach(s => {
      const sType = s.gridType || 'master';
      if (sType !== gridType) return;

      const isSpecialClass = s.memo && (s.memo.includes('보강') || s.memo.includes('추가'));
      if (!isSpecialClass && s.date >= weekStartStr && s.date <= weekEndStr && s.studentName) {
        bookedNames.add(s.studentName);
      }
    });

    // 고정 스케쥴 체크 (시작일 비교 추가)
    fixedSchedules.forEach(s => {
      const sType = s.gridType || 'master';
      if (sType === gridType && s.studentName && (!s.fixedStartDate || s.fixedStartDate <= weekEndStr)) {
        bookedNames.add(s.studentName);
      }
    });

    if (editingItemName) bookedNames.delete(editingItemName);

    const options = [];
    students.filter(s => s.isActive).forEach(student => {
      const rotationWeek = getRotationWeek(student.firstDate, selectedDateStr);
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
          if (!bookedNames.has(displayName)) options.push({ id: student.id, name: displayName, originalName: student.name });
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
        gridType: existingItem.gridType || 'master'
      });
    } else {
      setSelectedSlot({ date: dateStr, time: hourStr, minute: '00', dayOfWeek, id: null, gridType });
      setSelectedMinute('00');
      setScheduleTab('lesson');
      setScheduleForm({
        studentId: '', studentName: '', memo: '', category: '레슨',
        isFixed: false, status: '', gridType
      });
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

  // [수정] 스케쥴 저장/수정 함수 (아티스트 카운트 로직 추가)
  const handleScheduleSave = async () => {
    const timeToSave = `${selectedSlot.time}:${selectedMinute}`;
    const finalGridType = selectedSlot.gridType || scheduleForm.gridType || 'master';

    // 아티스트 카운트 자동 계산 로직
    if (scheduleForm.studentId) {
      const targetStudent = students.find(s => s.id === scheduleForm.studentId);

      if (targetStudent && targetStudent.isArtist) {
        let countChange = 0;
        const newStatus = scheduleForm.status;
        let oldStatus = '';

        if (selectedSlot.id) {
          const oldSchedule = schedules.find(s => s.id === selectedSlot.id);
          if (oldSchedule) oldStatus = oldSchedule.status;
        }

        if (newStatus === 'completed' && oldStatus !== 'completed') {
          countChange = 1;
        } else if (newStatus !== 'completed' && oldStatus === 'completed') {
          countChange = -1;
        }

        if (countChange !== 0) {
          const currentCount = parseInt(targetStudent.count || '0');
          try {
            await updateDoc(doc(db, "students", targetStudent.id), {
              count: String(currentCount + countChange)
            });
          } catch (err) {
            console.error("아티스트 카운트 업데이트 실패:", err);
          }
        }
      }
    }

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

    if (selectedSlot.id) {
      await updateDoc(doc(db, "schedules", selectedSlot.id), data);
    } else {
      await addDoc(collection(db, "schedules"), data);
    }

    if (selectedMakeupId) {
      await updateDoc(doc(db, "schedules", selectedMakeupId), { status: 'reschedule_assigned' });
      setHistorySchedules(prev => prev.map(h => h.id === selectedMakeupId ? { ...h, status: 'reschedule_assigned' } : h));
    }

    setIsScheduleModalOpen(false);
  };

  // [수정] 스케쥴 삭제 함수 (아티스트 카운트 복구 로직 추가)
  const handleScheduleDelete = async () => {
    if (selectedSlot.id && window.confirm("일정을 삭제하시겠습니까?")) {
      const currentSchedule = schedules.find(s => s.id === selectedSlot.id);

      if (currentSchedule && currentSchedule.studentId) {
        const targetStudent = students.find(s => s.id === currentSchedule.studentId);

        if (targetStudent && targetStudent.isArtist && currentSchedule.status === 'completed') {
          const currentCount = parseInt(targetStudent.count || '0');
          try {
            await updateDoc(doc(db, "students", targetStudent.id), {
              count: String(Math.max(0, currentCount - 1))
            });
          } catch (err) {
            console.error("아티스트 카운트 차감 실패:", err);
          }
        }
      }

      await deleteDoc(doc(db, "schedules", selectedSlot.id));

      if (currentSchedule) {
        let targetId = currentSchedule.relatedScheduleId;

        if (!targetId && currentSchedule.memo && currentSchedule.memo.startsWith('보강(')) {
          const match = currentSchedule.memo.match(/보강\(([^)]+)\)/);
          if (match) {
            const originalDate = match[1];
            const found = historySchedules.find(h =>
              h.studentId === currentSchedule.studentId &&
              h.date === originalDate &&
              h.status === 'reschedule_assigned'
            );
            if (found) targetId = found.id;
          }
        }

        if (targetId) {
          await updateDoc(doc(db, "schedules", targetId), { status: 'reschedule' });
          setHistorySchedules(prev => prev.map(h => h.id === targetId ? { ...h, status: 'reschedule' } : h));
        }
      }

      setIsScheduleModalOpen(false);
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
  const handleRetroactivePhotoUpload = async (sid, pid, f) => { if (!f) return; const s = await uploadBytes(ref(storage, `receipts/${sid}_${Date.now()}`), f); const u = await getDownloadURL(s.ref); await updateDoc(doc(db, "students", sid, "payments", pid), { imageUrl: u }); alert("업로드됨"); };
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
    // 1. 화면 전체 높이 고정 (스크롤 방지)
    <div className="h-screen w-full bg-gray-100 font-sans flex justify-center overflow-hidden">

      {/* 2. 중앙 컨텐츠 래퍼 */}
      <div className="w-full max-w-[1600px] h-full flex flex-col bg-white md:rounded-[3rem] shadow-2xl overflow-hidden my-2 md:my-8 mx-2 md:mx-8">

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
                const hasGhosts = ghostsMaster.length > 0 || ghostsVocal.length > 0;
                const hasPending = relevantSchedules.some(s => !s.status || s.status === 'pending');

                const isAllProcessed = !hasGhosts && !hasPending && relevantSchedules.length > 0;

                return (
                  <button
                    onClick={handleToggleWeekLock}
                    disabled={!isWeekLocked && !isAllProcessed}
                    className={`btn btn-sm border-none gap-2 font-bold ${isWeekLocked
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : (isAllProcessed ? 'bg-black text-white hover:bg-gray-800' : 'bg-gray-100 text-gray-400')
                      }`}
                  >
                    {isWeekLocked ? <><FaLockOpen /> 해제</> : <><FaLock /> 최종</>}
                  </button>
                );
              })()
            )}
            <button onClick={handleLogout} className="flex items-center gap-2 text-xs md:text-sm font-bold text-gray-400 hover:text-red-500"><FaSignOutAlt /> 로그아웃</button>
          </div>
        </header>

        {/* 메인 컨텐츠 영역 - 남은 공간 차지 (flex-1) & 내부 스크롤 제어 */}
        <main className="flex-1 flex flex-col overflow-hidden relative">

          {/* ----- 스케쥴 탭 ----- */}
          {activeTab === 'schedule' && (
            <div className="flex flex-col h-full w-full p-4 md:p-8 lg:px-12 gap-4">

              {/* 날짜 선택 및 메모 영역 (고정) */}
              <div className="flex-none flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl shadow-sm border border-gray-100">
                    <select className="select select-ghost text-2xl font-extrabold focus:bg-gray-50 rounded-xl px-2 h-12 min-w-[120px]" value={scheduleDate.getFullYear()} onChange={handleScheduleYearChange}>{Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => <option key={y} value={y}>{y}년</option>)}</select>
                    <select className="select select-ghost text-2xl font-extrabold focus:bg-gray-50 rounded-xl px-2 h-12 text-orange-500" value={scheduleDate.getMonth() + 1} onChange={handleScheduleMonthChange}>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select>
                    <div className="w-[2px] h-6 bg-gray-200 mx-2"></div>
                    <select
                      className="select select-ghost font-bold text-gray-600 text-base h-12 min-w-[240px]"
                      onChange={handleScheduleWeekChange}
                      value={formatDateLocal(getStartOfWeek(scheduleDate))}
                    >
                      {weeksInMonth.map((w, i) => (
                        <option key={i} value={formatDateLocal(w.start)}>
                          {i + 1}주차 ({w.start.getMonth() + 1}월 {w.start.getDate()}일 ~ {w.end.getMonth() + 1}월 {w.end.getDate()}일)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setScheduleDate(new Date())} className="btn btn-sm btn-ghost">오늘</button>
                  </div>
                </div>
                <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                  <div className="flex items-center gap-2 min-w-fit"><FaStickyNote className="text-blue-500 text-base" /><span className="text-xs font-bold text-gray-500">주간 메모</span></div>
                  <input type="text" className="input input-sm border-none bg-transparent flex-1 text-sm focus:outline-none" placeholder="이번 주 특이사항..." value={weeklyMemo} onChange={(e) => setWeeklyMemo(e.target.value)} />
                  <button onClick={handleWeeklyMemoSave} className="btn btn-xs bg-gray-100 text-gray-500 border-none hover:bg-black hover:text-white"><FaSave className="mr-1" /> 저장</button>
                </div>
              </div>

              {/* 스케쥴 표 영역 (헤더 고정 + 바디 스크롤) */}
              <div className="flex-1 flex flex-col min-h-0 bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">

                {/* 1. 요일 헤더 (flex-none으로 고정) */}
                <div className="flex-none grid grid-cols-8 border-b border-gray-100 bg-gray-50 z-10">
                  <div className="p-4 text-center text-xs font-bold text-gray-400 border-r border-gray-100">Time</div>
                  {weekDays.map((day, i) => (
                    <div key={i} className={`p-4 text-center border-r border-gray-100 last:border-none ${day.getDay() === 0 ? 'text-red-500' : day.getDay() === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                      <div className="text-xs font-bold">{['일', '월', '화', '수', '목', '금', '토'][day.getDay()]}</div>
                      <div className="text-lg font-extrabold">{day.getDate()}</div>
                    </div>
                  ))}
                </div>

                {/* 2. 시간표 바디 (flex-1 overflow-y-auto로 여기만 스크롤) */}
                <div className="flex-1 overflow-y-auto">
                  {(() => {
                    const ghostsMaster = getGhostSchedules('master');
                    const ghostsVocal = getGhostSchedules('vocal');

                    return hours.map((hour) => (
                      <div key={hour} className="grid grid-cols-8 border-b border-gray-100 min-h-[120px]">
                        <div className="p-2 text-center text-xs font-bold text-gray-400 border-r border-gray-100 flex flex-col justify-between items-center py-2">
                          <span>{`PM ${hour > 12 ? hour - 12 : hour}`}</span>
                        </div>
                        {weekDays.map((day, i) => {
                          const dateStr = formatDateLocal(day);
                          const dayOfWeek = day.getDay();

                          const getScheduleItems = (gType) => {
                            const ghosts = gType === 'master' ? ghostsMaster : ghostsVocal;
                            const getByTime = (tStr) => {
                              const matchStr = `${tStr}`;
                              const normal = schedules.filter(s => s.date === dateStr && s.time === matchStr && (s.gridType || 'master') === gType);
                              const fixed = fixedSchedules.filter(s =>
                                s.dayOfWeek === dayOfWeek &&
                                s.time === matchStr &&
                                (s.gridType || 'master') === gType &&
                                (!s.fixedStartDate || s.fixedStartDate <= dateStr)
                              );
                              const ghostItems = ghosts.filter(g => g.date === dateStr && g.time === matchStr);
                              const all = [...normal];
                              fixed.forEach(f => { if (!all.some(n => n.time === f.time)) all.push(f); });
                              if (all.length === 0) all.push(...ghostItems);
                              return all;
                            };
                            return [...getByTime(`${hour}:00`), ...getByTime(`${hour}:30`)];
                          };

                          const masterItems = getScheduleItems('master');
                          const vocalItems = getScheduleItems('vocal');

                          const renderItems = (items, gType) => (
                            items.length > 0 ? (
                              items.map((item, idx) => {
                                let statusStyle = '';
                                let statusIcon = null;
                                const isVocal = gType === 'vocal';

                                if (item.isGhost) statusStyle = 'bg-gray-50 text-gray-400 border-dashed border-gray-300 opacity-60 grayscale';
                                else if (item.status === 'completed') { statusStyle = 'bg-gray-600 text-white border-gray-700 opacity-80'; statusIcon = <FaCheckCircle className="text-green-400 text-[9px]" />; }
                                else if (item.status === 'reschedule' || item.status === 'reschedule_assigned') { statusStyle = 'bg-yellow-50 text-yellow-800 border-yellow-200 ring-1 ring-yellow-300'; statusIcon = <FaClock className="text-yellow-600 text-[9px]" />; }
                                else if (item.status === 'absent') { statusStyle = 'bg-red-50 text-red-800 border-red-200 ring-1 ring-red-300'; statusIcon = <FaTimesCircle className="text-red-500 text-[9px]" />; }
                                else {
                                  if (item.isFixed) statusStyle = 'bg-purple-50 text-purple-900 border-purple-100';
                                  else if (item.category === '상담') statusStyle = isVocal ? 'bg-slate-200 text-slate-800 border-slate-300' : 'bg-green-50 text-green-800 border-green-100';
                                  else if (item.category === '레슨') statusStyle = isVocal ? 'bg-blue-100 text-blue-900 border-blue-200' : 'bg-orange-50 text-orange-900 border-orange-100';
                                  else statusStyle = isVocal ? 'bg-slate-200 text-slate-800 border-slate-300' : 'bg-white text-gray-700 border-gray-200';
                                }

                                return (
                                  <div key={idx} onClick={(e) => { e.stopPropagation(); handleSlotClick(dateStr, String(hour), dayOfWeek, item, gType); }} className={`w-full rounded-md p-1 text-[10px] flex items-center gap-1 shadow-sm border overflow-hidden shrink-0 transition-all ${statusStyle}`}>
                                    <span className={`px-1 rounded text-[8px] font-bold shrink-0 ${item.status === 'completed' ? 'bg-gray-500 text-gray-200' : item.time.endsWith('30') ? 'bg-blue-200 text-blue-800' : 'bg-yellow-200 text-yellow-800'}`}>{item.time.split(':')[1]}</span>
                                    {item.isFixed && <FaThumbtack className="text-[8px] text-purple-400 min-w-fit" />}
                                    {statusIcon}
                                    <span className="truncate font-bold">{item.studentName || item.category}</span>
                                    {item.isGhost && <span className="text-[8px] bg-gray-200 text-gray-500 px-1 rounded ml-auto">예상</span>}
                                    {!item.isGhost && item.memo && <span className="hidden md:inline truncate opacity-75 font-normal ml-1">({item.memo})</span>}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100"><FaPlus className="text-gray-300 text-xs" /></div>
                            )
                          );

                          return (
                            <div key={i} className="border-r border-gray-100 last:border-none p-0 flex flex-col h-full">
                              <div className="flex-[1] bg-white p-1 flex flex-col gap-1 overflow-y-auto cursor-pointer relative group hover:bg-gray-50 transition-colors border-b border-gray-100"
                                onClick={() => handleSlotClick(dateStr, String(hour), dayOfWeek, null, 'master')}>
                                {renderItems(masterItems, 'master')}
                              </div>
                              <div className="flex-[1] bg-gray-50 p-1 flex flex-col gap-1 overflow-y-auto cursor-pointer relative group hover:bg-gray-200 transition-colors"
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
            <div className="flex flex-col gap-4 h-full p-4 md:p-8 lg:px-12 overflow-y-auto">
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
                <table className="table w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-white z-20 shadow-sm">
                    <tr className="text-center text-gray-500 text-xs font-bold border-b-2 border-gray-100">
                      <th className="sticky left-0 bg-white z-30 min-w-[150px] border-r border-gray-100 pl-6 text-left py-4">이름</th>
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
                        return (
                          <tr key={student.id} className="text-center hover:bg-gray-50 group">
                            <td className="sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-gray-100 text-left pl-6 py-3 font-bold text-gray-800 align-middle border-b-[2px] border-gray-300">
                              <span className="text-gray-400 text-xs mr-2">{idx + 1}</span>
                              {student.name}
                              {/* [NEW] 아티스트 카운트 표시 */}
                              {student.isArtist && <span className="text-[10px] text-purple-600 font-bold ml-1">({student.count || 0}회)</span>}

                              {attViewMode === 'month' && !student.isActive && <span className="ml-1 text-[9px] bg-gray-200 text-gray-500 px-1 rounded">종료</span>}

                              {/* [월별보기 > 월정산 탭 정산 계산 로직] */}
                              {attViewMode === 'month' && attCategory === 'monthly' && (() => {
                                const weeks = getMonthWeeksForView(attMonth);
                                if (weeks.length === 0) return null;
                                const mStart = weeks[0].startStr;
                                const mEnd = weeks[weeks.length - 1].endStr;

                                const monthScheds = attSchedules.filter(s =>
                                  s.studentId === student.id &&
                                  s.date >= mStart &&
                                  s.date <= mEnd &&
                                  s.status !== 'reschedule'
                                );

                                const cntM = monthScheds.filter(s => (s.gridType === 'master' || !s.gridType) && s.category !== '상담').length;
                                const cntV_All = monthScheds.filter(s => s.gridType === 'vocal').length;

                                if (cntM === 0 && cntV_All === 0) return null;

                                const hasPending = monthScheds.some(s => !s.status || s.status === 'pending');
                                const statusLabel = hasPending ? '(예정)' : '(완료)';
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
                                  <div className="mt-1.5 flex flex-col items-start gap-1 p-2 bg-blue-50/80 rounded-lg border border-blue-100 shadow-sm">
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
                                    <div className="flex items-center gap-2 w-full pt-1 mt-0.5 border-t border-blue-200">
                                      <span className="text-xs font-extrabold text-blue-600">
                                        = {formatCurrency(totalAmount)}원
                                      </span>
                                      <span className={`text-[10px] font-bold ${statusColor}`}>
                                        {statusLabel}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                            {weeks.map((w, i) => {
                              const rotationWeek = getRotationWeek(student.firstDate, w.startStr);
                              const weekConfig = student.schedule && student.schedule[rotationWeek - 1];

                              const mCountBasic = Number(weekConfig?.master || 0);
                              const vCountBasic = Number(weekConfig?.vocal || 0) + Number(weekConfig?.vocal30 || 0);

                              const weekSchedules = attSchedules.filter(s =>
                                s.studentId === student.id &&
                                s.date >= w.startStr &&
                                s.date <= w.endStr &&
                                !s.memo.includes('보강(')
                              );

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

                              const renderSlot = (type, index, actualScheds) => {
                                const sched = actualScheds[index];
                                const isMaster = type === 'M';

                                const manualKey = `${student.id}_${w.startStr}_${type}_${index}`;
                                const manualRecord = periodAttendance[manualKey];
                                const manualStatus = manualRecord ? manualRecord.status : 'none';

                                let boxClass = isMaster
                                  ? "bg-gray-100 border-dashed border-gray-300 text-gray-400"
                                  : "bg-white border-dashed border-gray-200 text-gray-300";
                                let content = type + (index + 1);
                                let icon = null;

                                if (sched) {
                                  const dateShort = formatMonthDay(sched.date);

                                  if (sched.status === 'completed') {
                                    boxClass = isMaster
                                      ? "bg-green-200 border-solid border-green-300 text-green-900 font-bold"
                                      : "bg-green-50 border-solid border-green-200 text-green-700 font-bold";
                                    content = dateShort;
                                    icon = <FaCheck className="text-[8px]" />;
                                  } else if (sched.status === 'absent') {
                                    boxClass = isMaster
                                      ? "bg-red-200 border-solid border-red-300 text-red-900 font-bold"
                                      : "bg-red-50 border-solid border-red-200 text-red-700 font-bold";
                                    content = dateShort;
                                    icon = <FaTimesCircle className="text-[8px]" />;

                                  } else if (sched.status === 'reschedule') {
                                    boxClass = isMaster
                                      ? "bg-red-50 border-dashed border-red-300 text-red-400 font-bold"
                                      : "bg-white border-dashed border-red-200 text-red-300";
                                    content = "미배정";
                                    icon = <FaExclamationCircle className="text-[8px]" />;

                                  } else if (sched.status === 'reschedule_assigned') {
                                    const makeupMemoStr = `보강(${sched.date})`;
                                    const makeupClass = attSchedules.find(s =>
                                      s.studentId === sched.studentId &&
                                      s.memo && s.memo.includes(makeupMemoStr)
                                    );

                                    if (makeupClass) {
                                      const makeupDateShort = formatMonthDay(makeupClass.date);
                                      if (makeupClass.status === 'completed') {
                                        boxClass = isMaster
                                          ? "bg-yellow-200 border-solid border-yellow-400 text-yellow-900 font-extrabold ring-1 ring-yellow-400"
                                          : "bg-yellow-100 border-solid border-yellow-300 text-yellow-800 font-bold";
                                        content = makeupDateShort;
                                        icon = <FaCheckCircle className="text-[8px] text-green-600" />;
                                      } else {
                                        boxClass = isMaster
                                          ? "bg-yellow-50 border-dashed border-yellow-300 text-yellow-700 font-bold"
                                          : "bg-white border-dashed border-yellow-200 text-yellow-600";
                                        content = makeupDateShort;
                                        icon = <FaClock className="text-[8px]" />;
                                      }
                                    } else {
                                      boxClass = isMaster
                                        ? "bg-yellow-50 border-dashed border-yellow-200 text-yellow-400"
                                        : "bg-white border-dashed border-yellow-100 text-yellow-300";
                                      content = "보강미정";
                                      icon = <FaExclamationCircle className="text-[8px]" />;
                                    }

                                  } else {
                                    boxClass = isMaster
                                      ? "bg-gray-200 border-solid border-gray-300 text-gray-600"
                                      : "bg-gray-50 border-solid border-gray-200 text-gray-400";
                                    content = dateShort;
                                  }
                                } else {
                                  if (manualStatus === 'present') {
                                    boxClass = isMaster ? "bg-green-200 text-green-900" : "bg-green-50 text-green-700";
                                    icon = <FaCheck className="text-[8px]" />;
                                  } else if (manualStatus === 'late') {
                                    boxClass = isMaster ? "bg-yellow-200 text-yellow-900" : "bg-yellow-50 text-yellow-700";
                                    icon = <FaClock className="text-[8px]" />;
                                  } else if (manualStatus === 'absent') {
                                    boxClass = isMaster ? "bg-red-200 text-red-900" : "bg-red-50 text-red-700";
                                    icon = <FaTimesCircle className="text-[8px]" />;
                                  }
                                }

                                return (
                                  <div
                                    key={`${type}-${index}`}
                                    className={`h-6 w-9 rounded-md text-[9px] flex flex-col items-center justify-center border cursor-pointer leading-none gap-0.5 ${boxClass}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePeriodAttendanceToggle(student.id, w.startStr, type, index);
                                    }}
                                  >
                                    {icon}
                                    <span>{content}</span>
                                  </div>
                                );
                              };

                              return (
                                <td key={i} className="border-r border-gray-50 p-1 align-top min-h-[60px] border-b-[2px] border-gray-300">
                                  <div className="flex flex-col gap-1.5 h-full justify-center py-1">
                                    {mTotal > 0 && (
                                      <div className="flex gap-1 justify-center flex-wrap">
                                        {Array.from({ length: mTotal }).map((_, idx) => renderSlot('M', idx, completedM))}
                                      </div>
                                    )}
                                    {vTotal > 0 && (
                                      <div className="flex gap-1 justify-center flex-wrap">
                                        {Array.from({ length: vTotal }).map((_, idx) => renderSlot('V', idx, completedV))}
                                      </div>
                                    )}
                                    {mTotal === 0 && vTotal === 0 && (
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
            <div className="flex flex-col h-full w-full p-4 md:p-8 lg:px-12 gap-6 overflow-y-auto">
              {/* ... (이전 코드와 동일, 생략 없음) ... */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4"><div><h2 className="text-2xl md:text-3xl font-extrabold mb-2">수강생 리스트</h2><div className="flex gap-2"><button onClick={() => { setViewStatus('active'); setCurrentPage(1) }} className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'active' ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>수강중</button><button onClick={() => { setViewStatus('inactive'); setCurrentPage(1) }} className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'inactive' ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>종료/비활성</button><button onClick={() => { setViewStatus('artist'); setCurrentPage(1) }} className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'artist' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'}`}>아티스트</button></div></div><div className="flex gap-2 w-full md:w-auto"><div className="relative group flex-1 md:flex-none"><FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="검색..." className="input w-full md:w-64 bg-gray-50 border-2 border-gray-100 pl-10 rounded-2xl h-12 outline-none font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div><button onClick={() => { setEditingId(null); setFormData(initialFormState); setIsModalOpen(true) }} className="btn h-12 bg-gray-900 text-white border-none px-6 rounded-2xl font-bold shadow-lg flex items-center gap-2"><FaPlus /> 등록</button></div></div>
              <div className="bg-gray-50 rounded-[1.5rem] md:rounded-[2.5rem] p-2 min-h-[600px] flex flex-col"><div className="overflow-x-auto bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-sm flex-1"><table className="table w-full"><thead className="sticky top-0 bg-white z-10 shadow-sm"><tr className="text-gray-500 text-xs md:text-sm font-bold border-b-2 border-gray-100"><th className="py-4 md:py-6 pl-4 md:pl-10 w-16">No.</th><th className="py-4 md:py-6">이름</th><th className="hidden md:table-cell py-4 md:py-6">클래스 상세</th><th className="hidden md:table-cell py-4 md:py-6">예상 금액 (4주)</th><th className="hidden md:table-cell py-4 md:py-6">등록일 / 재등록예정</th><th className="py-4 md:py-6 pr-4 md:pr-10 text-right">관리</th></tr></thead><tbody>{currentItems.map((student, idx) => {
                const totalAmount = calculateTotalAmount(student); const daysPassed = getDaysPassed(student.lastDate); const isStale = daysPassed >= 29; const isExpanded = expandedStudentId === student.id; const isUnpaid = student.isPaid === false; const unpaidItems = student.unpaidList || []; let displayedHistory = []; let historyTotalPages = 0; let totalPaidAmount = 0; let totalUnpaidAmount = 0; if (isExpanded) { const unpaidRows = unpaidItems.map(item => ({ id: item.id, type: 'unpaid', paymentDate: '-', amount: item.amount || totalAmount, paymentMethod: 'unpaid', targetDate: item.targetDate, isCashReceipt: false, receiptMemo: '미결제 상태' })); const combinedHistory = [...unpaidRows, ...paymentHistory]; combinedHistory.sort((a, b) => { const dateA = a[historySort] || ''; const dateB = b[historySort] || ''; return dateB.localeCompare(dateA); }); historyTotalPages = Math.ceil(combinedHistory.length / historyPerPage); combinedHistory.forEach((item, index) => { item.cycle = combinedHistory.length - index; }); displayedHistory = combinedHistory.slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage); totalPaidAmount = paymentHistory.reduce((acc, cur) => acc + Number(cur.amount || 0), 0); totalUnpaidAmount = unpaidItems.reduce((acc, cur) => acc + Number(cur.amount || 0), 0); } return (<Fragment key={student.id}><tr className={`hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-none ${isUnpaid ? 'bg-red-50 hover:bg-red-50' : ''}`}>
                  <td className="pl-4 md:pl-10 font-bold text-gray-400">{filteredStudents.length - ((currentPage - 1) * itemsPerPage + idx)}</td>
                  <td className="cursor-pointer" onClick={() => { setExpandedStudentId(isExpanded ? null : student.id); resetPaymentForm(totalAmount); }}><div className="flex items-center gap-2"><span className="font-bold text-gray-800 text-base md:text-lg">{student.name}</span>{student.isArtist && <FaStar className="text-purple-500 text-xs" />}{isExpanded ? <FaChevronUp className="text-gray-400 text-xs" /> : <FaChevronDown className="text-gray-400 text-xs" />}</div><div className="flex gap-1 mt-1 flex-wrap"><span className={`px-2 py-0.5 rounded text-[10px] ${student.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{student.isActive ? '수강' : '종료'}</span>{student.isMonthly && <span className="px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">월정산</span>}{isUnpaid && <span className="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-600 font-bold">{unpaidItems.length}건 미결제</span>}</div></td><td className="hidden md:table-cell"><div className="flex gap-2">{student.schedule?.map((w, i) => { const hasAny = Number(w.master) > 0 || Number(w.vocal) > 0 || Number(w.vocal30) > 0; return (<div key={i} className={`flex flex-col items-center border rounded-lg p-1 w-16 ${hasAny ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed opacity-50'}`}><span className="text-[10px] text-gray-400 font-bold">{i + 1}주</span>{Number(w.master) > 0 && <span className="text-[10px] text-orange-600 font-bold">M({w.master})</span>}{Number(w.vocal) > 0 && <span className="text-[10px] text-blue-600 font-bold">V({w.vocal})</span>}{Number(w.vocal30) > 0 && <span className="text-[10px] text-cyan-600 font-bold">V30({w.vocal30})</span>}</div>) })}</div></td><td className="hidden md:table-cell font-bold text-gray-800 text-base">{formatCurrency(totalAmount)}원</td><td className="hidden md:table-cell text-xs"><div className="flex items-center gap-1 mb-1"><span className="text-gray-400 w-8">최종:</span><span className="font-bold text-gray-700">{student.lastDate}</span>{isStale && <FaExclamationCircle className="text-red-500 text-sm animate-pulse" />}</div><div className="flex items-center gap-1"><span className="text-gray-400 w-8">예정:</span><input type="date" className="bg-gray-100 border border-gray-200 rounded px-1 py-0.5 text-xs outline-none" value={tempDates[student.id] || ''} onChange={(e) => setTempDates({ ...tempDates, [student.id]: e.target.value })} /><button onClick={() => handleAddUnpaid(student)} className="btn btn-xs btn-square bg-black text-white hover:bg-gray-800 border-none rounded"><FaPlus className="text-[10px]" /></button></div></td><td className="pr-4 md:pr-10 text-right"><div className="md:hidden mb-2 flex justify-end items-center gap-1"><input type="date" className="input input-xs border-gray-200" value={tempDates[student.id] || ''} onChange={(e) => setTempDates({ ...tempDates, [student.id]: e.target.value })} /><button onClick={() => handleAddUnpaid(student)} className="btn btn-xs btn-square bg-black text-white"><FaPlus /></button></div><div className="flex justify-end gap-2"><button onClick={() => toggleStatus(student)} className="btn btn-sm btn-square border-none bg-gray-100 text-gray-400">{student.isActive ? <FaUserSlash /> : <FaUserCheck />}</button><button onClick={() => handleEditClick(student)} className="btn btn-sm btn-square bg-gray-100 border-none text-gray-400 hover:text-orange-500"><FaEdit /></button><button onClick={() => handleDelete(student.id, student.name)} className="btn btn-sm btn-square bg-gray-100 border-none text-gray-400 hover:text-red-500"><FaTrash /></button></div></td></tr>{isExpanded && (<tr className="bg-orange-50/30"><td colSpan="6" className="p-0"><div className="p-4 md:p-6 flex flex-col gap-6" id="payment-form-area"><div className={`bg-white p-4 md:p-6 rounded-2xl shadow-sm border ${paymentForm.id ? 'border-blue-200 ring-2 ring-blue-100' : 'border-orange-100'}`}><h4 className="text-sm font-bold text-gray-800 mb-4 flex justify-between items-center"><div className="flex items-center gap-2"><FaCreditCard className="text-orange-500" />{paymentForm.id ? <span className="text-blue-600">수정중...</span> : '결제 등록'}{selectedUnpaidId && !paymentForm.id && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full animate-pulse">미결제 선택됨</span>}</div></h4><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end"><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">재등록일</label><input type="date" name="targetDate" className="input input-sm border-gray-200 bg-gray-50" value={paymentForm.targetDate} onChange={handlePaymentFormChange} /></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">결제일</label><input type="date" name="paymentDate" className="input input-sm border-gray-200 bg-gray-50" value={paymentForm.paymentDate} onChange={handlePaymentFormChange} /></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">수단</label><select name="method" className="select select-sm border-gray-200 bg-gray-50" value={paymentForm.method} onChange={handlePaymentFormChange}><option value="card">카드</option><option value="transfer">이체</option><option value="cash">현금</option></select></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">금액</label><input type="number" name="amount" className="input input-sm border-gray-200 bg-gray-50 font-bold" value={paymentForm.amount} onChange={handlePaymentFormChange} /></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">증빙</label><label className="flex items-center gap-2 cursor-pointer bg-gray-50 border border-gray-200 rounded-lg px-3 h-8 hover:bg-gray-100 transition-colors"><FaCamera className="text-gray-400" /><span className="text-xs text-gray-600 truncate max-w-[80px]">{paymentFile ? '선택됨' : '사진 첨부'}</span><input type="file" accept="image/*" className="hidden" onChange={(e) => setPaymentFile(e.target.files[0])} /></label></div></div><div className="mt-4 flex flex-col gap-4"><div className="flex items-center gap-2"><button className={`btn btn-sm ${paymentForm.isCashReceipt ? 'btn-warning text-black border-none font-bold' : 'btn-outline border-gray-300 text-gray-400'}`} onClick={() => setPaymentForm(prev => ({ ...prev, isCashReceipt: !prev.isCashReceipt }))}>현금영수증 {paymentForm.isCashReceipt ? 'ON' : 'OFF'}</button></div><input type="text" name="receiptMemo" placeholder="결제 관련 메모..." className="input input-sm border-gray-200 bg-gray-50 w-full" value={paymentForm.receiptMemo} onChange={handlePaymentFormChange} /><div className="flex gap-2 justify-end">{paymentForm.id && (<button className="btn btn-sm btn-ghost text-gray-500" onClick={() => resetPaymentForm(calculateTotalAmount(student))}><FaUndo className="mr-1" /> 취소</button>)}<button className={`btn btn-sm px-6 h-10 border-none text-white ${paymentForm.id ? 'bg-blue-600' : 'bg-black'}`} onClick={() => handlePaymentSave(student)}><FaCheckCircle className="mr-1" /> {paymentForm.id ? '수정 완료' : '결제 처리'}</button></div></div></div>{unpaidItems.length > 0 && (<div className="bg-red-50 p-4 rounded-2xl border border-red-100"><h4 className="text-xs font-bold text-red-500 mb-2">미결제 / 재등록 예정 내역 (클릭하여 처리)</h4><div className="flex flex-wrap gap-2">{unpaidItems.map((item) => (<div key={item.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm cursor-pointer transition-all ${selectedUnpaidId === item.id ? 'bg-red-100 border-red-300 ring-2 ring-red-200' : 'bg-white border-red-100 hover:bg-red-50'}`} onClick={() => handleUnpaidChipClick(student, item)}><div className="flex flex-col items-center leading-none"><span className="text-[10px] text-gray-400 mb-0.5">예정일</span><span className="text-sm font-bold text-red-600">{item.targetDate}</span></div><div className="w-[1px] h-6 bg-red-100 mx-1"></div><span className="text-xs font-bold text-gray-600">{formatCurrency(item.amount)}원</span><button onClick={(e) => { e.stopPropagation(); handleDeleteUnpaid(student, item.id); }} className="text-gray-300 hover:text-red-500 ml-1"><FaTimesCircle /></button></div>))}</div></div>)}<div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-center mb-3"><h4 className="text-sm font-bold text-gray-700 flex items-center gap-2"><FaHistory className="text-orange-500" /> 전체 내역 <span className="text-xs font-normal text-gray-400">(완료: {paymentHistory.length}건 / {formatCurrency(totalPaidAmount)}원 | 미납: {unpaidItems.length}건 / {formatCurrency(totalUnpaidAmount)}원)</span></h4><div className="flex gap-2 items-center"><button onClick={() => setHistorySort(historySort === 'paymentDate' ? 'targetDate' : 'paymentDate')} className="btn btn-xs bg-gray-100 text-gray-500 hover:bg-gray-200 border-none flex gap-1 items-center"><FaSort /> {historySort === 'paymentDate' ? '결제일순' : '재등록일순'}</button>{historyTotalPages > 1 && (<div className="flex gap-2"><button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1} className="btn btn-xs btn-circle btn-ghost"><FaChevronLeft /></button><span className="text-xs pt-0.5">{historyPage}/{historyTotalPages}</span><button onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages} className="btn btn-xs btn-circle btn-ghost"><FaChevronRight /></button></div>)}</div></div><div className="hidden md:block overflow-x-auto"><table className="table table-xs w-full"><thead><tr className="bg-gray-50 text-gray-500 border-b border-gray-100"><th>회차</th><th>재등록일</th><th>결제일</th><th>금액</th><th>수단</th><th>증빙/메모</th><th className="text-center">사진</th><th className="text-right">관리</th></tr></thead><tbody>{displayedHistory.map((pay, i) => { const isUnpaidItem = pay.type === 'unpaid'; const label = pay.paymentMethod === 'card' ? '카드' : pay.paymentMethod === 'transfer' ? '이체' : pay.paymentMethod === 'cash' ? '현금' : pay.paymentMethod; return (<tr key={pay.id === 'unpaid' ? `unpaid-${i}` : pay.id} className={`border-b border-gray-50 last:border-none ${isUnpaidItem ? 'bg-red-50/50' : ''}`}><td className="font-bold text-gray-700">{pay.cycle}회차</td><td className={`font-bold ${isUnpaidItem ? 'text-red-500' : 'text-gray-500'}`}>{pay.targetDate || '-'}</td><td>{isUnpaidItem ? '-' : <span className="font-bold text-gray-700">{pay.paymentDate}</span>}</td><td><span className="font-bold text-black">{formatCurrency(pay.amount)}원</span></td><td>{isUnpaidItem ? <span className="text-red-500 text-xs font-bold">미결제</span> : <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">{label}</span>}</td><td><div className="flex flex-col">{pay.isCashReceipt && <span className="text-[10px] text-orange-600 font-bold">현금영수증</span>}<span className="text-gray-500 text-xs truncate max-w-[100px]">{pay.receiptMemo}</span></div></td><td className="text-center">{pay.imageUrl ? (<a href={pay.imageUrl} target="_blank" className="btn btn-xs btn-square btn-ghost text-blue-500"><FaImage /></a>) : (!isUnpaidItem && <label className="cursor-pointer text-gray-300 hover:text-blue-500"><FaCamera /><input type="file" className="hidden" onChange={(e) => handleRetroactivePhotoUpload(student.id, pay.id, e.target.files[0])} /></label>)}</td><td className="text-right">{!isUnpaidItem ? (<div className="flex justify-end gap-1"><button onClick={() => handleEditHistoryClick(pay)} className="text-gray-300 hover:text-blue-500"><FaEdit className="text-xs" /></button><button onClick={() => handleDeletePayment(student.id, pay.id)} className="text-gray-300 hover:text-red-500"><FaTrash className="text-xs" /></button></div>) : (<span className="text-xs text-gray-400">상단에서 처리</span>)}</td></tr>); })}</tbody></table></div></div></div></td></tr>)}</Fragment>);
              })}</tbody></table></div><div className="flex justify-center mt-6 gap-4"><button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1} className="btn btn-circle btn-sm bg-white border-none shadow-sm disabled:text-gray-300"><FaChevronLeft /></button><span className="font-bold text-gray-600 text-sm">Page {currentPage}</span><button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages} className="btn btn-circle btn-sm bg-white border-none shadow-sm disabled:text-gray-300"><FaChevronRight /></button></div></div>
            </div>
          )}

          {/* ----- 정산 탭 (기존 유지) ----- */}
          {activeTab === 'settlement' && (
            <div className="flex flex-col gap-6 p-4 md:p-8 lg:px-12 overflow-y-auto"><div className="flex flex-col gap-2"><div className="flex flex-col md:flex-row justify-between items-center gap-4"><div className="flex items-center bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100"><button onClick={() => changeMonth(-1)} className="btn btn-circle btn-sm btn-ghost"><FaChevronLeft /></button><div className="flex items-center mx-2"><select className="select select-sm bg-transparent border-none font-extrabold text-lg text-center w-24 focus:outline-none" value={currentDate.getFullYear()} onChange={handleYearChange}>{Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => <option key={y} value={y}>{y}년</option>)}</select><select className="select select-sm bg-transparent border-none font-extrabold text-lg text-center w-20 focus:outline-none" value={currentDate.getMonth() + 1} onChange={handleMonthChange}>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select></div><button onClick={() => changeMonth(1)} className="btn btn-circle btn-sm btn-ghost"><FaChevronRight /></button></div><button onClick={fetchSettlementData} className="btn btn-sm btn-ghost text-gray-400"><FaUndo className="mr-1" /> 새로고침</button></div><div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3"><div className="flex items-center gap-2 min-w-fit"><FaStickyNote className="text-yellow-500 text-base" /><span className="text-xs font-bold text-gray-500">메모</span></div><input type="text" className="input input-sm border-none bg-transparent flex-1 text-sm focus:outline-none" placeholder="이달의 정산 특이사항 입력..." value={settlementMemo} onChange={(e) => setSettlementMemo(e.target.value)} /><button onClick={handleSettlementMemoSave} className="btn btn-xs bg-gray-100 text-gray-500 border-none hover:bg-black hover:text-white"><FaSave className="mr-1" /> 저장</button></div></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100"><div className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2"><FaMoneyBillWave className="text-green-500" /> 총 매출 (미수금 포함)</div><div className="text-2xl font-extrabold text-gray-800">{formatCurrency(totalRevenueIncludingUnpaid)}원</div><div className="text-xs text-gray-400 mt-1">완료 {settlementIncome.length}건 / 미납 {settlementUnpaid.length}건</div></div><div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100"><div className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2"><FaFileInvoiceDollar className="text-red-500" /> 총 지출</div><div className="text-2xl font-extrabold text-gray-800">{formatCurrency(totalExpense)}원</div><div className="text-xs text-gray-400 mt-1">지출 내역 {expenses.length}건</div></div><div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 bg-blue-50/50"><div className="text-sm font-bold text-blue-500 mb-2 flex items-center gap-2"><FaCalculator /> 순수익 (예상)</div><div className="text-2xl font-extrabold text-blue-600">{formatCurrency(netProfitIncludingUnpaid)}원</div></div><div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100"><div className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2"><FaExclamationCircle className="text-orange-500" /> 미수금</div><div className="text-2xl font-extrabold text-gray-400">{formatCurrency(totalUnpaid)}원</div><div className="text-xs text-orange-400 mt-1 font-bold">{settlementUnpaid.length}건 미결제</div></div></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[600px]"><div className="p-6 border-b border-gray-100 flex justify-between items-center"><h3 className="text-lg font-bold text-gray-800">수익 내역</h3><span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">입금완료</span></div><div className="flex-1 overflow-y-auto p-4"><table className="table table-sm w-full"><thead>
              <tr className="text-gray-400"><th>재등록일</th><th>이름</th><th>금액</th><th>결제일(수단)</th><th className="text-right">관리</th></tr></thead><tbody>{settlementIncome.map((item, i) => (<tr key={i} className="border-b border-gray-50 last:border-none cursor-pointer hover:bg-gray-50" onClick={() => handleGoToStudent(item.studentId, item.studentName)}>
                <td className="font-bold text-gray-600">{item.targetDate}</td><td className="font-bold flex items-center gap-1">{item.studentName}<FaExternalLinkAlt className="text-[10px] text-gray-300" /></td><td className="font-bold text-blue-600">{formatCurrency(item.amount)}</td>
                <td className="text-xs text-gray-400 flex items-center gap-1"><span className="font-bold text-gray-600">{item.paymentDate}</span><span>({item.paymentMethod === 'card' ? '카드' : item.paymentMethod === 'transfer' ? '이체' : '현금'})</span></td>
                <td className="text-right"><button onClick={(e) => { e.stopPropagation(); handleDeletePayment(item.studentId, item.id); }} className="text-gray-300 hover:text-red-500"><FaTrash /></button></td></tr>))}</tbody></table>{settlementIncome.length === 0 && <div className="text-center text-gray-300 py-10">내역이 없습니다.</div>}</div><div className="border-t border-gray-100 bg-gray-50 p-4"><h4 className="text-xs font-bold text-gray-500 mb-2">미수금 예정 리스트</h4><div className="h-32 overflow-y-auto"><table className="table table-xs w-full"><tbody>{settlementUnpaid.map((item, i) => (<tr key={i} className="border-none cursor-pointer hover:bg-gray-50" onClick={() => handleGoToStudent(item.studentId, item.studentName)}><td className="text-gray-400">{item.targetDate}</td><td className="text-gray-600 font-bold flex items-center gap-1">{item.studentName}<FaExternalLinkAlt className="text-[10px] text-gray-300" /></td><td className="text-gray-400">{formatCurrency(item.amount)}원</td></tr>))}</tbody></table></div></div></div><div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[600px]"><div className="p-6 border-b border-gray-100 flex justify-between items-center"><h3 className="text-lg font-bold text-gray-800">지출 관리</h3><span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded-lg">지출등록</span></div><div className="p-4 bg-gray-50 m-4 rounded-2xl border border-gray-200"><div className="grid grid-cols-2 gap-2 mb-2"><input type="date" name="date" className="input input-sm bg-white border-gray-200" value={expenseForm.date} onChange={handleExpenseChange} /><select name="category" className="select select-sm bg-white border-gray-200" value={expenseForm.category} onChange={handleExpenseChange}>{Object.keys(expenseDefaults).map(k => <option key={k} value={k}>{k}</option>)}</select></div><div className="flex gap-2 mb-2"><input type="number" name="amount" placeholder="금액" className="input input-sm bg-white border-gray-200 w-1/3 font-bold" value={expenseForm.amount} onChange={handleExpenseChange} /><input type="text" name="memo" placeholder="메모" className="input input-sm bg-white border-gray-200 flex-1" value={expenseForm.memo} onChange={handleExpenseChange} /></div><div className="flex gap-2">{editingExpenseId && <button onClick={cancelExpenseEdit} className="btn btn-sm btn-ghost flex-1">취소</button>}<button onClick={handleExpenseSubmit} className={`btn btn-sm ${editingExpenseId ? 'bg-blue-600' : 'bg-black'} text-white flex-1 border-none`}>{editingExpenseId ? '수정 완료' : '지출 추가'}</button></div></div><div className="flex-1 overflow-y-auto p-4 pt-0"><table className="table table-sm w-full"><thead><tr className="text-gray-400"><th>날짜</th><th>항목</th><th>금액</th><th>메모</th><th className="text-right">관리</th></tr></thead><tbody>{expenses.map((item) => (<tr key={item.id} className="border-b border-gray-50 last:border-none"><td className="text-gray-500">{item.date}</td><td className="font-bold text-gray-700">{item.category}</td><td className="font-bold text-red-500">-{formatCurrency(item.amount)}</td><td className="text-xs text-gray-400">{item.memo}</td><td className="text-right"><div className="flex justify-end gap-1"><button onClick={() => handleEditExpenseClick(item)} className="text-gray-300 hover:text-blue-500"><FaEdit /></button><button onClick={() => handleExpenseDelete(item.id)} className="text-gray-300 hover:text-red-500"><FaTimesCircle /></button></div></td></tr>))}</tbody></table>{expenses.length === 0 && <div className="text-center text-gray-300 py-10">지출 내역이 없습니다.</div>}</div></div></div></div>
          )}
        </main>

        {/* 모달들 (스케쥴, 수강생 등록) */}
        {isScheduleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-md p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 relative">
              <h3 className="text-lg font-bold mb-4">
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

              <div className="tabs tabs-boxed bg-gray-100 p-1 mb-4">
                <a className={`tab flex-1 ${scheduleTab === 'lesson' ? 'tab-active bg-white text-black font-bold' : ''}`} onClick={() => handleTabChange('lesson')}>수강생 레슨</a>
                <a className={`tab flex-1 ${scheduleTab === 'personal' ? 'tab-active bg-white text-black font-bold' : ''}`} onClick={() => handleTabChange('personal')}>개인 일정</a>
              </div>

              <div className="flex flex-col gap-3">
                {scheduleTab === 'lesson' ? (
                  <>
                    <select className="select select-sm border-gray-200"
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
                    <select className="select select-sm border-gray-200" value={scheduleForm.category} onChange={(e) => setScheduleForm({ ...scheduleForm, category: e.target.value })}>
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
                <input type="text" placeholder="메모" className="input input-sm border-gray-200" value={scheduleForm.memo} onChange={(e) => setScheduleForm({ ...scheduleForm, memo: e.target.value })} />

                {scheduleTab === 'lesson' && (
                  <div className="flex flex-col gap-3 mt-2 pt-2 border-t border-gray-100">
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
                            <button
                              disabled={!isPast}
                              onClick={() => setScheduleForm(prev => ({ ...prev, status: prev.status === 'completed' ? '' : 'completed' }))}
                              className={`btn btn-xs h-8 border-none disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed ${scheduleForm.status === 'completed' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600'}`}
                            >
                              {scheduleForm.status === 'completed' && <FaCheckCircle />} 완료
                            </button>

                            {!isMakeupAssignment && (
                              <button
                                disabled={!isPast}
                                onClick={() => setScheduleForm(prev => ({ ...prev, status: (prev.status === 'reschedule' || prev.status === 'reschedule_assigned') ? '' : 'reschedule' }))}
                                className={`btn btn-xs h-8 border-none disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed ${(scheduleForm.status === 'reschedule' || scheduleForm.status === 'reschedule_assigned') ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-600'}`}
                              >
                                {(scheduleForm.status === 'reschedule' || scheduleForm.status === 'reschedule_assigned') && <FaClock />} 보강
                              </button>
                            )}

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
                  {selectedSlot.id && <button onClick={handleScheduleDelete} disabled={isWeekLocked} className="btn btn-sm bg-red-500 text-white hover:bg-red-600 flex-1 border-none disabled:bg-gray-200 disabled:text-gray-400">일정 삭제</button>}
                  <button onClick={handleScheduleSave} disabled={isWeekLocked} className="btn btn-sm bg-black text-white flex-[2] border-none disabled:bg-gray-200 disabled:text-gray-400">저장</button>
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
      </div>
    </div>
  );
}

export default App;