import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_ROOT = path.join(__dirname, '..', 'report');

/**
 * Tạo report object mới cho một lần chạy command
 * @param {string} command - ví dụ: 'import --all', 'clean --all'
 */
export function createReport(command) {
  return {
    command,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationSeconds: null,
    steps: {},
    recommendation: null
  };
}

/**
 * Đánh dấu report đã hoàn tất, tính thời gian
 * @param {object} report
 */
export function finalizeReport(report) {
  const now = new Date();
  report.finishedAt = now.toISOString();
  const start = new Date(report.startedAt);
  report.durationSeconds = Math.round((now - start) / 1000);

  // Gợi ý nếu có nhiều lỗi
  const totalErrors = Object.values(report.steps).reduce((sum, s) => sum + (s.errors?.length || 0), 0);
  if (totalErrors > 0) {
    report.recommendation = `Có ${totalErrors} lỗi. Nếu dữ liệu không nhất quán, hãy chạy: node miner.js clean --all rồi import lại.`;
  }
}

/**
 * Lưu report JSON ra file
 * @param {object} report
 * @param {string} category - 'import', 'crawl', 'clean'
 */
export function saveReport(report, category = 'import') {
  const dir = path.join(REPORT_ROOT, category);
  fs.mkdirSync(dir, { recursive: true });

  const now = new Date(report.startedAt);
  const ts = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') + '_' +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');

  const slug = report.command.replace(/\s+/g, '_').replace(/--/g, '').replace(/[^a-z0-9_]/gi, '');
  const filename = `${slug}_${ts}.json`;
  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n📄 Report đã lưu: src/report/${category}/${filename}`);
  return filepath;
}

// ─── Render (node miner.js report) ────────────────────────────────────────────

/**
 * Đọc file report JSON mới nhất theo category
 * @param {string} category
 */
export function readLatestReport(category = 'import') {
  const dir = path.join(REPORT_ROOT, category);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) return null;
  return JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf-8'));
}

/**
 * Đọc file report cụ thể theo tên (tìm trong tất cả category)
 * @param {string} filename
 */
export function readReportByFile(filename) {
  for (const cat of ['import', 'crawl', 'clean']) {
    const fp = path.join(REPORT_ROOT, cat, filename);
    if (fs.existsSync(fp)) {
      return { report: JSON.parse(fs.readFileSync(fp, 'utf-8')), category: cat };
    }
  }
  return null;
}

/**
 * Liệt kê tất cả file report
 */
export function listAllReports() {
  const result = [];
  for (const cat of ['import', 'crawl', 'clean']) {
    const dir = path.join(REPORT_ROOT, cat);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
    for (const f of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      result.push({ category: cat, filename: f, command: raw.command, startedAt: raw.startedAt, durationSeconds: raw.durationSeconds });
    }
  }
  return result;
}

// ─── ASCII Table Renderer ──────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  cyan:  '\x1b[36m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  red:   '\x1b[31m',
  gray:  '\x1b[90m',
};

function pad(str, len, align = 'left') {
  const s = String(str ?? '');
  if (align === 'right') return s.padStart(len);
  if (align === 'center') {
    const left = Math.floor((len - s.length) / 2);
    const right = len - s.length - left;
    return ' '.repeat(left) + s + ' '.repeat(right);
  }
  return s.padEnd(len);
}

function formatDuration(secs) {
  if (!secs) return '-';
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/**
 * In báo cáo trực quan cho một report object ra terminal
 * @param {object} report
 * @param {string} filename
 */
export function renderReport(report, filename = '') {
  const W = 66;
  const line = '═'.repeat(W - 2);
  const divider = `╠${line}╣`;
  const bottom  = `╚${line}╝`;
  const colDivide = `╠${pad('', 12, 'left').replace(/ /g,'═')}╦${pad('', 12, 'left').replace(/ /g,'═')}╦${pad('', 9, 'left').replace(/ /g,'═')}╦${pad('', 5, 'left').replace(/ /g,'═')}╦${pad('', 20, 'left').replace(/ /g,'═')}╣`;
  const colBottom = `╚${pad('', 12, 'left').replace(/ /g,'═')}╩${pad('', 12, 'left').replace(/ /g,'═')}╩${pad('', 9, 'left').replace(/ /g,'═')}╩${pad('', 5, 'left').replace(/ /g,'═')}╩${pad('', 20, 'left').replace(/ /g,'═')}╝`;

  const header = (txt) => `║ ${pad(txt, W - 4)} ║`;
  const row = (step, ok, skip, err, note) => {
    const errColor = Number(err) > 0 ? C.red : C.green;
    const okStr  = pad(ok, 10, 'center');
    const skStr  = pad(skip, 7, 'center');
    const errStr = pad(err, 3, 'center');
    const noteStr = pad(note, 18);
    return `║ ${C.cyan}${pad(step, 10)}${C.reset} ║ ${C.green}${okStr}${C.reset} ║ ${C.yellow}${skStr}${C.reset} ║ ${errColor}${errStr}${C.reset} ║ ${noteStr} ║`;
  };

  console.log(`\n${C.bold}${C.cyan}╔${line}╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}${header('SENSORX MINER — BÁO CÁO KẾT QUẢ')}${C.reset}`);
  console.log(`${C.cyan}${divider}${C.reset}`);
  if (filename) console.log(header(`📄 File   : ${filename}`));
  console.log(header(`⚡ Command : ${report.command}`));
  console.log(header(`🕐 Bắt đầu : ${formatDate(report.startedAt)}`));
  console.log(header(`⏱  Thời gian: ${formatDuration(report.durationSeconds)}`));
  console.log(`${C.cyan}${divider}${C.reset}`);
  console.log(`║ ${C.bold}${pad('Bước', 10)}${C.reset} ║ ${C.bold}${pad('Thành công', 10, 'center')}${C.reset} ║ ${C.bold}${pad('Bỏ qua', 7, 'center')}${C.reset} ║ ${C.bold}${pad('Lỗi', 3, 'center')}${C.reset} ║ ${C.bold}${pad('Ghi chú', 18)}${C.reset} ║`);
  console.log(`${C.cyan}${colDivide}${C.reset}`);

  const steps = report.steps || {};
  for (const [step, data] of Object.entries(steps)) {
    const ok   = data.success ?? (data.success === true ? '✓' : '-');
    const skip = data.skipped ?? '-';
    const err  = data.errors?.length ?? 0;
    let note = err > 0 ? `${err} lỗi → xem JSON` : 'OK';
    if (data.success === true && typeof data.success !== 'number') note = 'OK';
    if (data.success === false) note = 'FAILED';
    console.log(row(step, ok, skip, err, note));
  }

  console.log(`${C.cyan}${colBottom}${C.reset}`);

  if (report.recommendation) {
    console.log(`\n${C.yellow}⚠  ${report.recommendation}${C.reset}`);
  }

  // In chi tiết lỗi nếu có
  for (const [step, data] of Object.entries(steps)) {
    if (data.errors?.length > 0) {
      console.log(`\n${C.red}Lỗi trong bước "${step}":${C.reset}`);
      data.errors.slice(0, 10).forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
      if (data.errors.length > 10) console.log(`  ... và ${data.errors.length - 10} lỗi khác (xem file JSON)`);
    }
  }
  console.log('');
}

/**
 * In danh sách tất cả report dạng bảng
 */
export function renderReportList(reports) {
  if (reports.length === 0) {
    console.log('\nChưa có report nào. Hãy chạy một lệnh import/crawl/clean trước.\n');
    return;
  }

  const W = 70;
  const line = '═'.repeat(W - 2);
  console.log(`\n${C.bold}${C.cyan}╔${line}╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║ ${pad('DANH SÁCH REPORT', W - 4)} ║${C.reset}`);
  console.log(`${C.cyan}╠${line}╣${C.reset}`);
  console.log(`║ ${C.bold}${pad('Category', 8)}${C.reset} │ ${C.bold}${pad('File', 35)}${C.reset} │ ${C.bold}${pad('Thời gian', 20)}${C.reset} ║`);
  console.log(`${C.cyan}╠${line}╣${C.reset}`);

  for (const r of reports) {
    const dt = formatDate(r.startedAt);
    console.log(`║ ${C.cyan}${pad(r.category, 8)}${C.reset} │ ${pad(r.filename, 35)} │ ${pad(dt, 20)} ║`);
  }
  console.log(`${C.cyan}╚${line}╝${C.reset}\n`);
}
