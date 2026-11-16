import { sb, currentUser, showLoading, showToast, showConfirm, debounce, renderPagination, sanitizeFileName } from './app.js';

let rawLoanItems = [];
let filteredLoanItems = [];
let timelineStatsMap = new Map(); // key: `${ma_nx}_${ma_vt}_${lot}` -> { count: number, photoCount: number }
let currentTimelineTarget = null;
let selectedNewPhotos = []; // [{ file: File, previewUrl: string, sizeKb: number }]
let isInitialized = false;
let isResizingColumn = false;
let distinctBmsList = [];
let distinctRegionList = [];

// Cấu hình danh sách các cột của Hàng Nợ
const HANG_NO_COLUMNS = [
    { key: 'stt', label: 'STT', defaultWidth: 48, canHide: false },
    { key: 'ma_nx', label: 'Mã DO', defaultWidth: 150, canHide: true, sortable: true },
    { key: 'thoi_gian', label: 'Ngày mượn', defaultWidth: 105, canHide: true, sortable: true },
    { key: 'so_ngay', label: 'Số ngày', defaultWidth: 90, canHide: true, sortable: true },
    { key: 'yeu_cau', label: 'Người mượn', defaultWidth: 150, canHide: true, sortable: true },
    { key: 'ma_vt', label: 'Mã VT', defaultWidth: 110, canHide: true, sortable: true },
    { key: 'ten_vt', label: 'Tên Vật Tư', defaultWidth: 260, canHide: true },
    { key: 'lot', label: 'LOT', defaultWidth: 100, canHide: true },
    { key: 'date', label: 'HSD', defaultWidth: 95, canHide: true },
    { key: 'seri', label: 'Số Seri', defaultWidth: 110, canHide: true, sortable: true },
    { key: 'bms', label: 'BMs', defaultWidth: 95, canHide: true, sortable: true },
    { key: 'region', label: 'Region', defaultWidth: 95, canHide: true, sortable: true },
    { key: 'muc_dich', label: 'Sự kiện / Mục đích', defaultWidth: 240, canHide: true },
    { key: 'nganh', label: 'Ngành', defaultWidth: 85, canHide: true },
    { key: 'xuat', label: 'SL Mượn', defaultWidth: 80, canHide: true },
    { key: 'da_tra', label: 'Đã Trả', defaultWidth: 80, canHide: true },
    { key: 'sl_con_no', label: 'CÒN NỢ', defaultWidth: 90, canHide: false, sortable: true },
    { key: 'nhat_ky', label: 'Nhật ký & Ảnh', defaultWidth: 130, canHide: true }
];

let hangNoFilters = {
    searchTerm: '',
    yeu_cau: [],
    nganh: [],
    sortCol: 'so_ngay',
    sortDir: 'desc',
    currentPage: 1,
    itemsPerPage: 50
};

const DEFAULT_HIDDEN_COLUMNS = ['ma_nx', 'thoi_gian', 'so_ngay', 'yeu_cau', 'muc_dich'];

function getDefaultColumnSettings() {
    const defaults = {};
    HANG_NO_COLUMNS.forEach(c => {
        defaults[c.key] = !DEFAULT_HIDDEN_COLUMNS.includes(c.key);
    });
    return defaults;
}

/**
 * Quản lý Cài đặt hiển thị cột (LocalStorage)
 */
function getHangNoColumnSettings() {
    try {
        const saved = localStorage.getItem('hangNoColumnSettings_v3');
        if (saved) return JSON.parse(saved);
    } catch (e) { }

    // Mặc định: ẩn các cột đã có trên thanh tổng hợp DO
    const defaults = getDefaultColumnSettings();
    saveHangNoColumnSettings(defaults);
    return defaults;
}

function saveHangNoColumnSettings(settings) {
    try {
        localStorage.setItem('hangNoColumnSettings_v3', JSON.stringify(settings));
        localStorage.setItem('hangNoColumnSettings', JSON.stringify(settings));
    } catch (e) { }
}

/**
 * Quản lý Độ rộng cột khi kéo dãn (LocalStorage)
 */
function getHangNoColumnWidths() {
    try {
        const saved = localStorage.getItem('hangNoColumnWidths');
        if (saved) return JSON.parse(saved);
    } catch (e) { }
    const widths = {};
    HANG_NO_COLUMNS.forEach(c => { widths[c.key] = c.defaultWidth; });
    return widths;
}

function saveHangNoColumnWidths(widths) {
    try {
        localStorage.setItem('hangNoColumnWidths', JSON.stringify(widths));
    } catch (e) { }
}

/**
 * Tính toán độ rộng hiệu dụng của các cột:
 * Nếu người dùng ẩn nhiều cột khiến tổng độ rộng nhỏ hơn chiều rộng màn hình,
 * tự động phân bổ đều để bảng luôn lấp đầy 100% bên phải, không bị khoảng trống.
 */
function getEffectiveColumnWidths(visibleCols) {
    const table = document.getElementById('hang-no-main-table');
    const container = table?.parentElement;
    const containerWidth = container ? container.clientWidth : 0;
    const colWidths = getHangNoColumnWidths();

    let rawTotal = 0;
    visibleCols.forEach(col => {
        rawTotal += (colWidths[col.key] || col.defaultWidth);
    });

    const effective = {};
    if (containerWidth > rawTotal && rawTotal > 0) {
        const scale = containerWidth / rawTotal;
        let runningTotal = 0;
        visibleCols.forEach((col, idx) => {
            const baseW = colWidths[col.key] || col.defaultWidth;
            if (idx === visibleCols.length - 1) {
                effective[col.key] = Math.max(baseW, containerWidth - runningTotal);
            } else {
                const scaled = Math.round(baseW * scale);
                effective[col.key] = scaled;
                runningTotal += scaled;
            }
        });
        return { widths: effective, totalWidth: containerWidth, isFullWidth: true };
    } else {
        visibleCols.forEach(col => {
            effective[col.key] = colWidths[col.key] || col.defaultWidth;
        });
        return { widths: effective, totalWidth: rawTotal, isFullWidth: false };
    }
}

/**
 * Loại bỏ dấu tiếng Việt để tìm kiếm không phụ thuộc dấu
 */
function removeVietnameseTones(str) {
    if (!str) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, m => (m === 'đ' ? 'd' : 'D'))
        .toLowerCase()
        .trim();
}

function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatDateTimeVN(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${hours}:${mins} - ${day}/${month}/${year}`;
}

/**
 * Nén ảnh phía client (Canvas) để tối ưu dung lượng trên di động
 */
async function compressImageFile(file, maxWidth = 1600, maxHeight = 1600, quality = 0.8) {
    return new Promise((resolve) => {
        if (!file || !file.type.startsWith('image/')) return resolve(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) return resolve(file);
                        const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

const VIEW_HTML = `
    <div class="flex flex-col h-full overflow-hidden p-2 md:p-4 bg-gray-50">
        <!-- Top KPI summary cards & Toolbar -->
        <div class="flex-shrink-0 flex flex-col gap-3 mb-3">
            <!-- KPI Cards: 4 ô thống kê -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                <div class="bg-white border border-gray-200 rounded-lg p-3 shadow-xs flex items-center justify-between">
                    <div>
                        <div class="text-[11px] md:text-xs text-gray-500 font-medium uppercase">Số dòng nợ</div>
                        <div id="hn-stat-rows" class="text-base md:text-2xl font-bold text-gray-800 mt-0.5">0</div>
                    </div>
                    <div class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                        </svg>
                    </div>
                </div>

                <div class="bg-white border border-gray-200 rounded-lg p-3 shadow-xs flex items-center justify-between">
                    <div>
                        <div class="text-[11px] md:text-xs text-gray-500 font-medium uppercase">Tổng SL còn nợ</div>
                        <div id="hn-stat-qty" class="text-base md:text-2xl font-bold text-red-600 mt-0.5">0</div>
                    </div>
                    <div class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
                        </svg>
                    </div>
                </div>

                <div class="bg-white border border-gray-200 rounded-lg p-3 shadow-xs flex items-center justify-between">
                    <div>
                        <div class="text-[11px] md:text-xs text-gray-500 font-medium uppercase">SL Đã gia hạn</div>
                        <div id="hn-stat-extended" class="text-base md:text-2xl font-bold text-amber-600 mt-0.5">0</div>
                    </div>
                    <div class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                </div>

                <div class="bg-white border border-gray-200 rounded-lg p-3 shadow-xs flex items-center justify-between">
                    <div>
                        <div class="text-[11px] md:text-xs text-gray-500 font-medium uppercase">Người đang mượn</div>
                        <div id="hn-stat-borrowers" class="text-base md:text-2xl font-bold text-gray-800 mt-0.5">0</div>
                    </div>
                    <div class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                        </svg>
                    </div>
                </div>
            </div>

            <!-- Toolbar Search & Actions theo chuẩn chung của App -->
            <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-gray-200 shadow-xs">
                <!-- Search input -->
                <div class="relative flex-grow max-w-md">
                    <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                    </span>
                    <input type="text" id="hang-no-search" placeholder="Tìm theo Mã DO, người mượn, mã VT, tên VT, lot..." 
                        class="w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded-md text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
                    <button id="hang-no-search-clear" class="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 hover:text-gray-600 hidden">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
                        </svg>
                    </button>
                </div>

                <!-- Filters & Action buttons dạng chuẩn chung của app -->
                <div class="flex items-center gap-2 flex-wrap">
                    <button id="hang-no-filter-yeu-cau-btn" class="px-2.5 py-1.5 text-xs font-medium border border-gray-300 rounded-md bg-white hover:bg-gray-50 flex items-center gap-1.5 text-gray-700">
                        <span>Người mượn</span>
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>

                    <button id="hang-no-filter-nganh-btn" class="px-2.5 py-1.5 text-xs font-medium border border-gray-300 rounded-md bg-white hover:bg-gray-50 flex items-center gap-1.5 text-gray-700">
                        <span>Ngành</span>
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>

                    <button type="button" id="hang-no-reset-filters"
                        class="btn-toolbar-secondary btn-clear-filter inline-flex items-center justify-center gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex-shrink-0"
                        title="Xóa toàn bộ bộ lọc & tìm kiếm">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z">
                            </path>
                            <line x1="18" y1="6" x2="6" y2="18" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"></line>
                        </svg>
                        <span class="hidden md:inline whitespace-nowrap">Xóa Lọc</span>
                    </button>

                    <button type="button" id="hang-no-col-settings-btn"
                        class="btn-toolbar-outline inline-flex items-center justify-center gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex-shrink-0"
                        title="Tùy chỉnh ẩn/hiển các cột">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"></path>
                        </svg>
                        <span class="hidden md:inline whitespace-nowrap">Cài Đặt Cột</span>
                    </button>

                    <button type="button" id="hang-no-btn-excel"
                        class="btn-toolbar-excel btn-excel-export inline-flex items-center justify-center gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex-shrink-0"
                        title="Xuất file Excel (.xlsx)">
                        <svg class="excel-btn-icon w-3.5 h-3.5 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-5.5-7.5l2.4 3.6h-1.6l-1.7-2.7-1.7 2.7H8.8l2.4-3.6-2.3-3.4h1.6l1.6 2.5 1.6-2.5h1.6l-2.3 3.4z" />
                        </svg>
                        <span class="hidden md:inline whitespace-nowrap">Xuất Excel</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- Table Container (Hỗ trợ trượt ngang và kéo dãn cột) -->
        <div class="flex-grow overflow-auto bg-white border border-gray-200 rounded-lg shadow-xs relative no-scrollbar">
            <table id="hang-no-main-table" class="border-collapse text-left min-w-full table-fixed" style="width: 100%;">
                <thead id="hang-no-table-head" class="bg-gray-100 text-gray-700 uppercase text-[11px] font-semibold sticky top-0 z-10 border-b border-gray-300 shadow-[0_1px_2px_rgba(0,0,0,0.05)] select-none">
                    <!-- Sẽ render động các thẻ TH có gắn class col-resizer và kích thước -->
                </thead>
                <tbody id="hang-no-table-body" class="divide-y divide-gray-200 text-xs text-gray-800">
                    <tr>
                        <td colspan="15" class="p-8 text-center text-gray-500">Đang tải dữ liệu...</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Pagination Footer -->
        <div class="flex-shrink-0 flex flex-wrap items-center justify-between gap-2 mt-3 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-xs text-xs">
            <div id="hang-no-pagination-info" class="text-gray-500 font-medium">Đang tải...</div>

            <div class="flex items-center gap-2">
                <div class="flex items-center gap-1">
                    <span class="text-gray-500">Hiển thị:</span>
                    <select id="hang-no-items-per-page" class="border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none">
                        <option value="25">25</option>
                        <option value="50" selected>50</option>
                        <option value="100">100</option>
                        <option value="200">200</option>
                    </select>
                </div>

                <div class="flex items-center gap-1">
                    <button id="hang-no-prev-page" class="p-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                    </button>
                    <div class="flex items-center gap-1 px-1">
                        <input type="number" id="hang-no-page-input" min="1" value="1" class="w-12 text-center border border-gray-300 rounded py-0.5 text-xs">
                        <span id="hang-no-total-pages" class="text-gray-500">/ 1</span>
                    </div>
                    <button id="hang-no-next-page" class="p-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                </div>
            </div>
        </div>
    </div>
`;

const TIMELINE_AND_SETTINGS_MODAL_HTML = `
    <!-- Modal Cài đặt hiển thị cột (giống View Chi Tiết) -->
    <div id="hang-no-settings-modal" class="hidden fixed inset-0 z-[130] flex items-center justify-center modal-backdrop bg-black/50 p-4 select-none">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
            <div class="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div>
                    <h3 class="text-sm font-bold text-gray-800 uppercase tracking-wide">Cài đặt hiển thị cột</h3>
                    <p class="text-xs text-gray-500 mt-0.5">Bật / tắt các cột theo nhu cầu trên màn hình máy tính.</p>
                </div>
                <button type="button" id="hn-settings-close-x" class="text-gray-400 hover:text-gray-600 text-lg p-1">✕</button>
            </div>
            <div class="p-4 overflow-y-auto max-h-[60vh] space-y-2">
                <div id="hn-column-toggles" class="space-y-1.5"></div>
            </div>
            <div class="p-3 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                <button type="button" id="hn-settings-reset-btn" class="text-xs text-gray-500 hover:text-blue-600 underline">Khôi phục mặc định</button>
                <button type="button" id="hn-settings-done-btn" class="px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold shadow-xs">Hoàn tất</button>
            </div>
        </div>
    </div>

    <!-- Modal Timeline & Upload ảnh tối ưu Mobile (CHỈ CÒN 2 MỐC: GIA HẠN VÀ BÁO TRẢ) -->
    <div id="hang-no-timeline-modal" class="hidden fixed inset-0 z-[120] flex items-end md:items-center justify-center modal-backdrop bg-black/60 p-0 md:p-4 select-none">
        <div class="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-xl max-h-[92vh] md:max-h-[85vh] flex flex-col overflow-hidden">
            <!-- Header -->
            <div class="p-3 md:p-4 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-3 flex-shrink-0">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs md:text-sm font-bold text-gray-800 uppercase tracking-wide">Nhật ký hàng mượn</span>
                        <span id="hn-tl-badge-dono" class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-100 text-blue-700"></span>
                    </div>
                    <div id="hn-tl-item-summary" class="text-[11px] md:text-xs text-gray-600 mt-1 truncate"></div>
                </div>
                <button type="button" id="hn-tl-modal-close" class="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <!-- Scrollable Content -->
            <div class="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 no-scrollbar">
                <!-- Form Add Entry (Chỉ 2 mốc: Gia hạn & Báo trả, kèm Seri/BMs/Region) -->
                <div class="bg-gray-50 border border-gray-200 rounded-xl p-3 md:p-4">
                    <div class="text-xs font-bold text-gray-800 uppercase mb-2.5">Cập nhật thông tin & mốc thời gian</div>

                    <div class="space-y-3">
                        <!-- 3 trường bổ sung: Seri, BMs, Region -->
                        <div>
                            <label class="block text-[11px] font-semibold text-gray-700 mb-0.5">Số Seri</label>
                            <input type="text" id="hn-tl-seri" placeholder="Nhập số Seri..." 
                                class="w-full text-xs p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400 font-mono">
                        </div>
                        <!-- BMs & Region (Nằm chung 1 hàng trên cả điện thoại và máy tính) -->
                        <div class="grid grid-cols-2 gap-2">
                            <div class="relative">
                                <label class="block text-[11px] font-semibold text-gray-700 mb-0.5">BMs</label>
                                <div class="relative">
                                    <input type="text" id="hn-tl-bms" placeholder="Nhập / chọn BMs..." autocomplete="off"
                                        class="w-full text-xs p-2 pr-7 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400">
                                    <button type="button" id="hn-tl-bms-toggle" tabindex="-1" class="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded">
                                        <svg class="w-3.5 h-3.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </button>
                                </div>
                                <div id="hn-tl-bms-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto no-scrollbar divide-y divide-gray-100"></div>
                            </div>
                            <div class="relative">
                                <label class="block text-[11px] font-semibold text-gray-700 mb-0.5">Region</label>
                                <div class="relative">
                                    <input type="text" id="hn-tl-region" placeholder="Nhập / chọn Region..." autocomplete="off"
                                        class="w-full text-xs p-2 pr-7 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400">
                                    <button type="button" id="hn-tl-region-toggle" tabindex="-1" class="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded">
                                        <svg class="w-3.5 h-3.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </button>
                                </div>
                                <div id="hn-tl-region-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto no-scrollbar divide-y divide-gray-100"></div>
                            </div>
                        </div>

                        <!-- Chỉ 2 mốc: Gia hạn & Báo trả, không dùng emoji -->
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <label class="flex items-center justify-center gap-2 p-2 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-400 font-semibold text-gray-700 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700 transition-all">
                                <input type="radio" name="hn-moc-type" value="gia_han" checked class="text-blue-600 focus:ring-0">
                                <span>Gia hạn mượn</span>
                            </label>
                            <label class="flex items-center justify-center gap-2 p-2 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-400 font-semibold text-gray-700 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700 transition-all">
                                <input type="radio" name="hn-moc-type" value="tra_hang" class="text-blue-600 focus:ring-0">
                                <span>Báo trả hàng</span>
                            </label>
                        </div>

                        <!-- Note input -->
                        <div>
                            <textarea id="hn-tl-note" rows="2" placeholder="Ghi chú (lý do gia hạn, tình trạng hàng hiện tại, ngày dự kiến trả...)"
                                class="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400"></textarea>
                        </div>

                        <!-- Photo upload buttons (Hỗ trợ chụp nhiều lần & chọn nhiều ảnh một lần) -->
                        <div class="flex flex-wrap items-center gap-2">
                            <input type="file" id="hn-camera-input" accept="image/*" capture="environment" multiple class="hidden">
                            <input type="file" id="hn-gallery-input" accept="image/*" multiple class="hidden">

                            <button type="button" id="hn-trigger-camera" class="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-blue-500 hover:text-blue-600 rounded-lg text-xs font-medium text-gray-700 active:scale-95 transition-all shadow-xs">
                                <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                <span>Chụp ảnh</span>
                            </button>

                            <button type="button" id="hn-trigger-gallery" class="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-blue-500 hover:text-blue-600 rounded-lg text-xs font-medium text-gray-700 active:scale-95 transition-all shadow-xs">
                                <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                <span>Chọn ảnh</span>
                            </button>

                            <button type="button" id="hn-save-timeline-btn" class="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95">
                                <span>Lưu thông tin & Mốc</span>
                            </button>
                        </div>

                        <!-- Selected Photos Preview -->
                        <div id="hn-preview-container" class="hidden flex flex-col gap-2 pt-2 border-t border-gray-200"></div>
                    </div>
                </div>

                <!-- Timeline history list -->
                <div>
                    <div class="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Lịch sử mốc thời gian</div>
                    <div id="hn-timeline-list" class="relative pl-6 space-y-4 border-l-2 border-gray-200 ml-3">
                        <div class="text-xs text-gray-400 italic">Đang tải lịch sử...</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Lightbox Modal for Fullscreen Image Viewing -->
    <div id="hang-no-lightbox-modal" class="hidden fixed inset-0 z-[150] bg-black/95 flex flex-col items-center justify-center p-2 select-none">
        <div class="absolute top-3 right-3 flex items-center gap-3 z-10">
            <a id="hn-lightbox-download" href="#" target="_blank" download class="p-2 text-white/80 hover:text-white bg-white/10 rounded-full hover:bg-white/20 transition-colors" title="Mở ảnh gốc">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            </a>
            <button type="button" id="hn-lightbox-close" class="p-2 text-white/80 hover:text-white bg-white/10 rounded-full hover:bg-white/20 transition-colors" title="Đóng">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <div class="max-w-full max-h-[85vh] flex items-center justify-center p-2">
            <img id="hn-lightbox-img" src="" alt="Full view" class="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl">
        </div>
        <div id="hn-lightbox-caption" class="text-white/80 text-xs text-center mt-2 px-4 max-w-lg"></div>
    </div>

    <!-- Modal Cập nhật & Xác nhận bàn giao theo Đơn DO (2 Tab: Cập nhật DO & Xác nhận PDF) -->
    <div id="hang-no-batch-modal" class="hidden fixed inset-0 z-[125] flex items-end md:items-center justify-center modal-backdrop bg-black/60 p-0 md:p-4 select-none">
        <div class="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-4xl max-h-[96vh] md:max-h-[92vh] flex flex-col overflow-hidden">
            <!-- Header with 2 Tabs -->
            <div class="p-2.5 md:p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2 flex-shrink-0">
                <div class="flex items-center gap-1.5 md:gap-2">
                    <button type="button" id="hn-batch-tab-update"
                        class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-blue-600 text-white border-blue-600 shadow-2xs flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        <span>1. Cập nhật chung DO</span>
                    </button>
                    <button type="button" id="hn-batch-tab-confirm"
                        class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-white text-gray-700 border-gray-300 hover:bg-gray-100 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <span>2. Xác nhận</span>
                    </button>
                </div>
                <button type="button" id="hn-batch-modal-close" class="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <!-- PHẦN 1: CẬP NHẬT CHUNG DO -->
            <div id="hn-batch-panel-update" class="flex-1 flex flex-col min-h-0 overflow-hidden">
                <!-- Scrollable Content -->
                <div class="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 no-scrollbar">
                    <!-- PHẦN CHUNG Ở TRÊN -->
                    <div class="bg-gray-50 border border-gray-200 rounded-xl p-3 md:p-4 space-y-3">
                        <!-- Badge thông tin đơn DO -->
                        <div id="hn-batch-do-summary" class="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex flex-wrap items-center justify-between gap-2"></div>

                        <!-- BMs & Region (Nằm chung 1 hàng trên cả điện thoại và máy tính) -->
                        <div class="grid grid-cols-2 gap-2">
                            <!-- BMs Combobox -->
                            <div class="relative">
                                <label class="block text-[11px] font-semibold text-gray-700 mb-0.5">BMs</label>
                                <div class="relative">
                                    <input type="text" id="hn-batch-bms" placeholder="Nhập / chọn BMs..." autocomplete="off"
                                        class="w-full text-xs p-2 pr-7 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400">
                                    <button type="button" id="hn-batch-bms-toggle" tabindex="-1" class="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded">
                                        <svg class="w-3.5 h-3.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </button>
                                </div>
                                <div id="hn-batch-bms-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto no-scrollbar divide-y divide-gray-100"></div>
                            </div>

                            <!-- Region Combobox -->
                            <div class="relative">
                                <label class="block text-[11px] font-semibold text-gray-700 mb-0.5">Region</label>
                                <div class="relative">
                                    <input type="text" id="hn-batch-region" placeholder="Nhập / chọn Region..." autocomplete="off"
                                        class="w-full text-xs p-2 pr-7 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400">
                                    <button type="button" id="hn-batch-region-toggle" tabindex="-1" class="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded">
                                        <svg class="w-3.5 h-3.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </button>
                                </div>
                                <div id="hn-batch-region-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto no-scrollbar divide-y divide-gray-100"></div>
                            </div>
                        </div>

                        <!-- 2 mốc: Gia hạn & Báo trả -->
                        <div>
                            <label class="block text-[11px] font-semibold text-gray-700 mb-1">Mốc thời gian</label>
                            <div class="grid grid-cols-2 gap-2 text-xs">
                                <label class="flex items-center justify-center gap-2 p-2 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-400 font-semibold text-gray-700 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700 transition-all">
                                    <input type="radio" name="hn-batch-moc-type" value="gia_han" checked class="text-blue-600 focus:ring-0">
                                    <span>Gia hạn mượn</span>
                                </label>
                                <label class="flex items-center justify-center gap-2 p-2 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-400 font-semibold text-gray-700 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700 transition-all">
                                    <input type="radio" name="hn-batch-moc-type" value="tra_hang" class="text-blue-600 focus:ring-0">
                                    <span>Báo trả hàng</span>
                                </label>
                            </div>
                        </div>

                        <!-- Ghi chú -->
                        <div>
                            <label class="block text-[11px] font-semibold text-gray-700 mb-0.5">Ghi chú</label>
                            <textarea id="hn-batch-note" rows="2" placeholder="Ghi chú (lý do gia hạn, ngày dự kiến trả...)"
                                class="w-full text-xs p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400"></textarea>
                        </div>
                    </div>

                    <!-- PHẦN DANH SÁCH SẢN PHẨM Ở DƯỚI (PHÂN BỔ SERI & ẢNH RIÊNG) -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold text-gray-800 uppercase tracking-wider">Danh sách sản phẩm thuộc đơn DO</span>
                            <span id="hn-batch-item-count" class="text-xs text-gray-500 font-medium">0 sản phẩm</span>
                        </div>

                        <div id="hn-batch-products-list" class="space-y-3">
                            <div class="p-6 text-center text-xs text-gray-400 italic bg-gray-50 border border-dashed border-gray-300 rounded-xl">
                                Đang tải sản phẩm...
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer Tab 1 -->
                <div class="p-3 md:p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-2 flex-shrink-0">
                    <button type="button" id="hn-batch-modal-cancel" class="px-4 py-2 border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition-colors">
                        Đóng
                    </button>
                    <button type="button" id="hn-batch-save-btn" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        <span>Lưu tất cả sản phẩm của DO</span>
                    </button>
                </div>
            </div>

            <!-- PHẦN 2: XÁC NHẬN BÀN GIAO (BIỂU MẪU GEN11 TRACKING) -->
            <div id="hn-batch-panel-confirm" class="hidden flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-100">
                <!-- Toolbar cấu hình form xác nhận -->
                <div class="p-3 md:p-3.5 bg-white border-b border-gray-200 flex-shrink-0 space-y-2.5">
                    <!-- Chọn sản phẩm đưa vào biểu mẫu -->
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Chọn sản phẩm đưa vào biểu mẫu:</span>
                            <button type="button" id="hn-confirm-toggle-all-products" class="text-xs text-blue-600 hover:underline font-semibold">Chọn tất cả</button>
                        </div>
                        <div id="hn-confirm-products-checklist" class="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-1.5 bg-gray-50 rounded-lg border border-gray-200">
                            <!-- Sẽ render các checkbox sản phẩm -->
                        </div>
                    </div>

                    <!-- Thêm người ký PSRs & BM -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-gray-100">
                        <!-- PSRs (Ngành EES) -->
                        <div>
                            <label class="block text-[11px] font-semibold text-gray-700 mb-1">Thêm người ký (PSRs - Ngành EES):</label>
                            <div class="flex items-center gap-1.5">
                                <div class="relative flex-1">
                                    <input type="text" id="hn-confirm-psr-input" placeholder="Chọn hoặc nhập tên nhân viên EES..." autocomplete="off"
                                        class="w-full text-xs p-2 pr-7 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400">
                                    <button type="button" id="hn-confirm-psr-toggle" tabindex="-1" class="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded">
                                        <svg class="w-3.5 h-3.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </button>
                                    <div id="hn-confirm-psr-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto no-scrollbar divide-y divide-gray-100"></div>
                                </div>
                                <button type="button" id="hn-confirm-add-psr-btn" class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs active:scale-95 flex-shrink-0">
                                    + Thêm
                                </button>
                            </div>
                            <div id="hn-confirm-psr-tags" class="flex flex-wrap gap-1.5 mt-1.5 min-h-[24px]"></div>
                        </div>

                        <!-- Người ký BM & 2 Nút In / Xuất PDF -->
                        <div class="flex flex-col justify-between">
                            <div>
                                <label class="block text-[11px] font-semibold text-gray-700 mb-1">Người ký BM:</label>
                                <input type="text" id="hn-confirm-bm-input" placeholder="Nhập tên BM ký duyệt..."
                                    class="w-full text-xs p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400">
                            </div>
                            <div class="flex items-center justify-end gap-2 mt-2">
                                <button type="button" id="hn-confirm-print-btn" class="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 active:scale-95">
                                    <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                    <span>In biểu mẫu</span>
                                </button>
                                <button type="button" id="hn-confirm-export-pdf" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 active:scale-95">
                                    <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-5.5-7.5l2.4 3.6h-1.6l-1.7-2.7-1.7 2.7H8.8l2.4-3.6-2.3-3.4h1.6l1.6 2.5 1.6-2.5h1.6l-2.3 3.4z"/>
                                    </svg>
                                    <span>Xuất PDF</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Preview Vùng in / xuất PDF Biểu mẫu chuẩn -->
                <div class="flex-1 overflow-y-auto p-3 md:p-6 no-scrollbar flex justify-center">
                    <div id="hn-confirm-document-root" class="w-full max-w-[760px] bg-white p-6 md:p-8 rounded shadow-sm border border-gray-200 text-slate-800" style="font-family: Arial, Helvetica, sans-serif; box-sizing: border-box;">
                        <!-- Banner tiêu đề -->
                        <div style="background-color: #0e2e47; color: #ffffff; padding: 12px 16px; text-align: center; font-size: 18px; font-weight: 700; letter-spacing: 0.5px; border-radius: 2px 2px 0 0;">
                            GEN11 | Demo Unit Tracking
                        </div>

                        <!-- Bảng dữ liệu: Serial Number | BMs | PSRs | Regions -->
                        <table style="width: 100%; border-collapse: collapse; margin-top: 0; border: 1px solid #14555f;">
                            <thead>
                                <tr style="background-color: #1d7380; color: #ffffff; text-align: center; font-weight: 700; font-size: 13px;">
                                    <th style="padding: 10px 8px; border: 1px solid #14555f; width: 30%;">Serial Number</th>
                                    <th style="padding: 10px 8px; border: 1px solid #14555f; width: 22%;">BMs</th>
                                    <th style="padding: 10px 8px; border: 1px solid #14555f; width: 26%;">PSRs</th>
                                    <th style="padding: 10px 8px; border: 1px solid #14555f; width: 22%;">Regions</th>
                                </tr>
                            </thead>
                            <tbody id="hn-confirm-table-body">
                                <!-- Dữ liệu hàng sẽ render động -->
                            </tbody>
                        </table>

                        <!-- Banner chữ ký: SIGNATURE APPROVALS -->
                        <div style="background-color: #0e2e47; color: #ffffff; padding: 8px 16px; text-align: center; font-size: 13px; font-weight: 700; margin-top: 36px; letter-spacing: 0.5px;">
                            SIGNATURE APPROVALS
                        </div>

                        <!-- Khung chữ ký (Grid 2 cột theo đúng mẫu) -->
                        <div id="hn-confirm-signatures-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px;">
                            <!-- Sẽ render động các ô PSR & BM -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
`;

/**
 * Tính toán nợ hàng từ chi_tiet
 */
function calculateHangNoData(exports, imports) {
    const doReturnMap = new Map();
    const fallbackReturnList = [];

    const doRegex = /(DO-\d{4}-[A-Za-z0-9_.-]+)/i;

    imports.forEach(imp => {
        const nhapVal = Number(imp.nhap) || 0;
        if (nhapVal <= 0) return;

        const maVt = (imp.ma_vt || '').trim();
        const lot = (imp.lot || '').trim();
        const mucDich = (imp.muc_dich || '').trim();
        const yeuCau = (imp.yeu_cau || '').trim();
        const impTime = imp.thoi_gian ? new Date(imp.thoi_gian).getTime() : 0;

        const match = mucDich.match(doRegex);
        if (match) {
            const doCode = match[1].toUpperCase();
            const key = `${doCode}_${maVt}_${lot}`;
            doReturnMap.set(key, (doReturnMap.get(key) || 0) + nhapVal);
        } else {
            const mdLower = mucDich.toLowerCase();
            if (mdLower.includes('trả') || mdLower.includes('tra ')) {
                fallbackReturnList.push({
                    yeu_cau: yeuCau,
                    ma_vt: maVt,
                    lot: lot,
                    nhap: nhapVal,
                    remaining: nhapVal,
                    thoi_gian: impTime
                });
            }
        }
    });

    const activeDebts = [];
    const now = Date.now();

    exports.forEach(exp => {
        const xuatVal = Number(exp.xuat) || 0;
        if (xuatVal <= 0) return;

        const maNx = (exp.ma_nx || '').trim().toUpperCase();
        if (!maNx || maNx.endsWith('-')) return;

        const maVt = (exp.ma_vt || '').trim();
        const lot = (exp.lot || '').trim();
        const yeuCau = (exp.yeu_cau || '').trim();
        const loanTime = exp.thoi_gian ? new Date(exp.thoi_gian).getTime() : 0;

        let daTra = 0;

        const explicitKey = `${maNx}_${maVt}_${lot}`;
        if (doReturnMap.has(explicitKey)) {
            const availableReturn = doReturnMap.get(explicitKey);
            const needed = xuatVal - daTra;
            const deduct = Math.min(availableReturn, needed);
            daTra += deduct;
            const rest = availableReturn - deduct;
            if (rest > 0) {
                doReturnMap.set(explicitKey, rest);
            } else {
                doReturnMap.delete(explicitKey);
            }
        }

        if (daTra < xuatVal && yeuCau) {
            for (const ret of fallbackReturnList) {
                if (ret.remaining > 0 &&
                    ret.yeu_cau.toLowerCase() === yeuCau.toLowerCase() &&
                    ret.ma_vt === maVt &&
                    ret.lot === lot &&
                    ret.thoi_gian >= loanTime) {
                    const needed = xuatVal - daTra;
                    const deduct = Math.min(ret.remaining, needed);
                    daTra += deduct;
                    ret.remaining -= deduct;
                    if (daTra >= xuatVal) break;
                }
            }
        }

        const slConNo = xuatVal - daTra;
        if (slConNo > 0) {
            const diffDays = Math.max(0, Math.floor((now - (loanTime || now)) / (1000 * 60 * 60 * 24)));

            activeDebts.push({
                id: exp.id,
                ma_kho: exp.ma_kho || '',
                ma_nx: exp.ma_nx || '',
                thoi_gian: exp.thoi_gian || '',
                so_ngay: diffDays,
                yeu_cau: exp.yeu_cau || '',
                seri: '',
                bms: '',
                region: '',
                muc_dich: exp.muc_dich || '',
                ma_vt: exp.ma_vt || '',
                ten_vt: exp.ten_vt || '',
                lot: exp.lot || '',
                date: exp.date || '',
                nganh: exp.nganh || '',
                phu_trach: exp.phu_trach || '',
                xuat: xuatVal,
                da_tra: daTra,
                sl_con_no: slConNo
            });
        }
    });

    return activeDebts;
}

/**
 * Tải số liệu thống kê mốc thời gian để hiện badge lên từng dòng của bảng
 */
async function loadTimelineStats() {
    try {
        const { data, error } = await sb.from('hang_no_timeline').select('ma_nx, ma_vt, lot, loai_moc, hinh_anh');
        if (error) {
            console.warn('Lỗi tải timeline stats:', error);
            return;
        }

        timelineStatsMap.clear();
        (data || []).forEach(row => {
            const key = `${row.ma_nx}_${row.ma_vt}_${row.lot || ''}`.toUpperCase();
            const curr = timelineStatsMap.get(key) || { count: 0, photoCount: 0, hasGiaHan: false, hasTraHang: false };
            curr.count += 1;
            if (row.loai_moc === 'gia_han') {
                curr.hasGiaHan = true;
            } else if (row.loai_moc === 'tra_hang') {
                curr.hasTraHang = true;
            }
            const imgs = Array.isArray(row.hinh_anh) ? row.hinh_anh : [];
            curr.photoCount += imgs.length;
            timelineStatsMap.set(key, curr);
        });
    } catch (e) {
        console.warn('Lỗi loadTimelineStats:', e);
    }
}

/**
 * Phân quyền hiển thị dữ liệu Hàng Nợ theo vai trò người dùng:
 * - Admin: Thấy toàn bộ dữ liệu (full).
 * - User: Thấy của ngành mình đang theo dõi (xem_data) + dòng do chính mình mượn.
 * - View (hoặc các vai trò khác): Chỉ thấy được những dòng có tên người mượn giống của mình.
 */
function applyRolePermissionFilter(items) {
    if (!currentUser) return items;
    const role = (currentUser.phan_quyen || '').trim().toLowerCase();

    // Admin: Thấy toàn bộ (full)
    if (role === 'admin') {
        return items;
    }

    const myName = (currentUser.ho_ten || '').trim().toLowerCase();

    // User: Thấy của ngành mình đang theo dõi (xem_data) + các dòng do chính mình mượn
    if (role === 'user') {
        const allowedNganh = (currentUser.xem_data || '')
            .split(',')
            .map(n => n.trim().toLowerCase())
            .filter(Boolean);

        return items.filter(item => {
            const itemBorrower = (item.yeu_cau || '').trim().toLowerCase();
            const itemNganh = (item.nganh || '').trim().toLowerCase();
            const isMyLoan = Boolean(myName && itemBorrower === myName);
            const isMyNganh = Boolean(allowedNganh.length > 0 && allowedNganh.includes(itemNganh));
            return isMyLoan || isMyNganh;
        });
    }

    // View: Chỉ thấy được những dòng có tên người mượn giống của mình
    return items.filter(item => {
        const itemBorrower = (item.yeu_cau || '').trim().toLowerCase();
        return Boolean(myName && itemBorrower === myName);
    });
}

/**
 * Lấy dữ liệu và tính toán
 */
export async function fetchHangNo(page = 1, isBackground = false) {
    if (!isBackground) showLoading(true);

    try {
        const expPromise = sb.from('chi_tiet')
            .select('id, ma_kho, ma_nx, thoi_gian, ma_vach, ma_vt, ten_vt, lot, date, xuat, loai, yeu_cau, muc_dich, nganh, phu_trach')
            .eq('loai', 'Trưng Bày')
            .gt('xuat', 0)
            .not('ma_nx', 'like', '%-')
            .not('ma_nx', 'is', null)
            .order('thoi_gian', { ascending: true });

        const impPromise = sb.from('chi_tiet')
            .select('id, ma_nx, thoi_gian, ma_vt, ten_vt, lot, nhap, loai, yeu_cau, muc_dich, nganh')
            .gt('nhap', 0)
            .order('thoi_gian', { ascending: true });

        const timelineStatsPromise = loadTimelineStats();
        const infoPromise = sb.from('hang_no_info').select('ma_nx, ma_vt, lot, seri, bms, region');
        const eesStaffPromise = fetchEesStaffList();

        const [expRes, impRes, , infoRes] = await Promise.all([expPromise, impPromise, timelineStatsPromise, infoPromise, eesStaffPromise]);

        if (expRes.error) throw expRes.error;
        if (impRes.error) throw impRes.error;

        const debts = calculateHangNoData(expRes.data || [], impRes.data || []);

        // Gắn dữ liệu Seri, BMs, Region từ bảng hang_no_info
        if (infoRes && !infoRes.error && Array.isArray(infoRes.data)) {
            const infoMap = new Map();
            infoRes.data.forEach(row => {
                const key = `${row.ma_nx}_${row.ma_vt}_${row.lot || ''}`.toUpperCase();
                infoMap.set(key, row);
            });

            debts.forEach(item => {
                const key = `${item.ma_nx}_${item.ma_vt}_${item.lot || ''}`.toUpperCase();
                const matchedInfo = infoMap.get(key);
                if (matchedInfo) {
                    item.seri = matchedInfo.seri || '';
                    item.bms = matchedInfo.bms || '';
                    item.region = matchedInfo.region || '';
                }
            });
        }

        // Phân quyền dữ liệu theo vai trò (View / User / Admin)
        rawLoanItems = applyRolePermissionFilter(debts);
        updateDistinctBmsAndRegion(infoRes?.data || []);
        hangNoFilters.currentPage = page;

        applyFiltersAndRender();
    } catch (error) {
        console.error('Lỗi tải dữ liệu Hàng Nợ:', error);
        showToast('Lỗi tải dữ liệu Hàng Nợ: ' + (error.message || error), 'error');
        const tbody = document.getElementById('hang-no-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="15" class="p-8 text-center text-red-500">Lỗi: ${error.message || 'Không thể tải dữ liệu'}</td></tr>`;
        }
    } finally {
        if (!isBackground) showLoading(false);
    }
}

/**
 * Render Header của Bảng (Hỗ trợ kéo dãn Resizer và ẩn/hiện cột)
 */
function renderTableHeader() {
    const thead = document.getElementById('hang-no-table-head');
    if (!thead) return;

    const colSettings = getHangNoColumnSettings();
    const visibleCols = HANG_NO_COLUMNS.filter(c => colSettings[c.key] !== false);
    const { widths: effectiveWidths, totalWidth, isFullWidth } = getEffectiveColumnWidths(visibleCols);

    const thsHtml = visibleCols.map(col => {
        const width = effectiveWidths[col.key] || col.defaultWidth;

        const isSortable = !!col.sortable;
        const isCurrentSort = hangNoFilters.sortCol === col.key;
        const sortIndicator = isCurrentSort
            ? (hangNoFilters.sortDir === 'asc' ? '▲' : '▼')
            : (isSortable ? '↕' : '');
        const sortColor = isCurrentSort ? 'text-blue-600 font-bold' : 'text-gray-400';

        const alignClass = (col.key === 'xuat' || col.key === 'da_tra' || col.key === 'sl_con_no')
            ? 'text-right'
            : (col.key === 'yeu_cau' || col.key === 'muc_dich' || col.key === 'ten_vt' ? 'text-left' : 'text-center');

        const style = isFullWidth
            ? `width: ${width}px; min-width: ${col.defaultWidth}px;`
            : `width: ${width}px; min-width: ${width}px; max-width: ${width}px;`;

        return `
            <th class="relative px-2 py-2.5 ${alignClass} border-r border-gray-300 ${isSortable ? 'cursor-pointer select-none hover:bg-gray-200' : ''}" 
                data-col-key="${col.key}" 
                ${isSortable ? `data-sort="${col.key}"` : ''} 
                style="${style}">
                <div class="flex items-center ${alignClass === 'text-right' ? 'justify-end' : (alignClass === 'text-left' ? 'justify-start' : 'justify-center')} gap-1 truncate pr-1">
                    <span class="truncate">${col.label}</span>
                    ${isSortable ? `<span class="sort-icon text-[10px] ${sortColor}">${sortIndicator}</span>` : ''}
                </div>
                <!-- Vùng nắm kéo dãn cột -->
                <div class="col-resizer" data-col-key="${col.key}" title="Kéo để chỉnh độ rộng cột. Nhấp đúp để khôi phục mặc định"></div>
            </th>
        `;
    }).join('');

    thead.innerHTML = `<tr>${thsHtml}</tr>`;

    // Cập nhật độ rộng bảng
    const table = document.getElementById('hang-no-main-table');
    if (table) {
        if (isFullWidth) {
            table.style.width = '100%';
            table.style.minWidth = '100%';
        } else {
            table.style.width = `${totalWidth}px`;
            table.style.minWidth = `${totalWidth}px`;
        }
    }

    // Gắn sự kiện Sort cho th
    thead.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', (e) => {
            if (e.target.closest('.col-resizer') || isResizingColumn) return;
            const sortKey = th.dataset.sort;
            if (hangNoFilters.sortCol === sortKey) {
                hangNoFilters.sortDir = hangNoFilters.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                hangNoFilters.sortCol = sortKey;
                hangNoFilters.sortDir = (sortKey === 'so_ngay' || sortKey === 'sl_con_no' || sortKey === 'thoi_gian') ? 'desc' : 'asc';
            }
            renderTableHeader();
            applyFiltersAndRender(false);
        });
    });

    // Gắn sự kiện kéo dãn cột (Column Resizer)
    initColumnResizers(thead);
}

/**
 * Xử lý kéo dãn các cột (Column Resizer)
 */
function initColumnResizers(thead) {
    const table = document.getElementById('hang-no-main-table');
    const colWidths = getHangNoColumnWidths();

    thead.querySelectorAll('.col-resizer').forEach(resizer => {
        const colKey = resizer.dataset.colKey;
        const th = resizer.closest('th');

        // Double click: Reset về mặc định
        resizer.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const colDef = HANG_NO_COLUMNS.find(c => c.key === colKey);
            if (!colDef) return;
            colWidths[colKey] = colDef.defaultWidth;
            saveHangNoColumnWidths(colWidths);
            renderTableHeader();
            applyFiltersAndRender(false);
            showToast(`Khôi phục cột "${colDef.label}" về ${colDef.defaultWidth}px`, 'info');
        };

        // Mousedown: Bắt đầu kéo
        resizer.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizingColumn = true;
            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const startX = e.pageX;
            const startWidth = th.getBoundingClientRect().width;
            let finalWidth = startWidth;

            const onMouseMove = (moveEvent) => {
                const diff = moveEvent.pageX - startX;
                finalWidth = Math.max(35, Math.round(startWidth + diff));
                th.style.width = `${finalWidth}px`;
                th.style.minWidth = `${finalWidth}px`;
                th.style.maxWidth = `${finalWidth}px`;
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                resizer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                setTimeout(() => { isResizingColumn = false; }, 50);

                colWidths[colKey] = finalWidth;
                saveHangNoColumnWidths(colWidths);
                renderTableHeader();
                applyFiltersAndRender(false);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
    });
}

/**
 * Lọc, sắp xếp và vẽ dữ liệu
 */
function applyFiltersAndRender(rebuildHeader = true) {
    if (rebuildHeader) {
        renderTableHeader();
    }

    let result = [...rawLoanItems];

    // 1. Tìm kiếm đa năng
    const searchVal = removeVietnameseTones(hangNoFilters.searchTerm);
    if (searchVal) {
        result = result.filter(item => {
            const targetStr = removeVietnameseTones([
                item.ma_nx,
                item.yeu_cau,
                item.seri,
                item.bms,
                item.region,
                item.muc_dich,
                item.ma_vt,
                item.ten_vt,
                item.lot,
                item.nganh,
                item.so_ngay
            ].join(' '));
            return targetStr.includes(searchVal);
        });
    }

    // 2. Lọc theo Người mượn
    if (hangNoFilters.yeu_cau.length > 0) {
        result = result.filter(item => hangNoFilters.yeu_cau.includes(item.yeu_cau));
    }

    // 3. Lọc theo Ngành
    if (hangNoFilters.nganh.length > 0) {
        result = result.filter(item => hangNoFilters.nganh.includes(item.nganh));
    }

    // 4. Cập nhật thẻ KPI Summary
    updateKpiCards(result);

    // 5. Sắp xếp
    const col = hangNoFilters.sortCol;
    const dir = hangNoFilters.sortDir === 'asc' ? 1 : -1;
    result.sort((a, b) => {
        let valA = a[col];
        let valB = b[col];

        if (typeof valA === 'number' && typeof valB === 'number') {
            if (valA !== valB) return (valA - valB) * dir;
        } else {
            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
            const cmp = valA.localeCompare(valB);
            if (cmp !== 0) return cmp * dir;
        }
        // Luôn gom các mã có cùng mã DO (ma_nx) nằm kề nhau
        const doA = String(a.ma_nx || '');
        const doB = String(b.ma_nx || '');
        if (doA !== doB) return doA.localeCompare(doB);
        return String(a.ma_vt || '').localeCompare(String(b.ma_vt || ''));
    });

    filteredLoanItems = result;

    // 6. Phân trang
    const totalItems = filteredLoanItems.length;
    const itemsPerPage = hangNoFilters.itemsPerPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (hangNoFilters.currentPage > totalPages) {
        hangNoFilters.currentPage = totalPages;
    }
    if (hangNoFilters.currentPage < 1) {
        hangNoFilters.currentPage = 1;
    }

    const startIndex = (hangNoFilters.currentPage - 1) * itemsPerPage;
    const pageItems = filteredLoanItems.slice(startIndex, startIndex + itemsPerPage);

    // 7. Render bảng
    renderTableRows(pageItems, startIndex);

    // 8. Render phân trang
    renderPaginationFooter(totalItems, startIndex, Math.min(startIndex + pageItems.length - 1, totalItems - 1), totalPages);

    // 9. Cập nhật nhãn nút lọc
    updateFilterButtonLabels();
}

function updateKpiCards(items) {
    const statRows = document.getElementById('hn-stat-rows');
    const statQty = document.getElementById('hn-stat-qty');
    const statExtended = document.getElementById('hn-stat-extended');
    const statBorrowers = document.getElementById('hn-stat-borrowers');

    if (statRows) statRows.textContent = items.length.toLocaleString('vi-VN');

    const totalQty = items.reduce((sum, item) => sum + (item.sl_con_no || 0), 0);
    if (statQty) statQty.textContent = totalQty.toLocaleString('vi-VN');

    // Đếm tổng số lượng còn nợ đã được gia hạn
    let extendedQty = 0;
    items.forEach(it => {
        const key = `${it.ma_nx}_${it.ma_vt}_${it.lot || ''}`.toUpperCase();
        const stat = timelineStatsMap.get(key);
        if (stat && stat.hasGiaHan) {
            extendedQty += (it.sl_con_no || 0);
        }
    });
    if (statExtended) statExtended.textContent = extendedQty.toLocaleString('vi-VN');

    const uniqueBorrowers = new Set(items.map(item => item.yeu_cau).filter(Boolean)).size;
    if (statBorrowers) statBorrowers.textContent = uniqueBorrowers.toLocaleString('vi-VN');
}

function renderTableRows(items, startIndex) {
    const tbody = document.getElementById('hang-no-table-body');
    if (!tbody) return;

    const colSettings = getHangNoColumnSettings();
    const visibleCols = HANG_NO_COLUMNS.filter(c => colSettings[c.key] !== false);
    const { widths: effectiveWidths, isFullWidth } = getEffectiveColumnWidths(visibleCols);

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${visibleCols.length}" class="p-8 text-center text-gray-500 italic">Không có hàng nợ nào phù hợp.</td></tr>`;
        return;
    }

    // Nhóm các mặt hàng có cùng mã DO (ma_nx) nằm chung với nhau
    const groups = [];
    let currentGroup = null;

    items.forEach((item, idx) => {
        const maNxKey = (item.ma_nx || '').trim().toUpperCase();
        if (!currentGroup || currentGroup.ma_nx_key !== maNxKey) {
            currentGroup = {
                ma_nx_key: maNxKey,
                ma_nx: item.ma_nx,
                yeu_cau: item.yeu_cau,
                thoi_gian: item.thoi_gian,
                so_ngay: item.so_ngay,
                bms: item.bms,
                region: item.region,
                muc_dich: item.muc_dich || '',
                items: []
            };
            groups.push(currentGroup);
        }
        currentGroup.items.push({ item, globalIndex: startIndex + idx });
        if (!currentGroup.bms && item.bms) currentGroup.bms = item.bms;
        if (!currentGroup.region && item.region) currentGroup.region = item.region;
        if (!currentGroup.muc_dich && item.muc_dich) currentGroup.muc_dich = item.muc_dich;
    });

    let html = '';

    groups.forEach(group => {
        const totalGroupDebt = group.items.reduce((sum, g) => sum + (g.item.sl_con_no || 0), 0);
        const groupDate = formatDateToDDMMYYYY(group.thoi_gian);

        // Dòng Tiêu đề nhóm DO (Nằm ở đầu nhóm với nút Cập nhật chung DO và Mục đích mượn)
        html += `
            <tr class="bg-blue-50/70 border-t-2 border-b border-blue-200 select-none">
                <td colspan="${visibleCols.length}" class="px-3 py-1.5">
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                        <div class="flex items-center gap-2 flex-wrap text-xs">
                            <span class="font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">${group.ma_nx}</span>
                            <span class="text-gray-800 font-semibold">Người mượn: <b class="text-gray-900">${group.yeu_cau || '-'}</b></span>
                            <span class="text-gray-400">•</span>
                            <span class="text-gray-600">${groupDate}</span>
                            <span class="text-gray-400">•</span>
                            <span class="px-1.5 py-0.5 rounded text-[11px] bg-white text-gray-700 border border-gray-200 font-medium">${group.so_ngay} ngày</span>
                            ${group.bms ? `<span class="px-1.5 py-0.5 rounded text-[11px] bg-white text-blue-800 border border-blue-200 font-semibold">BMs: ${group.bms}</span>` : ''}
                            ${group.region ? `<span class="px-1.5 py-0.5 rounded text-[11px] bg-white text-blue-800 border border-blue-200 font-semibold">Region: ${group.region}</span>` : ''}
                            ${group.muc_dich ? `<span class="px-2 py-0.5 rounded text-[11px] bg-white text-gray-700 border border-gray-200 max-w-sm truncate" title="${group.muc_dich}">Mục đích: <b class="text-gray-900 font-medium">${group.muc_dich}</b></span>` : ''}
                            <span class="text-gray-500 font-normal">(${group.items.length} mặt hàng • Còn nợ: <b class="text-red-600">${totalGroupDebt.toLocaleString('vi-VN')}</b>)</span>
                        </div>
                        <button type="button" class="hn-quick-batch-btn inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-blue-300 rounded text-xs font-semibold shadow-2xs transition-all active:scale-95" data-ma-nx="${group.ma_nx}" title="Cập nhật hoặc xuất biểu mẫu xác nhận cho đơn DO này">
                            <svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            <span>Cập nhật</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;

        // Dòng từng mặt hàng thuộc DO
        group.items.forEach(({ item, globalIndex }) => {
            const stt = globalIndex + 1;
            const ngayMuon = formatDateToDDMMYYYY(item.thoi_gian);
            const soNgay = item.so_ngay;

            const statKey = `${item.ma_nx}_${item.ma_vt}_${item.lot || ''}`.toUpperCase();
            const stat = timelineStatsMap.get(statKey);

            const tds = visibleCols.map(col => {
                const width = effectiveWidths[col.key] || col.defaultWidth;
                const style = isFullWidth
                    ? `width: ${width}px; min-width: ${col.defaultWidth}px;`
                    : `width: ${width}px; min-width: ${width}px; max-width: ${width}px;`;

                switch (col.key) {
                    case 'stt':
                        return `<td class="px-2 py-2 text-center text-gray-400 border-r border-gray-200" style="${style}">${stt}</td>`;
                    case 'ma_nx':
                        return `<td class="px-3 py-2 text-center font-mono font-medium text-gray-500 border-r border-gray-200 truncate" style="${style}">${item.ma_nx}</td>`;
                    case 'thoi_gian':
                        return `<td class="px-2.5 py-2 text-center border-r border-gray-200 truncate text-gray-600" style="${style}">${ngayMuon}</td>`;
                    case 'so_ngay':
                        return `<td class="px-2 py-2 text-center border-r border-gray-200" style="${style}">
                            <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                                ${soNgay} ngày
                            </span>
                        </td>`;
                    case 'yeu_cau':
                        return `<td class="px-3 py-2 font-medium text-gray-900 border-r border-gray-200 truncate" style="${style}" title="${item.yeu_cau || ''}">${item.yeu_cau || '-'}</td>`;
                    case 'seri':
                        return `<td class="px-2.5 py-2 text-center font-mono text-gray-700 border-r border-gray-200 truncate" style="${style}" title="${item.seri || ''}">${item.seri || '-'}</td>`;
                    case 'bms':
                        return `<td class="px-2.5 py-2 text-center text-gray-700 border-r border-gray-200 truncate" style="${style}" title="${item.bms || ''}">${item.bms || '-'}</td>`;
                    case 'region':
                        return `<td class="px-2.5 py-2 text-center text-gray-700 border-r border-gray-200 truncate" style="${style}" title="${item.region || ''}">${item.region || '-'}</td>`;
                    case 'muc_dich':
                        return `<td class="px-3 py-2 text-gray-600 border-r border-gray-200" style="${style}" title="${item.muc_dich || ''}">
                            <div class="line-clamp-2">${item.muc_dich || '-'}</div>
                        </td>`;
                    case 'ma_vt':
                        return `<td class="px-3 py-2 text-center font-mono font-bold text-gray-800 border-r border-gray-200 truncate" style="${style}">${item.ma_vt}</td>`;
                    case 'ten_vt':
                        return `<td class="px-3 py-2 text-gray-800 border-r border-gray-200" style="${style}" title="${item.ten_vt || ''}">
                            <div class="line-clamp-2 font-medium">${item.ten_vt || '-'}</div>
                        </td>`;
                    case 'lot':
                        return `<td class="px-2.5 py-2 text-center font-mono text-gray-600 border-r border-gray-200 truncate" style="${style}">${item.lot || '-'}</td>`;
                    case 'date':
                        return `<td class="px-2.5 py-2 text-center text-gray-600 border-r border-gray-200 truncate" style="${style}">${item.date || '-'}</td>`;
                    case 'nganh':
                        return `<td class="px-2 py-2 text-center border-r border-gray-200" style="${style}">
                            <span class="px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-700 font-medium">${item.nganh || '-'}</span>
                        </td>`;
                    case 'xuat':
                        return `<td class="px-2 py-2 text-right font-medium text-gray-700 border-r border-gray-200" style="${style}">${item.xuat.toLocaleString('vi-VN')}</td>`;
                    case 'da_tra':
                        return `<td class="px-2 py-2 text-right text-green-700 font-medium border-r border-gray-200" style="${style}">${item.da_tra.toLocaleString('vi-VN')}</td>`;
                    case 'sl_con_no':
                        return `<td class="px-2.5 py-2 text-right font-bold text-red-600 border-r border-gray-200 text-sm" style="${style}">${item.sl_con_no.toLocaleString('vi-VN')}</td>`;
                    case 'nhat_ky': {
                        let btnText = '+ Nhật ký';
                        // Chưa tác động gì thì tô đỏ nhạt
                        let btnClass = 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 font-medium';
                        let cellBg = 'bg-red-50/20';

                        if (stat && stat.count > 0) {
                            btnText = `Nhật ký (${stat.count})${stat.photoCount > 0 ? ` [${stat.photoCount} ảnh]` : ''}`;
                            if (stat.hasGiaHan) {
                                // Gia hạn thì tô vàng nhạt
                                btnClass = 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 font-semibold';
                                cellBg = 'bg-amber-50/30';
                            } else if (stat.hasTraHang) {
                                btnClass = 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 font-semibold';
                                cellBg = 'bg-emerald-50/20';
                            } else {
                                btnClass = 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 font-semibold';
                                cellBg = 'bg-amber-50/30';
                            }
                        }
                        return `
                            <td class="px-2.5 py-2 text-center whitespace-nowrap ${cellBg}" style="${style}">
                                <button type="button" class="hn-open-timeline-btn inline-flex items-center justify-center px-2 py-1 rounded text-xs transition-colors active:scale-95 shadow-2xs ${btnClass}"
                                    data-ma-nx="${item.ma_nx}" data-ma-vt="${item.ma_vt}" data-lot="${item.lot || ''}" data-id="${item.id}">
                                    ${btnText}
                                </button>
                            </td>
                        `;
                    }
                    default:
                        return '';
                }
            }).join('');

            html += `<tr class="hover:bg-blue-50/40 transition-colors">${tds}</tr>`;
        });
    });

    tbody.innerHTML = html;

    // Gắn sự kiện click nút Cập nhật chung DO trên dòng header nhóm
    tbody.querySelectorAll('.hn-quick-batch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const maNx = btn.dataset.maNx;
            openBatchDoModal(maNx);
        });
    });

    // Gắn sự kiện click mở Timeline Modal từng sản phẩm
    tbody.querySelectorAll('.hn-open-timeline-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const maNx = btn.dataset.maNx;
            const maVt = btn.dataset.maVt;
            const lot = btn.dataset.lot;
            const target = rawLoanItems.find(it => it.ma_nx === maNx && it.ma_vt === maVt && (it.lot || '') === lot);
            if (target) {
                openTimelineModal(target);
            }
        });
    });
}


function renderPaginationFooter(totalItems, from, to, totalPages) {
    const infoEl = document.getElementById('hang-no-pagination-info');
    const pageInput = document.getElementById('hang-no-page-input');
    const totalPagesEl = document.getElementById('hang-no-total-pages');
    const prevBtn = document.getElementById('hang-no-prev-page');
    const nextBtn = document.getElementById('hang-no-next-page');

    if (infoEl) {
        if (totalItems === 0) {
            infoEl.textContent = '0 dòng';
        } else {
            infoEl.textContent = `Hiển thị ${from + 1} - ${to + 1} trên ${totalItems} dòng`;
        }
    }

    if (pageInput) {
        pageInput.value = hangNoFilters.currentPage;
        pageInput.max = totalPages;
    }
    if (totalPagesEl) {
        totalPagesEl.textContent = `/ ${totalPages}`;
    }

    if (prevBtn) prevBtn.disabled = hangNoFilters.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = hangNoFilters.currentPage >= totalPages;
}

function updateFilterButtonLabels() {
    const ycBtn = document.getElementById('hang-no-filter-yeu-cau-btn');
    if (ycBtn) {
        const count = hangNoFilters.yeu_cau.length;
        ycBtn.querySelector('span').textContent = count > 0 ? `Người mượn (${count})` : 'Người mượn';
        ycBtn.classList.toggle('border-blue-500', count > 0);
        ycBtn.classList.toggle('bg-blue-50', count > 0);
    }

    const ngBtn = document.getElementById('hang-no-filter-nganh-btn');
    if (ngBtn) {
        const count = hangNoFilters.nganh.length;
        ngBtn.querySelector('span').textContent = count > 0 ? `Ngành (${count})` : 'Ngành';
        ngBtn.classList.toggle('border-blue-500', count > 0);
        ngBtn.classList.toggle('bg-blue-50', count > 0);
    }

    const resetBtn = document.getElementById('hang-no-reset-filters');
    if (resetBtn) {
        const hasActive = Boolean(
            (hangNoFilters.search && hangNoFilters.search.trim()) ||
            hangNoFilters.yeu_cau.length > 0 ||
            hangNoFilters.nganh.length > 0
        );
        resetBtn.classList.toggle('filter-has-active', hasActive);
    }
}

function resetAllHangNoFilters() {
    hangNoFilters.search = '';
    hangNoFilters.yeu_cau = [];
    hangNoFilters.nganh = [];
    hangNoFilters.currentPage = 1;

    const searchInput = document.getElementById('hang-no-search');
    if (searchInput) searchInput.value = '';
    const searchClear = document.getElementById('hang-no-search-clear');
    if (searchClear) searchClear.classList.add('hidden');

    updateFilterButtonLabels();
    applyFiltersAndRender();
}

/**
 * Popover chọn nhiều cho Người mượn và Ngành
 */
function openHangNoFilterPopover(button, filterKey, title) {
    const existing = document.querySelector('.hang-no-filter-popover');
    if (existing) existing.remove();

    const allOptions = [...new Set(rawLoanItems.map(item => item[filterKey]).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    const popover = document.createElement('div');
    popover.className = 'hang-no-filter-popover fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 flex flex-col gap-2 w-72';

    const rect = button.getBoundingClientRect();
    if (window.innerWidth <= 768) {
        popover.style.left = '50%';
        popover.style.top = '50%';
        popover.style.transform = 'translate(-50%, -50%)';
        popover.style.maxWidth = '90vw';
    } else {
        popover.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
        popover.style.top = `${rect.bottom + 6}px`;
    }

    const currentSelected = new Set(hangNoFilters[filterKey]);

    popover.innerHTML = `
        <div class="flex items-center justify-between pb-2 border-b border-gray-100">
            <span class="text-xs font-bold text-gray-700 uppercase">${title}</span>
            <button class="hn-popover-close text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
        <div class="relative">
            <input type="text" class="hn-popover-search w-full px-2.5 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Tìm nhanh...">
        </div>
        <div class="flex items-center justify-between text-[11px] text-gray-500 px-0.5">
            <button class="hn-popover-toggle-all text-blue-600 hover:underline font-medium">Chọn tất cả</button>
            <span class="hn-popover-count">Đã chọn: ${currentSelected.size}</span>
        </div>
        <div class="hn-popover-list max-h-48 overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded text-xs">
            <!-- options -->
        </div>
        <div class="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button class="hn-popover-clear px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700">Bỏ chọn</button>
            <button class="hn-popover-apply px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">Áp dụng</button>
        </div>
    `;

    document.body.appendChild(popover);

    const listContainer = popover.querySelector('.hn-popover-list');
    const searchInput = popover.querySelector('.hn-popover-search');
    const countEl = popover.querySelector('.hn-popover-count');
    const toggleAllBtn = popover.querySelector('.hn-popover-toggle-all');
    const applyBtn = popover.querySelector('.hn-popover-apply');
    const clearBtn = popover.querySelector('.hn-popover-clear');
    const closeBtn = popover.querySelector('.hn-popover-close');

    const renderOptions = () => {
        const query = removeVietnameseTones(searchInput.value);
        const filtered = allOptions.filter(opt => removeVietnameseTones(opt).includes(query));

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="p-3 text-center text-gray-400 text-xs">Không có tùy chọn</div>';
            return;
        }

        listContainer.innerHTML = filtered.map(opt => `
            <label class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 cursor-pointer select-none">
                <input type="checkbox" value="${opt}" class="hn-cb rounded text-blue-600 focus:ring-0" ${currentSelected.has(opt) ? 'checked' : ''}>
                <span class="truncate text-gray-700">${opt}</span>
            </label>
        `).join('');

        updateCount();
    };

    const updateCount = () => {
        countEl.textContent = `Đã chọn: ${currentSelected.size}`;
        toggleAllBtn.textContent = (currentSelected.size === allOptions.length && allOptions.length > 0) ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
    };

    renderOptions();

    searchInput.addEventListener('input', renderOptions);

    listContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('hn-cb')) {
            const val = e.target.value;
            if (e.target.checked) currentSelected.add(val);
            else currentSelected.delete(val);
            updateCount();
        }
    });

    toggleAllBtn.addEventListener('click', () => {
        if (currentSelected.size === allOptions.length) {
            currentSelected.clear();
        } else {
            allOptions.forEach(opt => currentSelected.add(opt));
        }
        renderOptions();
    });

    clearBtn.addEventListener('click', () => {
        currentSelected.clear();
        renderOptions();
    });

    applyBtn.addEventListener('click', () => {
        hangNoFilters[filterKey] = [...currentSelected];
        hangNoFilters.currentPage = 1;
        applyFiltersAndRender(false);
        popover.remove();
    });

    closeBtn.addEventListener('click', () => popover.remove());

    const handleOutsideClick = (e) => {
        if (!popover.contains(e.target) && e.target !== button && !button.contains(e.target)) {
            popover.remove();
            document.removeEventListener('click', handleOutsideClick);
        }
    };
    setTimeout(() => document.addEventListener('click', handleOutsideClick), 10);
}

/**
 * Modal Cài đặt hiển thị cột
 */
function openColumnSettingsModal() {
    const modal = document.getElementById('hang-no-settings-modal');
    const container = document.getElementById('hn-column-toggles');
    if (!modal || !container) return;

    const currentSettings = getHangNoColumnSettings();

    container.innerHTML = HANG_NO_COLUMNS.filter(c => c.canHide).map(col => `
        <label class="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 cursor-pointer text-xs">
            <span class="font-medium text-gray-700">${col.label}</span>
            <input type="checkbox" class="hn-col-toggle-cb w-4 h-4 accent-blue-600 rounded" data-key="${col.key}" ${currentSettings[col.key] !== false ? 'checked' : ''}>
        </label>
    `).join('');

    modal.classList.remove('hidden');

    container.querySelectorAll('.hn-col-toggle-cb').forEach(cb => {
        cb.onchange = (e) => {
            const key = e.target.dataset.key;
            currentSettings[key] = e.target.checked;
            saveHangNoColumnSettings(currentSettings);
            applyFiltersAndRender(true);
        };
    });

    document.getElementById('hn-settings-reset-btn').onclick = () => {
        const defaults = getDefaultColumnSettings();
        saveHangNoColumnSettings(defaults);
        openColumnSettingsModal();
        applyFiltersAndRender(true);
        showToast('Đã khôi phục cài đặt cột mặc định', 'info');
    };

    const closeHandler = () => modal.classList.add('hidden');
    document.getElementById('hn-settings-close-x').onclick = closeHandler;
    document.getElementById('hn-settings-done-btn').onclick = closeHandler;
}

/**
 * Xuất file Excel
 */
function exportToExcel() {
    if (filteredLoanItems.length === 0) {
        showToast('Không có dữ liệu hàng nợ để xuất.', 'warning');
        return;
    }

    if (typeof XLSX === 'undefined') {
        showToast('Thư viện Excel chưa sẵn sàng. Vui lòng tải lại trang.', 'error');
        return;
    }

    const dataToExport = filteredLoanItems.map((item, index) => ({
        'STT': index + 1,
        'MÃ DO': item.ma_nx,
        'NGÀY MƯỢN': formatDateToDDMMYYYY(item.thoi_gian),
        'SỐ NGÀY MƯỢN': item.so_ngay,
        'NGƯỜI MƯỢN': item.yeu_cau,
        'MÃ VT': item.ma_vt,
        'TÊN VẬT TƯ': item.ten_vt,
        'LOT': item.lot,
        'HSD': item.date,
        'SỐ SERI': item.seri || '',
        'BMS': item.bms || '',
        'REGION': item.region || '',
        'SỰ KIỆN / MỤC ĐÍCH': item.muc_dich,
        'NGÀNH': item.nganh,
        'SL MƯỢN': item.xuat,
        'ĐÃ TRẢ': item.da_tra,
        'CÒN NỢ': item.sl_con_no
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'HangNo');

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    XLSX.writeFile(workbook, `Bao_Cao_Hang_No_${dateStr}.xlsx`);
    showToast('Xuất Excel thành công!', 'success');
}

/**
 * ========================================================
 * XỬ LÝ TIMELINE & UPLOAD HÌNH ẢNH (2 MỐC: GIA HẠN & BÁO TRẢ)
 * ========================================================
 */

function openTimelineModal(item) {
    currentTimelineTarget = item;
    selectedNewPhotos = [];

    const modal = document.getElementById('hang-no-timeline-modal');
    if (!modal) return;

    // Header info
    const badgeDo = document.getElementById('hn-tl-badge-dono');
    const summaryEl = document.getElementById('hn-tl-item-summary');
    if (badgeDo) badgeDo.textContent = item.ma_nx;
    if (summaryEl) {
        summaryEl.textContent = `${item.ma_vt} • ${item.ten_vt || ''} ${item.lot ? `• LOT: ${item.lot}` : ''} • Người mượn: ${item.yeu_cau || 'N/A'}`;
    }

    // Điền sẵn 3 trường thông tin: Seri, BMs, Region
    const seriInput = document.getElementById('hn-tl-seri');
    const bmsInput = document.getElementById('hn-tl-bms');
    const regionInput = document.getElementById('hn-tl-region');
    if (seriInput) seriInput.value = item.seri || '';
    if (bmsInput) bmsInput.value = item.bms || '';
    if (regionInput) regionInput.value = item.region || '';

    // Reset Form (mặc định chọn Gia hạn)
    const noteEl = document.getElementById('hn-tl-note');
    if (noteEl) noteEl.value = '';
    const defaultRadio = document.querySelector('input[name="hn-moc-type"][value="gia_han"]');
    if (defaultRadio) defaultRadio.checked = true;
    renderSelectedPhotoPreviews();

    modal.classList.remove('hidden');

    fetchAndRenderTimeline(item);
}

function closeTimelineModal() {
    const modal = document.getElementById('hang-no-timeline-modal');
    if (modal) modal.classList.add('hidden');
    currentTimelineTarget = null;
    selectedNewPhotos = [];
    document.getElementById('hn-tl-bms-dropdown')?.classList.add('hidden');
    document.getElementById('hn-tl-region-dropdown')?.classList.add('hidden');
    document.querySelectorAll('#hang-no-timeline-modal [id$="-toggle"] svg').forEach(svg => svg.classList.remove('rotate-180'));
}

async function fetchAndRenderTimeline(item) {
    const listEl = document.getElementById('hn-timeline-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="text-xs text-gray-400 italic">Đang tải lịch sử mốc thời gian...</div>';

    try {
        let query = sb.from('hang_no_timeline')
            .select('*')
            .eq('ma_nx', item.ma_nx)
            .eq('ma_vt', item.ma_vt);

        if (item.lot) {
            query = query.eq('lot', item.lot);
        }

        const { data, error } = await query.order('thoi_gian', { ascending: false });

        if (error) throw error;

        // Mốc khởi nguồn: Kho xuất mượn
        const exportMilestone = `
            <div class="relative group">
                <div class="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-xs flex items-center justify-center">
                    <span class="w-1.5 h-1.5 bg-white rounded-full"></span>
                </div>
                <div class="bg-white border border-gray-200 rounded-xl p-3 shadow-2xs">
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                        <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700">Xuất kho mượn</span>
                        <span class="text-[11px] text-gray-400">${formatDateToDDMMYYYY(item.thoi_gian)}</span>
                    </div>
                    <div class="text-xs text-gray-700 mt-1">
                        Xuất số lượng <b>${item.xuat}</b> cho <b>${item.yeu_cau || 'N/A'}</b>
                        ${item.muc_dich ? `<div class="text-gray-500 text-[11px] mt-0.5">${item.muc_dich}</div>` : ''}
                    </div>
                </div>
            </div>
        `;

        if (!data || data.length === 0) {
            listEl.innerHTML = exportMilestone + `
                <div class="text-xs text-gray-400 italic pt-2">Chưa có mốc gia hạn hay báo trả nào được tạo thêm.</div>
            `;
            return;
        }

        const typeConfig = {
            'gia_han': { label: 'Gia hạn mượn', bg: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
            'tra_hang': { label: 'Báo trả hàng', bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
            'nhan_hang': { label: 'Nhận hàng', bg: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-500' }
        };

        const timelineEntries = data.map(entry => {
            const cfg = typeConfig[entry.loai_moc] || { label: 'Ghi nhận', bg: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-500' };
            const imgs = Array.isArray(entry.hinh_anh) ? entry.hinh_anh : [];

            let imagesHtml = '';
            if (imgs.length > 0) {
                imagesHtml = `
                    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2.5">
                        ${imgs.map(url => `
                            <div class="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity hn-thumb-wrap" data-img-url="${url}">
                                <img src="${url}" alt="Bằng chứng" loading="lazy" class="w-full h-full object-cover">
                                <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <svg class="w-5 h-5 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            return `
                <div class="relative group">
                    <div class="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full ${cfg.dot} border-2 border-white shadow-xs flex items-center justify-center">
                        <span class="w-1.5 h-1.5 bg-white rounded-full"></span>
                    </div>
                    <div class="bg-white border border-gray-200 rounded-xl p-3 shadow-2xs hover:border-blue-300 transition-colors">
                        <div class="flex items-center justify-between gap-2 flex-wrap">
                            <span class="px-2 py-0.5 rounded text-[11px] font-bold border ${cfg.bg}">${cfg.label}</span>
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] text-gray-500 font-medium">${formatDateTimeVN(entry.thoi_gian)}</span>
                                <button type="button" class="hn-delete-timeline-btn text-gray-300 hover:text-red-600 p-0.5 transition-colors" data-id="${entry.id}" title="Xóa mốc này">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </div>
                        </div>

                        ${entry.nguoi_thuc_hien ? `<div class="text-[11px] text-gray-400 mt-0.5">Người cập nhật: <span class="font-medium text-gray-700">${entry.nguoi_thuc_hien}</span></div>` : ''}

                        ${entry.seri ? `
                            <div class="flex flex-wrap items-center gap-2 text-[11px] text-gray-600 mt-1.5 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                <span>Số Seri: <b class="font-mono text-gray-800">${entry.seri}</b></span>
                            </div>
                        ` : ''}

                        ${entry.ghi_chu ? `<div class="text-xs text-gray-800 mt-1.5 whitespace-pre-wrap">${entry.ghi_chu}</div>` : ''}

                        ${imagesHtml}
                    </div>
                </div>
            `;
        }).join('');

        listEl.innerHTML = timelineEntries + exportMilestone;

        // Sự kiện click mở ảnh phóng to
        listEl.querySelectorAll('.hn-thumb-wrap').forEach(wrap => {
            wrap.addEventListener('click', () => {
                const url = wrap.dataset.imgUrl;
                if (url) openLightbox(url);
            });
        });

        // Sự kiện click xóa mốc
        listEl.querySelectorAll('.hn-delete-timeline-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const confirmed = await showConfirm('Bạn có chắc chắn muốn xóa mốc thời gian này?', 'Xác nhận xóa');
                if (confirmed) {
                    await deleteTimelineEntry(id);
                }
            });
        });

    } catch (err) {
        console.error('Lỗi fetch timeline:', err);
        listEl.innerHTML = `<div class="text-xs text-red-500">Lỗi tải lịch sử: ${err.message || err}</div>`;
    }
}

async function deleteTimelineEntry(id) {
    showLoading(true);
    try {
        const { error } = await sb.from('hang_no_timeline').delete().eq('id', id);
        if (error) throw error;
        showToast('Đã xóa mốc thời gian.', 'success');

        if (currentTimelineTarget) {
            await fetchAndRenderTimeline(currentTimelineTarget);
        }
        await loadTimelineStats();
        applyFiltersAndRender(false);
    } catch (e) {
        console.error('Lỗi xóa timeline:', e);
        showToast('Không thể xóa: ' + (e.message || e), 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Xử lý khi chọn ảnh từ camera hoặc thư viện
 */
async function handlePhotosSelected(fileList) {
    if (!fileList || fileList.length === 0) return;

    showLoading(true);
    try {
        for (let i = 0; i < fileList.length; i++) {
            const rawFile = fileList[i];
            if (!rawFile.type.startsWith('image/')) continue;

            const compressed = await compressImageFile(rawFile, 1600, 1600, 0.82);
            const previewUrl = URL.createObjectURL(compressed);
            const sizeKb = Math.round(compressed.size / 1024);

            selectedNewPhotos.push({
                file: compressed,
                previewUrl: previewUrl,
                sizeKb: sizeKb
            });
        }
        renderSelectedPhotoPreviews();
    } catch (e) {
        console.error('Lỗi xử lý ảnh:', e);
        showToast('Lỗi xử lý ảnh: ' + e.message, 'error');
    } finally {
        showLoading(false);
    }
}

function renderSelectedPhotoPreviews() {
    const container = document.getElementById('hn-preview-container');
    if (!container) return;

    if (selectedNewPhotos.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="w-full flex items-center justify-between text-[11px] text-gray-600 mb-1">
            <span class="font-semibold text-blue-700">Đã chọn / chụp ${selectedNewPhotos.length} ảnh:</span>
            <div class="flex items-center gap-2">
                <button type="button" id="hn-add-more-cam" class="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    <span>+ Chụp thêm</span>
                </button>
                <span class="text-gray-300">|</span>
                <button type="button" id="hn-add-more-gallery" class="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5">
                    <span>+ Chọn thêm</span>
                </button>
                <span class="text-gray-300">|</span>
                <button type="button" id="hn-clear-all-photos" class="text-red-500 hover:underline">Xóa tất cả</button>
            </div>
        </div>
        <div class="flex flex-wrap gap-2 w-full max-h-36 overflow-y-auto p-1.5 bg-white rounded-lg border border-gray-200">
            ${selectedNewPhotos.map((p, idx) => `
                <div class="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-300 bg-gray-100 flex-shrink-0 group shadow-2xs">
                    <img src="${p.previewUrl}" class="w-full h-full object-cover">
                    <button type="button" class="hn-remove-photo-btn absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] shadow" data-idx="${idx}">✕</button>
                    <span class="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] text-center truncate">${p.sizeKb}KB</span>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.hn-remove-photo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.idx);
            selectedNewPhotos.splice(idx, 1);
            renderSelectedPhotoPreviews();
        });
    });

    document.getElementById('hn-clear-all-photos')?.addEventListener('click', () => {
        selectedNewPhotos = [];
        renderSelectedPhotoPreviews();
    });

    document.getElementById('hn-add-more-cam')?.addEventListener('click', () => {
        document.getElementById('hn-camera-input')?.click();
    });

    document.getElementById('hn-add-more-gallery')?.addEventListener('click', () => {
        document.getElementById('hn-gallery-input')?.click();
    });
}

/**
 * Lưu mốc thời gian và tải ảnh lên Storage Bucket
 */
async function saveTimelineEntry() {
    if (!currentTimelineTarget) return;

    const note = (document.getElementById('hn-tl-note')?.value || '').trim();
    const typeRadio = document.querySelector('input[name="hn-moc-type"]:checked');
    const loaiMoc = typeRadio ? typeRadio.value : 'gia_han';

    const seri = (document.getElementById('hn-tl-seri')?.value || '').trim();
    const bms = (document.getElementById('hn-tl-bms')?.value || '').trim();
    const region = (document.getElementById('hn-tl-region')?.value || '').trim();

    const hasInfoUpdate = seri !== (currentTimelineTarget.seri || '') ||
        bms !== (currentTimelineTarget.bms || '') ||
        region !== (currentTimelineTarget.region || '');

    const hasTimelineMilestone = note.length > 0 || selectedNewPhotos.length > 0;

    if (!hasTimelineMilestone && !hasInfoUpdate) {
        showToast('Vui lòng nhập ghi chú, chụp/chọn ảnh hoặc cập nhật Seri/BMs/Region.', 'warning');
        return;
    }

    showLoading(true);

    try {
        const uploadedUrls = [];

        if (selectedNewPhotos.length > 0) {
            const cleanDO = sanitizeFileName(currentTimelineTarget.ma_nx || 'DO').replace(/[^a-zA-Z0-9_-]/g, '_');

            for (let i = 0; i < selectedNewPhotos.length; i++) {
                const item = selectedNewPhotos[i];
                const randStr = Math.random().toString(36).substring(2, 8);
                const fileName = `${cleanDO}/${Date.now()}_${i}_${randStr}.jpg`;

                const { data, error } = await sb.storage.from('hang_no_media').upload(fileName, item.file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/jpeg'
                });

                if (error) {
                    throw new Error('Lỗi tải ảnh lên máy chủ: ' + (error.message || error));
                }

                const { data: publicUrlData } = sb.storage.from('hang_no_media').getPublicUrl(fileName);
                if (publicUrlData?.publicUrl) {
                    uploadedUrls.push(publicUrlData.publicUrl);
                }
            }
        }

        const performer = currentUser?.ho_ten || currentUser?.gmail || 'Nhân viên';

        // CHỈ ghi vào nhật ký hang_no_timeline nếu có ghi chú hoặc có ảnh chụp/tải lên
        if (hasTimelineMilestone) {
            const insertPayload = {
                chi_tiet_id: currentTimelineTarget.id || null,
                ma_nx: currentTimelineTarget.ma_nx,
                ma_vt: currentTimelineTarget.ma_vt,
                lot: currentTimelineTarget.lot || '',
                seri: seri,
                loai_moc: loaiMoc,
                thoi_gian: new Date().toISOString(),
                nguoi_thuc_hien: performer,
                hinh_anh: uploadedUrls,
                ghi_chu: note
            };

            const { error: insertError } = await sb.from('hang_no_timeline').insert([insertPayload]);
            if (insertError) throw insertError;
        }

        // Lưu thông tin Seri, BMs, Region vào bảng hang_no_info
        if (hasInfoUpdate || seri || bms || region) {
            const { error: infoError } = await sb.from('hang_no_info').upsert({
                ma_nx: currentTimelineTarget.ma_nx,
                ma_vt: currentTimelineTarget.ma_vt,
                lot: currentTimelineTarget.lot || '',
                seri: seri,
                bms: bms,
                region: region,
                updated_at: new Date().toISOString()
            }, { onConflict: 'ma_nx,ma_vt,lot' });
            if (infoError) console.warn('Lỗi upsert hang_no_info:', infoError);
        }

        // Cập nhật lại đối tượng item trong bộ nhớ
        currentTimelineTarget.seri = seri;
        currentTimelineTarget.bms = bms;
        currentTimelineTarget.region = region;
        const matchedItem = rawLoanItems.find(it => it.ma_nx === currentTimelineTarget.ma_nx && it.ma_vt === currentTimelineTarget.ma_vt && (it.lot || '') === (currentTimelineTarget.lot || ''));
        if (matchedItem) {
            matchedItem.seri = seri;
            matchedItem.bms = bms;
            matchedItem.region = region;
        }

        if (bms && !distinctBmsList.includes(bms)) {
            distinctBmsList.push(bms);
            distinctBmsList.sort((a, b) => a.localeCompare(b, 'vi'));
        }
        if (region && !distinctRegionList.includes(region)) {
            distinctRegionList.push(region);
            distinctRegionList.sort((a, b) => a.localeCompare(b, 'vi'));
        }

        if (hasTimelineMilestone && hasInfoUpdate) {
            showToast('Đã lưu thông tin và mốc thời gian thành công!', 'success');
        } else if (hasTimelineMilestone) {
            showToast('Đã thêm mốc thời gian thành công!', 'success');
        } else {
            showToast('Đã cập nhật thông tin thành công!', 'success');
        }

    document.getElementById('hn-tl-note').value = '';
    selectedNewPhotos = [];
    renderSelectedPhotoPreviews();

    await fetchAndRenderTimeline(currentTimelineTarget);
    await loadTimelineStats();
    applyFiltersAndRender(false);

} catch (err) {
    console.error('Lỗi lưu mốc thời gian:', err);
    showToast('Lỗi: ' + (err.message || err), 'error');
} finally {
    showLoading(false);
}
}


/**
 * Lightbox xem ảnh to
 */
function openLightbox(url, caption = '') {
    const modal = document.getElementById('hang-no-lightbox-modal');
    const img = document.getElementById('hn-lightbox-img');
    const download = document.getElementById('hn-lightbox-download');
    const captionEl = document.getElementById('hn-lightbox-caption');

    if (!modal || !img) return;

    img.src = url;
    if (download) download.href = url;
    if (captionEl) captionEl.textContent = caption;

    modal.classList.remove('hidden');
}

function closeLightbox() {
    const modal = document.getElementById('hang-no-lightbox-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Quản lý danh sách giá trị có sẵn của BMs và Region
 */
function updateDistinctBmsAndRegion(infoData = []) {
    const bmsSet = new Set();
    const regionSet = new Set();

    if (Array.isArray(infoData)) {
        infoData.forEach(row => {
            if (row.bms && row.bms.trim()) bmsSet.add(row.bms.trim());
            if (row.region && row.region.trim()) regionSet.add(row.region.trim());
        });
    }

    if (Array.isArray(rawLoanItems)) {
        rawLoanItems.forEach(it => {
            if (it.bms && it.bms.trim()) bmsSet.add(it.bms.trim());
            if (it.region && it.region.trim()) regionSet.add(it.region.trim());
        });
    }

    distinctBmsList = Array.from(bmsSet).sort((a, b) => a.localeCompare(b, 'vi'));
    distinctRegionList = Array.from(regionSet).sort((a, b) => a.localeCompare(b, 'vi'));
}

/**
 * Custom Combobox in-app (dropdown tự chế trong ứng dụng, mượt mà trên mobile & web,
 * cho phép nhập mới hoặc chọn từ danh sách có sẵn, không mở native wheel picker của trình duyệt).
 */
function setupCustomCombobox({ inputId, toggleBtnId, dropdownId, getOptions, onSelect }) {
    const input = document.getElementById(inputId);
    const toggleBtn = document.getElementById(toggleBtnId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    function renderList(filterText = '') {
        const allOptions = getOptions() || [];
        const query = (filterText || '').trim().toLowerCase();
        const filtered = query
            ? allOptions.filter(opt => opt.toLowerCase().includes(query))
            : allOptions;

        if (allOptions.length === 0) {
            dropdown.innerHTML = `
                <div class="p-2.5 text-xs text-gray-400 italic text-center">
                    Chưa có sẵn dữ liệu trước đó.<br>Gõ trực tiếp để tạo mới.
                </div>
            `;
            return;
        }

        let html = '';
        if (filtered.length === 0) {
            html += `
                <div class="p-2 text-xs text-gray-400 italic text-center">Không tìm thấy "${filterText}".</div>
            `;
        } else {
            html += filtered.map(opt => {
                const isSelected = input.value.trim().toLowerCase() === opt.toLowerCase();
                return `
                    <div class="hn-combo-item px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 cursor-pointer flex items-center justify-between transition-colors select-none" data-val="${opt}">
                        <span class="font-medium truncate ${isSelected ? 'text-blue-700 font-semibold' : ''}">${opt}</span>
                        ${isSelected ? `<svg class="w-3.5 h-3.5 text-blue-600 flex-shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>` : ''}
                    </div>
                `;
            }).join('');
        }

        // Tùy chọn sử dụng giá trị đang gõ nếu chưa có trong danh sách
        if (query && !allOptions.some(opt => opt.toLowerCase() === query)) {
            html += `
                <div class="hn-combo-item px-3 py-2 text-xs text-blue-700 bg-blue-50/70 hover:bg-blue-100 active:bg-blue-200 cursor-pointer flex items-center gap-1.5 font-medium border-t border-gray-100 select-none" data-val="${input.value.trim()}">
                    <svg class="w-3 h-3 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    <span class="truncate">Dùng mới: "<b>${input.value.trim()}</b>"</span>
                </div>
            `;
        }

        dropdown.innerHTML = html;

        dropdown.querySelectorAll('.hn-combo-item').forEach(el => {
            el.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const selectedVal = el.dataset.val;
                input.value = selectedVal;
                closeDropdown();
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('input', { bubbles: true }));
                if (typeof onSelect === 'function') {
                    onSelect(selectedVal);
                }
            });
        });
    }

    function openDropdown() {
        // Đóng các combobox khác đang mở
        document.querySelectorAll('[id$="-dropdown"]').forEach(d => {
            if (d !== dropdown && !d.classList.contains('hidden')) {
                d.classList.add('hidden');
            }
        });
        document.querySelectorAll('[id$="-toggle"] svg').forEach(svg => {
            if (svg !== toggleBtn?.querySelector('svg')) {
                svg.classList.remove('rotate-180');
            }
        });

        renderList(input.value);
        dropdown.classList.remove('hidden');
        if (toggleBtn) {
            const svg = toggleBtn.querySelector('svg');
            if (svg) svg.classList.add('rotate-180');
        }
    }

    function closeDropdown() {
        dropdown.classList.add('hidden');
        if (toggleBtn) {
            const svg = toggleBtn.querySelector('svg');
            if (svg) svg.classList.remove('rotate-180');
        }
    }

    function toggleDropdown() {
        if (dropdown.classList.contains('hidden')) {
            openDropdown();
        } else {
            closeDropdown();
        }
    }

    input.addEventListener('focus', () => {
        openDropdown();
    });

    input.addEventListener('click', () => {
        openDropdown();
    });

    input.addEventListener('input', () => {
        openDropdown();
        renderList(input.value);
    });

    toggleBtn?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleDropdown();
    });

    // Đóng dropdown khi click/tap bên ngoài
    document.addEventListener('pointerdown', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target) && !toggleBtn?.contains(e.target)) {
            closeDropdown();
        }
    });
}

/**
 * ========================================================
 * XỬ LÝ CẬP NHẬT CHUNG THEO ĐƠN DO & BIỂU MẪU XÁC NHẬN
 * ========================================================
 */
let currentBatchDo = '';
let batchPhotosMap = new Map(); // key: itemKey -> array of { file, previewUrl, sizeKb }
let eesStaffList = [];          // Danh sách nhân viên ngành EES
let confirmPsrList = [];        // Danh sách PSRs được chọn trong tab Xác nhận
let confirmSelectedItems = new Set(); // itemKey của các sản phẩm được chọn đưa vào form

/**
 * Thu thập danh sách nhân viên ngành EES từ user, san_pham và chi_tiet
 */
async function fetchEesStaffList() {
    try {
        const staffSet = new Set();

        // 1. Lấy từ bảng user (nhân viên có phân quyền hoặc theo dõi ngành EES)
        try {
            const { data: users, error: uErr } = await sb.from('user').select('ho_ten, xem_data, phan_quyen');
            if (!uErr && Array.isArray(users)) {
                users.forEach(u => {
                    if (!u.ho_ten) return;
                    const xem = (u.xem_data || '').toUpperCase();
                    const role = (u.phan_quyen || '').toUpperCase();
                    if (role === 'ADMIN' || xem.includes('EES') || xem.includes('ALL')) {
                        staffSet.add(u.ho_ten.trim());
                    }
                });
            }
        } catch (e) {
            console.warn('Lỗi query user cho EES staff:', e);
        }

        // 2. Lấy từ bảng san_pham (phụ trách ngành EES)
        try {
            const { data: prods, error: pErr } = await sb.from('san_pham').select('phu_trach').eq('nganh', 'EES');
            if (!pErr && Array.isArray(prods)) {
                prods.forEach(p => {
                    if (p.phu_trach) {
                        p.phu_trach.split(/[,;\n]/).forEach(name => {
                            const trimmed = name.trim();
                            if (trimmed) staffSet.add(trimmed);
                        });
                    }
                });
            }
        } catch (e) {
            console.warn('Lỗi query san_pham cho EES staff:', e);
        }

        // 3. Lấy từ rawLoanItems (người mượn / phụ trách ngành EES)
        if (Array.isArray(rawLoanItems)) {
            rawLoanItems.forEach(it => {
                if ((it.nganh || '').toUpperCase() === 'EES') {
                    if (it.yeu_cau) staffSet.add(it.yeu_cau.trim());
                    if (it.phu_trach) staffSet.add(it.phu_trach.trim());
                }
            });
        }

        eesStaffList = Array.from(staffSet).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
    } catch (err) {
        console.warn('Lỗi tổng hợp eesStaffList:', err);
    }
}

/**
 * Chuyển đổi giữa Tab 1 (Cập nhật DO) và Tab 2 (Xác nhận bàn giao)
 */
function switchBatchTab(tab) {
    const tabUpdateBtn = document.getElementById('hn-batch-tab-update');
    const tabConfirmBtn = document.getElementById('hn-batch-tab-confirm');
    const panelUpdate = document.getElementById('hn-batch-panel-update');
    const panelConfirm = document.getElementById('hn-batch-panel-confirm');

    if (!tabUpdateBtn || !tabConfirmBtn || !panelUpdate || !panelConfirm) return;

    if (tab === 'confirm') {
        tabConfirmBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-blue-600 text-white border-blue-600 shadow-2xs flex items-center gap-1.5';
        tabConfirmBtn.querySelector('svg')?.classList.remove('text-blue-600');
        tabConfirmBtn.querySelector('svg')?.classList.add('text-white');

        tabUpdateBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-white text-gray-700 border-gray-300 hover:bg-gray-100 flex items-center gap-1.5';
        tabUpdateBtn.querySelector('svg')?.classList.remove('text-white');

        panelUpdate.classList.add('hidden');
        panelConfirm.classList.remove('hidden');

        // Đồng bộ dữ liệu hiển thị trên preview biểu mẫu
        renderConfirmDocumentPreview();
    } else {
        tabUpdateBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-blue-600 text-white border-blue-600 shadow-2xs flex items-center gap-1.5';
        tabUpdateBtn.querySelector('svg')?.classList.add('text-white');

        tabConfirmBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-white text-gray-700 border-gray-300 hover:bg-gray-100 flex items-center gap-1.5';
        tabConfirmBtn.querySelector('svg')?.classList.remove('text-white');
        tabConfirmBtn.querySelector('svg')?.classList.add('text-blue-600');

        panelConfirm.classList.add('hidden');
        panelUpdate.classList.remove('hidden');
    }
}

async function openBatchDoModal(maNx = null) {
    const modal = document.getElementById('hang-no-batch-modal');
    if (!modal) return;

    if (!maNx) {
        showToast('Vui lòng chọn đơn DO cần cập nhật.', 'warning');
        return;
    }

    currentBatchDo = maNx;
    batchPhotosMap.clear();

    modal.classList.remove('hidden');
    await onBatchDoChanged(maNx);
}

function closeBatchDoModal() {
    const modal = document.getElementById('hang-no-batch-modal');
    if (modal) modal.classList.add('hidden');
    batchPhotosMap.clear();
    currentBatchDo = '';
    document.getElementById('hn-batch-bms-dropdown')?.classList.add('hidden');
    document.getElementById('hn-batch-region-dropdown')?.classList.add('hidden');
    document.getElementById('hn-confirm-psr-dropdown')?.classList.add('hidden');
    document.querySelectorAll('#hang-no-batch-modal [id$="-toggle"] svg').forEach(svg => svg.classList.remove('rotate-180'));
}

async function onBatchDoChanged(maNx) {
    const summaryEl = document.getElementById('hn-batch-do-summary');
    const countEl = document.getElementById('hn-batch-item-count');
    const listEl = document.getElementById('hn-batch-products-list');
    const bmsInput = document.getElementById('hn-batch-bms');
    const regionInput = document.getElementById('hn-batch-region');
    const noteInput = document.getElementById('hn-batch-note');
    const defaultRadio = document.querySelector('input[name="hn-batch-moc-type"][value="gia_han"]');

    if (noteInput) noteInput.value = '';
    if (defaultRadio) defaultRadio.checked = true;
    batchPhotosMap.clear();

    // Mặc định mở Tab 1 (Cập nhật)
    switchBatchTab('update');

    if (!maNx) {
        if (summaryEl) summaryEl.innerHTML = '';
        if (bmsInput) bmsInput.value = '';
        if (regionInput) regionInput.value = '';
        if (countEl) countEl.textContent = '0 sản phẩm';
        if (listEl) {
            listEl.innerHTML = `
                <div class="p-6 text-center text-xs text-gray-400 italic bg-gray-50 border border-dashed border-gray-300 rounded-xl">
                    Không có sản phẩm nào.
                </div>
            `;
        }
        confirmSelectedItems.clear();
        confirmPsrList = [];
        renderConfirmProductsChecklist([]);
        renderConfirmPsrTags();
        renderConfirmDocumentPreview();
        return;
    }

    const items = rawLoanItems.filter(it => it.ma_nx === maNx);

    // Điền sẵn BMs và Region chung (lấy từ dữ liệu đã lưu của đơn DO này)
    const existingBms = items.find(it => it.bms)?.bms || '';
    const existingRegion = items.find(it => it.region)?.region || '';
    if (bmsInput) bmsInput.value = existingBms;
    if (regionInput) regionInput.value = existingRegion;

    const borrower = items[0]?.yeu_cau || '-';
    const loanDate = formatDateToDDMMYYYY(items[0]?.thoi_gian);
    const soNgay = items[0]?.so_ngay || 0;
    const totalDebt = items.reduce((sum, it) => sum + (it.sl_con_no || 0), 0);

    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="flex items-center gap-2 flex-wrap">
                <span class="font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200 text-xs">${maNx}</span>
                <span>Người mượn: <b>${borrower}</b></span>
                <span>• Ngày mượn: <b>${loanDate}</b></span>
                <span class="px-1.5 py-0.5 rounded text-[11px] bg-amber-100 text-amber-800 font-semibold">${soNgay} ngày</span>
            </div>
            <div class="text-xs">
                <span>Tổng SL còn nợ: <b class="text-red-600 font-bold">${totalDebt.toLocaleString('vi-VN')}</b></span>
            </div>
        `;
    }

    if (countEl) countEl.textContent = `${items.length} sản phẩm`;

    if (listEl) {
        listEl.innerHTML = `
            <div class="p-6 text-center text-xs text-gray-400 italic bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2">
                <svg class="w-4 h-4 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Đang tải danh sách sản phẩm và nhật ký đã lưu...</span>
            </div>
        `;
    }

    // Tải toàn bộ nhật ký mốc thời gian & ảnh đã lưu của đơn DO này
    const batchItemTimelineMap = new Map();
    try {
        const { data: timelineData, error: tlErr } = await sb.from('hang_no_timeline')
            .select('*')
            .eq('ma_nx', maNx)
            .order('thoi_gian', { ascending: false });

        if (!tlErr && Array.isArray(timelineData)) {
            timelineData.forEach(row => {
                const k = `${row.ma_vt}_${row.lot || ''}`.toUpperCase();
                if (!batchItemTimelineMap.has(k)) {
                    batchItemTimelineMap.set(k, []);
                }
                batchItemTimelineMap.get(k).push(row);
            });
        }
    } catch (e) {
        console.warn('Lỗi tải timeline cho batch DO:', e);
    }

    // Render danh sách sản phẩm bên dưới Tab 1 cùng với nhật ký & ảnh đã lưu của từng con
    renderBatchProductsList(items, batchItemTimelineMap);

    // Khởi tạo Tab 2: Chọn tất cả sản phẩm thuộc đơn DO vào biểu mẫu
    confirmSelectedItems.clear();
    items.forEach(it => confirmSelectedItems.add(`${it.ma_vt}_${it.lot || ''}`));

    // Khởi tạo người ký PSRs: Thêm người mượn của đơn này vào đầu danh sách
    confirmPsrList = (borrower && borrower !== '-') ? [borrower] : [];

    // Điền BM vào ô người ký BM
    const bmConfirmInput = document.getElementById('hn-confirm-bm-input');
    if (bmConfirmInput) bmConfirmInput.value = existingBms || '';

    // Render các thành phần của Tab 2 (Xác nhận bàn giao)
    renderConfirmProductsChecklist(items);
    renderConfirmPsrTags();
    renderConfirmDocumentPreview();
}

/**
 * Render danh sách checklist sản phẩm trong Tab 2 Xác nhận
 */
function renderConfirmProductsChecklist(items) {
    const container = document.getElementById('hn-confirm-products-checklist');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<span class="text-xs text-gray-400 italic p-1">Không có sản phẩm nào.</span>';
        return;
    }

    container.innerHTML = items.map((it) => {
        const itemKey = `${it.ma_vt}_${it.lot || ''}`;
        const isChecked = confirmSelectedItems.has(itemKey);
        return `
            <label class="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs cursor-pointer hover:border-blue-400 transition-colors select-none">
                <input type="checkbox" class="hn-confirm-item-cb text-blue-600 rounded focus:ring-0" data-item-key="${itemKey}" ${isChecked ? 'checked' : ''}>
                <span class="font-mono font-bold text-blue-700">${it.ma_vt}</span>
                <span class="text-gray-700 truncate max-w-[150px] md:max-w-[220px]" title="${it.ten_vt || ''}">${it.ten_vt || '-'}</span>
                <span class="text-gray-400 font-mono text-[11px]">(LOT: ${it.lot || '-'})</span>
            </label>
        `;
    }).join('');

    container.querySelectorAll('.hn-confirm-item-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const key = cb.dataset.itemKey;
            if (cb.checked) {
                confirmSelectedItems.add(key);
            } else {
                confirmSelectedItems.delete(key);
            }
            renderConfirmDocumentPreview();
        });
    });
}

/**
 * Chọn / Bỏ chọn tất cả sản phẩm vào form xác nhận
 */
function toggleAllConfirmProducts() {
    const items = rawLoanItems.filter(it => it.ma_nx === currentBatchDo);
    if (confirmSelectedItems.size === items.length) {
        confirmSelectedItems.clear();
    } else {
        items.forEach(it => confirmSelectedItems.add(`${it.ma_vt}_${it.lot || ''}`));
    }
    renderConfirmProductsChecklist(items);
    renderConfirmDocumentPreview();
}

/**
 * Thêm người ký PSR (ngành EES)
 */
function addConfirmPsr(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    if (!confirmPsrList.includes(trimmed)) {
        confirmPsrList.push(trimmed);
        if (!eesStaffList.includes(trimmed)) {
            eesStaffList.push(trimmed);
            eesStaffList.sort((a, b) => a.localeCompare(b, 'vi'));
        }
    }
    const input = document.getElementById('hn-confirm-psr-input');
    if (input) input.value = '';
    renderConfirmPsrTags();
    renderConfirmDocumentPreview();
}

/**
 * Xóa người ký PSR
 */
function removeConfirmPsr(index) {
    if (index >= 0 && index < confirmPsrList.length) {
        confirmPsrList.splice(index, 1);
        renderConfirmPsrTags();
        renderConfirmDocumentPreview();
    }
}

/**
 * Render các thẻ tag người ký PSR
 */
function renderConfirmPsrTags() {
    const container = document.getElementById('hn-confirm-psr-tags');
    if (!container) return;

    if (confirmPsrList.length === 0) {
        container.innerHTML = '<span class="text-[11px] text-gray-400 italic">Chưa thêm người ký PSR nào.</span>';
        return;
    }

    container.innerHTML = confirmPsrList.map((name, idx) => `
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs">
            <span>${name}</span>
            <button type="button" class="hn-confirm-remove-psr-btn text-blue-400 hover:text-red-600 font-bold ml-1 text-xs" data-idx="${idx}">✕</button>
        </span>
    `).join('');

    container.querySelectorAll('.hn-confirm-remove-psr-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.idx);
            removeConfirmPsr(idx);
        });
    });
}

/**
 * Render biểu mẫu xác nhận GEN11 Demo Unit Tracking theo đúng mẫu và màu sắc
 */
function renderConfirmDocumentPreview() {
    const tableBody = document.getElementById('hn-confirm-table-body');
    const signaturesGrid = document.getElementById('hn-confirm-signatures-grid');
    if (!tableBody || !signaturesGrid) return;

    const items = rawLoanItems.filter(it => it.ma_nx === currentBatchDo);
    const selectedItems = items.filter(it => confirmSelectedItems.has(`${it.ma_vt}_${it.lot || ''}`));

    // Lấy thông tin chung hiện tại từ form
    const currentBms = (document.getElementById('hn-batch-bms')?.value || '').trim();
    const currentRegion = (document.getElementById('hn-batch-region')?.value || '').trim();
    const currentBmSigner = (document.getElementById('hn-confirm-bm-input')?.value || currentBms || '').trim();

    // Map số seri hiện tại từ các ô nhập ở Tab 1
    const seriMap = new Map();
    document.querySelectorAll('.hn-batch-seri-input').forEach(inp => {
        seriMap.set(inp.dataset.itemKey, inp.value.trim());
    });

    // 1. Render các dòng bảng dữ liệu (Serial Number | BMs | PSRs | Regions)
    if (selectedItems.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="padding: 20px; text-align: center; color: #64748b; font-style: italic; background-color: #f8fafc; border: 1px solid #cbd5e1;">
                    Chưa có sản phẩm nào được chọn đưa vào biểu mẫu. Vui lòng tick chọn sản phẩm ở trên.
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = selectedItems.map(item => {
            const itemKey = `${item.ma_vt}_${item.lot || ''}`;
            const seri = (seriMap.has(itemKey) ? seriMap.get(itemKey) : item.seri) || '-';
            const bmsVal = currentBms || item.bms || '-';
            const psrVal = item.yeu_cau || '-'; // Lấy tên người mượn theo đúng yêu cầu
            const regionVal = currentRegion || item.region || '-';

            return `
                <tr style="background-color: #d8ecf8; color: #0e2e47; text-align: center; font-size: 13px; font-weight: 500;">
                    <td style="padding: 9px 8px; border: 1px solid #a3c9e2; font-family: monospace; font-weight: bold; letter-spacing: 0.5px;">${seri}</td>
                    <td style="padding: 9px 8px; border: 1px solid #a3c9e2;">${bmsVal}</td>
                    <td style="padding: 9px 8px; border: 1px solid #a3c9e2; font-weight: 600;">${psrVal}</td>
                    <td style="padding: 9px 8px; border: 1px solid #a3c9e2;">${regionVal}</td>
                </tr>
            `;
        }).join('');
    }

    // 2. Render khung chữ ký (SIGNATURE APPROVALS: 2 cột theo đúng mẫu)
    // Cột trái: PSR 1, PSR 2, BM (hàng 3)
    // Cột phải: PSR 3, PSR 4, PSR 5
    const psrNames = [...confirmPsrList];
    const todayStr = formatDateToDDMMYYYY(new Date().toISOString());

    const signatureBoxes = [
        { title: 'PSR', name: psrNames[0] || '' }, // Hàng 1, Cột Trái
        { title: 'PSR', name: psrNames[2] || '' }, // Hàng 1, Cột Phải
        { title: 'PSR', name: psrNames[1] || '' }, // Hàng 2, Cột Trái
        { title: 'PSR', name: psrNames[3] || '' }, // Hàng 2, Cột Phải
        { title: 'BM',  name: currentBmSigner   }, // Hàng 3, Cột Trái (Vị trí BM)
        { title: 'PSR', name: psrNames[4] || '' }, // Hàng 3, Cột Phải
    ];

    // Nếu người dùng thêm nhiều hơn 5 PSRs, tự động mở rộng thêm các hàng phía sau
    if (psrNames.length > 5) {
        for (let i = 5; i < psrNames.length; i += 2) {
            signatureBoxes.push({ title: 'PSR', name: psrNames[i] || '' });
            signatureBoxes.push({ title: 'PSR', name: psrNames[i + 1] || '' });
        }
    }

    signaturesGrid.innerHTML = signatureBoxes.map(box => `
        <div style="border: 1px solid #14555f; background-color: #ffffff; border-radius: 2px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="background-color: #e0eff5; color: #0e2e47; text-align: center; font-weight: 700; font-size: 13px; padding: 6px 8px; border-bottom: 1px solid #a3c9e2; letter-spacing: 0.5px;">
                ${box.title}
            </div>
            <div style="min-height: 48px; padding: 8px;"></div>
            <div style="padding: 6px 12px 10px 12px; font-size: 12px; color: #0e2e47; border-top: 1px dashed #cbd5e1; background-color: #fafcfe;">
                <div style="margin-bottom: 4px; display: flex; align-items: baseline;">
                    <span style="font-weight: 600; min-width: 48px;">Name:</span>
                    <span style="font-weight: 700; border-bottom: 1px solid #0e2e47; flex: 1; padding-left: 4px; min-height: 16px; color: #0e2e47;">
                        ${box.name || '&nbsp;'}
                    </span>
                </div>
                <div style="display: flex; align-items: baseline;">
                    <span style="font-weight: 600; min-width: 48px;">Date:</span>
                    <span style="border-bottom: 1px solid #0e2e47; flex: 1; padding-left: 4px; min-height: 16px; color: #475569;">
                        ${todayStr}
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Xuất biểu mẫu xác nhận thành file PDF chuẩn A4
 */
async function exportTrackingFormToPdf() {
    const docRoot = document.getElementById('hn-confirm-document-root');
    if (!docRoot) return;

    if (typeof html2pdf === 'undefined') {
        showToast('Thư viện tạo PDF đang tải, vui lòng thử lại sau giây lát hoặc dùng nút In.', 'warning');
        return;
    }

    const exportBtn = document.getElementById('hn-confirm-export-pdf');
    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.innerHTML = `
            <svg class="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Đang xuất...</span>
        `;
    }

    try {
        const doCode = sanitizeFileName(currentBatchDo || 'GEN11').replace(/[^a-zA-Z0-9_-]/g, '_');
        const opt = {
            margin: [8, 8, 8, 8],
            filename: `GEN11_Demo_Tracking_${doCode}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        await html2pdf().set(opt).from(docRoot).save();
        showToast(`Đã xuất PDF cho đơn DO ${currentBatchDo} thành công!`, 'success');
    } catch (err) {
        console.error('Lỗi xuất PDF:', err);
        showToast('Lỗi xuất PDF: ' + (err.message || err), 'error');
    } finally {
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = `
                <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-5.5-7.5l2.4 3.6h-1.6l-1.7-2.7-1.7 2.7H8.8l2.4-3.6-2.3-3.4h1.6l1.6 2.5 1.6-2.5h1.6l-2.3 3.4z"/>
                </svg>
                <span>Xuất PDF</span>
            `;
        }
    }
}

/**
 * Mở cửa sổ in biểu mẫu
 */
function printTrackingForm() {
    const docRoot = document.getElementById('hn-confirm-document-root');
    if (!docRoot) return;

    const printWin = window.open('', '_blank', 'width=850,height=900');
    if (!printWin) {
        showToast('Vui lòng cho phép mở popup để in biểu mẫu.', 'warning');
        return;
    }

    printWin.document.open();
    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>GEN11 Demo Unit Tracking - ${currentBatchDo || ''}</title>
            <style>
                @page { size: A4 portrait; margin: 12mm; }
                body { margin: 0; padding: 20px; font-family: Arial, Helvetica, sans-serif; color: #0e2e47; }
                table { border-collapse: collapse; width: 100%; }
                @media print {
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            ${docRoot.outerHTML}
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

function renderBatchProductsList(items, batchItemTimelineMap = new Map()) {
    const listEl = document.getElementById('hn-batch-products-list');
    if (!listEl) return;

    if (items.length === 0) {
        listEl.innerHTML = '<div class="p-4 text-center text-xs text-gray-500 italic">Không có sản phẩm nào.</div>';
        return;
    }

    listEl.innerHTML = items.map((item, index) => {
        const itemKey = `${item.ma_vt}_${item.lot || ''}`;
        const itemKeyUpper = itemKey.toUpperCase();
        const itemKeyClean = itemKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        const logs = (batchItemTimelineMap && batchItemTimelineMap.get(itemKeyUpper)) || [];
        const effectiveSeri = item.seri || (logs.find(l => l.seri)?.seri) || '';

        return `
            <div class="bg-white border border-gray-200 rounded-xl p-3 md:p-3.5 shadow-2xs space-y-2.5">
                <!-- Header của sản phẩm: STT, Mã VT, Tên VT -->
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs text-gray-400 font-semibold">#${index + 1}</span>
                    <span class="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">${item.ma_vt}</span>
                    <span class="text-xs font-semibold text-gray-800 truncate" title="${item.ten_vt || ''}">${item.ten_vt || '-'}</span>
                </div>

                <!-- LOT, HSD, Còn nợ (bỏ ngành & mục đích) -->
                <div class="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
                    <span>LOT: <b class="font-mono text-gray-700">${item.lot || '-'}</b></span>
                    <span>• HSD: <b>${item.date || '-'}</b></span>
                    <span>• Còn nợ: <b class="text-red-600 font-bold">${item.sl_con_no.toLocaleString('vi-VN')}</b></span>
                </div>

                <!-- Hàng Số Seri + 2 nút Chụp ảnh & Thêm ảnh trên cùng 1 hàng -->
                <div class="flex items-center gap-2 pt-0.5">
                    <input type="text" class="hn-batch-seri-input flex-1 min-w-[120px] text-xs p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400 font-mono"
                        data-item-key="${itemKey}" value="${effectiveSeri}" placeholder="Số Seri...">

                    <input type="file" class="hn-batch-cam-file hidden" data-item-key="${itemKey}" accept="image/*" capture="environment" multiple>
                    <input type="file" class="hn-batch-gal-file hidden" data-item-key="${itemKey}" accept="image/*" multiple>

                    <button type="button" class="hn-batch-cam-btn px-2.5 py-2 bg-white border border-gray-300 hover:border-blue-500 hover:text-blue-600 rounded-lg text-xs font-medium flex items-center gap-1 active:scale-95 shadow-2xs transition-colors flex-shrink-0" data-item-key="${itemKey}">
                        <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                        <span>Chụp ảnh</span>
                    </button>
                    <button type="button" class="hn-batch-gal-btn px-2.5 py-2 bg-white border border-gray-300 hover:border-blue-500 hover:text-blue-600 rounded-lg text-xs font-medium flex items-center gap-1 active:scale-95 shadow-2xs transition-colors flex-shrink-0" data-item-key="${itemKey}">
                        <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <span>Thêm ảnh</span>
                    </button>
                </div>

                <!-- Container preview ảnh mới chọn cho sản phẩm này -->
                <div id="hn-batch-preview-${itemKeyClean}" class="flex flex-wrap gap-2 pt-1 hidden"></div>

                <!-- KHU VỰC HIỂN THỊ NHẬT KÝ & ẢNH ĐÃ LƯU CỦA SẢN PHẨM CON NÀY -->
                ${logs.length > 0 ? `
                    <div class="mt-2 pt-2 border-t border-gray-100">
                        <div class="flex items-center justify-between text-[11px] font-bold text-gray-700 mb-1.5">
                            <span class="flex items-center gap-1.5 text-blue-700">
                                <svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                Nhật ký & Ảnh đã lưu (${logs.length} mốc):
                            </span>
                        </div>
                        <div class="space-y-2">
                            ${logs.map(log => {
                                const isGiaHan = log.loai_moc === 'gia_han';
                                const badgeClass = isGiaHan ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200';
                                const label = isGiaHan ? 'Gia hạn' : 'Báo trả';
                                const logImgs = Array.isArray(log.hinh_anh) ? log.hinh_anh : [];
                                return `
                                    <div class="bg-gray-50/90 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700 space-y-1.5 shadow-3xs">
                                        <div class="flex items-center justify-between gap-1 flex-wrap">
                                            <div class="flex items-center gap-1.5">
                                                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeClass}">${label}</span>
                                                <span class="text-[11px] text-gray-500 font-medium">${formatDateTimeVN(log.thoi_gian)}</span>
                                            </div>
                                            <div class="flex items-center gap-1.5">
                                                ${log.nguoi_thuc_hien ? `<span class="text-[10px] text-gray-400">Bởi: <b class="text-gray-600 font-medium">${log.nguoi_thuc_hien}</b></span>` : ''}
                                                <button type="button" class="hn-batch-delete-log-btn text-gray-300 hover:text-red-600 p-0.5 transition-colors" data-log-id="${log.id}" title="Xóa mốc này">
                                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                </button>
                                            </div>
                                        </div>

                                        ${log.ghi_chu ? `<div class="text-xs text-gray-800 whitespace-pre-wrap bg-white p-2 rounded border border-gray-200/80 leading-relaxed">${log.ghi_chu}</div>` : ''}

                                        ${logImgs.length > 0 ? `
                                            <div class="flex flex-wrap gap-1.5 pt-0.5">
                                                ${logImgs.map(imgUrl => `
                                                    <div class="relative group w-14 h-14 rounded-lg overflow-hidden border border-gray-300 bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity hn-batch-thumb-wrap" data-img-url="${imgUrl}">
                                                        <img src="${imgUrl}" alt="Ảnh bằng chứng" loading="lazy" class="w-full h-full object-cover">
                                                        <div class="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                            <svg class="w-4 h-4 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg>
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Gắn sự kiện chụp/chọn ảnh cho từng sản phẩm
    listEl.querySelectorAll('.hn-batch-cam-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const k = btn.dataset.itemKey;
            const fileInput = listEl.querySelector(`.hn-batch-cam-file[data-item-key="${k}"]`);
            fileInput?.click();
        });
    });

    listEl.querySelectorAll('.hn-batch-gal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const k = btn.dataset.itemKey;
            const fileInput = listEl.querySelector(`.hn-batch-gal-file[data-item-key="${k}"]`);
            fileInput?.click();
        });
    });

    listEl.querySelectorAll('.hn-batch-cam-file, .hn-batch-gal-file').forEach(input => {
        input.addEventListener('change', async (e) => {
            const k = input.dataset.itemKey;
            const files = e.target.files;
            if (files && files.length > 0) {
                await handleBatchItemPhotos(k, files);
            }
            e.target.value = '';
        });
    });

    listEl.querySelectorAll('.hn-batch-seri-input').forEach(inp => {
        inp.addEventListener('input', () => {
            renderConfirmDocumentPreview();
        });
    });

    // Mở xem ảnh phóng to (lightbox) khi click vào ảnh đã lưu
    listEl.querySelectorAll('.hn-batch-thumb-wrap').forEach(wrap => {
        wrap.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = wrap.dataset.imgUrl;
            if (url) openLightbox(url);
        });
    });

    // Xóa mốc nhật ký của sản phẩm con
    listEl.querySelectorAll('.hn-batch-delete-log-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const logId = btn.dataset.logId;
            const confirmed = await showConfirm('Bạn có chắc chắn muốn xóa mốc nhật ký này của sản phẩm?', 'Xác nhận xóa');
            if (confirmed) {
                showLoading(true);
                try {
                    const { error: delErr } = await sb.from('hang_no_timeline').delete().eq('id', logId);
                    if (delErr) throw delErr;
                    showToast('Đã xóa mốc nhật ký thành công!', 'success');
                    await loadTimelineStats();
                    applyFiltersAndRender(false);
                    await onBatchDoChanged(currentBatchDo);
                } catch (err) {
                    console.error('Lỗi xóa log:', err);
                    showToast('Lỗi xóa: ' + (err.message || err), 'error');
                } finally {
                    showLoading(false);
                }
            }
        });
    });
}

async function handleBatchItemPhotos(itemKey, fileList) {
    if (!fileList || fileList.length === 0) return;

    showLoading(true);
    try {
        const itemKeyClean = itemKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        const container = document.getElementById(`hn-batch-preview-${itemKeyClean}`);
        const currentArr = batchPhotosMap.get(itemKey) || [];

        for (let i = 0; i < fileList.length; i++) {
            const rawFile = fileList[i];
            if (!rawFile.type.startsWith('image/')) continue;

            const compressed = await compressImageFile(rawFile, 1600, 1600, 0.82);
            const previewUrl = URL.createObjectURL(compressed);
            const sizeKb = Math.round(compressed.size / 1024);

            currentArr.push({
                file: compressed,
                previewUrl: previewUrl,
                sizeKb: sizeKb
            });
        }

        batchPhotosMap.set(itemKey, currentArr);
        renderBatchItemPhotoPreviews(itemKey, container);
    } catch (e) {
        console.error('Lỗi xử lý ảnh sản phẩm:', e);
        showToast('Lỗi xử lý ảnh: ' + e.message, 'error');
    } finally {
        showLoading(false);
    }
}

function renderBatchItemPhotoPreviews(itemKey, container) {
    if (!container) return;
    const photos = batchPhotosMap.get(itemKey) || [];

    if (photos.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="w-full flex items-center justify-between text-[11px] text-gray-500 mb-0.5">
            <span class="font-semibold text-blue-700">Đã chọn ${photos.length} ảnh:</span>
            <button type="button" class="hn-batch-clear-item-photos text-red-500 hover:underline" data-item-key="${itemKey}">Xóa tất cả</button>
        </div>
        <div class="flex flex-wrap gap-1.5 w-full">
            ${photos.map((p, idx) => `
                <div class="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-300 bg-gray-100 flex-shrink-0 group shadow-2xs">
                    <img src="${p.previewUrl}" class="w-full h-full object-cover">
                    <button type="button" class="hn-batch-remove-photo-btn absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-red-600 text-white flex items-center justify-center text-[9px] shadow" data-item-key="${itemKey}" data-idx="${idx}">✕</button>
                    <span class="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] text-center truncate">${p.sizeKb}KB</span>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.hn-batch-remove-photo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const k = btn.dataset.itemKey;
            const idx = Number(btn.dataset.idx);
            const arr = batchPhotosMap.get(k);
            if (arr) {
                arr.splice(idx, 1);
                renderBatchItemPhotoPreviews(k, container);
            }
        });
    });

    container.querySelector('.hn-batch-clear-item-photos')?.addEventListener('click', () => {
        batchPhotosMap.set(itemKey, []);
        renderBatchItemPhotoPreviews(itemKey, container);
    });
}

async function saveBatchDo() {
    const maNx = currentBatchDo;
    if (!maNx) {
        showToast('Không xác định được mã DO cần cập nhật.', 'warning');
        return;
    }

    const doItems = rawLoanItems.filter(it => it.ma_nx === maNx);
    if (doItems.length === 0) {
        showToast('Không tìm thấy sản phẩm nào thuộc đơn DO này.', 'warning');
        return;
    }

    const bms = (document.getElementById('hn-batch-bms')?.value || '').trim();
    const region = (document.getElementById('hn-batch-region')?.value || '').trim();
    const note = (document.getElementById('hn-batch-note')?.value || '').trim();
    const typeRadio = document.querySelector('input[name="hn-batch-moc-type"]:checked');
    const loaiMoc = typeRadio ? typeRadio.value : 'gia_han';

    // Đọc số Seri của từng sản phẩm từ input
    const seriInputs = document.querySelectorAll('.hn-batch-seri-input');
    const seriMap = new Map();
    seriInputs.forEach(input => {
        const k = input.dataset.itemKey;
        seriMap.set(k, input.value.trim());
    });

    showLoading(true);

    try {
        const cleanDO = sanitizeFileName(maNx || 'DO').replace(/[^a-zA-Z0-9_-]/g, '_');
        const performer = currentUser?.ho_ten || currentUser?.gmail || 'Nhân viên';
        const nowIso = new Date().toISOString();

        for (const item of doItems) {
            const itemKey = `${item.ma_vt}_${item.lot || ''}`;
            const itemSeri = seriMap.has(itemKey) ? seriMap.get(itemKey) : (item.seri || '');
            const itemPhotos = batchPhotosMap.get(itemKey) || [];

            // 1. Tải ảnh của từng sản phẩm lên Storage
            const uploadedUrls = [];
            if (itemPhotos.length > 0) {
                const cleanVt = sanitizeFileName(item.ma_vt || 'VT').replace(/[^a-zA-Z0-9_-]/g, '_');
                for (let i = 0; i < itemPhotos.length; i++) {
                    const photoObj = itemPhotos[i];
                    const randStr = Math.random().toString(36).substring(2, 8);
                    const fileName = `${cleanDO}/${cleanVt}_${Date.now()}_${i}_${randStr}.jpg`;

                    const { error: uploadErr } = await sb.storage.from('hang_no_media').upload(fileName, photoObj.file, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: 'image/jpeg'
                    });

                    if (uploadErr) {
                        throw new Error(`Lỗi tải ảnh của ${item.ma_vt}: ${uploadErr.message || uploadErr}`);
                    }

                    const { data: publicUrlData } = sb.storage.from('hang_no_media').getPublicUrl(fileName);
                    if (publicUrlData?.publicUrl) {
                        uploadedUrls.push(publicUrlData.publicUrl);
                    }
                }
            }

            // 2. Lưu thông tin Seri, BMs, Region vào bảng hang_no_info
            const { error: infoErr } = await sb.from('hang_no_info').upsert({
                ma_nx: item.ma_nx,
                ma_vt: item.ma_vt,
                lot: item.lot || '',
                seri: itemSeri,
                bms: bms,
                region: region,
                updated_at: nowIso
            }, { onConflict: 'ma_nx,ma_vt,lot' });
            if (infoErr) console.warn('Lỗi upsert hang_no_info:', infoErr);

            // 3. Phân bổ lưu vào nhật ký hang_no_timeline (CHỈ tạo mốc khi có ghi chú hoặc có ảnh đính kèm)
            const hasTimelineMilestone = note.length > 0 || uploadedUrls.length > 0;
            if (hasTimelineMilestone) {
                const insertPayload = {
                    chi_tiet_id: item.id || null,
                    ma_nx: item.ma_nx,
                    ma_vt: item.ma_vt,
                    lot: item.lot || '',
                    seri: itemSeri,
                    loai_moc: loaiMoc,
                    thoi_gian: nowIso,
                    nguoi_thuc_hien: performer,
                    hinh_anh: uploadedUrls,
                    ghi_chu: note
                };
                const { error: timelineErr } = await sb.from('hang_no_timeline').insert([insertPayload]);
                if (timelineErr) console.warn('Lỗi insert timeline:', timelineErr);
            }

            // 4. Cập nhật dữ liệu trong bộ nhớ
            item.seri = itemSeri;
            item.bms = bms;
            item.region = region;
        }

        // Cập nhật tất cả các phần tử trong rawLoanItems có cùng DO
        rawLoanItems.forEach(it => {
            if (it.ma_nx === maNx) {
                const k = `${it.ma_vt}_${it.lot || ''}`;
                if (seriMap.has(k)) it.seri = seriMap.get(k);
                it.bms = bms;
                it.region = region;
            }
        });

        if (bms && !distinctBmsList.includes(bms)) {
            distinctBmsList.push(bms);
            distinctBmsList.sort((a, b) => a.localeCompare(b, 'vi'));
        }
        if (region && !distinctRegionList.includes(region)) {
            distinctRegionList.push(region);
            distinctRegionList.sort((a, b) => a.localeCompare(b, 'vi'));
        }

        showToast(`Đã lưu cập nhật cho đơn DO ${maNx} (${doItems.length} sản phẩm) thành công!`, 'success');

        closeBatchDoModal();
        await loadTimelineStats();
        applyFiltersAndRender(false);

    } catch (err) {
        console.error('Lỗi lưu cập nhật theo DO:', err);
        showToast('Lỗi: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Khởi tạo View Hàng Nợ
 */
export function initHangNoView() {
    const container = document.getElementById('view-hang-no');
    if (!container) return;

    container.innerHTML = VIEW_HTML;

    // Chèn modal cài đặt cột và modal timeline vào body nếu chưa có
    if (!document.getElementById('hang-no-settings-modal')) {
        document.body.insertAdjacentHTML('beforeend', TIMELINE_AND_SETTINGS_MODAL_HTML);
    }

    // Search input
    const searchInput = document.getElementById('hang-no-search');
    const searchClear = document.getElementById('hang-no-search-clear');

    const handleSearch = debounce(() => {
        hangNoFilters.searchTerm = searchInput?.value || '';
        hangNoFilters.currentPage = 1;
        applyFiltersAndRender(false);
    }, 300);

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (searchClear) searchClear.classList.toggle('hidden', !searchInput.value);
            handleSearch();
        });
    }

    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.classList.add('hidden');
            hangNoFilters.searchTerm = '';
            hangNoFilters.currentPage = 1;
            applyFiltersAndRender(false);
        });
    }

    // Filter Buttons
    document.getElementById('hang-no-filter-yeu-cau-btn')?.addEventListener('click', (e) => {
        openHangNoFilterPopover(e.currentTarget, 'yeu_cau', 'Người mượn');
    });

    document.getElementById('hang-no-filter-nganh-btn')?.addEventListener('click', (e) => {
        openHangNoFilterPopover(e.currentTarget, 'nganh', 'Ngành');
    });

    // Nút Xóa Lọc
    document.getElementById('hang-no-reset-filters')?.addEventListener('click', resetAllHangNoFilters);

    // Nút Cài đặt hiển thị cột
    document.getElementById('hang-no-col-settings-btn')?.addEventListener('click', openColumnSettingsModal);

    // Export Excel
    document.getElementById('hang-no-btn-excel')?.addEventListener('click', exportToExcel);

    // Items per page
    document.getElementById('hang-no-items-per-page')?.addEventListener('change', (e) => {
        hangNoFilters.itemsPerPage = Number(e.target.value) || 50;
        hangNoFilters.currentPage = 1;
        applyFiltersAndRender(false);
    });

    // Pagination buttons
    document.getElementById('hang-no-prev-page')?.addEventListener('click', () => {
        if (hangNoFilters.currentPage > 1) {
            hangNoFilters.currentPage--;
            applyFiltersAndRender(false);
        }
    });

    document.getElementById('hang-no-next-page')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredLoanItems.length / hangNoFilters.itemsPerPage) || 1;
        if (hangNoFilters.currentPage < totalPages) {
            hangNoFilters.currentPage++;
            applyFiltersAndRender(false);
        }
    });

    document.getElementById('hang-no-page-input')?.addEventListener('change', (e) => {
        const val = Number(e.target.value) || 1;
        hangNoFilters.currentPage = val;
        applyFiltersAndRender(false);
    });

    // Event listeners cho Timeline Modal
    document.getElementById('hn-tl-modal-close')?.addEventListener('click', closeTimelineModal);

    document.getElementById('hang-no-timeline-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'hang-no-timeline-modal') {
            closeTimelineModal();
        }
    });

    // Nút chụp ảnh camera
    const cameraInput = document.getElementById('hn-camera-input');
    document.getElementById('hn-trigger-camera')?.addEventListener('click', () => {
        cameraInput?.click();
    });
    cameraInput?.addEventListener('change', (e) => {
        handlePhotosSelected(e.target.files);
        e.target.value = '';
    });

    // Nút chọn từ thư viện
    const galleryInput = document.getElementById('hn-gallery-input');
    document.getElementById('hn-trigger-gallery')?.addEventListener('click', () => {
        galleryInput?.click();
    });
    galleryInput?.addEventListener('change', (e) => {
        handlePhotosSelected(e.target.files);
        e.target.value = '';
    });

    // Nút Lưu mốc thời gian
    document.getElementById('hn-save-timeline-btn')?.addEventListener('click', saveTimelineEntry);

    // Lightbox modal events
    document.getElementById('hn-lightbox-close')?.addEventListener('click', closeLightbox);
    document.getElementById('hang-no-lightbox-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'hang-no-lightbox-modal') closeLightbox();
    });

    // Batch DO Modal events
    document.getElementById('hn-batch-modal-close')?.addEventListener('click', closeBatchDoModal);
    document.getElementById('hn-batch-modal-cancel')?.addEventListener('click', closeBatchDoModal);
    document.getElementById('hn-batch-save-btn')?.addEventListener('click', saveBatchDo);
    document.getElementById('hang-no-batch-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'hang-no-batch-modal') closeBatchDoModal();
    });

    // 2 Tab chuyển đổi trong Batch Modal
    document.getElementById('hn-batch-tab-update')?.addEventListener('click', () => switchBatchTab('update'));
    document.getElementById('hn-batch-tab-confirm')?.addEventListener('click', () => switchBatchTab('confirm'));

    // Tab 2: Sự kiện chọn sản phẩm, thêm PSR, BM và In / Xuất PDF
    document.getElementById('hn-confirm-toggle-all-products')?.addEventListener('click', toggleAllConfirmProducts);
    document.getElementById('hn-confirm-add-psr-btn')?.addEventListener('click', () => {
        const input = document.getElementById('hn-confirm-psr-input');
        if (input && input.value.trim()) {
            addConfirmPsr(input.value.trim());
        }
    });
    document.getElementById('hn-confirm-psr-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const input = document.getElementById('hn-confirm-psr-input');
            if (input && input.value.trim()) {
                addConfirmPsr(input.value.trim());
            }
        }
    });
    document.getElementById('hn-confirm-bm-input')?.addEventListener('input', () => {
        renderConfirmDocumentPreview();
    });
    document.getElementById('hn-confirm-print-btn')?.addEventListener('click', printTrackingForm);
    document.getElementById('hn-confirm-export-pdf')?.addEventListener('click', exportTrackingFormToPdf);

    // Đồng bộ BMs & Region từ Tab 1 sang Tab 2 khi nhập
    document.getElementById('hn-batch-bms')?.addEventListener('input', () => {
        const bmConfirm = document.getElementById('hn-confirm-bm-input');
        if (bmConfirm && !bmConfirm.value) {
            bmConfirm.value = document.getElementById('hn-batch-bms').value;
        }
        renderConfirmDocumentPreview();
    });
    document.getElementById('hn-batch-region')?.addEventListener('input', () => {
        renderConfirmDocumentPreview();
    });

    // In-app custom combobox dropdowns cho BMs & Region & PSR (không kích hoạt droplist trình duyệt)
    setupCustomCombobox({
        inputId: 'hn-batch-bms',
        toggleBtnId: 'hn-batch-bms-toggle',
        dropdownId: 'hn-batch-bms-dropdown',
        getOptions: () => distinctBmsList,
        onSelect: (val) => {
            const bmConfirm = document.getElementById('hn-confirm-bm-input');
            if (bmConfirm && !bmConfirm.value) {
                bmConfirm.value = val;
            }
            renderConfirmDocumentPreview();
        }
    });
    setupCustomCombobox({
        inputId: 'hn-batch-region',
        toggleBtnId: 'hn-batch-region-toggle',
        dropdownId: 'hn-batch-region-dropdown',
        getOptions: () => distinctRegionList,
        onSelect: () => {
            renderConfirmDocumentPreview();
        }
    });
    setupCustomCombobox({
        inputId: 'hn-confirm-psr-input',
        toggleBtnId: 'hn-confirm-psr-toggle',
        dropdownId: 'hn-confirm-psr-dropdown',
        getOptions: () => eesStaffList,
        onSelect: (val) => {
            addConfirmPsr(val);
        }
    });
    setupCustomCombobox({
        inputId: 'hn-tl-bms',
        toggleBtnId: 'hn-tl-bms-toggle',
        dropdownId: 'hn-tl-bms-dropdown',
        getOptions: () => distinctBmsList
    });
    setupCustomCombobox({
        inputId: 'hn-tl-region',
        toggleBtnId: 'hn-tl-region-toggle',
        dropdownId: 'hn-tl-region-dropdown',
        getOptions: () => distinctRegionList
    });

    // Tự động phân bổ lại độ rộng bảng khi resize cửa sổ trình duyệt
    window.addEventListener('resize', debounce(() => {
        const viewEl = document.getElementById('view-hang-no');
        if (viewEl && !viewEl.classList.contains('hidden')) {
            renderTableHeader();
            applyFiltersAndRender(false);
        }
    }, 150));

    isInitialized = true;
}
