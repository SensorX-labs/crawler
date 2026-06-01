-- Lưu ý: Bạn cần chạy lệnh này trên TỪNG database của các service:
-- 1. SensorX_Data
-- 2. SensorX_Master
-- 3. SensorX_Warehouse

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '__EFMigrationsHistory') LOOP
        EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" RESTART IDENTITY CASCADE;';
    END LOOP;
END $$;
