import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

// 다른 모듈(config/corsOptions.js, domains/*/service.js 등)이 import되면서
// 평가될 때는 이미 process.env가 채워져 있어야 하므로, app.js의 모든 import 중
// 가장 먼저 평가되도록 이 파일을 app.js 맨 위에서 import한다(ESM은 import를
// 먼저 평가하기 때문에, app.js 본문에서 dotenv.config()를 나중에 불러도 늦다).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
