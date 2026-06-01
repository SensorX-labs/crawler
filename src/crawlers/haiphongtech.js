import axios from 'axios';
import * as cheerio from 'cheerio';

const PAGES_TO_CRAWL = 45;
const BASE_URL = 'https://haiphongtech.vn/shop/';

const KNOWN_SUPPLIERS = [
  'JST', 'OMRON', 'AUTONICS', 'SEGIBIZ', 'SEGIBIBZ', 'SAMWON', 'KEYENCE', 
  'PANASONIC', 'SCHNEIDER', 'MITSUBISHI', 'FOTEK', 'LS', 'SMC', 'YASKAWA', 
  'SIEMENS', 'ABB', 'HONEYWELL', 'MEANWELL', 'KACON', 'HANYOUNG', 'KOINO', 
  'JEONO', 'CHINT', 'SELEC', 'DELTA', 'MOLEX'
];

const KNOWN_CATEGORIES = [
  { keywords: ['CHÂN PIN', 'ĐẦU CỐT', 'TERMINAL', 'SOCKET'], name: 'Đầu nối & Chân pin' },
  { keywords: ['CẢM BIẾN', 'SENSOR', 'BRQP', 'BRQ', 'PR'], name: 'Cảm biến' },
  { keywords: ['RƠ LE', 'RELAY', 'MY2N', 'MY4N', 'LY2N', 'LY4N'], name: 'Rơ le trung gian' },
  { keywords: ['BỘ NGUỒN', 'NGUỒN TỔ ONG', 'POWER SUPPLY'], name: 'Bộ nguồn' },
  { keywords: ['CẦU TIẾP ĐỊA', 'CẦU ĐẤU', 'TERMINAL BLOCK', 'SG-EB'], name: 'Cầu tiếp địa & Cầu đấu' },
  { keywords: ['CÔNG TẮC', 'SWITCH', 'LIMIT SWITCH'], name: 'Công tắc & Nút nhấn' }
];

function detectSupplier(title) {
  const upperTitle = title.toUpperCase();
  for (const supplier of KNOWN_SUPPLIERS) {
    if (upperTitle.includes(supplier)) {
      if (supplier === 'SEGIBIBZ') return 'Segibiz';
      return supplier.charAt(0) + supplier.slice(1).toLowerCase();
    }
  }
  return 'Hải Phòng Tech';
}

function detectCategory(title, htmlCategory) {
  if (htmlCategory) {
    const trimmed = htmlCategory.trim();
    if (trimmed) return trimmed;
  }
  const upperTitle = title.toUpperCase();
  for (const cat of KNOWN_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (upperTitle.includes(kw)) {
        return cat.name;
      }
    }
  }
  return 'Thiết bị tự động hóa';
}

function getLargestImageUrl(imgEl, $) {
  const srcset = imgEl.attr('srcset') || imgEl.attr('data-srcset');
  if (srcset) {
    const parts = srcset.split(',');
    const lastPart = parts[parts.length - 1].trim();
    const url = lastPart.split(/\s+/)[0];
    if (url && url.startsWith('http')) return url;
  }
  return imgEl.attr('src') || imgEl.attr('data-src') || '';
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function scrapeHaiPhongTech() {
  console.log('=== BẮT ĐẦU CÀO DỮ LIỆU TỪ HẢI PHÒNG TECH ===');
  const products = [];
  const visitedUrls = new Set();

  for (let page = 1; page <= PAGES_TO_CRAWL; page++) {
    const pageUrl = page === 1 ? BASE_URL : `${BASE_URL}page/${page}/`;
    console.log(`Đang cào trang ${page}/${PAGES_TO_CRAWL}: ${pageUrl}`);

    try {
      const response = await axios.get(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      const productElements = $('.product, .product-small, .type-product');
      console.log(`Tìm thấy ${productElements.length} sản phẩm trên trang ${page}`);

      productElements.each((index, el) => {
        const titleEl = $(el).find('.name a, .product-title a, h3 a').first();
        const title = titleEl.text().trim();
        const productUrl = titleEl.attr('href');

        if (!title || !productUrl) return;

        if (visitedUrls.has(productUrl)) return;
        visitedUrls.add(productUrl);

        const htmlCategory = $(el).find('.category').first().text().trim();
        const categoryName = detectCategory(title, htmlCategory);
        const supplierName = detectSupplier(title);

        const imgEl = $(el).find('img').first();
        const imageUrl = getLargestImageUrl(imgEl, $);

        products.push({
          name: title,
          productUrl,
          imageUrl,
          supplierName,
          categoryName,
          unitName: 'Cái',
          price: 0 // Default to 0 for Haiphongtech since we don't parse prices here initially
        });
      });

      console.log(`Tổng số sản phẩm tích lũy được sau trang ${page}: ${products.length}`);
      await delay(800);
    } catch (error) {
      console.error(`Lỗi khi cào trang ${page}:`, error.message);
      await delay(2000);
    }
  }

  console.log(`=== HOÀN TẤT CÀO DỮ LIỆU. TỔNG SỐ SẢN PHẨM: ${products.length} ===`);
  return products;
}
