import axios from 'axios';
import { GATEWAY_URL } from './src/utils/api.js';

const STAFF_ACCOUNTS = [
  { email: 'manager@gmail.com', password: '123456', role: 4 }, // Role.Manager
  { email: 'nguyentungsk@gmail.com', password: '123456', role: 2 }, // Role.SaleStaff
  { email: 'nguyenduyduc@gmail.com', password: '123456', role: 2 }, // Role.SaleStaff
  { email: 'chuduchai@gmail.com', password: '123456', role: 2 } // Role.SaleStaff
];

async function seedAccounts() {
  console.log('=== BẮT ĐẦU TẠO TÀI KHOẢN MẶC ĐỊNH ===');

  let adminToken;
  try {
    const adminLoginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'admin@sensorx.com',
      password: '123456'
    });
    adminToken = adminLoginRes.data.data.accessToken;
    console.log('Đăng nhập thành công với tài khoản Admin gốc.');
  } catch (err) {
    console.error('Đăng nhập Admin thất bại. Không thể tạo tài khoản!', err.message);
    return;
  }

  for (const account of STAFF_ACCOUNTS) {
    try {
      console.log(`Đang kiểm tra/tạo tài khoản: ${account.email}...`);
      await axios.post(`${GATEWAY_URL}/auth/create`, {
        email: account.email,
        password: account.password,
        role: account.role
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log(`-> Tạo thành công: ${account.email}`);
    } catch (err) {
      if (err.response?.data?.message?.includes('exists') || err.response?.data?.Message?.includes('exists') || err.response?.status === 400) {
        console.log(`-> Tài khoản ${account.email} đã tồn tại.`);
      } else {
        console.error(`-> Lỗi tạo tài khoản ${account.email}:`, err.response?.data || err.message);
      }
    }
  }

  console.log('=== HOÀN TẤT TẠO TÀI KHOẢN ===');
}

seedAccounts().catch(console.error);
