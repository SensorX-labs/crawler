-- Lưu ý: Bạn cần chạy lệnh này trên TỪNG database của các service:
-- 1. SensorX_Data
-- 2. SensorX_Master
-- 3. SensorX_Warehouse

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    -- Lặp qua tất cả các bảng trong schema public và read, TRỪ bảng lịch sử migration
    FOR r IN (
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname IN ('public', 'read') 
          AND tablename != '__EFMigrationsHistory'
    ) LOOP
        -- Dùng TRUNCATE thay vì DROP để giữ lại cấu trúc bảng
        EXECUTE 'TRUNCATE TABLE "' || r.schemaname || '"."' || r.tablename || '" CASCADE;';
    END LOOP;
END $$;
