// 로컬 개발·node 실행용 진입점. app.js는 listen 없이 app만 export해서
// Vercel 서버리스 함수와 테스트에서도 그대로 가져다 쓸 수 있게 한다.
import app from './app.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.info(`Butler API listening on port ${PORT}`);
});
