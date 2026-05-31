import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const CATEGORIES = {
  'Đầu nối & Chân pin': 'https://codienhaiau.com/category/dau-cosse/',
  'Cầu tiếp địa & Cầu đấu': 'https://codienhaiau.com/category/cau-dau-day-dien/',
  'Thiết bị tự động hóa': 'https://codienhaiau.com/category/plc/',
  'Rơ le trung gian': 'https://codienhaiau.com/category/ro-le-trung-gian/',
  'Cảm biến': 'https://codienhaiau.com/category/cam-bien/',
  'Công tắc & Nút nhấn': 'https://codienhaiau.com/category/nut-nhan/',
  'Bộ nguồn': 'https://codienhaiau.com/category/bo-nguon/'
};

function parsePrice(priceText) {
  if (!priceText) return null;
  const cleanText = priceText.replace(/\s/g, '');
  
  if (priceText.includes('Giá hiện tại là:')) {
    const parts = priceText.split('Giá hiện tại là:');
    const currentPricePart = parts[parts.length - 1];
    const match = currentPricePart.match(/\d+(\.\d+)*/);
    if (match) {
      return parseInt(match[0].replace(/\./g, ''), 10);
    }
  }
  
  const numbers = cleanText.match(/\d+(\.\d+)*/g);
  if (!numbers || numbers.length === 0) return null;
  
  return parseInt(numbers[0].replace(/\./g, ''), 10);
}

async function scrapeCategory(categoryName, url) {
  const products = [];
  console.log(`Đang cào danh mục: ${categoryName} (${url})...`);
  
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(res.data);
    
    $('li.product').each((i, el) => {
      const name = $(el).find('.woocommerce-loop-product__title, h2, h3').text().trim();
      const priceText = $(el).find('.price').text().trim();
      const link = $(el).find('a').attr('href');
      const price = parsePrice(priceText);
      
      if (name && price) {
        products.push({
          category: categoryName,
          name,
          price,
          link
        });
      }
    });
    
    console.log(`-> Tìm thấy ${products.length} sản phẩm có giá trị.`);
  } catch (err) {
    console.error(`Lỗi khi cào danh mục ${categoryName}:`, err.message);
  }
  
  return products;
}

async function main() {
  const allProducts = [];
  
  for (const [name, url] of Object.entries(CATEGORIES)) {
    const products = await scrapeCategory(name, url);
    allProducts.push(...products);
    // Delay nhẹ tránh spam server
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const outputPath = path.join(process.cwd(), 'haiau_prices.json');
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2), 'utf-8');
  console.log(`\nCào thành công! Đã lưu ${allProducts.length} sản phẩm mẫu vào: ${outputPath}`);
}

main().catch(console.error);
