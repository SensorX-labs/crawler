import path from 'path';
import { getAllJSONFiles, readJSONFile } from './src/utils/api.js';
import { seedAccountsAndCustomers } from './src/importers/accountApi.js';
import { importProducts } from './src/importers/productApi.js';
import { importPrices } from './src/importers/priceApi.js';

async function main() {
  console.log('=== HỆ THỐNG IMPORT DỮ LIỆU SENSORX ===\n');

  // Bước 1: Tạo tài khoản nhân viên & khách hàng mặc định
  await seedAccountsAndCustomers();

  const productDir = path.join(process.cwd(), 'data', 'product');
  const priceDir = path.join(process.cwd(), 'data', 'price');

  const productFiles = getAllJSONFiles(productDir);
  let allProducts = [];

  for (const file of productFiles) {
    console.log(`Đọc file sản phẩm: ${file}`);
    const data = readJSONFile(file);
    if (data && Array.isArray(data)) {
      allProducts.push(...data);
    }
  }

  if (allProducts.length > 0) {
    console.log(`Bắt đầu import ${allProducts.length} sản phẩm...`);
    await importProducts(allProducts);
  } else {
    console.log('Không có sản phẩm nào để import. Bỏ qua bước import sản phẩm.');
  }

  console.log('\n----------------------------------------\n');

  const priceFiles = getAllJSONFiles(priceDir);
  let allPrices = [];

  for (const file of priceFiles) {
    console.log(`Đọc file bảng giá: ${file}`);
    const data = readJSONFile(file);
    if (data && Array.isArray(data)) {
      allPrices.push(...data);
    }
  }

  if (allPrices.length > 0) {
    console.log(`Bắt đầu import bảng giá dựa trên ${allPrices.length} mẫu giá...`);
    await importPrices(allPrices);
  } else {
    console.log('Không có dữ liệu giá mẫu. Vẫn tiến hành import bảng giá (sẽ dùng giá mặc định).');
    await importPrices([]);
  }

  console.log('\n=== QUÁ TRÌNH IMPORT HOÀN TẤT ===');
}

main().catch(console.error);
