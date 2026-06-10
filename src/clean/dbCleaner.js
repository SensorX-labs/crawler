import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { GATEWAY_URL } from '../utils/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execPromise = util.promisify(exec);

const DATABASES = [
  'SensorX_Data',
  'SensorX_Master',
  'SensorX_Warehouse',
  'SensorX_Warehouse_1',
  'SensorX_Warehouse_2',
  'sensorx_gateway'
];

const CONTAINER_NAME = 'sensorx_postgres';
const SQL_FILE_NAME = 'clean_all_data.sql';
const SQL_FILE_PATH = path.join(__dirname, SQL_FILE_NAME);

/**
 * Xóa toàn bộ dữ liệu trong các database của SensorX.
 * Tự động detect môi trường: Docker container hay localhost.
 *
 * @returns {{ success: boolean, errors: string[] }}
 */
export async function cleanAllData() {
  console.log('=== BẮT ĐẦU DỌN DẸP DỮ LIỆU ===');
  const result = { success: false, errors: [] };

  try {
    const runningInDocker = process.env.RUNNING_IN_DOCKER === 'true';

    if (runningInDocker) {
      // ── Chạy trong Docker container — dùng psql trực tiếp ──────────────
      console.log('Môi trường Docker: kết nối trực tiếp tới postgres host...');
      for (const db of DATABASES) {
        console.log(`Đang xóa: ${db} ...`);
        try {
          await execPromise(
            `psql -h postgres -U postgres -d ${db} -f "${SQL_FILE_PATH}"`,
            { env: { ...process.env, PGPASSWORD: 'sk1234' } }
          );
          console.log(`✓ Xóa xong ${db}`);
        } catch (err) {
          const msg = `Lỗi xóa ${db}: ${err.message}`;
          console.error(msg);
          result.errors.push(msg);
        }
      }
    } else {
      // ── Chạy ngoài Docker — thử qua docker exec trước ────────────────
      let useDockerExec = false;
      try {
        const { stdout } = await execPromise(`docker ps -q -f name=${CONTAINER_NAME}`);
        useDockerExec = !!stdout.trim();
      } catch (_) { }

      if (useDockerExec) {
        console.log(`Tìm thấy container '${CONTAINER_NAME}'. Dùng docker exec...`);
        await execPromise(`docker cp "${SQL_FILE_PATH}" "${CONTAINER_NAME}:/tmp/${SQL_FILE_NAME}"`);

        for (const db of DATABASES) {
          console.log(`Đang xóa: ${db} ...`);
          try {
            await execPromise(
              `docker exec ${CONTAINER_NAME} psql -U postgres -d ${db} -f "/tmp/${SQL_FILE_NAME}"`
            );
            console.log(`✓ Xóa xong ${db}`);
          } catch (err) {
            const msg = `Lỗi xóa ${db}: ${err.message}`;
            console.error(msg);
            result.errors.push(msg);
          }
        }
      } else {
        // ── Fallback: psql localhost ────────────────────────────────────
        console.log('Không tìm thấy container. Dùng psql localhost...');
        for (const db of DATABASES) {
          console.log(`Đang xóa: ${db} ...`);
          try {
            await execPromise(
              `psql -h localhost -U postgres -d ${db} -f "${SQL_FILE_PATH}"`,
              { env: { ...process.env, PGPASSWORD: 'sk1234' } }
            );
            console.log(`✓ Xóa xong ${db}`);
          } catch (err) {
            const msg = `Lỗi xóa ${db}: ${err.message}`;
            console.error(msg);
            result.errors.push(msg);
          }
        }
      }
    }

    // Khởi động lại các service cần thiết (chỉ khi không trong Docker)
    if (process.env.RUNNING_IN_DOCKER !== 'true') {
      console.log('\nKhởi động lại toàn bộ các service API backend...');
      try {
        await Promise.all([
          execPromise('docker restart sensorx_gateway'),
          // execPromise('docker restart sensorx_data_api'),
          // execPromise('docker restart sensorx_master_api'),
          execPromise('docker restart sensorx_warehouse_api_1'),
          execPromise('docker restart sensorx_warehouse_api_2')
        ]);
        
        console.log('Đang chờ gateway khởi động và hoàn tất seed database (tối đa 30s)...');
        const healthy = await waitForGatewayHealthy(30000);
        if (healthy) {
          console.log('✓ Gateway đã sẵn sàng và seed dữ liệu thành công!');
        } else {
          console.warn('⚠ Quá thời gian chờ gateway. Các bước sau có thể bị lỗi.');
        }
      } catch (e) {
        console.log('Không thể restart container: ' + e.message);
      }
    }

    console.log('\n=== DỌN DẸP HOÀN TẤT ===');
    result.success = result.errors.length === 0;
  } catch (err) {
    const msg = `Lỗi nghiêm trọng: ${err.message}`;
    console.error(msg);
    result.errors.push(msg);
  }

  return result;
}

/**
 * Đợi cho đến khi API Gateway phản hồi healthy (200 OK)
 * Đảm bảo DbSeeder đã chạy xong trước khi trả về.
 */
async function waitForGatewayHealthy(timeoutMs = 30000) {
  const start = Date.now();
  const url = `${GATEWAY_URL}/health`;
  
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(url, { timeout: 2000 });
      if (res.status === 200) {
        return true;
      }
    } catch (err) {
      // Bỏ qua lỗi connection / timeout để thử lại ở vòng lặp sau
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}
