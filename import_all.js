import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { getAllJSONFiles, readJSONFile } from './src/utils/api.js';
import { seedAccountsAndCustomers } from './src/importers/accountApi.js';
import { importProducts } from './src/importers/productApi.js';
import { importPrices } from './src/importers/priceApi.js';
import { runSimulation } from './src/simulators/simulate_closing_behavior.js';
import axios from 'axios';
import { GATEWAY_URL } from './src/utils/api.js';

const execPromise = util.promisify(exec);

async function cleanData() {
  const databases = [
    "SensorX_Data", 
    "SensorX_Master", 
    "SensorX_Warehouse",
    "SensorX_Warehouse_1", 
    "SensorX_Warehouse_2",
    "sensorx_gateway"
  ];
  const containerName = "sensorx_postgres";
  const sqlFile = path.join(process.cwd(), "clean_all_data.sql");
  const fileName = "clean_all_data.sql";

  console.log("Starting data cleanup process...");

  try {
    const { stdout } = await execPromise(`docker ps -q -f name=${containerName}`);
    if (stdout.trim()) {
      console.log(`Tìm thấy Docker container '${containerName}'. Bắt đầu xóa dữ liệu...`);
      await execPromise(`docker cp "${sqlFile}" "${containerName}:/tmp/${fileName}"`);
      
      for (const db of databases) {
        console.log(`Đang xóa dữ liệu Database: ${db} ...`);
        try {
          await execPromise(`docker exec ${containerName} psql -U postgres -d ${db} -f "/tmp/${fileName}"`);
          console.log(`Hoàn tất xóa ${db}`);
        } catch (err) {
          // ignore error
        }
      }
    } else {
      console.log(`Không tìm thấy Docker container '${containerName}'. Thử dùng psql cục bộ...`);
      for (const db of databases) {
        console.log(`Đang xóa dữ liệu Database: ${db} ...`);
        try {
          await execPromise(`psql -h localhost -U postgres -d ${db} -f "${sqlFile}"`, { env: { ...process.env, PGPASSWORD: "sk1234" } });
          console.log(`Hoàn tất xóa ${db}`);
        } catch (err) {
          // ignore error
        }
      }
    }
    console.log("Đang khởi động lại container gateway để tái tạo tài khoản Admin...");
    try {
      await execPromise("docker restart sensorx_gateway");
      console.log("Chờ 10 giây để gateway khởi động hoàn tất...");
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (e) {
      console.log("Không thể khởi động lại gateway: " + e.message);
    }
    console.log("Tất cả dữ liệu đã được dọn dẹp!\n");
  } catch (err) {
    console.error("Lỗi trong quá trình dọn dẹp:", err);
  }
}

async function main() {
  console.log('=== HỆ THỐNG IMPORT DỮ LIỆU SENSORX ===\n');

  // Bước 0: Dọn dẹp dữ liệu cũ
  await cleanData();

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

  console.log('\n=== QUÁ TRÌNH IMPORT DỮ LIỆU HOÀN TẤT ===');
  
  console.log('\n=== CHUẨN BỊ MÔ PHỎNG HÀNH VI CHỐT ĐƠN E2E ===\n');
  
  // Seed AI Hyperparameters
  try {
    console.log('Khởi tạo siêu tham số AI (AI Hyperparameters)...');
    await axios.post(`${GATEWAY_URL}/api/master/ai/hyperparameters/reset`);
    console.log('-> Khởi tạo thành công.');
  } catch (err) {
    console.error('Lỗi khi khởi tạo siêu tham số AI:', err.message);
  }

  await runSimulation();
}

main().catch(console.error);
