// 짱구 ToDo(짱구 Manager) 앱의 Firebase — 읽기 전용 연결.
//
// 스케쥴 앱과는 별개 프로젝트(cho-works)라, 두 번째 Firebase 앱으로 붙는다.
// 목적은 '날짜가 지정된 할일(tasks.targetDate)'을 스케쥴 화면 그 날짜에 보여주는 것뿐.
// 여기서는 절대 쓰지 않는다(읽기만). 설정값은 배포된 ToDo 앱에 그대로 박혀 있는 공개값.
//
// ⚠️ 이게 동작하려면 cho-works 의 Firestore 규칙에서 `tasks` 컬렉션 읽기를 허용해야 한다
//    (사용자 본인만 쓰는 개인 앱이라 공개 읽기로 열기로 함).
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const choConfig = {
    apiKey: 'AIzaSyC1x5B7Nm6iFJ85UPye-vy-aWWefbwmZLw',
    authDomain: 'cho-works.firebaseapp.com',
    projectId: 'cho-works',
    storageBucket: 'cho-works.firebasestorage.app',
    messagingSenderId: '595194586746',
    appId: '1:595194586746:web:249edc78bb6c4680da7dc3',
};

// 이름을 붙여 스케쥴 앱(기본 앱)과 충돌하지 않게 한다.
const choApp = initializeApp(choConfig, 'choworks');
export const choDb = getFirestore(choApp);
