import { useState, useEffect, Fragment } from 'react';
import {
  FaPlus, FaSearch, FaSignOutAlt, FaEdit, FaTrash,
  FaChevronLeft, FaChevronRight, FaUserSlash, FaUserCheck,
  FaExclamationCircle, FaChevronDown, FaChevronUp, FaCheckCircle,
  FaHistory, FaCreditCard, FaTimesCircle, FaCamera, FaImage, FaStar,
  FaUndo, FaMoneyBillWave, FaFileInvoiceDollar, FaCalculator,
  FaStickyNote, FaSave, FaExternalLinkAlt, FaCalendarCheck, FaCheck, FaThumbtack, FaClock, FaSort, FaMagic
} from 'react-icons/fa';
import { auth, db, storage } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc, getDocs, where, getDoc, setDoc, limit, writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
  const [selectedSlot, setSelectedSlot] = useState({ date: '', time: '', minute: '00', dayOfWeek: 0 });
  const [selectedMinute, setSelectedMinute] = useState('00');

  const [scheduleTab, setScheduleTab] = useState('lesson');
  const [scheduleForm, setScheduleForm] = useState({
    studentId: '', studentName: '', memo: '', category: '레슨',
    isFixed: false, status: ''
  });
  const [weeklyMemo, setWeeklyMemo] = useState('');
  const [availableStudents, setAvailableStudents] = useState([]);

  // 출석 관리
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState({});

  const expenseDefaults = {
    '임대료': 5005000, '임금': 0, '전기료': 0, '통신료': 55000,
    '세콤': 60500, '단말기': 5500, '정수기': 10000, '기타': 0
  };

  const initialPaymentForm = {
    id: null, targetDate: '', paymentDate: new Date().toISOString().split('T')[0],
    method: 'card', amount: '', isCashReceipt: false, receiptMemo: ''
  };
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
  const [selectedUnpaidId, setSelectedUnpaidId] = useState(null);

  const initialFormState = {
    name: '', isActive: true, isMonthly: false, isArtist: false,
    phone: '', count: '1',
    firstDate: new Date().toISOString().split('T')[0],
    lastDate: new Date().toISOString().split('T')[0],
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
    const startStr = startOfWeek.toISOString().split('T')[0];
    const endStr = endOfWeek.toISOString().split('T')[0];

    getDoc(doc(db, "weekly_memos", startStr)).then(docSnap => setWeeklyMemo(docSnap.exists() ? docSnap.data().text : ''));

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
      const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];

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

  useEffect(() => {
    if (!user || activeTab !== 'attendance') return;
    const q = query(collection(db, "attendance"), where("date", "==", attendanceDate));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const attMap = {};
      snapshot.docs.forEach(doc => { attMap[doc.data().studentId] = { id: doc.id, ...doc.data() }; });
      setAttendanceData(attMap);
    });
    return () => unsubscribe();
  }, [user, activeTab, attendanceDate]);

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

  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };
  const getWeekDays = (baseDate) => {
    const start = getStartOfWeek(baseDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
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
  const getGhostSchedules = () => {
    const weekStart = getStartOfWeek(scheduleDate);
    weekStart.setHours(12, 0, 0, 0);

    const ghosts = [];
    const scheduledStudentIds = new Set(schedules.map(s => s.studentId).filter(Boolean));

    students.forEach(student => {
      if (scheduledStudentIds.has(student.id)) return;
      if (!student.isActive) return;

      const weekStr = weekStart.toISOString().split('T')[0];
      const rotationWeek = getRotationWeek(student.firstDate, weekStr);
      const weekConfig = student.schedule && student.schedule[rotationWeek - 1];

      const hasLessonThisWeek = weekConfig && Number(weekConfig.master || 0) >= 1;

      if (hasLessonThisWeek) {
        const lastRecord = historySchedules.find(h => h.studentId === student.id && (h.category === '레슨' || h.category === '상담'));

        if (lastRecord) {
          const [ly, lm, ld] = lastRecord.date.split('-').map(Number);
          const lastDateObj = new Date(ly, lm - 1, ld, 12, 0, 0);
          const lastDayOfWeek = lastDateObj.getDay();

          const dayOffset = (lastDayOfWeek + 6) % 7;

          const targetDateObj = new Date(weekStart);
          targetDateObj.setDate(weekStart.getDate() + dayOffset);

          const ty = targetDateObj.getFullYear();
          const tm = String(targetDateObj.getMonth() + 1).padStart(2, '0');
          const td = String(targetDateObj.getDate()).padStart(2, '0');
          const targetDateStr = `${ty}-${tm}-${td}`;

          ghosts.push({
            id: `ghost-${student.id}`,
            isGhost: true,
            studentId: student.id,
            studentName: student.name,
            time: lastRecord.time,
            date: targetDateStr,
            category: lastRecord.category,
            memo: lastRecord.memo,
            dayOfWeek: lastDayOfWeek
          });
        }
      }
    });
    return ghosts;
  };

  // --- Handlers ---
  const handleGoToStudent = (sid, sname) => { setActiveTab('students'); setSearchTerm(sname); setExpandedStudentId(sid); };
  const handleWeeklyMemoSave = async () => { await setDoc(doc(db, "weekly_memos", getStartOfWeek(scheduleDate).toISOString().split('T')[0]), { text: weeklyMemo }, { merge: true }); alert("주간 메모 저장 완료"); };
  const handleSettlementMemoSave = async () => { const ym = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`; await setDoc(doc(db, "settlement_memos", ym), { text: settlementMemo }, { merge: true }); alert("저장됨"); };

  const generateAvailableStudents = (selectedDateStr, editingItemName = null) => {
    const weekStart = getStartOfWeek(selectedDateStr);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const bookedNames = new Set();
    schedules.forEach(s => { if (s.date >= weekStartStr && s.date <= weekEndStr && s.studentName) bookedNames.add(s.studentName); });
    fixedSchedules.forEach(s => { if (s.studentName) bookedNames.add(s.studentName); });
    if (editingItemName) bookedNames.delete(editingItemName);

    const options = [];
    students.filter(s => s.isActive).forEach(student => {
      const rotationWeek = getRotationWeek(student.firstDate, selectedDateStr);
      const weekConfig = student.schedule && student.schedule[rotationWeek - 1];
      if (weekConfig) {
        const masterCount = Number(weekConfig.master || 0);
        for (let i = 1; i <= masterCount; i++) {
          const displayName = masterCount > 1 ? `${student.name}(${i})` : student.name;
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

  const handleSlotClick = (dateStr, hourStr, dayOfWeek, existingItem = null) => {
    const editingName = existingItem ? existingItem.studentName : null;
    const options = generateAvailableStudents(dateStr, editingName);
    setAvailableStudents(options);

    if (existingItem) {
      const timeParts = existingItem.time.split(':');
      const isGhost = existingItem.isGhost;

      setSelectedSlot({
        date: dateStr,
        time: timeParts[0],
        minute: timeParts[1],
        dayOfWeek,
        id: isGhost ? null : existingItem.id
      });
      setSelectedMinute(timeParts[1]);

      setScheduleTab(existingItem.isFixed ? 'personal' : (existingItem.category === '레슨' || existingItem.category === '상담' ? 'lesson' : 'personal'));
      setScheduleForm({
        studentId: existingItem.studentId || '',
        studentName: existingItem.studentName || '',
        memo: existingItem.memo || '',
        category: existingItem.category || '레슨',
        isFixed: existingItem.isFixed || false,
        status: existingItem.status || ''
      });
    } else {
      setSelectedSlot({ date: dateStr, time: hourStr, minute: '00', dayOfWeek, id: null });
      setSelectedMinute('00');
      setScheduleTab('lesson');
      setScheduleForm({ studentId: '', studentName: '', memo: '', category: '레슨', isFixed: false, status: '' });
    }
    setIsScheduleModalOpen(true);
  };

  const handleTabChange = (tab) => {
    setScheduleTab(tab);
    if (tab === 'personal') {
      setScheduleForm(prev => ({ ...prev, category: '야구', studentId: '', studentName: '', status: '' }));
    } else {
      setScheduleForm(prev => ({ ...prev, category: '레슨', isFixed: false, status: '' }));
    }
  };

  const handleScheduleSave = async () => {
    const timeToSave = `${selectedSlot.time}:${selectedMinute}`;
    const data = {
      time: timeToSave,
      ...scheduleForm,
      date: scheduleForm.isFixed ? 'FIXED' : selectedSlot.date,
      dayOfWeek: scheduleForm.isFixed ? selectedSlot.dayOfWeek : null
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
    setIsScheduleModalOpen(false);
  };

  const handleScheduleDelete = async () => { if (selectedSlot.id && window.confirm("일정을 삭제하시겠습니까?")) { await deleteDoc(doc(db, "schedules", selectedSlot.id)); setIsScheduleModalOpen(false); } };

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
  const handleUnpaidChipClick = (s, i) => { setSelectedUnpaidId(i.id); setPaymentForm(p => ({ ...p, id: null, targetDate: i.targetDate, amount: i.amount, paymentDate: new Date().toISOString().split('T')[0] })); document.getElementById('payment-form-area')?.scrollIntoView({ behavior: 'smooth' }); };
  const resetPaymentForm = (amt = '') => { setPaymentForm({ ...initialPaymentForm, amount: amt, targetDate: new Date().toISOString().split('T')[0] }); setPaymentFile(null); setSelectedUnpaidId(null); };
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
  const handleAttendanceChange = async (studentId, status) => { const existing = attendanceData[studentId]; const data = { date: attendanceDate, studentId, status, memo: existing?.memo || '' }; if (existing) { if (status === existing.status) { await deleteDoc(doc(db, "attendance", existing.id)); } else { await updateDoc(doc(db, "attendance", existing.id), { status }); } } else { await addDoc(collection(db, "attendance"), data); } };
  const handleAttendanceMemo = async (studentId, memo) => { const existing = attendanceData[studentId]; if (existing) { await updateDoc(doc(db, "attendance", existing.id), { memo }); } else { await addDoc(collection(db, "attendance"), { date: attendanceDate, studentId, status: 'none', memo }); } };
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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-2xl">
        <div className="text-center mb-12"><h1 className="text-3xl font-extrabold text-gray-900">VT<span className="text-orange-500">Work</span></h1></div>
        <form onSubmit={handleLogin} className="space-y-6"><input type="email" placeholder="이메일" className="w-full bg-gray-50 border border-gray-200 rounded-2xl h-14 px-5 outline-none" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} /><input type="password" placeholder="비밀번호" className="w-full bg-gray-50 border border-gray-200 rounded-2xl h-14 px-5 outline-none" value={loginPw} onChange={(e) => setLoginPw(e.target.value)} /><button className="w-full bg-gray-900 text-white h-14 rounded-2xl font-bold mt-4 shadow-md">로그인</button></form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 font-sans p-2 md:p-8 lg:p-12 flex justify-center">
      <div className="w-full max-w-[1600px] bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col">
        <header className="px-4 py-4 md:px-12 md:py-6 border-b border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-xl md:text-2xl font-extrabold cursor-pointer">VT<span className="text-orange-500">Work</span></div>
          <nav className="flex p-1 bg-gray-100/50 rounded-full">
            {['schedule', 'attendance', 'students', 'settlement'].map(tab => (
              <button key={tab} onClick={() => { setActiveTab(tab); if (tab === 'settlement') fetchSettlementData(); }} className={`px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-full ${activeTab === tab ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                {tab === 'schedule' ? '스케쥴' : tab === 'attendance' ? '출석부' : tab === 'students' ? '학생관리' : '정산관리'}
              </button>
            ))}
          </nav>
          <button onClick={handleLogout} className="flex items-center gap-2 text-xs md:text-sm font-bold text-gray-400 hover:text-red-500"><FaSignOutAlt /> 로그아웃</button>
        </header>

        <main className="flex-1 p-4 md:p-12 lg:px-16 bg-white overflow-y-auto">
          {/* ----- 스케쥴 탭 ----- */}
          {activeTab === 'schedule' && (
            <div className="flex flex-col h-full">
              <div className="flex flex-col gap-4 mb-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl shadow-sm border border-gray-100">
                    <select className="select select-ghost text-2xl font-extrabold focus:bg-gray-50 rounded-xl px-2 h-12 min-w-[120px]" value={scheduleDate.getFullYear()} onChange={handleScheduleYearChange}>{Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => <option key={y} value={y}>{y}년</option>)}</select>
                    <select className="select select-ghost text-2xl font-extrabold focus:bg-gray-50 rounded-xl px-2 h-12 text-orange-500" value={scheduleDate.getMonth() + 1} onChange={handleScheduleMonthChange}>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select>
                    <div className="w-[2px] h-6 bg-gray-200 mx-2"></div>
                    <select className="select select-ghost font-bold text-gray-600 text-base h-12 min-w-[240px]" onChange={handleScheduleWeekChange} value={getStartOfWeek(scheduleDate).toISOString()}>
                      {weeksInMonth.map((w, i) => (
                        <option key={i} value={w.start.toISOString()}>{i + 1}주차 ({w.start.getDate()}일~{w.end.getDate()}일)</option>
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
              <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                <div className="grid grid-cols-8 border-b border-gray-100 bg-gray-50">
                  <div className="p-4 text-center text-xs font-bold text-gray-400 border-r border-gray-100">Time</div>
                  {weekDays.map((day, i) => (
                    <div key={i} className={`p-4 text-center border-r border-gray-100 last:border-none ${day.getDay() === 0 ? 'text-red-500' : day.getDay() === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                      <div className="text-xs font-bold">{['일', '월', '화', '수', '목', '금', '토'][day.getDay()]}</div>
                      <div className="text-lg font-extrabold">{day.getDate()}</div>
                    </div>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {(() => {
                    const ghostSchedules = getGhostSchedules();

                    return hours.map((hour) => (
                      <div key={hour} className="grid grid-cols-8 border-b border-gray-100 min-h-[100px]">
                        <div className="p-2 text-center text-xs font-bold text-gray-400 border-r border-gray-100 flex flex-col justify-between items-center py-2">
                          <span>{`PM ${hour > 12 ? hour - 12 : hour}`}</span>
                        </div>
                        {weekDays.map((day, i) => {
                          const dateStr = day.toISOString().split('T')[0];
                          const dayOfWeek = day.getDay();

                          const getSchedule = (tStr) => {
                            const matchStr = `${tStr}`;
                            const normal = schedules.filter(s => s.date === dateStr && s.time === matchStr);
                            const fixed = fixedSchedules.filter(s => s.dayOfWeek === dayOfWeek && s.time === matchStr);
                            const ghosts = ghostSchedules.filter(g => g.date === dateStr && g.time === matchStr);

                            const all = [...normal];
                            fixed.forEach(f => { if (!all.some(n => n.time === f.time)) all.push(f); });

                            if (all.length === 0) {
                              all.push(...ghosts);
                            }

                            return all;
                          };

                          const itemsTop = getSchedule(`${hour}:00`);
                          const itemsBot = getSchedule(`${hour}:30`);
                          const itemsInHour = [...itemsTop, ...itemsBot];

                          return (
                            <div key={i} className="border-r border-gray-100 last:border-none p-0 flex flex-col h-full">
                              <div className="flex-[2] bg-white p-1 flex flex-col gap-1 overflow-y-auto cursor-pointer relative group hover:bg-gray-50 transition-colors" onClick={() => handleSlotClick(dateStr, String(hour), dayOfWeek)}>
                                {itemsInHour.length > 0 ? (
                                  itemsInHour.map((item, idx) => {
                                    // [수정] 상태별 스타일 정의
                                    let statusStyle = '';
                                    let statusIcon = null;

                                    if (item.isGhost) {
                                      statusStyle = 'bg-gray-50 text-gray-400 border-dashed border-gray-300 opacity-60 grayscale';
                                    } else if (item.status === 'completed') {
                                      statusStyle = 'bg-gray-600 text-white border-gray-700 opacity-80'; // 완료: 어두운 배경
                                      statusIcon = <FaCheckCircle className="text-green-400 text-[9px]" />;
                                    } else if (item.status === 'reschedule') {
                                      statusStyle = 'bg-yellow-50 text-yellow-800 border-yellow-200 ring-1 ring-yellow-300'; // 보강예정: 노란색
                                      statusIcon = <FaClock className="text-yellow-600 text-[9px]" />;
                                    } else if (item.status === 'absent') {
                                      statusStyle = 'bg-red-50 text-red-800 border-red-200 ring-1 ring-red-300'; // 결석: 붉은색
                                      statusIcon = <FaTimesCircle className="text-red-500 text-[9px]" />;
                                    } else {
                                      // 일반(예정) 상태
                                      if (item.isFixed) statusStyle = 'bg-purple-50 text-purple-900 border-purple-100';
                                      else if (item.category === '상담') statusStyle = 'bg-green-50 text-green-800 border-green-100';
                                      else if (item.category === '레슨') statusStyle = 'bg-orange-50 text-orange-900 border-orange-100';
                                      else statusStyle = 'bg-gray-100 text-gray-700 border-gray-200';
                                    }

                                    return (
                                      <div key={idx}
                                        onClick={(e) => { e.stopPropagation(); handleSlotClick(dateStr, String(hour), dayOfWeek, item); }}
                                        className={`w-full rounded-md p-1 text-[10px] flex items-center gap-1 shadow-sm border overflow-hidden shrink-0 transition-all ${statusStyle}`}>
                                        <span className={`px-1 rounded text-[8px] font-bold shrink-0 ${item.status === 'completed' ? 'bg-gray-500 text-gray-200' :
                                            item.time.endsWith('30') ? 'bg-blue-200 text-blue-800' : 'bg-yellow-200 text-yellow-800'
                                          }`}>
                                          {item.time.split(':')[1]}
                                        </span>
                                        {item.isFixed && <FaThumbtack className="text-[8px] text-purple-400 min-w-fit" />}

                                        {statusIcon}

                                        <span className={`truncate font-bold ${item.status === 'completed' ? 'line-through decoration-gray-400' : ''}`}>
                                          {item.studentName || item.category}
                                        </span>

                                        {item.isGhost && <span className="text-[8px] bg-gray-200 text-gray-500 px-1 rounded ml-auto">예상</span>}
                                        {!item.isGhost && item.memo && <span className="truncate opacity-75 font-normal ml-1">({item.memo})</span>}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100"><FaPlus className="text-gray-300 text-xs" /></div>
                                )}
                              </div>
                              <div className="flex-[1] bg-gray-200 border-t border-gray-100 cursor-pointer hover:bg-gray-300 transition-colors"></div>
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

          {activeTab === 'attendance' && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4 mb-2">
                <h2 className="text-2xl font-extrabold text-gray-800">일일 출석부</h2>
                <input type="date" className="input input-bordered font-bold" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
              </div>
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 overflow-x-auto">
                <table className="table w-full"><thead><tr className="text-gray-500 border-b border-gray-100"><th className="w-16">No.</th><th>이름</th><th className="text-center">상태</th><th>메모</th></tr></thead><tbody>{students.filter(s => s.isActive).map((student, idx) => { const att = attendanceData[student.id] || {}; return (<tr key={student.id} className="hover:bg-gray-50 border-b border-gray-50"><td className="font-bold text-gray-400">{idx + 1}</td><td className="font-bold text-lg">{student.name}</td><td className="text-center"><div className="join"><button onClick={() => handleAttendanceChange(student.id, 'present')} className={`btn btn-sm join-item ${att.status === 'present' ? 'btn-primary text-white' : 'btn-outline border-gray-200 text-gray-400'}`}>출석</button><button onClick={() => handleAttendanceChange(student.id, 'late')} className={`btn btn-sm join-item ${att.status === 'late' ? 'btn-warning text-white' : 'btn-outline border-gray-200 text-gray-400'}`}>지각</button><button onClick={() => handleAttendanceChange(student.id, 'absent')} className={`btn btn-sm join-item ${att.status === 'absent' ? 'btn-error text-white' : 'btn-outline border-gray-200 text-gray-400'}`}>결석</button></div></td><td><input type="text" placeholder="특이사항..." className="input input-sm input-bordered w-full" defaultValue={att.memo || ''} onBlur={(e) => handleAttendanceMemo(student.id, e.target.value)} /></td></tr>) })}</tbody></table>
              </div>
            </div>
          )}
          {activeTab === 'students' && (
            <>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4"><div><h2 className="text-2xl md:text-3xl font-extrabold mb-2">수강생 리스트</h2><div className="flex gap-2"><button onClick={() => { setViewStatus('active'); setCurrentPage(1) }} className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'active' ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>수강중</button><button onClick={() => { setViewStatus('inactive'); setCurrentPage(1) }} className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'inactive' ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>종료/비활성</button><button onClick={() => { setViewStatus('artist'); setCurrentPage(1) }} className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'artist' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'}`}>아티스트</button></div></div><div className="flex gap-2 w-full md:w-auto"><div className="relative group flex-1 md:flex-none"><FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="검색..." className="input w-full md:w-64 bg-gray-50 border-2 border-gray-100 pl-10 rounded-2xl h-12 outline-none font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div><button onClick={() => { setEditingId(null); setFormData(initialFormState); setIsModalOpen(true) }} className="btn h-12 bg-gray-900 text-white border-none px-6 rounded-2xl font-bold shadow-lg flex items-center gap-2"><FaPlus /> 등록</button></div></div>
              <div className="bg-gray-50 rounded-[1.5rem] md:rounded-[2.5rem] p-2 min-h-[600px] flex flex-col"><div className="overflow-x-auto bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-sm flex-1"><table className="table w-full"><thead className="sticky top-0 bg-white z-10 shadow-sm"><tr className="text-gray-500 text-xs md:text-sm font-bold border-b-2 border-gray-100"><th className="py-4 md:py-6 pl-4 md:pl-10 w-16">No.</th><th className="py-4 md:py-6">이름</th><th className="hidden md:table-cell py-4 md:py-6">클래스 상세</th><th className="hidden md:table-cell py-4 md:py-6">예상 금액 (4주)</th><th className="hidden md:table-cell py-4 md:py-6">등록일 / 재등록예정</th><th className="py-4 md:py-6 pr-4 md:pr-10 text-right">관리</th></tr></thead><tbody>{currentItems.map((student, idx) => {
                const totalAmount = calculateTotalAmount(student); const daysPassed = getDaysPassed(student.lastDate); const isStale = daysPassed >= 29; const isExpanded = expandedStudentId === student.id; const isUnpaid = student.isPaid === false; const unpaidItems = student.unpaidList || []; let displayedHistory = []; let historyTotalPages = 0; let totalPaidAmount = 0; let totalUnpaidAmount = 0; if (isExpanded) { const unpaidRows = unpaidItems.map(item => ({ id: item.id, type: 'unpaid', paymentDate: '-', amount: item.amount || totalAmount, paymentMethod: 'unpaid', targetDate: item.targetDate, isCashReceipt: false, receiptMemo: '미결제 상태' })); const combinedHistory = [...unpaidRows, ...paymentHistory]; combinedHistory.sort((a, b) => { const dateA = a[historySort] || ''; const dateB = b[historySort] || ''; return dateB.localeCompare(dateA); }); historyTotalPages = Math.ceil(combinedHistory.length / historyPerPage); combinedHistory.forEach((item, index) => { item.cycle = combinedHistory.length - index; }); displayedHistory = combinedHistory.slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage); totalPaidAmount = paymentHistory.reduce((acc, cur) => acc + Number(cur.amount || 0), 0); totalUnpaidAmount = unpaidItems.reduce((acc, cur) => acc + Number(cur.amount || 0), 0); } return (<Fragment key={student.id}><tr className={`hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-none ${isUnpaid ? 'bg-red-50 hover:bg-red-50' : ''}`}>
                  <td className="pl-4 md:pl-10 font-bold text-gray-400">{filteredStudents.length - ((currentPage - 1) * itemsPerPage + idx)}</td>
                  <td className="cursor-pointer" onClick={() => { setExpandedStudentId(isExpanded ? null : student.id); resetPaymentForm(totalAmount); }}><div className="flex items-center gap-2"><span className="font-bold text-gray-800 text-base md:text-lg">{student.name}</span>{student.isArtist && <FaStar className="text-purple-500 text-xs" />}{isExpanded ? <FaChevronUp className="text-gray-400 text-xs" /> : <FaChevronDown className="text-gray-400 text-xs" />}</div><div className="flex gap-1 mt-1 flex-wrap"><span className={`px-2 py-0.5 rounded text-[10px] ${student.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{student.isActive ? '수강' : '종료'}</span>{student.isMonthly && <span className="px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">월정산</span>}{isUnpaid && <span className="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-600 font-bold">{unpaidItems.length}건 미결제</span>}</div></td><td className="hidden md:table-cell"><div className="flex gap-2">{student.schedule?.map((w, i) => { const hasAny = Number(w.master) > 0 || Number(w.vocal) > 0 || Number(w.vocal30) > 0; return (<div key={i} className={`flex flex-col items-center border rounded-lg p-1 w-16 ${hasAny ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed opacity-50'}`}><span className="text-[10px] text-gray-400 font-bold">{i + 1}주</span>{Number(w.master) > 0 && <span className="text-[10px] text-orange-600 font-bold">M({w.master})</span>}{Number(w.vocal) > 0 && <span className="text-[10px] text-blue-600 font-bold">V({w.vocal})</span>}{Number(w.vocal30) > 0 && <span className="text-[10px] text-cyan-600 font-bold">V30({w.vocal30})</span>}</div>) })}</div></td><td className="hidden md:table-cell font-bold text-gray-800 text-base">{formatCurrency(totalAmount)}원</td><td className="hidden md:table-cell text-xs"><div className="flex items-center gap-1 mb-1"><span className="text-gray-400 w-8">최종:</span><span className="font-bold text-gray-700">{student.lastDate}</span>{isStale && <FaExclamationCircle className="text-red-500 text-sm animate-pulse" />}</div><div className="flex items-center gap-1"><span className="text-gray-400 w-8">예정:</span><input type="date" className="bg-gray-100 border border-gray-200 rounded px-1 py-0.5 text-xs outline-none" value={tempDates[student.id] || ''} onChange={(e) => setTempDates({ ...tempDates, [student.id]: e.target.value })} /><button onClick={() => handleAddUnpaid(student)} className="btn btn-xs btn-square bg-black text-white hover:bg-gray-800 border-none rounded"><FaPlus className="text-[10px]" /></button></div></td><td className="pr-4 md:pr-10 text-right"><div className="md:hidden mb-2 flex justify-end items-center gap-1"><input type="date" className="input input-xs border-gray-200" value={tempDates[student.id] || ''} onChange={(e) => setTempDates({ ...tempDates, [student.id]: e.target.value })} /><button onClick={() => handleAddUnpaid(student)} className="btn btn-xs btn-square bg-black text-white"><FaPlus /></button></div><div className="flex justify-end gap-2"><button onClick={() => toggleStatus(student)} className="btn btn-sm btn-square border-none bg-gray-100 text-gray-400">{student.isActive ? <FaUserSlash /> : <FaUserCheck />}</button><button onClick={() => handleEditClick(student)} className="btn btn-sm btn-square bg-gray-100 border-none text-gray-400 hover:text-orange-500"><FaEdit /></button><button onClick={() => handleDelete(student.id, student.name)} className="btn btn-sm btn-square bg-gray-100 border-none text-gray-400 hover:text-red-500"><FaTrash /></button></div></td></tr>{isExpanded && (<tr className="bg-orange-50/30"><td colSpan="6" className="p-0"><div className="p-4 md:p-6 flex flex-col gap-6" id="payment-form-area"><div className={`bg-white p-4 md:p-6 rounded-2xl shadow-sm border ${paymentForm.id ? 'border-blue-200 ring-2 ring-blue-100' : 'border-orange-100'}`}><h4 className="text-sm font-bold text-gray-800 mb-4 flex justify-between items-center"><div className="flex items-center gap-2"><FaCreditCard className="text-orange-500" />{paymentForm.id ? <span className="text-blue-600">수정중...</span> : '결제 등록'}{selectedUnpaidId && !paymentForm.id && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full animate-pulse">미결제 선택됨</span>}</div></h4><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end"><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">재등록일</label><input type="date" name="targetDate" className="input input-sm border-gray-200 bg-gray-50" value={paymentForm.targetDate} onChange={handlePaymentFormChange} /></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">결제일</label><input type="date" name="paymentDate" className="input input-sm border-gray-200 bg-gray-50" value={paymentForm.paymentDate} onChange={handlePaymentFormChange} /></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">수단</label><select name="method" className="select select-sm border-gray-200 bg-gray-50" value={paymentForm.method} onChange={handlePaymentFormChange}><option value="card">카드</option><option value="transfer">이체</option><option value="cash">현금</option></select></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">금액</label><input type="number" name="amount" className="input input-sm border-gray-200 bg-gray-50 font-bold" value={paymentForm.amount} onChange={handlePaymentFormChange} /></div><div className="form-control"><label className="label-text text-xs font-bold text-gray-500 mb-1">증빙</label><label className="flex items-center gap-2 cursor-pointer bg-gray-50 border border-gray-200 rounded-lg px-3 h-8 hover:bg-gray-100 transition-colors"><FaCamera className="text-gray-400" /><span className="text-xs text-gray-600 truncate max-w-[80px]">{paymentFile ? '선택됨' : '사진 첨부'}</span><input type="file" accept="image/*" className="hidden" onChange={(e) => setPaymentFile(e.target.files[0])} /></label></div></div><div className="mt-4 flex flex-col gap-4"><div className="flex items-center gap-2"><button className={`btn btn-sm ${paymentForm.isCashReceipt ? 'btn-warning text-black border-none font-bold' : 'btn-outline border-gray-300 text-gray-400'}`} onClick={() => setPaymentForm(prev => ({ ...prev, isCashReceipt: !prev.isCashReceipt }))}>현금영수증 {paymentForm.isCashReceipt ? 'ON' : 'OFF'}</button></div><input type="text" name="receiptMemo" placeholder="결제 관련 메모..." className="input input-sm border-gray-200 bg-gray-50 w-full" value={paymentForm.receiptMemo} onChange={handlePaymentFormChange} /><div className="flex gap-2 justify-end">{paymentForm.id && (<button className="btn btn-sm btn-ghost text-gray-500" onClick={() => resetPaymentForm(calculateTotalAmount(student))}><FaUndo className="mr-1" /> 취소</button>)}<button className={`btn btn-sm px-6 h-10 border-none text-white ${paymentForm.id ? 'bg-blue-600' : 'bg-black'}`} onClick={() => handlePaymentSave(student)}><FaCheckCircle className="mr-1" /> {paymentForm.id ? '수정 완료' : '결제 처리'}</button></div></div></div>{unpaidItems.length > 0 && (<div className="bg-red-50 p-4 rounded-2xl border border-red-100"><h4 className="text-xs font-bold text-red-500 mb-2">미결제 / 재등록 예정 내역 (클릭하여 처리)</h4><div className="flex flex-wrap gap-2">{unpaidItems.map((item) => (<div key={item.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm cursor-pointer transition-all ${selectedUnpaidId === item.id ? 'bg-red-100 border-red-300 ring-2 ring-red-200' : 'bg-white border-red-100 hover:bg-red-50'}`} onClick={() => handleUnpaidChipClick(student, item)}><div className="flex flex-col items-center leading-none"><span className="text-[10px] text-gray-400 mb-0.5">예정일</span><span className="text-sm font-bold text-red-600">{item.targetDate}</span></div><div className="w-[1px] h-6 bg-red-100 mx-1"></div><span className="text-xs font-bold text-gray-600">{formatCurrency(item.amount)}원</span><button onClick={(e) => { e.stopPropagation(); handleDeleteUnpaid(student, item.id); }} className="text-gray-300 hover:text-red-500 ml-1"><FaTimesCircle /></button></div>))}</div></div>)}<div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-center mb-3"><h4 className="text-sm font-bold text-gray-700 flex items-center gap-2"><FaHistory className="text-orange-500" /> 전체 내역 <span className="text-xs font-normal text-gray-400">(완료: {paymentHistory.length}건 / {formatCurrency(totalPaidAmount)}원 | 미납: {unpaidItems.length}건 / {formatCurrency(totalUnpaidAmount)}원)</span></h4><div className="flex gap-2 items-center"><button onClick={() => setHistorySort(historySort === 'paymentDate' ? 'targetDate' : 'paymentDate')} className="btn btn-xs bg-gray-100 text-gray-500 hover:bg-gray-200 border-none flex gap-1 items-center"><FaSort /> {historySort === 'paymentDate' ? '결제일순' : '재등록일순'}</button>{historyTotalPages > 1 && (<div className="flex gap-2"><button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1} className="btn btn-xs btn-circle btn-ghost"><FaChevronLeft /></button><span className="text-xs pt-0.5">{historyPage}/{historyTotalPages}</span><button onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages} className="btn btn-xs btn-circle btn-ghost"><FaChevronRight /></button></div>)}</div></div><div className="hidden md:block overflow-x-auto"><table className="table table-xs w-full"><thead><tr className="bg-gray-50 text-gray-500 border-b border-gray-100"><th>회차</th><th>재등록일</th><th>결제일</th><th>금액</th><th>수단</th><th>증빙/메모</th><th className="text-center">사진</th><th className="text-right">관리</th></tr></thead><tbody>{displayedHistory.map((pay, i) => { const isUnpaidItem = pay.type === 'unpaid'; const label = pay.paymentMethod === 'card' ? '카드' : pay.paymentMethod === 'transfer' ? '이체' : pay.paymentMethod === 'cash' ? '현금' : pay.paymentMethod; return (<tr key={pay.id === 'unpaid' ? `unpaid-${i}` : pay.id} className={`border-b border-gray-50 last:border-none ${isUnpaidItem ? 'bg-red-50/50' : ''}`}><td className="font-bold text-gray-700">{pay.cycle}회차</td><td className={`font-bold ${isUnpaidItem ? 'text-red-500' : 'text-gray-500'}`}>{pay.targetDate || '-'}</td><td>{isUnpaidItem ? '-' : <span className="font-bold text-gray-700">{pay.paymentDate}</span>}</td><td><span className="font-bold text-black">{formatCurrency(pay.amount)}원</span></td><td>{isUnpaidItem ? <span className="text-red-500 text-xs font-bold">미결제</span> : <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">{label}</span>}</td><td><div className="flex flex-col">{pay.isCashReceipt && <span className="text-[10px] text-orange-600 font-bold">현금영수증</span>}<span className="text-gray-500 text-xs truncate max-w-[100px]">{pay.receiptMemo}</span></div></td><td className="text-center">{pay.imageUrl ? (<a href={pay.imageUrl} target="_blank" className="btn btn-xs btn-square btn-ghost text-blue-500"><FaImage /></a>) : (!isUnpaidItem && <label className="cursor-pointer text-gray-300 hover:text-blue-500"><FaCamera /><input type="file" className="hidden" onChange={(e) => handleRetroactivePhotoUpload(student.id, pay.id, e.target.files[0])} /></label>)}</td><td className="text-right">{!isUnpaidItem ? (<div className="flex justify-end gap-1"><button onClick={() => handleEditHistoryClick(pay)} className="text-gray-300 hover:text-blue-500"><FaEdit className="text-xs" /></button><button onClick={() => handleDeletePayment(student.id, pay.id)} className="text-gray-300 hover:text-red-500"><FaTrash className="text-xs" /></button></div>) : (<span className="text-xs text-gray-400">상단에서 처리</span>)}</td></tr>); })}</tbody></table></div></div></div></td></tr>)}</Fragment>);
              })}</tbody></table></div><div className="flex justify-center mt-6 gap-4"><button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1} className="btn btn-circle btn-sm bg-white border-none shadow-sm disabled:text-gray-300"><FaChevronLeft /></button><span className="font-bold text-gray-600 text-sm">Page {currentPage}</span><button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages} className="btn btn-circle btn-sm bg-white border-none shadow-sm disabled:text-gray-300"><FaChevronRight /></button></div></div>
            </>
          )}
          {activeTab === 'settlement' && (
            <div className="flex flex-col gap-6"><div className="flex flex-col gap-2"><div className="flex flex-col md:flex-row justify-between items-center gap-4"><div className="flex items-center bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100"><button onClick={() => changeMonth(-1)} className="btn btn-circle btn-sm btn-ghost"><FaChevronLeft /></button><div className="flex items-center mx-2"><select className="select select-sm bg-transparent border-none font-extrabold text-lg text-center w-24 focus:outline-none" value={currentDate.getFullYear()} onChange={handleYearChange}>{Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => <option key={y} value={y}>{y}년</option>)}</select><select className="select select-sm bg-transparent border-none font-extrabold text-lg text-center w-20 focus:outline-none" value={currentDate.getMonth() + 1} onChange={handleMonthChange}>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select></div><button onClick={() => changeMonth(1)} className="btn btn-circle btn-sm btn-ghost"><FaChevronRight /></button></div><button onClick={fetchSettlementData} className="btn btn-sm btn-ghost text-gray-400"><FaUndo className="mr-1" /> 새로고침</button></div><div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3"><div className="flex items-center gap-2 min-w-fit"><FaStickyNote className="text-yellow-500 text-base" /><span className="text-xs font-bold text-gray-500">메모</span></div><input type="text" className="input input-sm border-none bg-transparent flex-1 text-sm focus:outline-none" placeholder="이달의 정산 특이사항 입력..." value={settlementMemo} onChange={(e) => setSettlementMemo(e.target.value)} /><button onClick={handleSettlementMemoSave} className="btn btn-xs bg-gray-100 text-gray-500 border-none hover:bg-black hover:text-white"><FaSave className="mr-1" /> 저장</button></div></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100"><div className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2"><FaMoneyBillWave className="text-green-500" /> 총 매출 (미수금 포함)</div><div className="text-2xl font-extrabold text-gray-800">{formatCurrency(totalRevenueIncludingUnpaid)}원</div><div className="text-xs text-gray-400 mt-1">완료 {settlementIncome.length}건 / 미납 {settlementUnpaid.length}건</div></div><div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100"><div className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2"><FaFileInvoiceDollar className="text-red-500" /> 총 지출</div><div className="text-2xl font-extrabold text-gray-800">{formatCurrency(totalExpense)}원</div><div className="text-xs text-gray-400 mt-1">지출 내역 {expenses.length}건</div></div><div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 bg-blue-50/50"><div className="text-sm font-bold text-blue-500 mb-2 flex items-center gap-2"><FaCalculator /> 순수익 (예상)</div><div className="text-2xl font-extrabold text-blue-600">{formatCurrency(netProfitIncludingUnpaid)}원</div></div><div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100"><div className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2"><FaExclamationCircle className="text-orange-500" /> 미수금</div><div className="text-2xl font-extrabold text-gray-400">{formatCurrency(totalUnpaid)}원</div><div className="text-xs text-orange-400 mt-1 font-bold">{settlementUnpaid.length}건 미결제</div></div></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[600px]"><div className="p-6 border-b border-gray-100 flex justify-between items-center"><h3 className="text-lg font-bold text-gray-800">수익 내역</h3><span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">입금완료</span></div><div className="flex-1 overflow-y-auto p-4"><table className="table table-sm w-full"><thead>
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
              <h3 className="text-lg font-bold mb-4">{selectedSlot.date} {selectedSlot.time}:00 일정</h3>

              {/* 분 선택 라디오 버튼 */}
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

              {/* 탭: 레슨 vs 개인 */}
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
                      <option value="야구">야구</option>
                      <option value="야구1:1">야구 1:1</option>
                      <option value="작곡">작곡</option>
                      <option value="합주">합주</option>
                      <option value="미팅">미팅</option>
                      <option value="병원">병원</option>
                      <option value="기타">기타</option>
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

                {/* [수정] 학생 이름이 있는 경우에만 표시 & 시간 체크 로직 추가 */}
                {scheduleForm.studentName && (
                  <div className="flex flex-col gap-1 mt-3">
                    <label className="text-xs font-bold text-gray-400">수업 상태 체크 ({scheduleForm.studentName})</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(() => {
                        // 현재 시간과 스케쥴 시간 비교
                        const targetDateTime = new Date(`${selectedSlot.date}T${selectedSlot.time.padStart(2, '0')}:${selectedMinute}:00`);
                        const isPast = new Date() > targetDateTime;

                        return (
                          <>
                            <button
                              disabled={!isPast}
                              onClick={() => setScheduleForm(prev => ({ ...prev, status: prev.status === 'completed' ? '' : 'completed' }))}
                              className={`btn btn-xs h-8 border-none disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed ${scheduleForm.status === 'completed' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600'}`}
                            >
                              {scheduleForm.status === 'completed' && <FaCheckCircle />} 완료
                            </button>
                            <button
                              disabled={!isPast}
                              onClick={() => setScheduleForm(prev => ({ ...prev, status: prev.status === 'reschedule' ? '' : 'reschedule' }))}
                              className={`btn btn-xs h-8 border-none disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed ${scheduleForm.status === 'reschedule' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-600'}`}
                            >
                              {scheduleForm.status === 'reschedule' && <FaClock />} 보강
                            </button>
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
                  {selectedSlot.id && <button onClick={handleScheduleDelete} className="btn btn-sm bg-red-500 text-white hover:bg-red-600 flex-1 border-none">일정 삭제</button>}
                  <button onClick={handleScheduleSave} className="btn btn-sm bg-black text-white flex-[2] border-none">저장</button>
                </div>
              </div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2">✕</button>
            </div>
          </div>
        )}

        {/* 모달: 수강생 등록/수정 (기존 유지) */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-md p-4">
            <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-8 relative max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6"><h3 className="text-2xl font-extrabold">{editingId ? '수정' : '등록'}</h3><button onClick={closeModal} className="btn btn-sm btn-circle btn-ghost">✕</button></div>
              <div className="space-y-6">
                <div className="grid grid-cols-5 gap-4">
                  <div className="col-span-2"><label className="text-xs font-bold text-gray-500 ml-1">이름</label><input type="text" name="name" className="input w-full bg-gray-50 border-gray-200 rounded-xl px-4 h-10 text-sm" placeholder="이름" value={formData.name} onChange={handleChange} /></div>
                  <div className="col-span-2"><label className="text-xs font-bold text-gray-500 ml-1">연락처</label><input type="text" name="phone" className="input w-full bg-gray-50 border-gray-200 rounded-xl px-4 h-10 text-sm" placeholder="010-0000-0000" value={formData.phone} onChange={handlePhoneChange} maxLength="13" /></div>
                  <div className="flex items-end gap-1"><button onClick={() => setFormData({ ...formData, isMonthly: !formData.isMonthly })} className={`btn flex-1 h-10 rounded-xl text-[10px] font-bold border-none ${formData.isMonthly ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>월정산</button><button onClick={() => setFormData({ ...formData, isArtist: !formData.isArtist })} className={`btn flex-1 h-10 rounded-xl text-[10px] font-bold border-none ${formData.isArtist ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-400'}`}>아티스트</button></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-gray-500 ml-1">최초 등록일</label><input type="date" name="firstDate" className={`input w-full border-gray-200 rounded-xl px-4 h-10 text-sm text-gray-600 ${editingId ? 'bg-gray-200 cursor-not-allowed' : 'bg-gray-50'}`} value={formData.firstDate} onChange={handleChange} disabled={!!editingId} /></div>
                  <div><label className="text-xs font-bold text-gray-500 ml-1">재등록 회차</label><input type="number" name="count" className="input w-full bg-gray-50 border-gray-200 rounded-xl px-4 h-10 text-sm text-center font-bold" placeholder="1" value={formData.count} onChange={handleChange} /></div>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold text-gray-400 mb-2"><div>Week</div><div className="text-orange-600">Master</div><div className="text-blue-600">Vocal</div><div className="text-cyan-600">V30(50%)</div></div>
                  <div className="space-y-2">{formData.schedule.map((item, idx) => (<div key={idx} className="grid grid-cols-4 gap-2 items-center"><div className="text-xs font-bold text-gray-500 text-center">{item.week}주차</div><input type="number" step="0.1" className="input w-10 h-8 mx-auto text-center text-sm font-bold bg-white border-orange-100 focus:border-orange-500 [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]" placeholder="0" value={item.master} onChange={(e) => handleScheduleChange(idx, 'master', e.target.value)} /><input type="number" step="0.1" className="input w-10 h-8 mx-auto text-center text-sm font-bold bg-white border-blue-100 focus:border-blue-500 [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]" placeholder="0" value={item.vocal} onChange={(e) => handleScheduleChange(idx, 'vocal', e.target.value)} /><input type="number" step="0.1" className="input w-10 h-8 mx-auto text-center text-sm font-bold bg-white border-cyan-100 focus:border-cyan-500 [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]" placeholder="0" value={item.vocal30} onChange={(e) => handleScheduleChange(idx, 'vocal30', e.target.value)} /></div>))}</div>
                </div>
                <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100 grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] font-bold text-orange-600 ml-1">마스터(1회당)</label><input type="text" className="input w-full h-10 text-right font-bold text-sm bg-white border-orange-200" value={formatCurrency(formData.rates.master)} onChange={(e) => handleRateChange('master', e.target.value)} /></div>
                  <div><label className="text-[10px] font-bold text-orange-600 ml-1">발성(1회당)</label><input type="text" className="input w-full h-10 text-right font-bold text-sm bg-white border-orange-200" value={formatCurrency(formData.rates.vocal)} onChange={(e) => handleRateChange('vocal', e.target.value)} /></div>
                </div>
                <textarea name="memo" className="textarea w-full bg-gray-50 border-gray-200 rounded-2xl h-20 text-sm" placeholder="메모..." value={formData.memo} onChange={handleChange}></textarea>
              </div>
              <div className="mt-8"><button className="btn w-full bg-gray-900 text-white rounded-2xl h-12 shadow-xl" onClick={handleSubmit}>저장하기</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;