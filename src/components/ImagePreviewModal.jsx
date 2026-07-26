import { FaTimesCircle, FaTrash } from 'react-icons/fa';

/**
 * 결제 영수증 이미지 확대 보기.
 *
 * @param image    문자열(URL) 또는 { url, sid, pid }. sid 가 있으면 삭제 버튼을 보여준다.
 * @param onClose  닫기
 * @param onDelete 삭제 (sid 가 있을 때만 노출)
 */
export function ImagePreviewModal({ image, onClose, onDelete }) {
    if (!image) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] bg-black/95 flex justify-center items-center p-4 touch-none"
            onClick={onClose}
        >
            <div
                className="relative max-w-4xl w-full flex justify-center items-center"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={image.url || image}
                    alt="영수증 미리보기"
                    className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
                />

                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 md:top-4 md:right-4 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white shadow-lg ring-1 ring-white/20 transition-all hover:bg-black hover:ring-white active:scale-95 z-50"
                >
                    <FaTimesCircle className="text-xl" />
                </button>

                {image.sid && (
                    <button
                        onClick={onDelete}
                        className="absolute bottom-4 right-4 inline-flex items-center gap-1 rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white shadow-lg transition-all hover:bg-red-600 active:scale-95 z-50"
                    >
                        <FaTrash /> 삭제
                    </button>
                )}
            </div>
        </div>
    );
}
