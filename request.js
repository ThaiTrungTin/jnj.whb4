import { sb, currentUser, showLoading, showToast, showConfirm, debounce } from './app.js';
import { buildColumnSettingsModalHtml, renderColumnConfigList, bindColumnSettingsModal } from './col-settings-ui.js';

/* =====================================================================
 * VIEW REQUEST (Quản lý Yêu Cầu Vật Tư)
 * - Bảng danh sách request hỗ trợ 2 chế độ:
 *   + Xem Nhánh (Tree): Hàng tổng hợp đơn request phía trên (Thời Gian,
 *     PSR, Tổng SL, Ngày SD, Hội Nghị, Ghi Chú, Trạng thái đơn, Nút Sửa/Xóa/Xem),
 *     bấm mở rộng để xem chi tiết các sản phẩm bên trong.
 *   + Xem Thường (Flat): Hiển thị phẳng từng dòng sản phẩm.
 * - Tự động nhận diện "Done" (Đã xử lý):
 *   Khi bảng chi_tiet có phiếu xuất của mã đó (cộng dồn tất cả các LOT)
 *   từ ngày request trở đi và người yêu cầu khớp PSR -> Request coi như Done.
 *   Khi đã Done, request KHÔNG bị trừ vào Khả dụng nữa (vì tồn kho đã trừ rồi).
 * - Cột Trạng Thái tự động:
 *   + "Done" (xanh lá): Đã được xuất kho xử lý.
 *   + "True" (xanh dương): Đang đề xuất, SL <= Khả dụng.
 *   + "False" (đỏ): Đang đề xuất, SL > Khả dụng (vẫn cho lưu bình thường).
 * - Phân quyền:
 *   Chỉ người tạo (hoặc Admin) mới được phép Sửa & Xóa đơn của mình.
 *   Người khác chỉ có nút con mắt (👁) để xem chi tiết.
 * ===================================================================== */

const TABLE = 'request';

const RQ_COLUMNS = [
    { key: 'stt', title: 'STT', width: 50, canHide: false, align: 'center' },
    { key: 'thoi_gian', title: 'Thời Gian', width: 100, sortable: true, filterable: true, align: 'center', type: 'date' },
    { key: 'psr', title: 'PSR', width: 140, sortable: true, filterable: true, align: 'left' },
    { key: 'ma_vt', title: 'Code', width: 140, sortable: true, filterable: true, align: 'left' },
    { key: 'ten_vt', title: 'Code Name', width: 260, sortable: true, filterable: true, align: 'left' },
    { key: 'so_luong', title: 'Số Lượng', width: 90, sortable: true, filterable: true, align: 'right', type: 'number' },
    { key: 'ton_kho', title: 'Tồn Kho', width: 85, sortable: true, filterable: true, align: 'right', type: 'number' },
    { key: 'kha_dung', title: 'Khả Dụng', width: 90, sortable: true, filterable: true, align: 'right', type: 'number' },
    { key: 'ngay_su_dung', title: 'Ngày Sử Dụng', width: 115, sortable: true, filterable: true, align: 'center', type: 'date' },
    { key: 'hoi_nghi', title: 'Hội Nghị', width: 200, sortable: true, filterable: true, align: 'left' },
    { key: 'ghi_chu', title: 'Ghi Chú', width: 180, sortable: true, filterable: true, align: 'left' },
    { key: 'trang_thai', title: 'Trạng Thái', width: 110, sortable: true, filterable: true, align: 'center' },
    { key: 'nguoi_tao', title: 'Người Tạo', width: 130, sortable: true, filterable: true, align: 'left', defaultVisible: false },
    { key: 'actions', title: 'Thao Tác', width: 85, canHide: false, align: 'center' },
];

const LS_KEY = 'requestColumnConfig_v3';
const EMPTY_LABEL = '(Trống)';

let rawRows = [];
let filteredRows = [];
let isResizing = false;
let tableMissing = false;

// Chế độ xem: 'tree' (mặc định dạng nhánh) hoặc 'flat'
let displayMode = localStorage.getItem('rq_display_mode') || 'tree';
let expandedNhomIds = new Set();

// Dữ liệu tham chiếu & Cache
let spList = [];                 // [{ ma_vt, ten_vt, key, norm }]
let spMap = new Map();           // KEY(ma_vt) -> sp
let stockMap = new Map();        // KEY(ma_vt) -> tồn cuối
let scanMap = new Map();         // KEY(ma_vt) -> SL đang quét (phiếu xuất chưa hoàn thành)
let allExports = [];             // Chi tiết các phiếu xuất kho (xuat > 0)
let allDbRequestRows = [];       // Tất cả dòng request từ DB
let requestStatusMap = new Map();// (id hoặc nhom_id_stt) -> { isDone, fulfilledQty, remainingQty, status }
let requestMap = new Map();      // KEY(ma_vt) -> tổng SL request CHƯA DONE cần trừ vào Khả dụng
let psrOptions = [];
let psrLoaded = false;

const rqState = {
    searchTerm: '',
    filters: {},
    sortCol: 'thoi_gian',
    sortDir: 'desc',
    currentPage: 1,
    itemsPerPage: 50,
};

/* ---------------------------- Tiện ích ---------------------------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const keyOf = (code) => String(code ?? '').trim().toUpperCase();
const pad2 = (n) => String(n).padStart(2, '0');
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const fmtNum = (n) => (Number(n) || 0).toLocaleString('vi-VN');

function removeVietnameseTones(str) {
    if (!str) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, m => (m === 'đ' ? 'd' : 'D'))
        .toLowerCase()
        .trim();
}

function normalizeText(str) {
    return removeVietnameseTones(str);
}

function isNameMatching(a, b) {
    if (!a || !b) return false;
    const na = removeVietnameseTones(a);
    const nb = removeVietnameseTones(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const wordsA = na.split(/\s+/).filter(Boolean);
    const wordsB = nb.split(/\s+/).filter(Boolean);
    if (wordsA.includes(nb) || wordsB.includes(na)) return true;
    if (na.includes(nb) || nb.includes(na)) return true;
    return false;
}

function getCurrentAppUser() {
    if (currentUser) return currentUser;
    try {
        const saved = sessionStorage.getItem('loggedInUser');
        if (saved) return JSON.parse(saved);
    } catch (e) { }
    return null;
}

function canUserEditRequest(item) {
    const user = currentUser || getCurrentAppUser();
    if (!user) return false;
    if (user.phan_quyen === 'Admin') return true;
    if (user.phan_quyen === 'View') return false;

    const creator = item?.nguoi_tao;
    const psr = item?.psr;
    const myName = user.ho_ten || '';
    const myGmail = user.gmail || '';

    if (creator && (isNameMatching(creator, myName) || isNameMatching(creator, myGmail))) return true;
    if (!creator && psr && (isNameMatching(psr, myName) || isNameMatching(psr, myGmail))) return true;
    return false;
}

function canCreate() {
    const user = currentUser || getCurrentAppUser();
    return !!user && user.phan_quyen !== 'View';
}

function fmtDate(v) {
    if (!v) return '';
    const s = String(v).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function parseQty(raw) {
    let s = String(raw ?? '').trim().replace(/\s/g, '');
    if (!s) return '';
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
    else s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

function isNumericText(raw) {
    const n = parseQty(raw);
    return n !== '' && !Number.isNaN(n);
}

async function fetchAll(buildQuery) {
    const size = 1000;
    let from = 0;
    const out = [];
    while (true) {
        const { data, error } = await buildQuery().range(from, from + size - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < size) break;
        from += size;
    }
    return out;
}

function isMissingTableError(err) {
    const msg = String(err?.message || '');
    return err?.code === '42P01' || err?.code === 'PGRST205' || /relation .*request.* does not exist|Could not find the table/i.test(msg);
}

/* ---------------------- Cấu hình cột (LocalStorage) ---------------------- */
function getColConfig() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { }
    const order = Array.isArray(saved?.order) ? saved.order : [];
    const hidden = Array.isArray(saved?.hidden) ? saved.hidden : RQ_COLUMNS.filter(c => c.defaultVisible === false).map(c => c.key);
    const widths = saved?.widths || {};
    const map = new Map(RQ_COLUMNS.map(c => [c.key, c]));
    const ordered = [];
    order.forEach(k => { if (map.has(k)) { ordered.push(map.get(k)); map.delete(k); } });
    map.forEach(c => ordered.push(c));
    return ordered.map(c => ({
        ...c,
        visible: c.canHide === false ? true : !hidden.includes(c.key),
        width: Number(widths[c.key]) || c.width,
    }));
}

function saveColConfig(cols) {
    const cfg = {
        order: cols.map(c => c.key),
        hidden: cols.filter(c => !c.visible && c.canHide !== false).map(c => c.key),
        widths: Object.fromEntries(cols.map(c => [c.key, c.width])),
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) { }
}

/* ------------------------------ CSS ------------------------------ */
const STYLE = `
#view-request .rq-table-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; position: relative; }
#rq-main-table { table-layout: fixed; border-collapse: collapse; min-width: 100%; }
#rq-main-table thead th { position: sticky; top: 0; z-index: 20; background: #e5e7eb; box-shadow: inset 0 -1px 0 #cbd5e1; user-select: none; }
#rq-main-table thead th.rq-sortable:hover { background: #d1d5db; }
#rq-main-table th, #rq-main-table td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box; }
#rq-main-table th.rq-filler, #rq-main-table td.rq-filler { border: none !important; padding: 0 !important; width: auto; }
#rq-main-table th.rq-filler { border-bottom: 1px solid #cbd5e1 !important; }
#rq-main-table td.rq-filler { border-bottom: 1px solid #e5e7eb !important; background: transparent !important; }
#rq-main-table tbody tr.rq-parent-row { background: #f8fafc; font-weight: 500; border-top: 1.5px solid #cbd5e1; border-bottom: 1.5px solid #cbd5e1; }
#rq-main-table tbody tr.rq-parent-row:hover td:not(.rq-filler) { background: #e2e8f0 !important; }
#rq-main-table tbody tr.rq-parent-row.is-expanded { background: #eff6ff !important; box-shadow: inset 3px 0 0 #2563eb; }
#rq-main-table tbody tr.rq-parent-row.is-expanded:hover td:not(.rq-filler) { background: #dbeafe !important; }
#rq-main-table tbody tr.rq-child-row { background: #ffffff; }
#rq-main-table tbody tr.rq-child-row:hover td:not(.rq-filler) { background: #f1f5f9 !important; }
#rq-main-table tbody tr.rq-child-row td { border-top: 1px dashed #e2e8f0 !important; border-bottom: 1px dashed #e2e8f0 !important; }

/* Cột thao tác cố định bên phải khi cuộn ngang */
#rq-main-table thead th.rq-th-actions { position: sticky; right: 0; top: 0; z-index: 25; background: #e5e7eb; box-shadow: -3px 0 6px -2px rgba(0,0,0,0.12); }
#rq-main-table td.rq-td-actions { position: sticky; right: 0; z-index: 15; box-shadow: -3px 0 6px -2px rgba(0,0,0,0.12); }
#rq-main-table tbody tr.rq-parent-row td.rq-td-actions { background: #f8fafc; }
#rq-main-table tbody tr.rq-parent-row:hover td.rq-td-actions { background: #e2e8f0 !important; }
#rq-main-table tbody tr.rq-parent-row.is-expanded td.rq-td-actions { background: #eff6ff !important; }
#rq-main-table tbody tr.rq-parent-row.is-expanded:hover td.rq-td-actions { background: #dbeafe !important; }
#rq-main-table tbody tr.rq-child-row td.rq-td-actions { background: #ffffff; }
#rq-main-table tbody tr.rq-child-row:hover td.rq-td-actions { background: #f1f5f9 !important; }

.rq-th-content { display: flex; align-items: center; justify-content: center; gap: 2px; width: 100%; min-width: 0; overflow: hidden; min-height: 20px; }
.rq-th-title { display: inline-flex; align-items: center; gap: 2px; min-width: 0; overflow: hidden; }
.rq-th-title span.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#view-request .col-resizer { position: absolute; top: 0; right: 0; width: 7px; bottom: 0; cursor: col-resize; z-index: 40; }
#view-request .col-resizer:hover, #view-request .col-resizer.resizing { background: #3b82f6; width: 4px; }
.rq-btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 6.5px 12px; border-radius: 9px; font-size: 12px; font-weight: 700; background: #2563eb; color: #fff; border: 1px solid #2563eb; box-shadow: 0 1px 2px rgba(0,0,0,.06); white-space: nowrap; transition: all .2s; }
.rq-btn-primary:hover { background: #1d4ed8; transform: translateY(-1.5px); box-shadow: 0 4px 14px rgba(37,99,235,.35); }

/* Badges trạng thái (không tô màu nền, không viền) */
.rq-badge-done { display: inline-block; font-size: 11.5px; font-weight: 600; color: #16a34a; line-height: 1.2; background: transparent !important; border: none !important; padding: 0 !important; }
.rq-badge-true { display: inline-block; font-size: 11.5px; font-weight: 600; color: #2563eb; line-height: 1.2; background: transparent !important; border: none !important; padding: 0 !important; }
.rq-badge-false { display: inline-block; font-size: 11.5px; font-weight: 600; color: #dc2626; line-height: 1.2; background: transparent !important; border: none !important; padding: 0 !important; }
.rq-badge-partial { display: inline-block; font-size: 11.5px; font-weight: 600; color: #d97706; line-height: 1.2; background: transparent !important; border: none !important; padding: 0 !important; }

/* ---- Modal grid ---- */
#rq-grid { table-layout: fixed; border-collapse: collapse; width: 100%; }
#rq-grid thead th { position: sticky; top: 0; z-index: 5; background: #e5e7eb; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #374151; border: 1px solid #cbd5e1; padding: 5px 4px; }
#rq-grid td { border: 1px solid #d1d5db; padding: 0; height: 28px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#rq-grid td.rq-ro { padding: 0 6px; background: #f9fafb; color: #374151; }
#rq-grid td.rq-stock { padding: 0 6px; text-align: right; font-weight: 600; color: #16a34a; background: transparent; }
#rq-grid td.rq-avail { padding: 0 6px; text-align: right; font-weight: 600; color: #d97706; background: transparent; }
#rq-grid td.rq-status { text-align: center; }
#rq-grid input.rq-cell { width: 100%; height: 100%; border: none; outline: none; padding: 0 6px; font-size: 12px; background: transparent; font-weight: 500; }
#rq-grid input.rq-cell[data-col="qty"] { text-align: right; }
#rq-grid td:focus-within { box-shadow: inset 0 0 0 2px #2563eb; background: #fff; }
#rq-grid tr.rq-invalid td.rq-code-td { background: #fef2f2; }
#rq-grid tr.rq-invalid td.rq-code-td input { color: #dc2626; font-weight: 500; }
#rq-grid td.rq-stt { text-align: center; color: #6b7280; background: #f3f4f6; font-size: 11px; font-weight: 500; }

#rq-code-suggest { position: fixed; z-index: 10050; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 10px 25px -5px rgba(0,0,0,.25); max-height: 300px; overflow-y: auto; min-width: 440px; }
#rq-code-suggest .rq-sg-item { padding: 5px 10px; cursor: pointer; display: flex; gap: 8px; align-items: center; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
#rq-code-suggest .rq-sg-item.active, #rq-code-suggest .rq-sg-item:hover { background: #eff6ff; }
.rq-psr-list { position: absolute; left: 0; right: 0; top: 100%; margin-top: 2px; z-index: 60; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 10px 20px -5px rgba(0,0,0,.2); max-height: 220px; overflow-y: auto; }
.rq-psr-item { padding: 6px 10px; font-size: 12px; cursor: pointer; }
.rq-psr-item.active, .rq-psr-item:hover { background: #eff6ff; color: #1d4ed8; }
.rq-filter-pop { position: fixed; z-index: 10000; width: 260px; background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; box-shadow: 0 10px 25px -5px rgba(0,0,0,.25); display: flex; flex-direction: column; overflow: hidden; }
`;

/* ------------------------------ HTML ------------------------------ */
const ICON_FUNNEL = `<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>`;
const ICON_SORT = `<svg class="w-2.5 h-2.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg>`;
const ICON_SORT_ASC = `<svg class="w-2.5 h-2.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path class="text-blue-600" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4"></path><path class="text-gray-300" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg>`;
const ICON_SORT_DESC = `<svg class="w-2.5 h-2.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path class="text-gray-300" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4"></path><path class="text-blue-600" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg>`;

const VIEW_HTML = `
<style id="rq-style">${STYLE}</style>
<div class="flex flex-col h-full overflow-hidden">
    <div class="flex-shrink-0 bg-white p-2 md:p-2.5 rounded-xl shadow-sm border border-gray-100 mb-2">
        <div class="flex flex-wrap gap-2 items-center justify-between">
            <div class="flex gap-2 items-center flex-grow md:flex-grow-0">
                <div class="vattu-search-wrap relative flex-grow md:flex-grow-0" style="min-width:180px">
                    <svg class="search-icon absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" x2="16.65" y1="21" y2="16.65"></line></svg>
                    <input type="text" id="rq-search" placeholder="Tìm PSR, Code, tên, hội nghị..." class="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500">
                </div>

                <!-- Điều khiển chế độ xem: Nhánh vs Xem Thường giống Tồn Kho -->
                <div class="tk-segmented-control ml-1" id="rq-display-mode-control">
                    <button type="button" id="rq-mode-tree" class="tk-segment-btn ${displayMode === 'tree' ? 'bg-white shadow-sm font-semibold text-blue-600' : 'text-gray-500'}" title="Chế độ xem gom nhóm dạng nhánh đổ xuống">
                        <svg class="w-3.5 h-3.5 inline-block text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M8 14h12M8 18h12"></path></svg>
                        <span>Nhánh</span>
                    </button>
                    <button type="button" id="rq-btn-toggle-all-branches" class="tk-branch-toggle-btn" title="Mở rộng / Thu gọn tất cả nhánh">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="7 11 12 6 17 11"></polyline>
                            <polyline points="7 18 12 13 17 18"></polyline>
                        </svg>
                    </button>
                    <button type="button" id="rq-mode-flat" class="tk-segment-btn ${displayMode === 'flat' ? 'bg-white shadow-sm font-semibold text-blue-600' : 'text-gray-500'}" title="Chế độ xem bảng thường (không có nhánh)">
                        <svg class="w-3.5 h-3.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                        <span>Xem Thường</span>
                    </button>
                </div>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
                <button type="button" id="rq-btn-add" class="rq-btn-primary" title="Thêm request mới">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span>Thêm Request</span>
                </button>
                <button type="button" id="rq-reset-filters" class="btn-toolbar-secondary btn-clear-filter" title="Xóa toàn bộ bộ lọc & tìm kiếm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path><line x1="18" y1="6" x2="6" y2="18" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"></line></svg>
                    <span class="hidden md:inline">Xóa Lọc</span>
                </button>
                <button type="button" id="rq-btn-settings" class="btn-toolbar-outline" title="Tùy chỉnh ẩn/hiển & thứ tự các cột">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"></path></svg>
                    <span class="hidden md:inline">Cài Đặt Cột</span>
                </button>
                <button type="button" id="rq-btn-excel" class="btn-toolbar-excel btn-excel-export" title="Xuất file Excel (.xlsx)">
                    <svg class="excel-btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-5.5-7.5l2.4 3.6h-1.6l-1.7-2.7-1.7 2.7H8.8l2.4-3.6-2.3-3.4h1.6l1.6 2.5 1.6-2.5h1.6l-2.3 3.4z" /></svg>
                    <span class="hidden md:inline">Xuất Excel</span>
                </button>
            </div>
        </div>
    </div>

    <div class="flex-1 min-h-0 bg-white rounded-lg shadow-md overflow-hidden relative flex flex-col">
        <div class="rq-table-wrap">
            <table id="rq-main-table">
                <thead id="rq-table-head"></thead>
                <tbody id="rq-table-body"><tr><td class="p-8 text-center text-gray-500 text-xs">Đang tải dữ liệu...</td></tr></tbody>
            </table>
        </div>
    </div>

    <div class="flex-shrink-0 flex flex-row justify-between items-center mt-0.5 p-1 md:p-1.5 bg-white rounded-lg shadow-md flex-nowrap overflow-hidden pagination-bar">
        <span id="rq-pagination-info" class="text-[8px] md:text-xs text-gray-600 mr-1 whitespace-nowrap flex-shrink-0"></span>
        <div id="rq-summary-info" class="flex-grow flex justify-end md:justify-center overflow-hidden px-1"></div>
        <div class="flex items-center gap-0.5 flex-nowrap flex-shrink-0">
            <select id="rq-items-per-page" class="hidden md:block px-2 py-0.5 border rounded-md bg-white text-xs">
                <option value="25">25</option><option value="50" selected>50</option><option value="100">100</option><option value="200">200</option><option value="500">500</option>
            </select>
            <button id="rq-prev-page" class="px-1.5 py-0.5 border rounded-md bg-white text-xs disabled:opacity-40 disabled:cursor-not-allowed"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
            <div class="flex items-center gap-0.5 mx-0.5">
                <input type="number" id="rq-page-input" min="1" value="1" class="w-6 md:w-12 text-center border rounded-md p-0.5 text-xs">
                <span id="rq-total-pages" class="text-xs text-gray-700 whitespace-nowrap">/ 1</span>
            </div>
            <button id="rq-next-page" class="px-1.5 py-0.5 border rounded-md bg-white text-xs disabled:opacity-40 disabled:cursor-not-allowed"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg></button>
        </div>
    </div>
</div>
${buildColumnSettingsModalHtml('rq', 'Cài đặt & Sắp xếp thứ tự cột Request')}

<!-- ============ MODAL THÊM / SỬA REQUEST ============ -->
<div id="rq-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-1 md:p-4">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[96vh] md:h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        <div class="px-4 py-2.5 border-b bg-gray-50 flex justify-between items-center flex-shrink-0">
            <h3 id="rq-modal-title" class="text-sm md:text-base font-bold text-gray-800">Thêm Request</h3>
            <button type="button" id="rq-modal-close" class="text-gray-400 hover:text-gray-700 text-2xl font-bold leading-none p-1">&times;</button>
        </div>

        <div class="flex-1 min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
            <!-- Thông tin chung -->
            <div class="grid grid-cols-2 md:grid-cols-12 gap-2 md:gap-3 flex-shrink-0">
                <div class="md:col-span-2">
                    <label class="block text-[11px] font-semibold text-gray-600 mb-0.5">Thời Gian</label>
                    <input type="date" id="rq-f-thoi-gian" class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                </div>
                <div class="md:col-span-3 relative" id="rq-psr-wrap">
                    <label class="block text-[11px] font-semibold text-gray-600 mb-0.5">PSR</label>
                    <div class="relative">
                        <input type="text" id="rq-f-psr" autocomplete="off" placeholder="Chọn hoặc nhập PSR mới..." class="w-full pl-2 pr-7 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <button type="button" id="rq-psr-toggle" tabindex="-1" class="absolute inset-y-0 right-0 px-2 text-gray-400 hover:text-gray-700">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </button>
                    </div>
                    <div id="rq-psr-list" class="rq-psr-list hidden"></div>
                </div>
                <div class="md:col-span-2">
                    <label class="block text-[11px] font-semibold text-gray-600 mb-0.5">Ngày Sử Dụng <span class="text-red-500">*</span></label>
                    <input type="date" id="rq-f-ngay-sd" class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                </div>
                <div class="col-span-2 md:col-span-5 hidden md:block"></div>
                <div class="col-span-2 md:col-span-6">
                    <label class="block text-[11px] font-semibold text-gray-600 mb-0.5">Hội Nghị</label>
                    <textarea id="rq-f-hoi-nghi" rows="2" class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"></textarea>
                </div>
                <div class="col-span-2 md:col-span-6">
                    <label class="block text-[11px] font-semibold text-gray-600 mb-0.5">Ghi Chú</label>
                    <textarea id="rq-f-ghi-chu" rows="2" class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"></textarea>
                </div>
            </div>

            <!-- Danh sách vật tư -->
            <div class="flex items-center justify-between flex-shrink-0">
                <div class="text-xs font-bold text-gray-700 uppercase">Danh sách vật tư
                    <span class="ml-2 normal-case font-normal text-[11px] text-gray-500 hidden md:inline">Dán (Ctrl+V) nhiều hàng/cột từ Excel vào ô Code hoặc Số lượng • Gõ Code để tìm gợi ý • Enter/↑/↓ để di chuyển</span>
                </div>
                <div class="flex items-center gap-1.5" id="rq-grid-tools">
                    <button type="button" id="rq-grid-clear" class="px-2 py-1 text-[11px] border border-gray-300 rounded-md text-gray-600 hover:bg-red-50 hover:text-red-600">Xóa trống</button>
                    <button type="button" id="rq-grid-add5" class="px-2 py-1 text-[11px] border border-blue-300 rounded-md text-blue-700 hover:bg-blue-50">+5 hàng</button>
                </div>
            </div>
            <div class="flex-1 min-h-0 overflow-auto border border-gray-300 rounded-md" id="rq-grid-wrap">
                <table id="rq-grid">
                    <colgroup>
                        <col style="width:44px"><col style="width:150px"><col><col style="width:95px"><col style="width:95px"><col style="width:95px"><col style="width:95px"><col style="width:34px">
                    </colgroup>
                    <thead>
                        <tr>
                            <th>STT</th><th>Code</th><th>Code Name</th><th>Số Lượng</th>
                            <th class="!text-green-700">Tồn Kho</th><th class="!text-yellow-700">Khả Dụng</th><th>Trạng Thái</th><th></th>
                        </tr>
                    </thead>
                    <tbody id="rq-grid-body"></tbody>
                </table>
                <button type="button" id="rq-grid-add" class="w-full py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 border-t border-dashed border-blue-300 flex items-center justify-center gap-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Thêm hàng
                </button>
            </div>
        </div>

        <div class="px-3 py-2 border-t bg-gray-50 flex flex-wrap justify-between items-center gap-2 flex-shrink-0">
            <div id="rq-grid-summary" class="text-[11px] md:text-xs text-gray-600 font-semibold"></div>
            <div class="flex items-center gap-2">
                <button type="button" id="rq-modal-cancel" class="px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-md font-medium">Đóng</button>
                <button type="button" id="rq-modal-save" class="px-5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-bold shadow-sm">Lưu Request</button>
            </div>
        </div>
    </div>
</div>
`;

/* ===================================================================
 * DỮ LIỆU THAM CHIẾU & ĐÁNH GIÁ TRẠNG THÁI "DONE"
 * =================================================================== */
async function loadSanPham() {
    const rows = await fetchAll(() => sb.from('san_pham').select('ma_vt, ten_vt').order('ma_vt', { ascending: true }));
    spMap = new Map();
    spList = [];
    rows.forEach(r => {
        const key = keyOf(r.ma_vt);
        if (!key || spMap.has(key)) return;
        const sp = { ma_vt: String(r.ma_vt).trim(), ten_vt: r.ten_vt || '', key, norm: normalizeText(`${r.ma_vt} ${r.ten_vt || ''}`) };
        spMap.set(key, sp);
        spList.push(sp);
    });
}

/**
 * Tự động kiểm tra request đã Done chưa:
 * Tra cứu trong chi_tiet: các dòng xuất (xuat > 0) có cùng mã VT,
 * ngày xuất >= ngày request, người yêu cầu khớp PSR.
 * Cộng dồn TẤT CẢ các LOT của mã đó.
 * Nếu tổng xuất >= số lượng request -> Đơn vị mã đó là "Done"!
 */
function evaluateRequestStatuses(requests, exportsList) {
    const exportMap = new Map();
    exportsList.forEach(e => {
        const k = keyOf(e.ma_vt);
        if (!k) return;
        if (!exportMap.has(k)) exportMap.set(k, []);
        exportMap.get(k).push({
            date: String(e.thoi_gian || '').slice(0, 10),
            xuat: Number(e.xuat) || 0,
            yeu_cau: String(e.yeu_cau || '').trim(),
            remaining: Number(e.xuat) || 0
        });
    });

    // Sắp xếp requests theo thời gian cũ nhất -> mới nhất (FIFO)
    const sortedRequests = [...requests].sort((a, b) => {
        const da = String(a.thoi_gian || '');
        const db = String(b.thoi_gian || '');
        if (da !== db) return da.localeCompare(db);
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

    const statusMap = new Map();

    sortedRequests.forEach(r => {
        const rKey = keyOf(r.ma_vt);
        const rDate = String(r.thoi_gian || '').slice(0, 10);
        const rQty = Number(r.so_luong) || 0;
        const availableExports = exportMap.get(rKey) || [];

        let fulfilled = 0;
        for (const exp of availableExports) {
            if (exp.remaining <= 0) continue;
            // Ngày xuất trong hôm nay hoặc trở về sau
            if (exp.date < rDate) continue;
            // Người yêu cầu khớp PSR hoặc người tạo
            if (!isNameMatching(exp.yeu_cau, r.psr) && !isNameMatching(exp.yeu_cau, r.nguoi_tao)) continue;

            const take = Math.min(exp.remaining, rQty - fulfilled);
            fulfilled += take;
            exp.remaining -= take;

            if (fulfilled >= rQty) break;
        }

        const isDone = (fulfilled >= rQty && rQty > 0);
        const remaining = Math.max(0, rQty - fulfilled);

        // Khả dụng cơ bản = Tồn kho (ton_cuoi đã bao gồm trừ các phiếu xuất trong chi_tiet)
        const ton = stockMap.get(rKey) || 0;
        const baseKd = ton;

        let statusText = 'True';
        if (isDone) {
            statusText = 'Done';
        } else if (r.kha_dung !== undefined && r.kha_dung !== null) {
            statusText = Number(r.kha_dung) < 0 ? 'False' : 'True';
        } else if (rQty > baseKd) {
            statusText = 'False';
        } else {
            statusText = 'True';
        }

        const itemKey = r.id ? String(r.id) : `${r.nhom_id}_${r.stt}`;
        statusMap.set(itemKey, {
            isDone,
            fulfilledQty: fulfilled,
            remainingQty: remaining,
            status: statusText
        });
    });

    return statusMap;
}

function updateRequestMap(excludeNhomId = null) {
    requestMap = new Map();
    allDbRequestRows.forEach(r => {
        if (excludeNhomId && r.nhom_id === excludeNhomId) return;
        const itemKey = r.id ? String(r.id) : `${r.nhom_id}_${r.stt}`;
        const st = requestStatusMap.get(itemKey);
        // NẾU ĐÃ DONE: KHÔNG trừ vào Khả dụng nữa vì tồn kho đã trừ rồi!
        if (st && st.isDone) return;
        const rem = st ? st.remainingQty : (Number(r.so_luong) || 0);
        const k = keyOf(r.ma_vt);
        if (k && rem > 0) {
            requestMap.set(k, (requestMap.get(k) || 0) + rem);
        }
    });
}

async function loadStockAndScanning() {
    try {
        const [stockRows, scanRows, reqRows, expRows] = await Promise.all([
            fetchAll(() => sb.from('ton_kho_update').select('ma_vt, ton_cuoi')),
            // Phiếu đang quét (đang xử lý) = ma_nx kết thúc bằng '-'
            fetchAll(() => sb.from('chi_tiet').select('ma_vt, xuat').like('ma_nx', '%-').gt('xuat', 0)),
            // Tất cả request trong DB
            fetchAll(() => sb.from(TABLE).select('*')).catch(err => {
                console.warn('Chưa lấy được bảng request:', err);
                return [];
            }),
            // Tất cả phiếu xuất kho từ chi_tiet để kiểm tra request đã Done chưa (gộp các lot)
            fetchAll(() => sb.from('chi_tiet').select('thoi_gian, ma_vt, lot, xuat, yeu_cau').gt('xuat', 0)).catch(err => {
                console.warn('Chưa lấy được chi_tiet phiếu xuất:', err);
                return [];
            })
        ]);

        stockMap = new Map();
        stockRows.forEach(r => {
            const k = keyOf(r.ma_vt);
            if (k) stockMap.set(k, (stockMap.get(k) || 0) + (Number(r.ton_cuoi) || 0));
        });

        scanMap = new Map();
        scanRows.forEach(r => {
            const k = keyOf(r.ma_vt);
            if (k) scanMap.set(k, (scanMap.get(k) || 0) + (Number(r.xuat) || 0));
        });

        allExports = expRows || [];
        allDbRequestRows = reqRows || [];

        // Đánh giá trạng thái Done / True / False cho từng mã
        requestStatusMap = evaluateRequestStatuses(allDbRequestRows, allExports);

        // Cập nhật số lượng request chưa Done để trừ vào khả dụng
        updateRequestMap(editingNhomId);
    } catch (e) {
        console.error('Lỗi loadStockAndScanning:', e);
    }
}

export async function refreshLiveRequestStock() {
    await loadStockAndScanning();
    refreshComputed();
}

async function loadPsrOptions(force = false) {
    if (psrLoaded && !force) return;
    const names = new Set();
    try {
        const [ctRows, userRes] = await Promise.all([
            fetchAll(() => sb.from('chi_tiet').select('yeu_cau').not('yeu_cau', 'is', null)),
            sb.from('user').select('ho_ten'),
        ]);
        ctRows.forEach(r => { const v = String(r.yeu_cau || '').trim(); if (v) names.add(v); });
        (userRes.data || []).forEach(u => { const v = String(u.ho_ten || '').trim(); if (v) names.add(v); });
    } catch (e) {
        console.error('Lỗi tải danh sách PSR:', e);
    }
    rawRows.forEach(r => { const v = String(r.psr || '').trim(); if (v) names.add(v); });
    psrOptions = [...names].sort((a, b) => a.localeCompare(b, 'vi'));
    psrLoaded = true;
}

/* ===================================================================
 * FETCH & RENDER BẢNG CHÍNH
 * =================================================================== */
export async function fetchRequest(page = rqState.currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        const [rows] = await Promise.all([
            fetchAll(() => sb.from(TABLE).select('*').order('thoi_gian', { ascending: false }).order('created_at', { ascending: false }).order('stt', { ascending: true })),
            spList.length ? Promise.resolve() : loadSanPham(),
            loadStockAndScanning(),
        ]);
        tableMissing = false;
        rawRows = rows;
        allDbRequestRows = rows;
        requestStatusMap = evaluateRequestStatuses(allDbRequestRows, allExports);
        updateRequestMap(editingNhomId);
        rqState.currentPage = page || 1;
        applyFiltersAndRender(true);
    } catch (err) {
        console.error('Lỗi tải Request:', err);
        const tbody = document.getElementById('rq-table-body');
        if (isMissingTableError(err)) {
            tableMissing = true;
            if (tbody) tbody.innerHTML = `<tr><td class="p-8 text-center text-amber-700 text-xs">Chưa có bảng <b>request</b> trên Supabase. Hãy chạy file <code>migrations/0003_create_request.sql</code> trong SQL Editor rồi tải lại trang.</td></tr>`;
        } else {
            showToast('Lỗi tải Request: ' + (err.message || err), 'error');
            if (tbody) tbody.innerHTML = `<tr><td class="p-8 text-center text-red-500 text-xs">Lỗi: ${esc(err.message || 'Không thể tải dữ liệu')}</td></tr>`;
        }
    } finally {
        if (showLoader) showLoading(false);
    }
}

function displayTenVt(row) {
    return spMap.get(keyOf(row.ma_vt))?.ten_vt || row.ten_vt || '';
}

function getItemStatusInfo(row) {
    const itemKey = row.id ? String(row.id) : `${row.nhom_id}_${row.stt}`;
    return requestStatusMap.get(itemKey) || { isDone: false, fulfilledQty: 0, remainingQty: Number(row.so_luong) || 0, status: 'True' };
}

function getDisplayValue(row, key) {
    switch (key) {
        case 'thoi_gian':
        case 'ngay_su_dung': return fmtDate(row[key]);
        case 'ten_vt': return displayTenVt(row);
        case 'so_luong': return fmtNum(row.so_luong);
        case 'ton_kho': return (row.ton_kho !== null && row.ton_kho !== undefined) ? fmtNum(row.ton_kho) : '';
        case 'kha_dung': return (row.kha_dung !== null && row.kha_dung !== undefined) ? fmtNum(row.kha_dung) : '';
        case 'trang_thai': return getItemStatusInfo(row).status;
        default: return String(row[key] ?? '').trim();
    }
}

function getSortValue(row, key) {
    if (key === 'so_luong') return Number(row.so_luong) || 0;
    if (key === 'ton_kho') return Number(row.ton_kho) || 0;
    if (key === 'kha_dung') return Number(row.kha_dung) || 0;
    if (key === 'thoi_gian' || key === 'ngay_su_dung') return String(row[key] || '');
    if (key === 'ten_vt') return displayTenVt(row).toLowerCase();
    if (key === 'trang_thai') return getItemStatusInfo(row).status;
    return String(row[key] ?? '').toLowerCase();
}

function rowPassesFilters(row, skipKey = null) {
    const term = normalizeText(rqState.searchTerm);
    if (term) {
        const hay = normalizeText([row.psr, row.ma_vt, displayTenVt(row), row.hoi_nghi, row.ghi_chu, row.nguoi_tao, fmtDate(row.thoi_gian), fmtDate(row.ngay_su_dung), getItemStatusInfo(row).status].join(' '));
        if (!hay.includes(term)) return false;
    }
    for (const [key, values] of Object.entries(rqState.filters)) {
        if (key === skipKey || !Array.isArray(values) || values.length === 0) continue;
        const v = getDisplayValue(row, key) || EMPTY_LABEL;
        if (!values.includes(v)) return false;
    }
    return true;
}

function renderStatusBadge(status) {
    switch (status) {
        case 'Done':
            return '<span class="rq-badge-done" title="Đã xuất kho xử lý thành công">Done</span>';
        case 'True':
            return '<span class="rq-badge-true" title="Đang đề xuất - Số lượng trong khả dụng">True</span>';
        case 'False':
            return '<span class="rq-badge-false" title="Đang đề xuất - Số lượng vượt quá khả dụng">False</span>';
        default:
            return `<span class="rq-badge-true">${esc(status)}</span>`;
    }
}

function getVisibleCols() {
    return getColConfig().filter(c => c.visible);
}

function renderTableHeader() {
    const thead = document.getElementById('rq-table-head');
    const table = document.getElementById('rq-main-table');
    if (!thead || !table) return;
    const cols = getVisibleCols();
    const totalW = cols.reduce((s, c) => s + c.width, 0);
    table.style.width = `${totalW}px`;

    const ths = cols.map(col => {
        const isSorted = rqState.sortCol === col.key;
        const sortIcon = isSorted ? (rqState.sortDir === 'asc' ? ICON_SORT_ASC : ICON_SORT_DESC) : ICON_SORT;
        const selected = rqState.filters[col.key] || [];
        const active = selected.length > 0;
        const filterBtn = col.filterable ? `
            <button type="button" class="col-filter-btn ${active ? 'filter-active' : ''}" data-col="${col.key}" title="Lọc ${esc(col.title)}">
                ${ICON_FUNNEL}${active ? `<span class="filter-badge">${selected.length}</span>` : ''}
            </button>` : '';
        const isActions = col.key === 'actions';
        const actionsClass = isActions ? 'rq-th-actions sticky right-0' : '';
        return `
            <th class="relative ${col.sortable ? 'rq-sortable cursor-pointer' : ''} ${actionsClass} px-1.5 py-1 text-center font-semibold text-gray-700 uppercase tracking-wider border border-gray-300 text-[11px]"
                data-col-key="${col.key}" ${col.sortable ? `data-sort="${col.key}"` : ''}
                style="width:${col.width}px;min-width:${col.width}px;max-width:${col.width}px;${isActions ? 'right:0;' : ''}">
                <div class="rq-th-content">
                    <div class="rq-th-title"><span class="truncate">${esc(col.title)}</span>${col.sortable ? `<span class="sort-icon ml-0.5 text-gray-400 flex-shrink-0">${sortIcon}</span>` : ''}</div>
                    ${filterBtn}
                </div>
                <div class="col-resizer" data-col-key="${col.key}" title="Kéo để chỉnh độ rộng. Nhấp đúp để về mặc định"></div>
            </th>`;
    }).join('');
    thead.innerHTML = `<tr>${ths}</tr>`;

    thead.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', (e) => {
            if (isResizing || e.target.closest('.col-resizer') || e.target.closest('.col-filter-btn')) return;
            const k = th.dataset.sort;
            if (rqState.sortCol === k) rqState.sortDir = rqState.sortDir === 'asc' ? 'desc' : 'asc';
            else { rqState.sortCol = k; rqState.sortDir = (k === 'thoi_gian' || k === 'ngay_su_dung' || k === 'so_luong') ? 'desc' : 'asc'; }
            applyFiltersAndRender(true);
        });
    });
    thead.querySelectorAll('.col-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openColumnFilter(btn, btn.dataset.col); });
    });
    initColumnResizers(thead);
}

function initColumnResizers(thead) {
    const table = document.getElementById('rq-main-table');
    thead.querySelectorAll('.col-resizer').forEach(resizer => {
        const colKey = resizer.dataset.colKey;
        const th = resizer.closest('th');

        resizer.ondblclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const cols = getColConfig();
            const c = cols.find(x => x.key === colKey);
            const def = RQ_COLUMNS.find(x => x.key === colKey);
            if (!c || !def) return;
            c.width = def.width;
            saveColConfig(cols);
            renderTableHeader();
        };

        resizer.onmousedown = (e) => {
            e.preventDefault(); e.stopPropagation();
            isResizing = true;
            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            const startX = e.pageX;
            const startW = th.getBoundingClientRect().width;
            const startTableW = table.getBoundingClientRect().width;
            let finalW = startW;

            const onMove = (ev) => {
                finalW = Math.max(35, Math.round(startW + ev.pageX - startX));
                th.style.width = th.style.minWidth = th.style.maxWidth = `${finalW}px`;
                table.style.width = `${Math.round(startTableW + finalW - startW)}px`;
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                resizer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                setTimeout(() => { isResizing = false; }, 50);
                const cols = getColConfig();
                const c = cols.find(x => x.key === colKey);
                if (c) { c.width = finalW; saveColConfig(cols); }
                renderTableHeader();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    });
}

/* ---------------------- Chế độ xem: Nhánh & Xem Thường ---------------------- */
export function setRequestDisplayMode(mode) {
    displayMode = (mode === 'flat') ? 'flat' : 'tree';
    try { localStorage.setItem('rq_display_mode', displayMode); } catch (e) { }
    updateDisplayModeUI();
    applyFiltersAndRender(false);
}

function updateDisplayModeUI() {
    const btnTree = document.getElementById('rq-mode-tree');
    const btnFlat = document.getElementById('rq-mode-flat');
    const btnToggleAll = document.getElementById('rq-btn-toggle-all-branches');

    if (btnTree && btnFlat) {
        if (displayMode === 'tree') {
            btnTree.className = 'tk-segment-btn bg-white shadow-sm font-semibold text-blue-600';
            btnFlat.className = 'tk-segment-btn text-gray-500';
            if (btnToggleAll) btnToggleAll.style.display = 'inline-flex';
        } else {
            btnTree.className = 'tk-segment-btn text-gray-500';
            btnFlat.className = 'tk-segment-btn bg-white shadow-sm font-semibold text-blue-600';
            if (btnToggleAll) btnToggleAll.style.display = 'none';
        }
    }
}

export function toggleRequestGroup(nhomId) {
    if (!nhomId) return;
    if (expandedNhomIds.has(nhomId)) {
        expandedNhomIds.delete(nhomId);
    } else {
        expandedNhomIds.add(nhomId);
    }
    applyFiltersAndRender(false);
}

export function toggleAllRequestBranches() {
    const groupIds = [...new Set(filteredRows.map(r => r.nhom_id))];
    const isAllExpanded = groupIds.every(id => expandedNhomIds.has(id));
    if (isAllExpanded) {
        expandedNhomIds.clear();
    } else {
        groupIds.forEach(id => expandedNhomIds.add(id));
    }
    applyFiltersAndRender(false);
}

function applyFiltersAndRender(rebuildHeader = true) {
    if (rebuildHeader) renderTableHeader();
    updateDisplayModeUI();

    let result = rawRows.filter(r => rowPassesFilters(r));
    const col = rqState.sortCol;
    const dir = rqState.sortDir === 'asc' ? 1 : -1;
    result.sort((a, b) => {
        const va = getSortValue(a, col), vb = getSortValue(b, col);
        let cmp = 0;
        if (col === 'thoi_gian' || col === 'ngay_su_dung') {
            const da = va ? new Date(va).getTime() : 0;
            const db = vb ? new Date(vb).getTime() : 0;
            cmp = da - db;
        } else if (typeof va === 'number' && typeof vb === 'number') {
            cmp = va - vb;
        } else {
            cmp = String(va).localeCompare(String(vb), 'vi');
        }
        if (cmp !== 0) return cmp * dir;

        // Mặc định luôn ưu tiên thời gian mới hơn trước (hôm nay nằm trên hôm qua)
        const tga = a.thoi_gian ? new Date(a.thoi_gian).getTime() : 0;
        const tgb = b.thoi_gian ? new Date(b.thoi_gian).getTime() : 0;
        if (tga !== tgb) return tgb - tga;

        const ca = String(a.created_at || ''), cb = String(b.created_at || '');
        if (ca !== cb) return cb.localeCompare(ca);
        if (a.nhom_id !== b.nhom_id) return String(a.nhom_id).localeCompare(String(b.nhom_id));
        return (Number(a.stt) || 0) - (Number(b.stt) || 0);
    });
    filteredRows = result;

    if (displayMode === 'tree') {
        renderTreeTable();
    } else {
        renderFlatTable();
    }

    updateResetBtnState();
}

/**
 * Render dạng Nhánh (Tree View):
 * Hàng cha (Hàng tổng) chứa thông tin đơn + tổng SL + Trạng thái đơn + Nút Sửa/Xóa.
 * Hàng con hiển thị chi tiết từng sản phẩm.
 */
function renderTreeTable() {
    const tbody = document.getElementById('rq-table-body');
    if (!tbody) return;
    const cols = getVisibleCols();

    // Gom nhóm theo nhom_id
    const groupMap = new Map();
    const groups = [];
    filteredRows.forEach(row => {
        const key = row.nhom_id || row.id;
        if (!groupMap.has(key)) {
            const grp = {
                nhom_id: key,
                thoi_gian: row.thoi_gian,
                psr: row.psr,
                ngay_su_dung: row.ngay_su_dung,
                hoi_nghi: row.hoi_nghi,
                ghi_chu: row.ghi_chu,
                nguoi_tao: row.nguoi_tao,
                created_at: row.created_at,
                items: [],
                total_qty: 0,
            };
            groupMap.set(key, grp);
            groups.push(grp);
        }
        const grp = groupMap.get(key);
        grp.items.push(row);
        grp.total_qty += (Number(row.so_luong) || 0);
    });

    const totalGroups = groups.length;
    if (totalGroups === 0) {
        tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" class="p-8 text-center text-gray-500 text-xs">Không có request nào.</td></tr>`;
        renderPagination(0, 0, 0, 1, 0);
        return;
    }

    const perPage = rqState.itemsPerPage;
    const totalPages = Math.max(1, Math.ceil(totalGroups / perPage));
    rqState.currentPage = Math.min(Math.max(1, rqState.currentPage), totalPages);
    const start = (rqState.currentPage - 1) * perPage;
    const pageGroups = groups.slice(start, start + perPage);

    const htmlRows = [];
    pageGroups.forEach((group, gIdx) => {
        const isExpanded = expandedNhomIds.has(group.nhom_id);
        const canEditThis = canUserEditRequest(group);

        // Tính trạng thái chung của đơn
        let doneCount = 0;
        let hasFalse = false;
        group.items.forEach(it => {
            const st = getItemStatusInfo(it);
            if (st.isDone) doneCount++;
            else if (st.status === 'False') hasFalse = true;
        });

        const allDone = doneCount === group.items.length && group.items.length > 0;
        let groupStatusHtml = '';
        if (allDone) {
            groupStatusHtml = '<span class="rq-badge-done">Done</span>';
        } else if (doneCount > 0) {
            groupStatusHtml = `<span class="rq-badge-partial" title="${doneCount}/${group.items.length} mã đã xuất">Đang xử lý (${doneCount}/${group.items.length})</span>`;
        } else if (hasFalse) {
            groupStatusHtml = '<span class="rq-badge-false">Chờ xuất (Thiếu)</span>';
        } else {
            groupStatusHtml = '<span class="rq-badge-true">Chờ xuất</span>';
        }

        // HÀNG CHA (Hàng tổng của đơn request)
        const parentTds = cols.map(col => {
            const align = col.align === 'right' ? 'text-right' : (col.align === 'center' ? 'text-center' : 'text-left');
            const isActions = col.key === 'actions';
            const actionTdClass = isActions ? 'rq-td-actions sticky right-0' : '';
            let content = '';

            switch (col.key) {
                case 'stt':
                    content = `<span class="font-medium text-gray-500">${start + gIdx + 1}</span>`;
                    break;
                case 'thoi_gian':
                    content = `<span class="font-medium text-gray-700">${fmtDate(group.thoi_gian)}</span>`;
                    break;
                case 'psr':
                    content = `<span class="font-medium text-blue-700">${esc(group.psr || '')}</span>`;
                    break;
                case 'ma_vt':
                    content = `
                        <div class="flex items-center gap-1.5 w-full min-w-0 cursor-pointer" onclick="toggleRequestGroup('${esc(group.nhom_id)}')">
                            <button type="button" class="btn-subrow-toggle ${isExpanded ? 'active' : ''} p-0.5 text-blue-600 hover:bg-blue-100 rounded" title="${isExpanded ? 'Thu gọn' : 'Xem ' + group.items.length + ' sản phẩm'}">
                                <svg class="w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path></svg>
                            </button>
                            <span class="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 font-medium border border-blue-200 flex-shrink-0 cursor-pointer">${group.items.length} mã VT</span>
                        </div>`;
                    break;
                case 'ten_vt':
                    const summaryCodes = group.items.map(i => i.ma_vt).slice(0, 3).join(', ');
                    content = `<span class="text-gray-500 italic text-[11px] truncate" title="${esc(group.items.map(i => `${i.ma_vt}: ${displayTenVt(i)}`).join(' | '))}">${esc(summaryCodes)}${group.items.length > 3 ? '...' : ''}</span>`;
                    break;
                case 'so_luong':
                    content = `<span class="font-medium text-slate-800 text-[12px]" title="Tổng số lượng ${fmtNum(group.total_qty)}">${fmtNum(group.total_qty)}</span>`;
                    break;
                case 'ton_kho':
                case 'kha_dung':
                    content = `<span class="text-gray-300 select-none">-</span>`;
                    break;
                case 'ngay_su_dung':
                    content = `<span class="font-medium text-slate-700">${esc(fmtDate(group.ngay_su_dung))}</span>`;
                    break;
                case 'hoi_nghi':
                    content = `<span class="font-normal text-slate-700 truncate" title="${esc(group.hoi_nghi || '')}">${esc(group.hoi_nghi || '')}</span>`;
                    break;
                case 'ghi_chu':
                    content = `<span class="font-normal text-slate-600 truncate" title="${esc(group.ghi_chu || '')}">${esc(group.ghi_chu || '')}</span>`;
                    break;
                case 'trang_thai':
                    content = groupStatusHtml;
                    break;
                case 'nguoi_tao':
                    content = `<span class="text-gray-600 text-[11px]">${esc(group.nguoi_tao || '')}</span>`;
                    break;
                case 'actions':
                    // NÚT XUẤT EXCEL & SỬA & XÓA NẰM TRÊN HÀNG TỔNG
                    const excelBtn = `
                        <button type="button" class="rq-act-excel p-1 rounded text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors" data-nhom="${esc(group.nhom_id)}" title="Xuất Excel request này">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="8" y1="13" x2="16" y2="13"></line>
                                <line x1="8" y1="17" x2="16" y2="17"></line>
                                <line x1="10" y1="9" x2="8" y2="9"></line>
                            </svg>
                        </button>`;
                    content = canEditThis ? `
                        <div class="flex items-center justify-center gap-0.5">
                            ${excelBtn}
                            <button type="button" class="rq-act-edit p-1 rounded text-blue-600 hover:bg-blue-100" data-nhom="${esc(group.nhom_id)}" title="Chỉnh sửa đơn request">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            </button>
                            <button type="button" class="rq-act-del p-1 rounded text-red-500 hover:bg-red-100" data-nhom="${esc(group.nhom_id)}" title="Xóa đơn request">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>` : `
                        <div class="flex items-center justify-center gap-0.5">
                            ${excelBtn}
                            <button type="button" class="rq-act-edit p-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50" data-nhom="${esc(group.nhom_id)}" title="Xem chi tiết (Chỉ người tạo mới được sửa)">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            </button>
                        </div>`;
                    break;
                default:
                    content = esc(group[col.key] || '');
            }

            return `<td class="px-1.5 py-1 text-xs border border-gray-300 ${align} ${actionTdClass}" style="${isActions ? 'right:0;' : ''}">${content}</td>`;
        }).join('');

        htmlRows.push(`
            <tr class="rq-parent-row ${isExpanded ? 'is-expanded' : ''} cursor-pointer" data-nhom="${esc(group.nhom_id)}" onclick="if(!event.target.closest('button')) toggleRequestGroup('${esc(group.nhom_id)}')">
                ${parentTds}
            </tr>
        `);

        // HÀNG CON (Chi tiết từng mã trong đơn nếu đang mở rộng)
        if (isExpanded) {
            group.items.forEach((item, itemIdx) => {
                const isLast = itemIdx === group.items.length - 1;
                const branchTreeIcon = isLast ? '└─' : '├─';
                const stInfo = getItemStatusInfo(item);

                const childTds = cols.map(col => {
                    const align = col.align === 'right' ? 'text-right' : (col.align === 'center' ? 'text-center' : 'text-left');
                    const isActions = col.key === 'actions';
                    const actionTdClass = isActions ? 'rq-td-actions sticky right-0' : '';
                    let content = '';

                    switch (col.key) {
                        case 'stt':
                            content = `<span class="text-gray-400 font-mono text-[10px]">${itemIdx + 1}</span>`;
                            break;
                        case 'thoi_gian':
                        case 'psr':
                        case 'ngay_su_dung':
                        case 'hoi_nghi':
                        case 'ghi_chu':
                        case 'nguoi_tao':
                            content = `<span class="text-gray-300 select-none">-</span>`;
                            break;
                        case 'ma_vt':
                            content = `
                                <div class="flex items-center gap-1.5 pl-3">
                                    <span class="text-gray-400 font-mono text-xs select-none">${branchTreeIcon}</span>
                                    <span class="font-medium text-blue-600 truncate" title="${esc(item.ma_vt)}">${esc(item.ma_vt)}</span>
                                </div>`;
                            break;
                        case 'ten_vt':
                            content = `<span class="text-slate-700 font-normal truncate" title="${esc(displayTenVt(item))}">${esc(displayTenVt(item))}</span>`;
                            break;
                        case 'so_luong':
                            content = `<span class="font-medium text-slate-800">${fmtNum(item.so_luong)}</span>`;
                            break;
                        case 'ton_kho':
                            content = `<span class="text-emerald-600 font-medium">${item.ton_kho !== null && item.ton_kho !== undefined ? fmtNum(item.ton_kho) : '-'}</span>`;
                            break;
                        case 'kha_dung':
                            content = `<span class="font-medium ${Number(item.kha_dung) < 0 ? 'text-red-600' : 'text-amber-600'}">${item.kha_dung !== null && item.kha_dung !== undefined ? fmtNum(item.kha_dung) : '-'}</span>`;
                            break;
                        case 'trang_thai':
                            content = renderStatusBadge(stInfo.status);
                            break;
                        case 'actions':
                            content = `<span class="text-gray-300 select-none">-</span>`;
                            break;
                        default:
                            content = esc(getDisplayValue(item, col.key));
                    }

                    return `<td class="px-1.5 py-0.5 text-xs border border-gray-200 ${align} ${actionTdClass}" style="${isActions ? 'right:0;' : ''}">${content}</td>`;
                }).join('');

                htmlRows.push(`
                    <tr class="rq-child-row" data-nhom="${esc(group.nhom_id)}">
                        ${childTds}
                    </tr>
                `);
            });
        }
    });

    tbody.innerHTML = htmlRows.join('');
    renderPagination(totalGroups, start, start + pageGroups.length - 1, totalPages, filteredRows.length);
}

/**
 * Render dạng Xem Thường (Flat View - phẳng từng dòng)
 */
function renderFlatTable() {
    const tbody = document.getElementById('rq-table-body');
    if (!tbody) return;
    const cols = getVisibleCols();

    const total = filteredRows.length;
    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" class="p-8 text-center text-gray-500 text-xs">Không có request nào.</td></tr>`;
        renderPagination(0, 0, 0, 1, 0);
        return;
    }

    const perPage = rqState.itemsPerPage;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    rqState.currentPage = Math.min(Math.max(1, rqState.currentPage), totalPages);
    const start = (rqState.currentPage - 1) * perPage;
    const pageRows = filteredRows.slice(start, start + perPage);

    let prevGroup = null;
    let groupIdx = -1;
    tbody.innerHTML = pageRows.map((row, i) => {
        const isGroupStart = row.nhom_id !== prevGroup;
        if (isGroupStart) groupIdx++;
        prevGroup = row.nhom_id;
        const bg = groupIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50';
        const canEditThis = canUserEditRequest(row);
        const stInfo = getItemStatusInfo(row);

        const tds = cols.map(col => {
            const align = col.align === 'right' ? 'text-right' : (col.align === 'center' ? 'text-center' : 'text-left');
            const isActions = col.key === 'actions';
            const actionTdClass = isActions ? 'rq-td-actions sticky right-0' : '';
            let inner;
            switch (col.key) {
                case 'stt': inner = `<span class="text-gray-500 font-normal">${start + i + 1}</span>`; break;
                case 'ma_vt': inner = `<span class="font-medium text-blue-600">${esc(row.ma_vt)}</span>`; break;
                case 'so_luong': inner = `<span class="font-medium text-slate-800">${fmtNum(row.so_luong)}</span>`; break;
                case 'ton_kho': inner = `<span class="text-emerald-600 font-medium">${row.ton_kho !== null && row.ton_kho !== undefined ? fmtNum(row.ton_kho) : '-'}</span>`; break;
                case 'kha_dung': inner = `<span class="font-medium ${Number(row.kha_dung) < 0 ? 'text-red-600' : 'text-amber-600'}">${row.kha_dung !== null && row.kha_dung !== undefined ? fmtNum(row.kha_dung) : '-'}</span>`; break;
                case 'psr': inner = `<span class="font-normal text-slate-700">${esc(row.psr || '')}</span>`; break;
                case 'ngay_su_dung': inner = `<span class="font-normal text-slate-700">${esc(fmtDate(row.ngay_su_dung))}</span>`; break;
                case 'trang_thai': inner = renderStatusBadge(stInfo.status); break;
                case 'actions':
                    const excelBtn = `
                        <button type="button" class="rq-act-excel p-1 rounded text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors" data-nhom="${esc(row.nhom_id)}" title="Xuất Excel request này">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="8" y1="13" x2="16" y2="13"></line>
                                <line x1="8" y1="17" x2="16" y2="17"></line>
                                <line x1="10" y1="9" x2="8" y2="9"></line>
                            </svg>
                        </button>`;
                    inner = canEditThis ? `
                        <div class="flex items-center justify-center gap-0.5">
                            ${excelBtn}
                            <button type="button" class="rq-act-edit p-1 rounded text-blue-600 hover:bg-blue-100" data-nhom="${esc(row.nhom_id)}" title="Chỉnh sửa đơn request">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            </button>
                            <button type="button" class="rq-act-del p-1 rounded text-red-500 hover:bg-red-100" data-nhom="${esc(row.nhom_id)}" title="Xóa đơn request">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>` : `
                        <div class="flex items-center justify-center gap-0.5">
                            ${excelBtn}
                            <button type="button" class="rq-act-edit p-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50" data-nhom="${esc(row.nhom_id)}" title="Xem chi tiết (Chỉ người tạo mới được sửa)">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            </button>
                        </div>`;
                    break;
                default: inner = esc(getDisplayValue(row, col.key));
            }
            const title = (col.key === 'actions' || col.key === 'stt') ? '' : ` title="${esc(getDisplayValue(row, col.key))}"`;
            return `<td class="px-1.5 py-0.5 text-xs border border-gray-300 ${align} ${bg} ${actionTdClass}" style="${isActions ? 'right:0;' : ''}"${title}>${inner}</td>`;
        }).join('');
        return `<tr class="${isGroupStart && i > 0 ? 'border-t-2 border-slate-400' : ''}" data-nhom="${esc(row.nhom_id)}">${tds}</tr>`;
    }).join('');

    renderPagination(total, start, start + pageRows.length - 1, totalPages, total);
}

function renderPagination(total, from, to, totalPages, totalItemsCount = 0) {
    const info = document.getElementById('rq-pagination-info');
    if (info) {
        if (displayMode === 'tree') {
            info.textContent = total === 0 ? '(Hiển thị 0 đơn)' : `(Hiển thị ${from + 1} - ${to + 1} trên ${total} đơn)`;
        } else {
            info.textContent = total === 0 ? '(Hiển thị 0 dòng)' : `(Hiển thị ${from + 1} - ${to + 1} trên ${total} dòng)`;
        }
    }
    const pageInput = document.getElementById('rq-page-input');
    if (pageInput) { pageInput.value = rqState.currentPage; pageInput.max = totalPages; }
    const tp = document.getElementById('rq-total-pages');
    if (tp) tp.textContent = `/ ${totalPages}`;
    const prev = document.getElementById('rq-prev-page');
    const next = document.getElementById('rq-next-page');
    if (prev) prev.disabled = rqState.currentPage <= 1;
    if (next) next.disabled = rqState.currentPage >= totalPages;

    const summary = document.getElementById('rq-summary-info');
    if (summary) {
        const groups = new Set(filteredRows.map(r => r.nhom_id)).size;
        const codes = new Set(filteredRows.map(r => keyOf(r.ma_vt))).size;
        const qty = filteredRows.reduce((s, r) => s + (Number(r.so_luong) || 0), 0);
        let doneQty = 0;
        filteredRows.forEach(r => {
            const st = getItemStatusInfo(r);
            if (st.isDone) doneQty += (Number(r.so_luong) || 0);
        });
        summary.innerHTML = `
            <div class="flex items-center gap-1 sm:gap-2 text-[7px] sm:text-[10px] md:text-xs font-bold border-x border-gray-100 px-2 whitespace-nowrap">
                <span class="text-blue-600" title="Số đơn request">Đơn: ${fmtNum(groups)}</span>
                <span class="text-gray-200">|</span>
                <span class="text-gray-700" title="Số mã vật tư">Mã: ${fmtNum(codes)}</span>
                <span class="text-gray-200">|</span>
                <span class="text-gray-900" title="Tổng số lượng">Tổng SL: ${fmtNum(qty)}</span>
                <span class="text-gray-200">|</span>
                <span class="text-green-600" title="Số lượng đã xuất kho Done">Đã xuất: ${fmtNum(doneQty)}</span>
            </div>`;
    }
}

function updateResetBtnState() {
    const btn = document.getElementById('rq-reset-filters');
    if (!btn) return;
    const has = !!rqState.searchTerm.trim() || Object.values(rqState.filters).some(v => Array.isArray(v) && v.length);
    btn.classList.toggle('filter-has-active', has);
}

/* ---------------------- Popover lọc theo cột ---------------------- */
function closeColumnFilter() {
    document.querySelectorAll('.rq-filter-pop').forEach(p => p.remove());
}

function openColumnFilter(btn, key) {
    const existing = document.querySelector(`.rq-filter-pop[data-col="${key}"]`);
    closeColumnFilter();
    if (existing) return;

    const col = RQ_COLUMNS.find(c => c.key === key);
    const counts = new Map();
    rawRows.filter(r => rowPassesFilters(r, key)).forEach(r => {
        const v = getDisplayValue(r, key) || EMPTY_LABEL;
        counts.set(v, (counts.get(v) || 0) + 1);
    });
    let options = [...counts.keys()];
    if (col?.type === 'date') {
        const toIso = (s) => { const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}${m[2]}${m[1]}` : s; };
        options.sort((a, b) => toIso(b).localeCompare(toIso(a)));
    } else if (col?.type === 'number') {
        options.sort((a, b) => (parseQty(a) || 0) - (parseQty(b) || 0));
    } else {
        options.sort((a, b) => a.localeCompare(b, 'vi'));
    }
    const selected = new Set(rqState.filters[key] || []);

    const pop = document.createElement('div');
    pop.className = 'rq-filter-pop';
    pop.dataset.col = key;
    pop.innerHTML = `
        <div class="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
            <span class="text-xs font-bold text-gray-700 uppercase">Lọc: ${esc(col?.title || key)}</span>
            <button type="button" class="rq-fp-close text-gray-400 hover:text-gray-700 text-sm">✕</button>
        </div>
        <div class="p-2 border-b"><input type="text" class="rq-fp-search w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Tìm nhanh..."></div>
        <div class="px-3 py-1 flex items-center justify-between text-[11px] text-gray-500">
            <button type="button" class="rq-fp-all text-blue-600 hover:underline font-medium">Chọn tất cả</button>
            <span class="rq-fp-count">Đã chọn: ${selected.size}</span>
        </div>
        <div class="rq-fp-list overflow-y-auto text-xs" style="max-height:230px"></div>
        <div class="p-2 border-t flex justify-end gap-2">
            <button type="button" class="rq-fp-clear px-2.5 py-1 text-xs text-gray-500 hover:text-red-600">Bỏ lọc</button>
            <button type="button" class="rq-fp-apply px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold">Áp dụng</button>
        </div>`;
    document.body.appendChild(pop);

    const rect = btn.getBoundingClientRect();
    pop.style.left = `${Math.max(4, Math.min(rect.left - 120, window.innerWidth - 270))}px`;
    pop.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 380)}px`;

    const list = pop.querySelector('.rq-fp-list');
    const search = pop.querySelector('.rq-fp-search');
    const countEl = pop.querySelector('.rq-fp-count');
    const renderList = () => {
        const q = normalizeText(search.value);
        const shown = options.filter(o => normalizeText(o).includes(q));
        list.innerHTML = shown.length ? shown.map(o => `
            <label class="flex items-center gap-2 px-3 py-1 hover:bg-blue-50 cursor-pointer select-none">
                <input type="checkbox" class="rq-fp-cb rounded text-blue-600" value="${esc(o)}" ${selected.has(o) ? 'checked' : ''}>
                <span class="truncate flex-1 ${o === EMPTY_LABEL ? 'italic text-gray-400' : 'text-gray-700'}">${esc(o)}</span>
                <span class="text-[10px] text-gray-400">${counts.get(o)}</span>
            </label>`).join('') : '<div class="p-3 text-center text-gray-400">Không có giá trị</div>';
        countEl.textContent = `Đã chọn: ${selected.size}`;
    };
    renderList();
    setTimeout(() => search.focus(), 0);

    search.addEventListener('input', renderList);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') pop.querySelector('.rq-fp-apply').click(); });
    list.addEventListener('change', (e) => {
        if (!e.target.classList.contains('rq-fp-cb')) return;
        if (e.target.checked) selected.add(e.target.value); else selected.delete(e.target.value);
        countEl.textContent = `Đã chọn: ${selected.size}`;
    });
    pop.querySelector('.rq-fp-all').onclick = () => {
        const q = normalizeText(search.value);
        const shown = options.filter(o => normalizeText(o).includes(q));
        const allOn = shown.every(o => selected.has(o));
        shown.forEach(o => allOn ? selected.delete(o) : selected.add(o));
        renderList();
    };
    pop.querySelector('.rq-fp-close').onclick = closeColumnFilter;
    pop.querySelector('.rq-fp-clear').onclick = () => {
        delete rqState.filters[key];
        rqState.currentPage = 1;
        closeColumnFilter();
        applyFiltersAndRender(true);
    };
    pop.querySelector('.rq-fp-apply').onclick = () => {
        if (selected.size) rqState.filters[key] = [...selected]; else delete rqState.filters[key];
        rqState.currentPage = 1;
        closeColumnFilter();
        applyFiltersAndRender(true);
    };
}

/* ---------------------- Cài đặt cột ---------------------- */
function openColumnSettings() {
    const modal = document.getElementById('rq-settings-modal');
    const container = document.getElementById('rq-column-toggles');
    if (!modal || !container) return;
    const toPending = (cols) => cols.map(c => ({ key: c.key, title: c.title, canHide: c.canHide !== false, visible: c.visible, width: c.width }));
    let pending = toPending(getColConfig());
    renderColumnConfigList(container, pending);
    modal.classList.remove('hidden');
    bindColumnSettingsModal('rq', {
        onReset: () => {
            pending = RQ_COLUMNS.map(c => ({ key: c.key, title: c.title, canHide: c.canHide !== false, visible: c.defaultVisible !== false, width: c.width }));
            renderColumnConfigList(container, pending);
        },
        onSave: () => {
            const current = new Map(getColConfig().map(c => [c.key, c]));
            const cols = pending.map(p => ({ ...current.get(p.key), visible: p.canHide === false ? true : p.visible, width: p.width }));
            saveColConfig(cols);
            applyFiltersAndRender(true);
            showToast('Đã lưu cấu hình cột', 'success');
        },
    });
}

/* ---------------------- Xuất Excel ---------------------- */
function exportToExcel() {
    if (!filteredRows.length) { showToast('Không có dữ liệu để xuất.', 'warning'); return; }
    if (typeof XLSX === 'undefined') { showToast('Thư viện Excel chưa sẵn sàng.', 'error'); return; }
    const cols = getVisibleCols().filter(c => c.key !== 'actions');
    const aoa = [cols.map(c => c.title)];
    filteredRows.forEach((r, i) => {
        aoa.push(cols.map(c => {
            if (c.key === 'stt') return i + 1;
            if (c.key === 'so_luong') return Number(r.so_luong) || 0;
            return getDisplayValue(r, c.key);
        }));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map(c => ({ wch: Math.max(6, Math.round(c.width / 7)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Request');
    XLSX.writeFile(wb, `Request_${todayLocal()}.xlsx`);
}

export function exportSingleRequestToExcel(nhomId) {
    if (!nhomId) return;
    if (typeof XLSX === 'undefined') { showToast('Thư viện Excel chưa sẵn sàng.', 'error'); return; }
    const items = rawRows.filter(r => (r.nhom_id || r.id) === nhomId)
        .sort((a, b) => (Number(a.stt) || 0) - (Number(b.stt) || 0));
    if (!items.length) { showToast('Không tìm thấy dữ liệu request để xuất.', 'warning'); return; }

    const first = items[0];
    const headers = [
        'STT', 'Thời Gian', 'PSR', 'Ngày Sử Dụng', 'Hội Nghị', 'Ghi Chú',
        'Mã VT', 'Tên Vật Tư', 'Số Lượng', 'Tồn Kho', 'Khả Dụng', 'Trạng Thái', 'Người Tạo'
    ];
    const aoa = [headers];
    items.forEach((r, idx) => {
        const st = getItemStatusInfo(r);
        aoa.push([
            idx + 1,
            fmtDate(r.thoi_gian),
            r.psr || '',
            fmtDate(r.ngay_su_dung),
            r.hoi_nghi || '',
            r.ghi_chu || '',
            r.ma_vt || '',
            displayTenVt(r) || '',
            Number(r.so_luong) || 0,
            r.ton_kho !== null && r.ton_kho !== undefined ? Number(r.ton_kho) : '',
            r.kha_dung !== null && r.kha_dung !== undefined ? Number(r.kha_dung) : '',
            st.status,
            r.nguoi_tao || ''
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
        { wch: 6 },
        { wch: 12 },
        { wch: 22 },
        { wch: 14 },
        { wch: 25 },
        { wch: 25 },
        { wch: 16 },
        { wch: 40 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 14 },
        { wch: 18 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Request');
    const psrName = (first.psr || 'Request').replace(/[\/\\?%*:|"<>]/g, '_');
    const dateStr = first.thoi_gian ? String(first.thoi_gian).slice(0, 10) : todayLocal();
    XLSX.writeFile(wb, `Request_${psrName}_${dateStr}.xlsx`);
    showToast('Đã xuất file Excel đơn request!', 'success');
}

/* ===================================================================
 * MODAL THÊM / SỬA REQUEST
 * =================================================================== */
let gridRows = [];          // [{ code, qty, isDone }]
let editingNhomId = null;
let editingOldRows = [];
let modalReadOnly = false;
let modalSnapshot = '';
let suggestState = { rowIdx: -1, items: [], active: 0 };

function newRow(code = '', qty = '', extra = {}) {
    return {
        id: extra.id || null,
        code,
        qty,
        saved_ton_kho: (extra.saved_ton_kho !== undefined && extra.saved_ton_kho !== null) ? Number(extra.saved_ton_kho) : null,
        saved_kha_dung: (extra.saved_kha_dung !== undefined && extra.saved_kha_dung !== null) ? Number(extra.saved_kha_dung) : null,
        isDone: !!extra.isDone,
        _isUserModified: !!extra._isUserModified
    };
}

function getFormSnapshot() {
    return JSON.stringify({
        t: document.getElementById('rq-f-thoi-gian')?.value,
        p: document.getElementById('rq-f-psr')?.value,
        n: document.getElementById('rq-f-ngay-sd')?.value,
        h: document.getElementById('rq-f-hoi-nghi')?.value,
        g: document.getElementById('rq-f-ghi-chu')?.value,
        r: gridRows.filter(r => String(r.code).trim() || String(r.qty).trim()),
    });
}

async function openRequestModal(nhomId = null) {
    if (tableMissing) { showToast('Chưa có bảng request trên Supabase. Hãy chạy migrations/0003_create_request.sql', 'error'); return; }
    const modal = document.getElementById('rq-modal');
    if (!modal) return;

    editingNhomId = nhomId;

    // Kiểm tra quyền sửa nếu đang mở đơn cũ
    if (nhomId) {
        editingOldRows = rawRows.filter(r => r.nhom_id === nhomId).sort((a, b) => (Number(a.stt) || 0) - (Number(b.stt) || 0));
        const first = editingOldRows[0];
        modalReadOnly = !canUserEditRequest(first);
    } else {
        editingOldRows = [];
        modalReadOnly = !canCreate();
    }

    updateRequestMap(editingNhomId);

    showLoading(true);
    try {
        await Promise.all([loadSanPham(), loadStockAndScanning(), loadPsrOptions()]);
    } catch (e) {
        console.error(e);
        showToast('Lỗi tải dữ liệu tham chiếu: ' + (e.message || e), 'error');
    } finally {
        showLoading(false);
    }

    const $ = (id) => document.getElementById(id);

    if (nhomId) {
        const h = editingOldRows[0] || {};
        $('rq-f-thoi-gian').value = String(h.thoi_gian || todayLocal()).slice(0, 10);
        $('rq-f-psr').value = h.psr || '';
        $('rq-f-ngay-sd').value = h.ngay_su_dung ? String(h.ngay_su_dung).slice(0, 10) : '';
        $('rq-f-hoi-nghi').value = h.hoi_nghi || '';
        $('rq-f-ghi-chu').value = h.ghi_chu || '';
        gridRows = editingOldRows.map(r => {
            const st = getItemStatusInfo(r);
            return newRow(r.ma_vt || '', r.so_luong ?? '', {
                id: r.id,
                saved_ton_kho: (r.ton_kho !== undefined && r.ton_kho !== null) ? Number(r.ton_kho) : null,
                saved_kha_dung: (r.kha_dung !== undefined && r.kha_dung !== null) ? Number(r.kha_dung) : null,
                isDone: st.isDone,
                _isUserModified: false
            });
        });
        if (!modalReadOnly) for (let i = 0; i < 3; i++) gridRows.push(newRow());
        $('rq-modal-title').textContent = modalReadOnly ? `Xem Request - ${h.psr || ''} (Chỉ xem)` : `Chỉnh sửa Request - ${h.psr || ''}`;
    } else {
        $('rq-f-thoi-gian').value = todayLocal();
        $('rq-f-psr').value = '';
        $('rq-f-ngay-sd').value = '';
        $('rq-f-hoi-nghi').value = '';
        $('rq-f-ghi-chu').value = '';
        gridRows = Array.from({ length: 10 }, () => newRow());
        $('rq-modal-title').textContent = 'Thêm Request Mới';
    }

    ['rq-f-thoi-gian', 'rq-f-psr', 'rq-f-ngay-sd', 'rq-f-hoi-nghi', 'rq-f-ghi-chu'].forEach(id => { $(id).disabled = modalReadOnly; });
    $('rq-f-ngay-sd').classList.remove('border-red-500', 'ring-1', 'ring-red-400');
    $('rq-modal-save').classList.toggle('hidden', modalReadOnly);
    $('rq-grid-tools').classList.toggle('hidden', modalReadOnly);
    $('rq-grid-add').classList.toggle('hidden', modalReadOnly);

    renderGrid();
    modalSnapshot = getFormSnapshot();
    modal.classList.remove('hidden');
    setTimeout(() => {
        if (modalReadOnly) return;
        if (nhomId) document.querySelector('#rq-grid-body input[data-col="code"]')?.focus();
        else $('rq-f-psr').focus();
    }, 50);
}

async function closeRequestModal(force = false) {
    const modal = document.getElementById('rq-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (!force && !modalReadOnly && getFormSnapshot() !== modalSnapshot) {
        const ok = await showConfirm('Dữ liệu chưa được lưu. Bạn có chắc muốn đóng?', 'Đóng cửa sổ');
        if (!ok) return;
    }
    hideSuggest();
    hidePsrList();
    modal.classList.add('hidden');
}

/* --------------------------- Lưới nhập --------------------------- */
function computeForCode(code) {
    const k = keyOf(code);
    const sp = spMap.get(k);
    const ton = stockMap.get(k) || 0;
    const req = requestMap.get(k) || 0;
    const kd = ton - req;
    return { k, sp, ton, req, kd };
}

function renderGrid() {
    const tbody = document.getElementById('rq-grid-body');
    if (!tbody) return;
    tbody.innerHTML = gridRows.map((r, i) => {
        const isLocked = modalReadOnly || !!r.isDone;
        const codeInputRo = isLocked ? 'readonly disabled tabindex="-1"' : '';
        const qtyInputRo = isLocked ? 'readonly disabled tabindex="-1"' : '';
        const codeClass = isLocked
            ? 'rq-cell font-bold text-gray-500 bg-gray-100 cursor-not-allowed select-none'
            : 'rq-cell font-bold text-blue-700';
        const qtyClass = isLocked
            ? 'rq-cell font-semibold text-gray-500 bg-gray-100 cursor-not-allowed select-none'
            : 'rq-cell font-semibold';
        const delBtn = modalReadOnly ? '' : (r.isDone
            ? `<span class="inline-block px-1 text-gray-400 select-none cursor-not-allowed" title="Mã này đã xuất kho (Done), không thể sửa hoặc xóa">🔒</span>`
            : `<button type="button" class="rq-row-del text-gray-400 hover:text-red-600 px-1" data-row="${i}" tabindex="-1" title="Xóa dòng">✕</button>`);

        return `
        <tr data-row="${i}" class="${r.isDone ? 'bg-emerald-50/40' : ''}">
            <td class="rq-stt">${i + 1}</td>
            <td class="rq-code-td"><input type="text" class="${codeClass}" data-row="${i}" data-col="code" value="${esc(r.code)}" autocomplete="off" spellcheck="false" ${codeInputRo}></td>
            <td class="rq-ro rq-name"></td>
            <td><input type="text" inputmode="decimal" class="${qtyClass}" data-row="${i}" data-col="qty" value="${esc(r.qty)}" autocomplete="off" ${qtyInputRo}></td>
            <td class="rq-stock"></td>
            <td class="rq-avail"></td>
            <td class="rq-status"></td>
            <td class="text-center">${delBtn}</td>
        </tr>`;
    }).join('');
    refreshComputed();
}

function refreshComputed() {
    const tbody = document.getElementById('rq-grid-body');
    if (!tbody) return;

    let nCodes = 0, totalQty = 0, nFalse = 0, nDone = 0, nInvalid = 0;
    const usedMap = new Map();

    gridRows.forEach((r, i) => {
        const tr = tbody.querySelector(`tr[data-row="${i}"]`);
        if (!tr) return;
        const nameTd = tr.querySelector('.rq-name');
        const stockTd = tr.querySelector('.rq-stock');
        const availTd = tr.querySelector('.rq-avail');
        const statusTd = tr.querySelector('.rq-status');
        const codeTxt = String(r.code || '').trim();
        tr.classList.remove('rq-invalid');
        tr.title = '';

        if (!codeTxt) {
            nameTd.textContent = ''; stockTd.textContent = ''; availTd.textContent = ''; statusTd.innerHTML = '';
            r.computed_ton_kho = null;
            r.computed_kha_dung = null;
            return;
        }

        const c = computeForCode(codeTxt);
        if (!c.sp) {
            tr.classList.add('rq-invalid');
            tr.title = 'Code không có trong Sản Phẩm';
            nameTd.innerHTML = '<span class="text-red-500 italic">Không tìm thấy Code</span>';
            stockTd.textContent = ''; availTd.textContent = ''; statusTd.innerHTML = '';
            r.computed_ton_kho = null;
            r.computed_kha_dung = null;
            nInvalid++;
            return;
        }

        nCodes++;
        nameTd.textContent = c.sp.ten_vt;
        nameTd.title = c.sp.ten_vt;

        const q = parseQty(r.qty);
        const validQ = (typeof q === 'number' && !Number.isNaN(q) && q > 0) ? q : 0;
        if (validQ > 0) totalQty += validQ;

        let displayTon, displayKd, statusBadgeHtml;

        if (r.isDone) {
            nDone++;
            displayTon = (r.saved_ton_kho !== null && r.saved_ton_kho !== undefined) ? r.saved_ton_kho : c.ton;
            displayKd = Math.max(0, (r.saved_kha_dung !== null && r.saved_kha_dung !== undefined) ? r.saved_kha_dung : c.kd);
            statusBadgeHtml = '<span class="rq-badge-done" title="Mã này đã được xuất kho xử lý thành công">Done</span>';
            r.computed_ton_kho = displayTon;
            r.computed_kha_dung = displayKd;
        } else if (r.saved_kha_dung !== null && r.saved_kha_dung !== undefined && !r._isUserModified) {
            displayTon = (r.saved_ton_kho !== null && r.saved_ton_kho !== undefined) ? r.saved_ton_kho : c.ton;
            displayKd = r.saved_kha_dung;
            const ok = validQ > 0 && displayKd >= 0;
            if (!ok && validQ > 0) nFalse++;
            statusBadgeHtml = (validQ > 0)
                ? `<span class="${ok ? 'rq-badge-true' : 'rq-badge-false'}">${ok ? 'TRUE' : 'FALSE'}</span>`
                : '';
            r.computed_ton_kho = displayTon;
            r.computed_kha_dung = displayKd;
            if (validQ > 0) {
                usedMap.set(c.k, (usedMap.get(c.k) || 0) + validQ);
            }
        } else {
            displayTon = c.ton;
            const prior = usedMap.get(c.k) || 0;
            const availBefore = c.kd - prior;

            let isOk = false;
            if (validQ > 0) {
                if (availBefore >= validQ) {
                    displayKd = availBefore;
                    isOk = true;
                } else {
                    displayKd = availBefore - validQ;
                    isOk = false;
                }
                usedMap.set(c.k, prior + validQ);
            } else {
                displayKd = Math.max(0, availBefore);
                isOk = false;
            }

            if (!isOk && validQ > 0) nFalse++;
            statusBadgeHtml = (validQ > 0)
                ? `<span class="${isOk ? 'rq-badge-true' : 'rq-badge-false'}">${isOk ? 'TRUE' : 'FALSE'}</span>`
                : '';

            r.computed_ton_kho = displayTon;
            r.computed_kha_dung = displayKd;
        }

        stockTd.textContent = fmtNum(displayTon);
        availTd.textContent = fmtNum(displayKd);
        availTd.className = `rq-avail ${displayKd < 0 ? '!text-red-600 font-medium' : '!text-amber-600 font-medium'}`;
        availTd.title = `Tồn kho lúc đề xuất: ${fmtNum(displayTon)} | Khả dụng: ${fmtNum(displayKd)}`;
        statusTd.innerHTML = statusBadgeHtml;
    });

    const sum = document.getElementById('rq-grid-summary');
    if (sum) {
        sum.innerHTML = `Số mã: <span class="text-blue-600">${nCodes}</span> &nbsp;|&nbsp; Tổng SL: <span class="text-gray-900">${fmtNum(totalQty)}</span>`
            + (nDone ? ` &nbsp;|&nbsp; <span class="text-green-600 font-bold">Done: ${nDone}</span>` : '')
            + (nFalse ? ` &nbsp;|&nbsp; <span class="text-red-600 font-bold">FALSE (Vượt khả dụng): ${nFalse}</span>` : '')
            + (nInvalid ? ` &nbsp;|&nbsp; <span class="text-red-600">Code sai: ${nInvalid}</span>` : '');
    }
}

function focusCell(row, col) {
    const input = document.querySelector(`#rq-grid-body input[data-row="${row}"][data-col="${col}"]`);
    if (input) { input.focus(); input.select(); input.scrollIntoView({ block: 'nearest' }); }
}

function ensureRows(n) {
    while (gridRows.length < n) gridRows.push(newRow());
}

function addRows(n = 1, focus = true) {
    const start = gridRows.length;
    for (let i = 0; i < n; i++) gridRows.push(newRow());
    renderGrid();
    if (focus) focusCell(start, 'code');
}

function resolveCode(rowIdx) {
    const r = gridRows[rowIdx];
    if (!r) return;
    const sp = spMap.get(keyOf(r.code));
    if (sp && r.code !== sp.ma_vt) {
        r.code = sp.ma_vt;
        const input = document.querySelector(`#rq-grid-body input[data-row="${rowIdx}"][data-col="code"]`);
        if (input) input.value = sp.ma_vt;
    }
}

/** Dán dữ liệu dạng Excel (tab / xuống dòng) vào lưới */
function handleGridPaste(e) {
    const input = e.target.closest('input.rq-cell');
    if (!input || modalReadOnly) return;
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    e.preventDefault();

    const lines = text.replace(/\r/g, '').split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    const startRow = parseInt(input.dataset.row, 10);
    const startCol = input.dataset.col;

    let writeIdx = startRow;
    lines.forEach((line) => {
        while (writeIdx < gridRows.length && gridRows[writeIdx]?.isDone) {
            writeIdx++;
        }
        ensureRows(writeIdx + 1);
        const cells = line.split('\t').map(s => s.trim());
        const r = gridRows[writeIdx];
        r._isUserModified = true;
        if (startCol === 'code') {
            r.code = cells[0] || '';
            const qCell = cells.slice(1).find(c => isNumericText(c));
            if (qCell !== undefined) r.qty = String(parseQty(qCell));
            else if (cells.length > 1 && cells[1] === '') r.qty = '';
        } else {
            r.qty = isNumericText(cells[0]) ? String(parseQty(cells[0])) : (cells[0] || '');
        }
        writeIdx++;
    });

    gridRows.forEach(r => { if (!r.isDone) { const sp = spMap.get(keyOf(r.code)); if (sp) r.code = sp.ma_vt; } });
    if (gridRows[gridRows.length - 1].code || gridRows[gridRows.length - 1].qty) gridRows.push(newRow());
    renderGrid();
    focusCell(Math.min(writeIdx, gridRows.length - 1), startCol);
    showToast(`Đã dán ${lines.length} dòng`, 'success');
}

/* ------------------------ Gợi ý Code ------------------------ */
function getSuggestEl() {
    let el = document.getElementById('rq-code-suggest');
    if (!el) {
        el = document.createElement('div');
        el.id = 'rq-code-suggest';
        el.className = 'hidden';
        document.body.appendChild(el);
        el.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.rq-sg-item');
            if (!item) return;
            e.preventDefault();
            pickSuggest(parseInt(item.dataset.idx, 10));
        });
    }
    return el;
}

function hideSuggest() {
    const el = document.getElementById('rq-code-suggest');
    if (el) el.classList.add('hidden');
    suggestState = { rowIdx: -1, items: [], active: 0 };
}

function isSuggestOpen() {
    const el = document.getElementById('rq-code-suggest');
    return !!el && !el.classList.contains('hidden') && suggestState.items.length > 0;
}

function showSuggest(input) {
    const q = normalizeText(input.value);
    const rowIdx = parseInt(input.dataset.row, 10);
    if (!q) { hideSuggest(); return; }
    const qKey = keyOf(input.value);
    const scored = [];
    for (const sp of spList) {
        if (!sp.norm.includes(q)) continue;
        let score = 3;
        if (sp.key === qKey) score = 0;
        else if (sp.key.startsWith(qKey)) score = 1;
        else if (sp.key.includes(qKey)) score = 2;
        scored.push([score, sp]);
        if (scored.length > 400) break;
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].key.localeCompare(b[1].key));
    const items = scored.slice(0, 40).map(x => x[1]);
    const el = getSuggestEl();
    if (!items.length) {
        el.innerHTML = '<div class="p-3 text-xs text-gray-400 text-center">Không tìm thấy Code phù hợp</div>';
        suggestState = { rowIdx, items: [], active: 0 };
    } else {
        suggestState = { rowIdx, items, active: 0 };
        el.innerHTML = items.map((sp, i) => {
            const c = computeForCode(sp.ma_vt);
            const kdClass = c.kd <= 0 ? 'text-red-600' : 'text-yellow-700';
            return `<div class="rq-sg-item ${i === 0 ? 'active' : ''}" data-idx="${i}">
                <span class="font-bold text-blue-700 w-28 flex-shrink-0 truncate">${esc(sp.ma_vt)}</span>
                <span class="flex-1 truncate text-gray-700" title="${esc(sp.ten_vt)}">${esc(sp.ten_vt)}</span>
                <span class="text-[10px] font-bold text-green-700 whitespace-nowrap">T:${fmtNum(c.ton)}</span>
                <span class="text-[10px] font-bold ${kdClass} whitespace-nowrap">KD:${fmtNum(c.kd)}</span>
                ${c.req > 0 ? `<span class="text-[10px] text-amber-600 font-semibold whitespace-nowrap" title="Đã có request chờ: ${fmtNum(c.req)}">(YC:${fmtNum(c.req)})</span>` : ''}
            </div>`;
        }).join('');
    }
    const rect = input.closest('td').getBoundingClientRect();
    const h = Math.min(300, el.scrollHeight || 300);
    el.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 440))}px`;
    el.style.top = (rect.bottom + h > window.innerHeight - 8) ? `${Math.max(4, rect.top - h - 2)}px` : `${rect.bottom + 1}px`;
    el.classList.remove('hidden');
}

function moveSuggest(delta) {
    const el = getSuggestEl();
    const n = suggestState.items.length;
    if (!n) return;
    suggestState.active = (suggestState.active + delta + n) % n;
    el.querySelectorAll('.rq-sg-item').forEach((it, i) => it.classList.toggle('active', i === suggestState.active));
    el.querySelector('.rq-sg-item.active')?.scrollIntoView({ block: 'nearest' });
}

function pickSuggest(idx, key = 'Enter') {
    const sp = suggestState.items[idx];
    const rowIdx = suggestState.rowIdx;
    if (!sp || rowIdx < 0) return;
    gridRows[rowIdx].code = sp.ma_vt;
    const input = document.querySelector(`#rq-grid-body input[data-row="${rowIdx}"][data-col="code"]`);
    if (input) input.value = sp.ma_vt;
    hideSuggest();
    refreshComputed();
    if (key === 'Tab') {
        focusCell(rowIdx, 'qty');
    } else {
        if (rowIdx >= gridRows.length - 1) addRows(1, false);
        focusCell(rowIdx + 1, 'code');
    }
}

/* ------------------------ PSR combobox ------------------------ */
let psrActive = -1;
function hidePsrList() { document.getElementById('rq-psr-list')?.classList.add('hidden'); psrActive = -1; }

function renderPsrList(showAll = false) {
    const input = document.getElementById('rq-f-psr');
    const list = document.getElementById('rq-psr-list');
    if (!input || !list || modalReadOnly) return;
    const val = input.value.trim();
    const q = showAll ? '' : normalizeText(val);
    const opts = psrOptions.filter(o => normalizeText(o).includes(q)).slice(0, 200);
    const exists = psrOptions.some(o => normalizeText(o) === normalizeText(val));
    let html = '';
    if (val && !exists) html += `<div class="rq-psr-item text-blue-700 font-semibold" data-value="${esc(val)}">+ Thêm mới "${esc(val)}"</div>`;
    html += opts.map(o => `<div class="rq-psr-item" data-value="${esc(o)}">${esc(o)}</div>`).join('');
    if (!html) html = '<div class="p-2 text-xs text-gray-400 text-center">Không có dữ liệu</div>';
    list.innerHTML = html;
    psrActive = -1;
    list.classList.remove('hidden');
}

function pickPsr(value) {
    const input = document.getElementById('rq-f-psr');
    input.value = value;
    if (value && !psrOptions.includes(value)) { psrOptions.push(value); psrOptions.sort((a, b) => a.localeCompare(b, 'vi')); }
    hidePsrList();
}

/* ------------------------ Lưu / Xóa ------------------------ */
async function saveRequest() {
    if (modalReadOnly) return;

    // Kiểm tra phân quyền: Chỉ người tạo hoặc Admin mới được sửa
    if (editingNhomId && editingOldRows.length > 0) {
        if (!canUserEditRequest(editingOldRows[0])) {
            showToast('Bạn không có quyền chỉnh sửa request của người khác.', 'error');
            return;
        }
    }

    const $ = (id) => document.getElementById(id);
    const thoiGian = $('rq-f-thoi-gian').value || todayLocal();
    const psr = $('rq-f-psr').value.trim();
    const ngaySd = $('rq-f-ngay-sd').value;
    const hoiNghi = $('rq-f-hoi-nghi').value.trim();
    const ghiChu = $('rq-f-ghi-chu').value.trim();

    if (!ngaySd) {
        $('rq-f-ngay-sd').classList.add('border-red-500', 'ring-1', 'ring-red-400');
        $('rq-f-ngay-sd').focus();
        showToast('Vui lòng chọn Ngày Sử Dụng.', 'error');
        return;
    }

    const items = [];
    for (let i = 0; i < gridRows.length; i++) {
        const r = gridRows[i];
        const code = String(r.code || '').trim();
        const qtyRaw = String(r.qty ?? '').trim();
        if (!code && !qtyRaw) continue;
        const sp = spMap.get(keyOf(code));
        if (!code) { showToast(`Dòng ${i + 1}: thiếu Code.`, 'error'); focusCell(i, 'code'); return; }
        if (!sp) { showToast(`Dòng ${i + 1}: Code "${code}" không có trong Sản Phẩm.`, 'error'); focusCell(i, 'code'); return; }
        const q = parseQty(qtyRaw);
        if (q === '' || Number.isNaN(q) || q <= 0) { showToast(`Dòng ${i + 1}: Số lượng không hợp lệ.`, 'error'); focusCell(i, 'qty'); return; }
        const c = computeForCode(code);
        items.push({
            id: r.id || null,
            ma_vt: sp.ma_vt,
            ten_vt: sp.ten_vt,
            so_luong: q,
            ton_kho: (r.computed_ton_kho !== undefined && r.computed_ton_kho !== null) ? r.computed_ton_kho : (r.saved_ton_kho ?? c.ton),
            kha_dung: (r.computed_kha_dung !== undefined && r.computed_kha_dung !== null) ? r.computed_kha_dung : (r.saved_kha_dung ?? c.kd),
            isDone: !!r.isDone
        });
    }
    if (!items.length) { showToast('Danh sách vật tư đang trống.', 'error'); focusCell(0, 'code'); return; }

    const nhomId = editingNhomId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const old = editingOldRows[0];
    const nowIso = new Date().toISOString();
    const user = currentUser || getCurrentAppUser();
    const creatorName = old?.nguoi_tao || user?.ho_ten || user?.gmail || 'Người dùng';

    // Đảm bảo không xóa mất các dòng đã Done của request cũ
    const keptOldIds = new Set(items.filter(it => it.id).map(it => it.id));
    editingOldRows.filter(r => getItemStatusInfo(r).isDone).forEach(doneRow => {
        if (!keptOldIds.has(doneRow.id)) {
            items.unshift({
                id: doneRow.id,
                ma_vt: doneRow.ma_vt,
                ten_vt: doneRow.ten_vt,
                so_luong: Number(doneRow.so_luong) || 0,
                ton_kho: doneRow.ton_kho ?? 0,
                kha_dung: doneRow.kha_dung ?? 0,
                isDone: true
            });
            keptOldIds.add(doneRow.id);
        }
    });

    const idsToDelete = editingOldRows
        .filter(r => !keptOldIds.has(r.id))
        .map(r => r.id);

    const itemsToUpdate = items.filter(it => it.id);
    const itemsToInsert = items.filter(it => !it.id);

    showLoading(true);
    try {
        let hasMissingColumns = false;

        // Xóa các dòng bị bỏ (không phải Done)
        if (idsToDelete.length) {
            const { error: delErr } = await sb.from(TABLE).delete().in('id', idsToDelete);
            if (delErr) throw delErr;
        }

        // Cập nhật các dòng đã có id
        for (let idx = 0; idx < itemsToUpdate.length; idx++) {
            const it = itemsToUpdate[idx];
            let updPayload = {
                nhom_id: nhomId,
                thoi_gian: thoiGian,
                psr: psr || null,
                ma_vt: it.ma_vt,
                ten_vt: it.ten_vt,
                so_luong: it.so_luong,
                ton_kho: it.ton_kho,
                kha_dung: it.kha_dung,
                ngay_su_dung: ngaySd,
                hoi_nghi: hoiNghi || null,
                ghi_chu: ghiChu || null,
                stt: idx + 1,
                updated_at: nowIso,
            };

            let { error: updErr } = await sb.from(TABLE).update(updPayload).eq('id', it.id);
            if (updErr && (updErr.code === '42703' || updErr.code === 'PGRST204' || /ton_kho|kha_dung/i.test(updErr.message || ''))) {
                hasMissingColumns = true;
                delete updPayload.ton_kho;
                delete updPayload.kha_dung;
                const retry = await sb.from(TABLE).update(updPayload).eq('id', it.id);
                if (retry.error) throw retry.error;
            } else if (updErr) {
                throw updErr;
            }
        }

        // Thêm các dòng mới
        if (itemsToInsert.length) {
            let insPayload = itemsToInsert.map((it, i) => ({
                nhom_id: nhomId,
                thoi_gian: thoiGian,
                psr: psr || null,
                ma_vt: it.ma_vt,
                ten_vt: it.ten_vt,
                so_luong: it.so_luong,
                ton_kho: it.ton_kho,
                kha_dung: it.kha_dung,
                ngay_su_dung: ngaySd,
                hoi_nghi: hoiNghi || null,
                ghi_chu: ghiChu || null,
                stt: itemsToUpdate.length + i + 1,
                nguoi_tao: creatorName,
                created_at: old?.created_at || nowIso,
                updated_at: nowIso,
            }));

            let { error: insErr } = await sb.from(TABLE).insert(insPayload);
            if (insErr && (insErr.code === '42703' || insErr.code === 'PGRST204' || /ton_kho|kha_dung/i.test(insErr.message || ''))) {
                hasMissingColumns = true;
                const fallbackPayload = insPayload.map(p => {
                    const copy = { ...p };
                    delete copy.ton_kho;
                    delete copy.kha_dung;
                    return copy;
                });
                const retry = await sb.from(TABLE).insert(fallbackPayload);
                if (retry.error) throw retry.error;
            } else if (insErr) {
                throw insErr;
            }
        }

        if (psr && !psrOptions.includes(psr)) { psrOptions.push(psr); psrOptions.sort((a, b) => a.localeCompare(b, 'vi')); }

        if (hasMissingColumns) {
            showToast('Đã lưu! Hãy chạy file migrations/0004_add_ton_kho_kha_dung_to_request.sql trong Supabase để lưu cố định Tồn kho & Khả dụng.', 'warning');
        } else {
            showToast(editingNhomId ? 'Đã cập nhật request thành công.' : `Đã thêm request (${items.length} mã).`, 'success');
        }

        await closeRequestModal(true);
        await fetchRequest(editingNhomId ? rqState.currentPage : 1, false);
    } catch (err) {
        console.error('Lỗi lưu request:', err);
        showToast('Lỗi lưu request: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteRequest(nhomId) {
    const rows = rawRows.filter(r => r.nhom_id === nhomId);
    if (!rows.length) return;
    const h = rows[0];

    // Phân quyền xóa: chỉ người tạo hoặc Admin
    if (!canUserEditRequest(h)) {
        showToast('Bạn không có quyền xóa request của người khác.', 'error');
        return;
    }

    const doneCount = rows.filter(r => getItemStatusInfo(r).isDone).length;
    const user = currentUser || getCurrentAppUser();
    if (doneCount > 0 && user?.phan_quyen !== 'Admin') {
        showToast(`Đơn này đã có ${doneCount} mã xuất kho (Done). Chỉ Admin mới được phép xóa.`, 'error');
        return;
    }

    const ok = await showConfirm(`Xóa toàn bộ request của ${h.psr || '(không PSR)'} ngày ${fmtDate(h.thoi_gian)} gồm ${rows.length} mã?`, 'Xóa Request');
    if (!ok) return;

    showLoading(true);
    try {
        const { error } = await sb.from(TABLE).delete().eq('nhom_id', nhomId);
        if (error) throw error;
        showToast('Đã xóa request thành công.', 'success');
        await fetchRequest(rqState.currentPage, false);
    } catch (err) {
        showToast('Lỗi xóa request: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

// Cho phép gọi toggle từ onclick trong chuỗi HTML
window.toggleRequestGroup = toggleRequestGroup;
window.exportSingleRequestToExcel = exportSingleRequestToExcel;

/* ===================================================================
 * INIT
 * =================================================================== */
export function initRequestView() {
    const view = document.getElementById('view-request');
    if (!view) return;
    view.innerHTML = VIEW_HTML;
    const $ = (id) => document.getElementById(id);

    $('rq-btn-add').classList.toggle('hidden', !canCreate());

    // Toolbar
    const onSearch = debounce(() => { rqState.searchTerm = $('rq-search').value; rqState.currentPage = 1; applyFiltersAndRender(false); }, 250);
    $('rq-search').addEventListener('input', onSearch);
    $('rq-reset-filters').addEventListener('click', () => {
        rqState.searchTerm = '';
        rqState.filters = {};
        rqState.currentPage = 1;
        $('rq-search').value = '';
        applyFiltersAndRender(true);
    });
    $('rq-btn-settings').addEventListener('click', openColumnSettings);
    $('rq-btn-excel').addEventListener('click', exportToExcel);
    $('rq-btn-add').addEventListener('click', () => openRequestModal(null));

    // Nút chuyển chế độ xem Nhánh / Xem Thường
    $('rq-mode-tree').addEventListener('click', () => setRequestDisplayMode('tree'));
    $('rq-mode-flat').addEventListener('click', () => setRequestDisplayMode('flat'));
    $('rq-btn-toggle-all-branches').addEventListener('click', toggleAllRequestBranches);

    // Phân trang
    $('rq-items-per-page').addEventListener('change', (e) => { rqState.itemsPerPage = parseInt(e.target.value, 10) || 50; rqState.currentPage = 1; applyFiltersAndRender(false); });
    $('rq-prev-page').addEventListener('click', () => { rqState.currentPage--; applyFiltersAndRender(false); });
    $('rq-next-page').addEventListener('click', () => { rqState.currentPage++; applyFiltersAndRender(false); });
    $('rq-page-input').addEventListener('change', (e) => { rqState.currentPage = parseInt(e.target.value, 10) || 1; applyFiltersAndRender(false); });

    // Hành động trên bảng
    const tbody = $('rq-table-body');
    tbody.addEventListener('click', (e) => {
        const excel = e.target.closest('.rq-act-excel');
        if (excel) {
            e.stopPropagation();
            exportSingleRequestToExcel(excel.dataset.nhom);
            return;
        }
        const edit = e.target.closest('.rq-act-edit');
        if (edit) { openRequestModal(edit.dataset.nhom); return; }
        const del = e.target.closest('.rq-act-del');
        if (del) { deleteRequest(del.dataset.nhom); return; }
    });
    tbody.addEventListener('dblclick', (e) => {
        const tr = e.target.closest('tr[data-nhom]');
        if (tr && !e.target.closest('button')) openRequestModal(tr.dataset.nhom);
    });

    // Đóng popover lọc khi bấm ra ngoài
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.rq-filter-pop') && !e.target.closest('#view-request .col-filter-btn')) closeColumnFilter();
        if (!e.target.closest('#rq-psr-wrap')) hidePsrList();
        if (!e.target.closest('#rq-code-suggest') && !e.target.closest('#rq-grid-body input[data-col="code"]')) hideSuggest();
    });

    window.addEventListener('resize', debounce(() => { if (!view.classList.contains('hidden')) renderTableHeader(); }, 200));

    /* ---------- Modal ---------- */
    const modal = $('rq-modal');
    $('rq-modal-close').addEventListener('click', () => closeRequestModal());
    $('rq-modal-cancel').addEventListener('click', () => closeRequestModal());
    $('rq-modal-save').addEventListener('click', saveRequest);
    let downOnBackdrop = false;
    modal.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === modal; });
    modal.addEventListener('click', (e) => { if (downOnBackdrop && e.target === modal) closeRequestModal(); downOnBackdrop = false; });
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isSuggestOpen()) { hideSuggest(); e.stopPropagation(); return; }
            if (!$('rq-psr-list').classList.contains('hidden')) { hidePsrList(); return; }
            closeRequestModal();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveRequest();
        }
    });
    $('rq-modal').querySelector('.overflow-auto#rq-grid-wrap').addEventListener('scroll', hideSuggest);

    $('rq-f-ngay-sd').addEventListener('change', (e) => { if (e.target.value) e.target.classList.remove('border-red-500', 'ring-1', 'ring-red-400'); });

    // PSR combobox
    const psrInput = $('rq-f-psr');
    psrInput.addEventListener('focus', () => renderPsrList(true));
    psrInput.addEventListener('input', () => renderPsrList(false));
    psrInput.addEventListener('keydown', (e) => {
        const list = $('rq-psr-list');
        const items = [...list.querySelectorAll('.rq-psr-item')];
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (list.classList.contains('hidden')) { renderPsrList(true); return; }
            if (!items.length) return;
            psrActive = (psrActive + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items.forEach((it, i) => it.classList.toggle('active', i === psrActive));
            items[psrActive].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (psrActive >= 0 && items[psrActive]) pickPsr(items[psrActive].dataset.value);
            else pickPsr(psrInput.value.trim());
            $('rq-f-ngay-sd').focus();
        } else if (e.key === 'Tab') {
            hidePsrList();
        }
    });
    $('rq-psr-toggle').addEventListener('click', () => {
        if ($('rq-psr-list').classList.contains('hidden')) { renderPsrList(true); psrInput.focus(); } else hidePsrList();
    });
    $('rq-psr-list').addEventListener('mousedown', (e) => {
        const it = e.target.closest('.rq-psr-item');
        if (!it) return;
        e.preventDefault();
        pickPsr(it.dataset.value);
    });

    // Lưới nhập trong modal
    const gridBody = $('rq-grid-body');
    gridBody.addEventListener('input', (e) => {
        const input = e.target.closest('input.rq-cell');
        if (!input) return;
        const i = parseInt(input.dataset.row, 10);
        const col = input.dataset.col;
        if (!gridRows[i] || gridRows[i].isDone) return;
        gridRows[i]._isUserModified = true;
        if (col === 'code') { gridRows[i].code = input.value; showSuggest(input); }
        else gridRows[i].qty = input.value;
        refreshComputed();
    });
    gridBody.addEventListener('focusout', (e) => {
        const input = e.target.closest('input.rq-cell[data-col="code"]');
        if (!input) return;
        const i = parseInt(input.dataset.row, 10);
        if (gridRows[i]?.isDone) return;
        setTimeout(() => {
            resolveCode(i);
            refreshComputed();
            if (suggestState.rowIdx === i && document.activeElement !== input) hideSuggest();
        }, 120);
    });
    gridBody.addEventListener('paste', handleGridPaste);
    gridBody.addEventListener('keydown', (e) => {
        const input = e.target.closest('input.rq-cell');
        if (!input) return;
        const i = parseInt(input.dataset.row, 10);
        const col = input.dataset.col;

        if (col === 'code' && isSuggestOpen()) {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggest(1); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggest(-1); return; }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                pickSuggest(suggestState.active, e.key);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                hideSuggest();
                return;
            }
        }
        if (modalReadOnly) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (col === 'code') {
                if (!gridRows[i]?.isDone) resolveCode(i);
                refreshComputed();
            }
            if (i >= gridRows.length - 1) addRows(1, false);
            // Enter xuống tiếp dòng dưới ở cùng một cột (code -> next code, qty -> next qty)
            focusCell(i + 1, col);
            return;
        } else if (e.key === 'Tab') {
            // Tab mới chuyển ô ngang
            if (col === 'code' && !e.shiftKey) {
                e.preventDefault();
                if (!gridRows[i]?.isDone) resolveCode(i);
                refreshComputed();
                focusCell(i, 'qty');
                return;
            } else if (col === 'qty' && !e.shiftKey) {
                e.preventDefault();
                if (i >= gridRows.length - 1) addRows(1, false);
                focusCell(i + 1, 'code');
                return;
            } else if (col === 'qty' && e.shiftKey) {
                e.preventDefault();
                focusCell(i, 'code');
                return;
            } else if (col === 'code' && e.shiftKey) {
                if (i > 0) {
                    e.preventDefault();
                    focusCell(i - 1, 'qty');
                    return;
                }
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (i >= gridRows.length - 1) addRows(1, false);
            focusCell(i + 1, col);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (i > 0) focusCell(i - 1, col);
        } else if (e.key === 'ArrowRight' && col === 'code' && input.selectionStart === input.value.length) {
            e.preventDefault(); focusCell(i, 'qty');
        } else if (e.key === 'ArrowLeft' && col === 'qty' && input.selectionStart === 0) {
            e.preventDefault(); focusCell(i, 'code');
        } else if (e.key === 'Delete' && e.ctrlKey) {
            e.preventDefault();
            if (gridRows[i]?.isDone) {
                showToast('Mã này đã xuất kho (Done), không thể xóa.', 'warning');
                return;
            }
            gridRows.splice(i, 1);
            if (!gridRows.length) gridRows.push(newRow());
            renderGrid();
            focusCell(Math.min(i, gridRows.length - 1), col);
        }
    });
    gridBody.addEventListener('click', (e) => {
        const del = e.target.closest('.rq-row-del');
        if (!del) return;
        const i = parseInt(del.dataset.row, 10);
        if (gridRows[i]?.isDone) {
            showToast('Mã này đã xuất kho (Done), không thể xóa.', 'warning');
            return;
        }
        gridRows.splice(i, 1);
        if (!gridRows.length) gridRows.push(newRow());
        renderGrid();
    });
    $('rq-grid-add').addEventListener('click', () => addRows(1));
    $('rq-grid-add5').addEventListener('click', () => addRows(5));
    $('rq-grid-clear').addEventListener('click', async () => {
        const editableRows = gridRows.filter(r => !r.isDone);
        if (editableRows.some(r => String(r.code).trim() || String(r.qty).trim())) {
            const ok = await showConfirm('Xóa các dòng vật tư chưa xuất kho?', 'Xóa trống');
            if (!ok) return;
        }
        const doneRows = gridRows.filter(r => r.isDone);
        gridRows = [...doneRows, ...Array.from({ length: Math.max(5, 10 - doneRows.length) }, () => newRow())];
        renderGrid();
        focusCell(doneRows.length, 'code');
    });
}
