import axios from 'axios';
import fs from 'fs';
import path from 'path';

export const GATEWAY_URL = 'http://localhost:5053';

export async function getManagerToken() {
  console.log('Đang kết nối tới Gateway để lấy Access Token cho manager@sensorx.com...');
  
  try {
    const loginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'manager@sensorx.com',
      password: '123456'
    });
    if (loginRes.data?.data?.accessToken) {
      return loginRes.data.data.accessToken;
    }
  } catch (error) {
    console.error('Không thể đăng nhập manager@sensorx.com. Vui lòng đảm bảo script khởi tạo tài khoản đã chạy thành công.', error.message);
    throw error;
  }
}

export function getAllJSONFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath);
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(dirPath, f));
}

export function readJSONFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Lỗi đọc file ${filePath}:`, err.message);
    return null;
  }
}
