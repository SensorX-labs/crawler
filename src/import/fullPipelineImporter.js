/**
 * fullPipelineImporter.js
 * Giả lập hành vi E2E: Khách hàng → RFQ → AI phân bổ → Nhân viên Quote → Quản lý duyệt → Khách phản hồi
 * 
 * Đây là phần "AI Training Simulator" của pipeline import --all.
 * Logic gốc từ: src/simulators/simulate_closing_behavior.js
 */

import axios from 'axios';
import { GATEWAY_URL } from '../utils/api.js';
import { STAFF_ACCOUNTS, CUSTOMER_ACCOUNTS } from './accountImporter.js';

const API_GATEWAY = GATEWAY_URL;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class SensorXClient {
    constructor(email, password) {
        this.email = email;
        this.password = password;
        this.token = null;
        this.axios = axios.create({ baseURL: API_GATEWAY });
    }

    async login() {
        try {
            const res = await this.axios.post('/auth/login', { email: this.email, password: this.password });
            if (res.data?.success && res.data.data?.accessToken) {
                this.token = res.data.data.accessToken;
                this.axios.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
                return true;
            }
            throw new Error(res.data?.message || 'Login failed');
        } catch (e) {
            return false;
        }
    }

    async createAndSendRFQ(categories, productsByCategory) {
        const numItems = Math.floor(Math.random() * 3) + 1;
        const items = [];
        const selectedCategory = categories[Math.floor(Math.random() * categories.length)];
        const categoryProducts = productsByCategory[selectedCategory];

        for (let j = 0; j < numItems; j++) {
            const product = categoryProducts[Math.floor(Math.random() * categoryProducts.length)];
            if (!items.find(x => x.productId === product.id)) {
                items.push({
                    productId: product.id,
                    quantity: Math.floor(Math.random() * 10) + 1
                });
            }
        }

        const rfqRes = await this.axios.post('/api/master/rfq', { items });
        const rfqId = rfqRes.data.value.id || rfqRes.data.value;
        console.log(`Tạo RFQ thành công: ${rfqId}`);

        await this.axios.post('/api/master/rfq/send', { id: rfqId });
        console.log(`Đã gửi RFQ ${rfqId} (Danh mục: ${selectedCategory}), chờ AI phân bổ...`);
        return { rfqId, selectedCategory };
    }

    async acceptRFQ(rfqId) {
        await this.axios.post('/api/master/rfq/accept', { id: rfqId });
    }

    async createAndSubmitQuote(rfqId) {
        const rfqStaffRes = await this.axios.get(`/api/master/rfq/${rfqId}`);
        const requestedItems = rfqStaffRes.data.value.items || [];

        const quoteItems = requestedItems.map(reqItem => ({
            productId: reqItem.productId,
            unitPrice: 500000 + Math.random() * 1000000,
            taxRate: 10
        }));

        const createQuoteRes = await this.axios.post('/api/master/quotes', {
            rfqId: rfqId,
            note: 'Báo giá tốt nhất cho khách hàng',
            items: quoteItems
        });
        const quoteId = createQuoteRes.data.value;
        console.log(`Nhân viên đã tạo Quote: ${quoteId}`);

        await this.axios.post(`/api/master/quotes/${quoteId}/submit-for-approval`, {});
        return quoteId;
    }

    async approveQuote(quoteId) {
        await this.axios.post(`/api/master/quotes/${quoteId}/approve`, {});
        console.log(`Quản lý đã duyệt Quote.`);
    }

    async publishQuote(quoteId) {
        await this.axios.post(`/api/master/quotes/${quoteId}/publish`, {});
    }

    async respondQuote(quoteId, isAccepted) {
        await this.axios.post(`/api/master/quotes/${quoteId}/customer-response`, {
            id: quoteId,
            responseType: isAccepted ? 0 : 1,
            paymentTerm: 1,
            shippingAddress: 'Tại công trình',
            recipientName: 'Anh Trưởng Phòng',
            recipientPhone: '0909123456',
            feedback: isAccepted ? 'Giá OK' : 'Giá quá đắt'
        });
    }
}

async function getMasterDataProducts() {
    console.log('Fetching products from Catalog...');
    const publicClient = axios.create({ baseURL: API_GATEWAY });
    let products = [];
    try {
        const prodRes = await publicClient.get('/api/data/catalog/products/list?pageSize=2000');
        if (prodRes.data?.isSuccess) {
            products = prodRes.data.value.items || prodRes.data.value;
        }
    } catch (e) {
        console.error('Failed to fetch products:', e.message);
        return null;
    }

    if (!products || products.length === 0) {
        console.log('No products found, cannot create RFQs.');
        return null;
    }

    const productsByCategory = {};
    for (const p of products) {
        const cat = p.categoryName || 'Unknown';
        if (!productsByCategory[cat]) productsByCategory[cat] = [];
        productsByCategory[cat].push(p);
    }
    const categories = Object.keys(productsByCategory);
    console.log(`Found ${products.length} products across ${categories.length} categories.`);
    return { categories, productsByCategory };
}

/**
 * Chạy toàn bộ simulation E2E AI Training.
 * @returns {{ success: boolean, errors: string[] }}
 */
export async function runFullPipeline() {
    console.log('🚀 Bắt đầu giả lập E2E AI Training (Real Data)...');
    const result = { success: false, errors: [] };

    try {
        const masterData = await getMasterDataProducts();
        if (!masterData) {
            result.errors.push('Không tải được danh sách sản phẩm để simulate.');
            return result;
        }
        const { categories, productsByCategory } = masterData;

        // Divide categories among sale staffs to specialize
        const saleStaffs = STAFF_ACCOUNTS.filter(s => s.role === 2);
        const chunkSize = Math.ceil(categories.length / saleStaffs.length);
        const staffCategoriesMap = {};
        saleStaffs.forEach((staff, index) => {
            staffCategoriesMap[staff.email] = categories.slice(index * chunkSize, (index + 1) * chunkSize);
        });

        // Cache staff clients and assign specialties
        const staffClients = {};
        for (const staff of STAFF_ACCOUNTS) {
            const client = new SensorXClient(staff.email, staff.password);
            const logged = await client.login();
            if (logged) {
                try {
                    const profileRes = await client.axios.get('/api/data/staff/profile');
                    const profile = profileRes.data.value;
                    client.staffId = profile.id;

                    if (staff.role === 2 && staffCategoriesMap[staff.email]) {
                        client.specializedCategories = staffCategoriesMap[staff.email];
                        const assignedCats = staffCategoriesMap[staff.email];
                        const specText = `Chuyên xử lý báo giá cho các danh mục: ${assignedCats.join(', ')}`;
                        console.log(`Cập nhật chuyên môn cho ${staff.email}:\n  -> ${specText}`);
                        await client.axios.put('/api/data/staff/profile', {
                            name: profile.name || staff.fullName,
                            email: staff.email,
                            phone: profile.phone || staff.phone || '0988000000',
                            biography: specText
                        });
                    }

                    staffClients[staff.email] = client;
                } catch (err) {
                    console.error(`Failed to get/update profile for ${staff.email}`, err.message);
                }
            } else {
                console.log(`Failed to login staff ${staff.email}`);
            }
        }

        const NUM_CUSTOMERS = 40;
        const BATCH_SIZE = 5;
        let successCount = 0;

        const managerClient = staffClients['manager@sensorx.com'];
        if (!managerClient) {
            result.errors.push('Không tìm thấy managerClient.');
            return result;
        }

        const processTransaction = async (i) => {
            console.log(`\n--- Bắt đầu giao dịch ${i}/${NUM_CUSTOMERS} ---`);
            const selectedCustomer = CUSTOMER_ACCOUNTS[Math.floor(Math.random() * CUSTOMER_ACCOUNTS.length)];
            const customerClient = new SensorXClient(selectedCustomer.email, selectedCustomer.password);
            const loggedIn = await customerClient.login();
            if (!loggedIn) {
                console.log(`Bỏ qua giao dịch ${i} — không login được ${selectedCustomer.email}.`);
                return false;
            }

            try {
                const { rfqId, selectedCategory } = await customerClient.createAndSendRFQ(categories, productsByCategory);

                let assignedStaffId = null;
                let pollingAttempts = 0;
                const maxPollingAttempts = 15;

                while (!assignedStaffId && pollingAttempts < maxPollingAttempts) {
                    const rfqDetailRes = await managerClient.axios.get(`/api/master/rfq/${rfqId}`);
                    assignedStaffId = rfqDetailRes.data.value.staffId;
                    if (!assignedStaffId) {
                        pollingAttempts++;
                        await delay(1000);
                    }
                }

                if (!assignedStaffId) {
                    console.log(`RFQ chưa được AI phân bổ sau ${maxPollingAttempts}s. Bỏ qua.`);
                    return false;
                }

                const assignedStaffClient = Object.values(staffClients).find(c => c.staffId === assignedStaffId);
                if (!assignedStaffClient) {
                    console.log(`Không tìm thấy nhân viên cho RFQ ${rfqId}.`);
                    return false;
                }

                console.log(`Giao dịch ${i} — AI phân bổ cho: ${assignedStaffClient.email}`);
                await delay(Math.random() * 2000 + 1000);
                await assignedStaffClient.acceptRFQ(rfqId);
                const quoteId = await assignedStaffClient.createAndSubmitQuote(rfqId);
                await managerClient.approveQuote(quoteId);

                (async () => {
                    await delay(Math.random() * 5000 + 5000);
                    console.log(`Giao dịch ${i} — Nhân viên publish báo giá.`);
                    await assignedStaffClient.publishQuote(quoteId);
                    await delay(Math.random() * 3000 + 2000);
                    
                    // Logic chốt đơn theo chuyên môn: 
                    // Nếu nhân viên được giao xử lý đúng danh mục chuyên môn -> 95% chốt. Trái chuyên môn -> 5% chốt.
                    const isSpecialized = assignedStaffClient.specializedCategories?.includes(selectedCategory);
                    const isAccepted = isSpecialized ? (Math.random() > 0.05) : (Math.random() < 0.05);
                    
                    await customerClient.respondQuote(quoteId, isAccepted);
                    console.log(`Giao dịch ${i} — Khách hàng: ${isAccepted ? 'CHỐT ĐƠN' : 'TỪ CHỐI'} (Đúng mảng: ${isSpecialized ? 'Có' : 'Không'})`);
                })().catch(err => {
                    console.error(`Lỗi background giao dịch ${i}:`, err.message);
                });

                return true;
            } catch (error) {
                console.error(`Lỗi giao dịch ${i}:`, error?.response?.data || error.message);
                return false;
            }
        };

        const numBatches = Math.ceil(NUM_CUSTOMERS / BATCH_SIZE);
        for (let b = 0; b < numBatches; b++) {
            console.log(`\n=== LÔ GIAO DỊCH ${b + 1}/${numBatches} ===`);
            const batchTasks = [];
            for (let j = 1; j <= BATCH_SIZE; j++) {
                const index = b * BATCH_SIZE + j;
                if (index > NUM_CUSTOMERS) break;
                batchTasks.push(processTransaction(index));
            }
            const results = await Promise.all(batchTasks);
            successCount += results.filter(r => r).length;
            console.log(`=== HOÀN TẤT LÔ ${b + 1}. Chờ 3s... ===`);
            await delay(3000);
        }

        console.log(`\n🎉 Hoàn tất giả lập! ${successCount}/${NUM_CUSTOMERS} giao dịch thành công.`);
        result.success = true;

        // Reset AI Hyperparameters
        try {
            await axios.post(`${GATEWAY_URL}/api/master/ai/hyperparameters/reset`);
            console.log('-> Đã reset AI Hyperparameters.');
        } catch (err) {
            result.errors.push(`Lỗi reset AI Hyperparameters: ${err.message}`);
        }

    } catch (err) {
        result.errors.push(`Lỗi nghiêm trọng simulation: ${err.message}`);
        console.error(err);
    }

    return result;
}
