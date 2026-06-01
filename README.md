# SensorX.Miner

SensorX.Miner là công cụ thu thập dữ liệu (Crawler), nhập liệu tự động (Importer), và mô phỏng hành vi AI (AI Simulator) dành riêng cho hệ thống cốt lõi SensorX.

## Mục đích
- **Thu thập dữ liệu thực tế**: Cào dữ liệu sản phẩm, danh mục, và giá cả từ các nguồn mở (như Cơ Điện Hải Âu, Hải Phòng Tech) để làm giàu cơ sở dữ liệu hệ thống.
- **Tự động hóa nhập liệu**: Đưa dữ liệu đã chuẩn hóa lên API Gateway của hệ thống chính.
- **Mô phỏng hành vi AI (Simulate Training)**: Tự động chạy giả lập hành vi chốt đơn, tương tác RFQ, qua đó tạo ra nguồn dữ liệu thật giúp AI phân bổ có đủ dữ liệu học tập (RL & ML Models).

## Cấu trúc thư mục
- `data/product/`: Chứa các file `.json` kết quả cào sản phẩm từ web.
- `data/price/`: Chứa các file `.json` bảng giá nội bộ.
- `src/crawlers/`: Các module logic chuyên biệt cào dữ liệu cho từng nguồn.
- `src/importers/`: Logic gọi API Gateway để đẩy sản phẩm & bảng giá vào Database.
- `src/simulators/`: Chứa `simulate_closing_behavior.js` để chạy giả lập AI Training.

## Cách sử dụng

Cài đặt các gói phụ thuộc trước khi chạy:
```bash
npm install
```

### 1. Thu thập dữ liệu (Crawl)
Chạy lệnh sau và làm theo hướng dẫn trên màn hình (chọn nguồn cào: codienhaiau hoặc haiphongtech):
```bash
npm run crawl
```
Dữ liệu sẽ tự động lưu dưới dạng JSON vào thư mục `data/product/`.

### 2. Chuẩn bị và Đẩy dữ liệu vào hệ thống (Import)
Trước khi import dữ liệu mới, nếu bạn muốn làm sạch toàn bộ CSDL hiện tại, hãy chạy script:
```powershell
.\run_clean_data.ps1
```

Sau đó, chạy lệnh sau để hệ thống tự động:
1. Khởi tạo tài khoản Staff mặc định và Khách hàng mẫu.
2. Quét file trong `data/product` để import sản phẩm.
3. Quét file trong `data/price` để import bảng giá.

```bash
npm run import
```
*Lưu ý: Bạn phải đảm bảo API Gateway (`http://localhost:5053`) đang chạy.*

### 3. Mô phỏng hành vi (Simulate)
Sinh dữ liệu học máy bằng cách chạy tự động quy trình báo giá và chốt đơn giữa Admin, Manager, và Sale Staff:
```bash
npm run simulate
```

### 4. Khởi tạo tài khoản (Seed Staff)
Tạo sẵn các tài khoản mặc định (manager và 3 sale staffs) với mật khẩu `123456` để phục vụ chạy mô phỏng:
```bash
npm run seed-staff
```
