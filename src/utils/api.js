import axios from 'axios';
import fs from 'fs';
import path from 'path';

export const GATEWAY_URL = 'http://localhost:5053';

export async function getManagerToken() {
  console.log('Đang kết nối tới Gateway để lấy Access Token...');
  
  try {
    const loginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'manager@gmail.com',
      password: '123456'
    });
    if (loginRes.data?.data?.accessToken) {
      console.log('Đăng nhập thành công với tài khoản manager@gmail.com');
      return loginRes.data.data.accessToken;
    }
  } catch (error) {
    console.log('Tài khoản manager@gmail.com chưa tồn tại hoặc sai mật khẩu. Đăng nhập Admin để khởi tạo...');
  }

  let adminToken;
  try {
    const adminLoginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'admin@sensorx.com',
      password: '123456'
    });
    adminToken = adminLoginRes.data.data.accessToken;
    console.log('Đăng nhập thành công với tài khoản Admin.');
  } catch (err) {
    console.error('Đăng nhập Admin thất bại.', err.message);
    throw err;
  }

  try {
    console.log('Đang tạo tài khoản manager@gmail.com...');
    await axios.post(`${GATEWAY_URL}/auth/create`, {
      email: 'manager@gmail.com',
      password: '123456',
      role: 4 // Manager role
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('Tạo tài khoản manager@gmail.com thành công!');
  } catch (createErr) {
    if (createErr.response?.data?.message?.includes('exists') || createErr.response?.data?.Message?.includes('exists')) {
      console.log('Tài khoản manager@gmail.com đã tồn tại.');
    } else {
      throw createErr;
    }
  }

  try {
    const finalLoginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'manager@gmail.com',
      password: '123456'
    });
    return finalLoginRes.data.data.accessToken;
  } catch (err) {
    console.error('Đăng nhập manager@gmail.com sau khi khởi tạo thất bại:', err.message);
    throw err;
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
