/**
 * 결제 영수증 이미지를 캔버스로 축소/압축해 base64 dataURL 로 돌려준다.
 * 최대 폭 800px, JPEG 품질 0.6, 10초 타임아웃.
 */
export const compressImage = (file) =>
    new Promise((resolve, reject) => {
        // 타임아웃 10초 설정
        const timer = setTimeout(() => reject(new Error('이미지 압축 시간 초과')), 10000);

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                clearTimeout(timer);
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
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
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = () => {
                clearTimeout(timer);
                reject(new Error('이미지 개체 로드 실패'));
            };
            img.src = e.target.result;
        };
        reader.onerror = () => {
            clearTimeout(timer);
            reject(new Error('파일 읽기 실패'));
        };
        reader.readAsDataURL(file);
    });
