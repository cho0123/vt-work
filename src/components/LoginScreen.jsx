import { useState } from 'react';

/**
 * 로그인 화면.
 *
 * 이메일/비밀번호 입력값은 이 컴포넌트 안에서만 관리한다.
 * (예전에는 App 의 state 라서 한 글자 칠 때마다 App 전체가 재렌더됐다)
 *
 * @param onLogin 이메일과 비밀번호를 받아 로그인을 시도하는 함수
 */
export function LoginScreen({ onLogin }) {
    const [email, setEmail] = useState('');
    const [pw, setPw] = useState('');
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
            await onLogin(email, pw);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="h-screen bg-gray-100 font-sans p-2 md:p-8 lg:p-12 flex justify-center overflow-hidden">
            <div className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-2xl">
                <div className="text-center mb-12">
                    <h1 className="text-3xl font-extrabold text-gray-900">
                        VT<span className="text-orange-500">Work</span>
                    </h1>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input
                        type="email"
                        placeholder="이메일"
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl h-14 px-5 outline-none"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                        type="password"
                        placeholder="비밀번호"
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl h-14 px-5 outline-none"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                    />
                    <button
                        disabled={busy}
                        className="w-full bg-gray-900 text-white h-14 rounded-2xl font-bold mt-4 shadow-md"
                    >
                        로그인
                    </button>
                </form>
            </div>
        </div>
    );
}
