import axios from 'axios';
import { GATEWAY_URL } from './api.js';

/**
 * SensorX API Client tập trung.
 * Tất cả importer dùng chung instance này thay vì tự tạo axios riêng.
 *
 * Sử dụng:
 *   import { apiClient } from '../utils/apiClient.js';
 *   await apiClient.init();
 *   await apiClient.data.get('/catalog/products/list');
 */
class ApiClient {
  constructor() {
    this._token = null;
    this._adminToken = null;
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  /**
   * Khởi tạo manager token (cần gọi trước khi dùng .data / .warehouse / .master)
   */
  async init() {
    console.log('Đang lấy access token cho manager@sensorx.com...');
    this._token = await this._login('manager@sensorx.com', '123456');
  }

  /**
   * Lấy admin token (dùng để tạo tài khoản)
   */
  async initAdmin() {
    console.log('Đang lấy access token cho admin@sensorx.com...');
    this._adminToken = await this._login('admin@sensorx.com', '123456');
    return this._adminToken;
  }

  async _login(email, password) {
    const res = await axios.post(`${GATEWAY_URL}/auth/login`, { email, password });
    const token = res.data?.data?.accessToken;
    if (!token) throw new Error(`Đăng nhập thất bại cho ${email}`);
    return token;
  }

  /**
   * Đăng nhập với bất kỳ email/password nào → trả về token
   */
  async login(email, password) {
    return this._login(email, password);
  }

  /**
   * Tạo tài khoản nhân viên (cần adminToken)
   */
  async createAccount(payload) {
    if (!this._adminToken) await this.initAdmin();
    return axios.post(`${GATEWAY_URL}/auth/create`, payload, {
      headers: { Authorization: `Bearer ${this._adminToken}` }
    });
  }

  /**
   * Đăng ký tài khoản khách hàng (không cần token)
   */
  async registerCustomer(payload) {
    return axios.post(`${GATEWAY_URL}/auth/register`, payload);
  }

  // ─── Service Clients ───────────────────────────────────────────────────────

  /**
   * Axios instance cho SensorX.Data API
   * GET/POST tới /api/data/...
   */
  get data() {
    if (!this._token) throw new Error('apiClient chưa được khởi tạo. Gọi await apiClient.init() trước.');
    return axios.create({
      baseURL: `${GATEWAY_URL}/api/data`,
      headers: {
        Authorization: `Bearer ${this._token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Axios instance với token động (dùng khi cần pass token khác)
   */
  dataWithToken(token) {
    return axios.create({
      baseURL: `${GATEWAY_URL}/api/data`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Axios instance cho Warehouse API
   * POST tới /api/warehouse/...
   */
  get warehouse() {
    if (!this._token) throw new Error('apiClient chưa được khởi tạo. Gọi await apiClient.init() trước.');
    return axios.create({
      baseURL: `${GATEWAY_URL}/api/warehouse`,
      headers: {
        Authorization: `Bearer ${this._token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Axios instance cho Master API
   * POST tới /api/master/...
   */
  get master() {
    if (!this._token) throw new Error('apiClient chưa được khởi tạo. Gọi await apiClient.init() trước.');
    return axios.create({
      baseURL: `${GATEWAY_URL}/api/master`,
      headers: {
        Authorization: `Bearer ${this._token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Axios instance cho Gateway Auth (không có /api prefix)
   */
  get auth() {
    return axios.create({
      baseURL: `${GATEWAY_URL}`,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  /**
   * Kiểm tra lỗi có phải "đã tồn tại" không (bỏ qua idempotent)
   */
  isAlreadyExistsError(err) {
    const status = err.response?.status;
    const msg = (err.response?.data?.message || err.response?.data?.Message || '').toLowerCase();
    return (status === 400 || status === 409) && (msg.includes('exist') || msg.includes('tồn tại'));
  }
}

// Singleton — dùng chung toàn project
export const apiClient = new ApiClient();
