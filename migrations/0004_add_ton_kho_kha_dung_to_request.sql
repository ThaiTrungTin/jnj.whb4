-- Migration 0004: Thêm cột ton_kho và kha_dung vào bảng request
-- Chạy đoạn này trong SQL Editor của Supabase:

ALTER TABLE public.request ADD COLUMN IF NOT EXISTS ton_kho numeric DEFAULT 0;
ALTER TABLE public.request ADD COLUMN IF NOT EXISTS kha_dung numeric DEFAULT 0;

-- Cập nhật ghi chú
COMMENT ON COLUMN public.request.ton_kho IS 'Tồn kho tại thời điểm đề xuất';
COMMENT ON COLUMN public.request.kha_dung IS 'Khả dụng tại thời điểm đề xuất (luỹ kế theo dòng)';
