import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import { scrapeHaiAu } from './src/crawlers/haiau.js';
import { scrapeHaiPhongTech } from './src/crawlers/haiphongtech.js';

function saveProducts(products, sourceName) {
  if (!products || products.length === 0) {
    console.error(`Không có dữ liệu nào được trả về từ nguồn ${sourceName}.`);
    return;
  }

  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') + '_' +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');

  const filename = `products_${sourceName}_${timestamp}_${products.length}.json`;
  const filepath = path.join(process.cwd(), 'data', 'product', filename);

  fs.writeFileSync(filepath, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`Đã lưu ${products.length} sản phẩm vào file: ${filepath}`);
}

async function main() {
  console.log('=== HỆ THỐNG CÀO DỮ LIỆU SENSORX ===\n');
  
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'source',
      message: 'Bạn muốn cào dữ liệu từ nguồn nào?',
      choices: [
        { name: 'Cơ Điện Hải Âu (codienhaiau.com)', value: 'haiau' },
        { name: 'Hải Phòng Tech (haiphongtech.vn)', value: 'haiphongtech' },
        { name: 'Thoát', value: 'exit' }
      ]
    }
  ]);

  if (answers.source === 'exit') {
    console.log('Đã thoát chương trình.');
    return;
  }

  try {
    let products = [];
    if (answers.source === 'haiau') {
      products = await scrapeHaiAu();
    } else if (answers.source === 'haiphongtech') {
      products = await scrapeHaiPhongTech();
    }
    
    saveProducts(products, answers.source);
  } catch (err) {
    console.error('Đã xảy ra lỗi trong quá trình cào:', err);
  }
}

main().catch(console.error);
