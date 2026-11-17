ALTER TABLE public.request ADD COLUMN IF NOT EXISTS ton_kho numeric DEFAULT 0;
ALTER TABLE public.request ADD COLUMN IF NOT EXISTS kha_dung numeric DEFAULT 0;

COMMENT ON COLUMN public.request.ton_kho IS 'Tồn kho tại thời điểm đề xuất';
COMMENT ON COLUMN public.request.kha_dung IS 'Khả dụng tại thời điểm đề xuất (luỹ kế theo dòng)';
