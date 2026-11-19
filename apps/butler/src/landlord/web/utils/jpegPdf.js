// Created: 2026-11-20
// JPEG 여러 장을 1장 = 1쪽인 PDF로 묶는다(계약서 OCR 사진 여러 장, B팀 #181). 라이브러리 없이 PDF 1.4 구조를 직접 쓴다.
// JPEG는 다시 압축하지 않고 그대로 넣는다(/DCTDecode). 쪽 크기는 사진 픽셀 크기와 같게 둔다(1px = 1pt).
// 쪽 크기를 A4로 줄이면 OCR이 낮은 해상도로 읽을 수 있어서 픽셀 크기를 그대로 쓴다.
// 서버가 쪽 수를 셀 수 있게(/Type /Page) 객체를 압축하지 않는다.

const encoder = new TextEncoder();

// pages: [{ data: Uint8Array(JPEG), width, height }] → Blob(application/pdf)
export const buildJpegPdf = (pages) => {
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (part) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const writeObject = (id, ...body) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body.forEach(push);
    push('\nendobj\n');
  };

  // 객체 번호: 1 카탈로그, 2 쪽 목록, 그 뒤 쪽마다 (쪽, 그리기 명령, 사진) 3개
  const pageId = (index) => 3 + index * 3;
  const objectCount = 2 + pages.length * 3;

  push('%PDF-1.4\n');
  writeObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  writeObject(2, `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach(({ data, width, height }, index) => {
    const id = pageId(index);
    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    writeObject(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
    );
    writeObject(id + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    writeObject(
      id + 2,
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n`,
      data,
      '\nendstream',
    );
  });

  const xrefOffset = length;
  let trailer = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id += 1) trailer += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  trailer += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  push(trailer);

  return new Blob(parts, { type: 'application/pdf' });
};
