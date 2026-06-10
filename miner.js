/**
 * miner.js — SensorX Miner CLI Entry Point
 *
 * Cú pháp:
 *   node miner.js import --all        Toàn bộ pipeline (account → product → price → stockin → simulate)
 *   node miner.js import --account    Chỉ seed tài khoản & khách hàng
 *   node miner.js import --product    Chỉ import sản phẩm từ src/crawl/data/product/
 *   node miner.js import --price      Chỉ import/làm bảng giá
 *   node miner.js import --stockin    Chỉ nhập tồn kho
 *   node miner.js crawl               Chọn source và crawl dữ liệu
 *   node miner.js clean --all         Xóa toàn bộ DB (chạy tay)
 *   node miner.js report              Xem báo cáo lần chạy gần nhất
 *   node miner.js report --list       Liệt kê tất cả report
 *   node miner.js report --file <f>   Xem report cụ thể
 *   node miner.js --help              Hướng dẫn sử dụng
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';

import { seedAccountsAndCustomers } from './src/import/accountImporter.js';
import { importProducts } from './src/import/productImporter.js';
import { importPrices } from './src/import/priceImporter.js';
import { importInventory } from './src/import/stockinImporter.js';
import { runFullPipeline } from './src/import/fullPipelineImporter.js';
import { scrapeHaiAu } from './src/crawl/haiau.js';
import { scrapeHaiPhongTech } from './src/crawl/haiphongtech.js';
import { cleanAllData } from './src/clean/dbCleaner.js';
import {
  createReport, finalizeReport, saveReport,
  readLatestReport, readReportByFile, listAllReports,
  renderReport, renderReportList
} from './src/utils/reporter.js';
import { getAllJSONFiles, readJSONFile } from './src/utils/api.js';
import { apiClient } from './src/utils/apiClient.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PRODUCT_DIR = path.join(__dirname, 'src', 'crawl', 'data', 'product');
const DATA_PRICE_DIR = path.join(__dirname, 'src', 'crawl', 'data', 'price');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║                        SENSORX MINER — CLI HELPER                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║  node miner.js import --all        Toàn bộ pipeline (account → product → ║
║                                    price → stockin → simulate)           ║
║  node miner.js import --account    Chỉ seed tài khoản                    ║
║  node miner.js import --product    Chỉ import sản phẩm                   ║
║  node miner.js import --price      Chỉ import bảng giá                   ║
║  node miner.js import --stockin    Chỉ nhập tồn kho                      ║
║  node miner.js import --simulate   Chỉ chạy simulate E2E                 ║
╠══════════════════════════════════════════════════════════════════════════╣
║  node miner.js crawl               Crawl dữ liệu từ web                  ║
║  node miner.js clean --all         Xóa toàn bộ DB                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║  node miner.js report              Báo cáo lần chạy gần nhất             ║
║  node miner.js report --list       Liệt kê tất cả report                 ║
║  node miner.js report --file <f>   Xem report cụ thể                     ║
╚══════════════════════════════════════════════════════════════════════════╝
`);
}

// ─── Command: import ──────────────────────────────────────────────────────────

const VALID_IMPORT_FLAGS = new Set(['--all', '--account', '--product', '--price', '--stockin', '--simulate']);

async function runImport(flags) {
  if (flags.length === 0) {
    console.error('Thiếu flag. Ví dụ: node miner.js import --all');
    showHelp();
    return;
  }

  // Validate tất cả flags trước
  for (const f of flags) {
    if (!VALID_IMPORT_FLAGS.has(f)) {
      console.error(`Flag không hợp lệ: ${f}`);
      showHelp();
      return;
    }
  }

  const report = createReport(`import ${flags.join(' ')}`);

  // Nếu có --all → chạy full pipeline (bao gồm tất cả bước)
  if (flags.includes('--all')) {
    console.log('Flag --all được phát hiện → chạy toàn bộ pipeline.');
    await importAll(report);
  } else {
    // Chạy từng flag theo thứ tự trái → phải
    let step = 1;
    const total = flags.length;
    for (const flag of flags) {
      console.log(`\n${'═'.repeat(50)}`);
      console.log(`[${step}/${total}] ${flag}`);
      console.log('═'.repeat(50));
      switch (flag) {
        case '--account': await importAccount(report); break;
        case '--product': await importProduct(report); break;
        case '--price': await importPrice(report); break;
        case '--stockin': await importStockin(report); break;
        case '--simulate': await importSimulate(report); break;
      }
      step++;
    }
  }

  finalizeReport(report);
  saveReport(report, 'import');
}


async function importAll(report) {
  console.log('\n=== [1/5] TẠO TÀI KHOẢN ===');
  report.steps.account = await seedAccountsAndCustomers();

  // ── Kiểm tra manager token trước khi chạy các bước tiếp theo ──────────────
  // Nếu login fail (do DB bị xóa, chưa reseed...) → abort sớm thay vì crash
  try {
    await apiClient.init();
  } catch (loginErr) {
    const msg = `Không thể đăng nhập manager@sensorx.com (${loginErr.message}).\n` +
      `  Nguyên nhân thường gặp: gateway DB vừa bị xóa, chưa reseed admin account.\n` +
      `  → Restart lại SensorX.Data + SensorX-gateway rồi chạy lại.`;
    console.error(`\n❌ ${msg}`);
    report.steps._abort = { errors: [msg] };
    return;
  }

  console.log('\n=== [2/5] IMPORT SẢN PHẨM ===');
  try {
    const productFiles = getAllJSONFiles(DATA_PRODUCT_DIR);
    let allProducts = [];
    for (const file of productFiles) {
      const data = readJSONFile(file);
      if (data && Array.isArray(data)) allProducts.push(...data);
    }
    if (allProducts.length > 0) {
      report.steps.product = await importProducts(allProducts);
    } else {
      console.log('Không có file sản phẩm nào trong src/crawl/data/product/. Bỏ qua.');
      report.steps.product = { success: 0, skipped: 0, errors: ['Không có file JSON sản phẩm'] };
    }
  } catch (err) {
    console.error(`Lỗi bước import product: ${err.message}`);
    report.steps.product = { success: 0, skipped: 0, errors: [err.message] };
  }

  console.log('\n=== [3/5] IMPORT BẢNG GIÁ ===');
  try {
    const priceFiles = getAllJSONFiles(DATA_PRICE_DIR);
    let allPrices = [];
    for (const file of priceFiles) {
      const data = readJSONFile(file);
      if (data && Array.isArray(data)) allPrices.push(...data);
    }
    report.steps.price = await importPrices(allPrices);
  } catch (err) {
    console.error(`Lỗi bước import price: ${err.message}`);
    report.steps.price = { success: 0, skipped: 0, errors: [err.message] };
  }

  console.log('\n=== [4/5] NHẬP TỒN KHO ===');
  try {
    report.steps.stockin = await importInventory();
  } catch (err) {
    console.error(`Lỗi bước stockin: ${err.message}`);
    report.steps.stockin = { success: 0, skipped: 0, errors: [err.message] };
  }

  console.log('\n=== [5/5] SIMULATE E2E PIPELINE ===');
  try {
    report.steps.simulate = await runFullPipeline();
  } catch (err) {
    console.error(`Lỗi bước simulate: ${err.message}`);
    report.steps.simulate = { success: false, errors: [err.message] };
  }

  console.log('\n=== HOÀN TẤT TOÀN BỘ PIPELINE ===');
}


async function importAccount(report) {
  console.log('\n=== IMPORT TÀI KHOẢN ===');
  report.steps.account = await seedAccountsAndCustomers();
}

async function importProduct(report) {
  console.log('\n=== IMPORT SẢN PHẨM ===');
  const productFiles = getAllJSONFiles(DATA_PRODUCT_DIR);
  let allProducts = [];
  for (const file of productFiles) {
    const data = readJSONFile(file);
    if (data && Array.isArray(data)) allProducts.push(...data);
  }
  if (allProducts.length === 0) {
    console.log('Không có file JSON nào trong src/crawl/data/product/');
    report.steps.product = { success: 0, skipped: 0, errors: ['Không tìm thấy file JSON'] };
    return;
  }
  console.log(`Đọc được ${allProducts.length} sản phẩm từ ${productFiles.length} file.`);
  report.steps.product = await importProducts(allProducts);
}

async function importPrice(report) {
  console.log('\n=== IMPORT BẢNG GIÁ ===');
  const priceFiles = getAllJSONFiles(DATA_PRICE_DIR);
  let allPrices = [];
  for (const file of priceFiles) {
    const data = readJSONFile(file);
    if (data && Array.isArray(data)) allPrices.push(...data);
  }
  report.steps.price = await importPrices(allPrices);
}

async function importStockin(report) {
  console.log('\n=== NHẬP TỒN KHO ===');
  report.steps.stockin = await importInventory();
}

async function importSimulate(report) {
  console.log('\n=== SIMULATE E2E PIPELINE ===');
  report.steps.simulate = await runFullPipeline();
}

// ─── Command: crawl ───────────────────────────────────────────────────────────

async function runCrawl() {
  console.log('=== HỆ THỐNG CÀO DỮ LIỆU SENSORX ===\n');

  const { source } = await inquirer.prompt([{
    type: 'list',
    name: 'source',
    message: 'Bạn muốn cào dữ liệu từ nguồn nào?',
    choices: [
      { name: 'Cơ Điện Hải Âu (codienhaiau.com)', value: 'haiau' },
      { name: 'Hải Phòng Tech (haiphongtech.vn)', value: 'haiphongtech' },
      { name: 'Thoát', value: 'exit' }
    ]
  }]);

  if (source === 'exit') {
    console.log('Đã thoát.');
    return;
  }

  const report = createReport(`crawl --source ${source}`);

  try {
    let products = [];
    if (source === 'haiau') {
      products = await scrapeHaiAu();
    } else if (source === 'haiphongtech') {
      products = await scrapeHaiPhongTech();
    }

    if (!products || products.length === 0) {
      console.error(`Không có dữ liệu từ nguồn ${source}.`);
      report.steps.crawl = { success: 0, skipped: 0, errors: ['Không có dữ liệu trả về'] };
    } else {
      // Lưu JSON vào src/crawl/data/product/
      fs.mkdirSync(DATA_PRODUCT_DIR, { recursive: true });
      const now = new Date();
      const ts = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') + '_' +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');
      const filename = `products_${source}_${ts}_${products.length}.json`;
      const filepath = path.join(DATA_PRODUCT_DIR, filename);
      fs.writeFileSync(filepath, JSON.stringify(products, null, 2), 'utf-8');
      console.log(`✓ Đã lưu ${products.length} sản phẩm → ${filepath}`);
      report.steps.crawl = { success: products.length, skipped: 0, errors: [], file: filename };
    }
  } catch (err) {
    console.error('Lỗi trong quá trình cào:', err);
    report.steps.crawl = { success: 0, skipped: 0, errors: [err.message] };
  }

  finalizeReport(report);
  saveReport(report, 'crawl');
}

// ─── Command: clean ───────────────────────────────────────────────────────────

async function runClean(flags) {
  if (!flags.includes('--all')) {
    console.error('Cú pháp: node miner.js clean --all');
    return;
  }

  console.log('\n⚠  Cảnh báo: Toàn bộ dữ liệu trong DB sẽ bị xóa!');
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Bạn có chắc chắn muốn xóa sạch DB không?',
    default: false
  }]);

  if (!confirm) {
    console.log('Đã hủy.');
    return;
  }

  const report = createReport('clean --all');
  report.steps.clean = await cleanAllData();
  finalizeReport(report);
  saveReport(report, 'clean');
}

// ─── Command: report ──────────────────────────────────────────────────────────

async function runReport(flags) {
  if (flags.includes('--list')) {
    const all = listAllReports();
    renderReportList(all);
    return;
  }

  if (flags.includes('--file')) {
    const fileIdx = flags.indexOf('--file');
    const filename = flags[fileIdx + 1];
    if (!filename) {
      console.error('Thiếu tên file. Ví dụ: node miner.js report --file import_20260610_162030.json');
      return;
    }
    const found = readReportByFile(filename);
    if (!found) {
      console.error(`Không tìm thấy file report: ${filename}`);
      return;
    }
    renderReport(found.report, filename);
    return;
  }

  // Mặc định: xem report import mới nhất, hoặc bất kỳ category nào có
  let report = readLatestReport('import');
  let category = 'import';
  if (!report) {
    report = readLatestReport('crawl');
    category = 'crawl';
  }
  if (!report) {
    report = readLatestReport('clean');
    category = 'clean';
  }

  if (!report) {
    console.log('\nChưa có report nào. Hãy chạy một lệnh import/crawl/clean trước.\n');
    console.log('Gợi ý: node miner.js import --all');
    return;
  }

  // Tìm filename tương ứng
  const allReports = listAllReports();
  const match = allReports.find(r => r.category === category && r.command === report.command);
  renderReport(report, match?.filename || '');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [, , command, ...flags] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  switch (command) {
    case 'import': await runImport(flags); break;
    case 'crawl': await runCrawl(); break;
    case 'clean': await runClean(flags); break;
    case 'report': await runReport(flags); break;
    default:
      console.error(`Lệnh không hợp lệ: "${command}"`);
      showHelp();
  }
}

main().catch(err => {
  console.error('\n❌ Lỗi không xử lý được:', err.message);
  process.exit(1);
});
