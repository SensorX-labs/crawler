$databases = @(
    "SensorX_Data", 
    "SensorX_Master", 
    "SensorX_Warehouse_1", 
    "SensorX_Warehouse_2",
    "sensorx_gateway"
)

$sqlFile = "$PSScriptRoot\clean_all_data.sql"
$containerName = "sensorx_postgres"

Write-Host "Starting data cleanup process..." -ForegroundColor Cyan

# Kiểm tra xem có đang chạy DB bằng Docker không
$dockerRunning = docker ps -q -f name=$containerName
if ($dockerRunning) {
    Write-Host "Tìm thấy Docker container '$containerName'. Bắt đầu xóa dữ liệu..." -ForegroundColor Cyan
    docker cp $sqlFile "$($containerName):/tmp/$sqlFile"
    
    foreach ($db in $databases) {
        Write-Host "Đang xóa dữ liệu Database: $db ..." -ForegroundColor Yellow
        # Chạy file SQL trong container. Bỏ qua thông báo lỗi nếu database không tồn tại (vd Warehouse_2 chưa tạo)
        docker exec $containerName psql -U postgres -d $db -f "/tmp/$sqlFile" 2>$null
        Write-Host "Hoàn tất xóa $db" -ForegroundColor Green
    }
} else {
    Write-Host "Không tìm thấy Docker container '$containerName'. Thử dùng psql cục bộ..." -ForegroundColor Yellow
    $env:PGPASSWORD = "sk1234"
    foreach ($db in $databases) {
        Write-Host "Đang xóa dữ liệu Database: $db ..." -ForegroundColor Yellow
        psql -h localhost -U postgres -d $db -f $sqlFile 2>$null
        Write-Host "Hoàn tất xóa $db" -ForegroundColor Green
    }
}

Write-Host "Tất cả dữ liệu đã được dọn dẹp!" -ForegroundColor Cyan
