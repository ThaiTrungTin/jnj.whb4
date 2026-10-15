
import { sb, cache, viewStates, currentUser, showLoading, showToast, debounce, renderPagination, filterButtonDefaultTexts, showView, updateMobileFilterIconStatus, openAutocomplete } from './app.js';

const OPTIONAL_COLUMNS_CT = [
    { key: 'ma-kho', label: 'Mã Kho', class: 'ct-col-ma-kho' },
    { key: 'ma-vach', label: 'Code + Lot + EXP', class: 'ct-col-ma-vach' },
    { key: 'ten-vt', label: 'Tên Vật Tư', class: 'ct-col-ten-vt' },
    { key: 'yeu-cau', label: 'Yêu Cầu', class: 'ct-col-yeu-cau' },
    { key: 'nhap', label: 'Nhập', class: 'ct-col-nhap' },
    { key: 'xuat', label: 'Xuất', class: 'ct-col-xuat' },
    { key: 'loai', label: 'Loại', class: 'ct-col-loai' },
    { key: 'muc-dich', label: 'Mục Đích', class: 'ct-col-muc-dich' },
    { key: 'nganh', label: 'Ngành', class: 'ct-col-nganh' },
    { key: 'phu-trach', label: 'Phụ Trách', class: 'ct-col-phu-trach' },
];

let activeActionPopover = null;
let currentDistributingItem = null;
let detailVtItems = [];
let initialDetailVtItems = [];
let nameSuggestionsCache = [];
let isModalListenersInitialized = false;

const VIEW_HTML = `
    <div class="flex-shrink-0">
        <div id="ct-mobile-toolbar" class="md:hidden flex items-center gap-2 mb-3 bg-white p-2 rounded-lg shadow-sm">
            <input type="text" id="chi-tiet-search-mobile" placeholder="Tìm kiếm..." class="flex-grow px-2 py-1.5 border rounded-md text-[11px] min-w-0">
            <button id="ct-mobile-filter-toggle" class="p-1.5 bg-gray-100 rounded-md text-gray-600">
                <svg class="w-3 h-3 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
            </button>
            <button id="chi-tiet-btn-excel-mobile" class="p-1.5 bg-green-100 rounded-md text-green-600">
                <svg class="w-3 h-3 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </button>
        </div>

        <div id="ct-filter-drawer-overlay" class="fixed inset-0 bg-black bg-opacity-50 z-40 hidden transition-opacity duration-300"></div>
        <div id="ct-filter-drawer" class="fixed inset-y-0 right-0 w-64 bg-white z-50 transform translate-x-full transition-transform duration-300 shadow-xl flex flex-col">
            <div class="p-4 border-b flex justify-between items-center">
                <h3 class="font-bold text-lg">Bộ Lọc Chi Tiết</h3>
                <button id="ct-filter-drawer-close" class="text-gray-500 hover:text-gray-800">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="p-4 flex-grow space-y-4 overflow-y-auto">
                <!-- Bộ lọc thời gian (Điện thoại / Mobile Drawer) -->
                <div class="space-y-2" id="ct-mobile-date-filter-section">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke-width="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6" stroke-width="2"></line>
                                <line x1="8" y1="2" x2="8" y2="6" stroke-width="2"></line>
                                <line x1="3" y1="10" x2="21" y2="10" stroke-width="2"></line>
                            </svg>
                            <span class="text-xs font-semibold text-gray-500 uppercase">Khoảng Thời Gian</span>
                        </div>
                        <button type="button" id="ct-mobile-date-clear-btn" class="text-[11px] text-gray-400 hover:text-red-500 font-medium transition cursor-pointer" title="Xóa chọn ngày">
                            Xóa ngày
                        </button>
                    </div>

                    <!-- 2 nút chọn ngày: Từ ngày và Đến ngày -->
                    <div class="grid grid-cols-2 gap-2">
                        <button type="button" id="ct-btn-from-date-mobile" class="flex flex-col items-start px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-lg text-left transition shadow-sm cursor-pointer">
                            <span class="text-[9px] uppercase font-bold text-gray-400">Từ ngày</span>
                            <span id="ct-label-from-date-mobile" class="text-xs font-semibold text-gray-800 truncate">Chọn ngày</span>
                        </button>
                        <button type="button" id="ct-btn-to-date-mobile" class="flex flex-col items-start px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-lg text-left transition shadow-sm cursor-pointer">
                            <span class="text-[9px] uppercase font-bold text-gray-400">Đến ngày</span>
                            <span id="ct-label-to-date-mobile" class="text-xs font-semibold text-gray-800 truncate">Chọn ngày</span>
                        </button>
                    </div>

                    <!-- Custom In-App Calendar (Hiển thị ngay trong drawer, không bị tràn ra ngoài) -->
                    <div id="ct-custom-calendar-box" class="hidden mt-2 p-2.5 bg-white border border-gray-200 rounded-xl shadow-md w-full">
                        <div class="flex items-center justify-between mb-2">
                            <button type="button" id="ct-cal-prev-month" class="p-1 hover:bg-gray-100 rounded text-gray-600 transition cursor-pointer">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                            </button>
                            <div id="ct-cal-month-year-label" class="text-xs font-bold text-gray-800"></div>
                            <button type="button" id="ct-cal-next-month" class="p-1 hover:bg-gray-100 rounded text-gray-600 transition cursor-pointer">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                            </button>
                        </div>
                        <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-1">
                            <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span class="text-red-500">CN</span>
                        </div>
                        <div id="ct-cal-days-grid" class="grid grid-cols-7 gap-1 text-center text-xs"></div>
                        <div class="flex items-center justify-between pt-2 mt-2 border-t text-[11px]">
                            <button type="button" id="ct-cal-today-btn" class="text-blue-600 font-semibold hover:underline cursor-pointer">Hôm nay</button>
                            <button type="button" id="ct-cal-close-btn" class="text-gray-500 hover:text-gray-800 font-medium cursor-pointer">Đóng</button>
                        </div>
                    </div>
                </div>
                <div class="space-y-1.5 pt-2 border-t ct-custom-dropdown-container" id="ct-mobile-loai-don-wrap">
                    <label class="text-xs font-semibold text-gray-500 uppercase block">Loại Đơn</label>
                    <button type="button" class="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50 text-gray-800 hover:bg-gray-100 transition shadow-sm">
                        <span class="truncate font-medium text-xs ct-dropdown-label">Loại đơn: Tất cả</span>
                        <svg class="w-4 h-4 text-gray-400 transition-transform duration-200 ct-dropdown-arrow flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div class="ct-custom-dropdown-menu hidden mt-1 bg-white border border-gray-200 rounded-md shadow-md overflow-hidden divide-y divide-gray-100">
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium" data-value="">
                            <span>Loại đơn: Tất cả</span>
                            <span class="ct-opt-check hidden text-blue-600 font-bold">✓</span>
                        </div>
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium text-green-700" data-value="Nhập">
                            <span>Nhập (RO / IN)</span>
                            <span class="ct-opt-check hidden text-green-600 font-bold">✓</span>
                        </div>
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium text-red-600" data-value="Xuất">
                            <span>Xuất (DO / OUT)</span>
                            <span class="ct-opt-check hidden text-red-600 font-bold">✓</span>
                        </div>
                    </div>
                </div>
                <div class="space-y-1.5 pt-2 border-t ct-custom-dropdown-container" id="ct-mobile-trang-thai-wrap">
                    <label class="text-xs font-semibold text-gray-500 uppercase block">Trạng Thái</label>
                    <button type="button" class="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50 text-gray-800 hover:bg-gray-100 transition shadow-sm">
                        <span class="truncate font-medium text-xs ct-dropdown-label">Trạng thái: Tất cả</span>
                        <svg class="w-4 h-4 text-gray-400 transition-transform duration-200 ct-dropdown-arrow flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div class="ct-custom-dropdown-menu hidden mt-1 bg-white border border-gray-200 rounded-md shadow-md overflow-hidden divide-y divide-gray-100">
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium" data-value="">
                            <span>Trạng thái: Tất cả</span>
                            <span class="ct-opt-check hidden text-blue-600 font-bold">✓</span>
                        </div>
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium text-amber-700" data-value="dang_xu_ly">
                            <span>Đang xử lý</span>
                            <span class="ct-opt-check hidden text-amber-600 font-bold">✓</span>
                        </div>
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium text-green-700" data-value="hoan_thanh">
                            <span>Hoàn thành</span>
                            <span class="ct-opt-check hidden text-green-600 font-bold">✓</span>
                        </div>
                    </div>
                </div>
                <div class="space-y-2 pt-2 border-t">
                    <p class="text-xs font-semibold text-gray-500 uppercase">Tiêu chí khác</p>
                    <button id="chi-tiet-filter-loai-btn-mobile" data-filter-key="loai" class="filter-btn w-full text-left px-3 py-2 border rounded-md bg-gray-50 text-sm">Loại VT (Trưng Bày / Tiêu Hao)</button>
                    <button id="chi-tiet-filter-ma-kho-btn-mobile" data-filter-key="ma_kho" class="filter-btn w-full text-left px-3 py-2 border rounded-md bg-gray-50 text-sm">Mã Kho</button>
                    <button id="chi-tiet-filter-ma-nx-btn-mobile" data-filter-key="ma_nx" class="filter-btn w-full text-left px-3 py-2 border rounded-md bg-gray-50 text-sm">Mã NX</button>
                    <button id="chi-tiet-filter-ma-vt-btn-mobile" data-filter-key="ma_vt" class="filter-btn w-full text-left px-3 py-2 border rounded-md bg-gray-50 text-sm">Mã VT</button>
                    <button id="chi-tiet-filter-lot-btn-mobile" data-filter-key="lot" class="filter-btn w-full text-left px-3 py-2 border rounded-md bg-gray-50 text-sm">LOT</button>
                    <button id="chi-tiet-filter-nganh-btn-mobile" data-filter-key="nganh" class="filter-btn w-full text-left px-3 py-2 border rounded-md bg-gray-50 text-sm">Ngành</button>
                    <button id="chi-tiet-filter-phu-trach-btn-mobile" data-filter-key="phu_trach" class="filter-btn w-full text-left px-3 py-2 border rounded-md bg-gray-50 text-sm">Phụ Trách</button>
                    <button id="chi-tiet-filter-yeu-cau-btn-mobile" data-filter-key="yeu_cau" class="filter-btn w-full text-left px-3 py-2 border rounded-md bg-gray-50 text-sm">Yêu Cầu</button>
                </div>
            </div>
            <div class="p-4 border-t">
                <button id="chi-tiet-reset-filters-mobile" class="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 rounded-md">Xóa Lọc</button>
            </div>
        </div>

        <div class="vattu-toolbar-panel hidden md:flex items-center justify-between flex-nowrap bg-white p-2.5 rounded-xl shadow-sm border border-gray-100 mb-2">
            <div class="vattu-toolbar-filters flex gap-2 items-center flex-nowrap flex-shrink-0">
                <div class="vattu-search-wrap flex-shrink-0">
                    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="11" cy="11" r="7"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" id="chi-tiet-search" placeholder="Tìm kiếm chung..." autocomplete="off">
                    <button type="button" class="search-clear" id="chi-tiet-search-clear" style="display: none;">&times;</button>
                </div>
                <div class="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs shadow-sm flex-nowrap flex-shrink-0">
                    <span class="text-gray-400 font-medium">Từ:</span>
                    <input type="date" id="chi-tiet-filter-from-date" class="border-0 bg-transparent p-0 text-xs text-gray-700 focus:ring-0">
                    <span class="text-gray-300">|</span>
                    <span class="text-gray-400 font-medium">Đến:</span>
                    <input type="date" id="chi-tiet-filter-to-date" class="border-0 bg-transparent p-0 text-xs text-gray-700 focus:ring-0">
                </div>

                <!-- Hidden legacy filter buttons for DOM/mobile compatibility -->
                <div class="hidden">
                    <button id="chi-tiet-filter-loai-btn" data-filter-key="loai" class="filter-btn"></button>
                    <button id="chi-tiet-filter-ma-kho-btn" data-filter-key="ma_kho" class="filter-btn"></button>
                    <button id="chi-tiet-filter-ma-nx-btn" data-filter-key="ma_nx" class="filter-btn"></button>
                    <button id="chi-tiet-filter-ma-vt-btn" data-filter-key="ma_vt" class="filter-btn"></button>
                    <button id="chi-tiet-filter-lot-btn" data-filter-key="lot" class="filter-btn"></button>
                    <button id="chi-tiet-filter-nganh-btn" data-filter-key="nganh" class="filter-btn"></button>
                    <button id="chi-tiet-filter-phu-trach-btn" data-filter-key="phu_trach" class="filter-btn"></button>
                    <button id="chi-tiet-filter-yeu-cau-btn" data-filter-key="yeu_cau" class="filter-btn"></button>
                </div>

                <!-- Droplist: Loại Đơn (Nhập / Xuất) -->
                <div class="relative inline-flex items-center flex-shrink-0 ct-custom-dropdown-container" id="ct-desktop-loai-don-wrap">
                    <button type="button" class="ct-toolbar-select-btn flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition shadow-sm">
                        <span class="ct-dropdown-label">Loại: Tất cả</span>
                        <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ct-dropdown-arrow flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div class="ct-custom-dropdown-menu hidden absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden divide-y divide-gray-100">
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium" data-value="">
                            <span>Loại đơn: Tất cả</span>
                            <span class="ct-opt-check hidden text-blue-600 font-bold">✓</span>
                        </div>
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium text-green-700" data-value="Nhập">
                            <span>Nhập (RO / IN)</span>
                            <span class="ct-opt-check hidden text-green-600 font-bold">✓</span>
                        </div>
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium text-red-600" data-value="Xuất">
                            <span>Xuất (DO / OUT)</span>
                            <span class="ct-opt-check hidden text-red-600 font-bold">✓</span>
                        </div>
                    </div>
                </div>

                <!-- Droplist: Trạng Thái (Đang xử lý / Hoàn thành) -->
                <div class="relative inline-flex items-center flex-shrink-0 ct-custom-dropdown-container" id="ct-desktop-trang-thai-wrap">
                    <button type="button" class="ct-toolbar-select-btn flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition shadow-sm">
                        <span class="ct-dropdown-label">Trạng thái: Tất cả</span>
                        <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ct-dropdown-arrow flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div class="ct-custom-dropdown-menu hidden absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden divide-y divide-gray-100">
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium" data-value="">
                            <span>Trạng thái: Tất cả</span>
                            <span class="ct-opt-check hidden text-blue-600 font-bold">✓</span>
                        </div>
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium text-amber-700" data-value="dang_xu_ly">
                            <span>Đang xử lý</span>
                            <span class="ct-opt-check hidden text-amber-600 font-bold">✓</span>
                        </div>
                        <div class="ct-dropdown-option px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-between font-medium text-green-700" data-value="hoan_thanh">
                            <span>Hoàn thành</span>
                            <span class="ct-opt-check hidden text-green-600 font-bold">✓</span>
                        </div>
                    </div>
                </div>

                <!-- Display Mode Control: Nhánh vs Xem Thường -->
                <div class="tk-segmented-control flex-shrink-0" id="ct-display-mode-control">
                    <button type="button" id="ct-mode-tree"
                        class="tk-segment-btn bg-white shadow-sm font-semibold text-blue-600"
                        title="Chế độ gom nhóm theo Mã Kho dạng nhánh đổ xuống"
                        onclick="setChiTietDisplayMode('tree')">
                        <svg class="w-3.5 h-3.5 inline-block text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M8 14h12M8 18h12"></path>
                        </svg>
                        <span>Nhánh</span>
                    </button>
                    <button type="button" id="chi-tiet-btn-toggle-all-branches"
                        class="tk-branch-toggle-btn"
                        title="Đang thu gọn - Nhấn để mở rộng toàn bộ nhánh"
                        onclick="toggleAllChiTietSubRows()">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="7 11 12 6 17 11"></polyline>
                            <polyline points="7 18 12 13 17 18"></polyline>
                        </svg>
                    </button>
                    <button type="button" id="ct-mode-flat"
                        class="tk-segment-btn text-gray-500"
                        title="Chế độ xem bảng thường (không có nhánh)"
                        onclick="setChiTietDisplayMode('flat')">
                        <svg class="w-3.5 h-3.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                        </svg>
                        <span>Xem Thường</span>
                    </button>
                </div>
            </div>
            <div class="vattu-toolbar-actions flex gap-2 items-center flex-nowrap flex-shrink-0">
                <button type="button" id="chi-tiet-reset-filters"
                    class="btn-toolbar-secondary btn-clear-filter"
                    title="Xóa toàn bộ bộ lọc & tìm kiếm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z">
                        </path>
                        <line x1="18" y1="6" x2="6" y2="18" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"></line>
                    </svg>
                    <span>Xóa Lọc</span>
                </button>
                <button type="button" id="chi-tiet-btn-settings"
                    class="btn-toolbar-outline"
                    title="Tùy chỉnh ẩn/hiển các cột">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"></path>
                    </svg>
                    <span>Cài Đặt Cột</span>
                </button>
                <button type="button" id="chi-tiet-btn-excel"
                    class="btn-toolbar-excel btn-excel-export"
                    title="Xuất file Excel (.xlsx)">
                    <svg class="excel-btn-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-5.5-7.5l2.4 3.6h-1.6l-1.7-2.7-1.7 2.7H8.8l2.4-3.6-2.3-3.4h1.6l1.6 2.5 1.6-2.5h1.6l-2.3 3.4z" />
                    </svg>
                    <span>Xuất Excel</span>
                </button>
            </div>
        </div>
    </div>
    <div class="flex-1 min-h-0 bg-white rounded-lg shadow-md flex flex-col overflow-hidden">
        <div class="table-container min-w-full overflow-auto flex-1">
            <table class="min-w-full border-collapse table-fixed md:table-auto">
                <thead class="bg-gray-200 sticky top-0 z-30" id="chi-tiet-table-head"><tr>
                    <th class="px-2 py-2 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-24">
                        <span class="md:hidden">TG</span><span class="hidden md:inline">Thời Gian</span>
                    </th>
                    <th class="hidden md:table-cell ct-col-ma-kho px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-28" data-col="ma_kho">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Mã Kho</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="ma_kho" title="Lọc Mã Kho">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="sticky left-0 z-40 bg-gray-200 px-2 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 whitespace-nowrap min-w-max md:whitespace-normal md:min-w-[180px] shadow-[2px_0_5_px_-2px_rgba(0,0,0,0.2)]" data-col="ma_nx">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Mã NX</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="ma_nx" title="Lọc Mã NX">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="hidden md:table-cell ct-col-ma-vach px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-64" data-col="ma_vach">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Code + Lot + EXP</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="ma_vach" title="Lọc Code + Lot + EXP">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-32" data-col="ma_vt">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Mã VT</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="ma_vt" title="Lọc Mã VT">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="hidden md:table-cell ct-col-ten-vt px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 min-w-[400px] w-auto" data-col="ten_vt">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Tên VT</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="ten_vt" title="Lọc Tên VT">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-24" data-col="lot">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Lot</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="lot" title="Lọc Lot">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-28" data-col="date">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Date</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="date" title="Lọc Date">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="hidden md:table-cell ct-col-yeu-cau px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-20">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Yêu Cầu</span></div>
                        </div>
                    </th>
                    <th class="hidden md:table-cell ct-col-nhap px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-20">
                        <div class="text-[10px]">Nhập<span id="chi-tiet-header-nhap-count" class="block font-bold text-green-600 text-[7px] md:text-[9px]"></span></div>
                    </th>
                    <th class="hidden md:table-cell ct-col-xuat px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-20">
                        <div class="text-[10px]">Xuất<span id="chi-tiet-header-xuat-count" class="block font-bold text-red-600 text-[7px] md:text-[9px]"></span></div>
                    </th>
                    <th class="md:hidden px-1 py-3 text-center font-bold text-black uppercase tracking-wider border border-gray-300 w-6">
                        SL
                    </th>
                    <th class="hidden md:table-cell ct-col-loai px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-28" data-col="loai">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Loại</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="loai" title="Lọc Loại">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-32" data-col="yeu_cau">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Người YC</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="yeu_cau" title="Lọc Người YC">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="hidden md:table-cell ct-col-muc-dich px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 min-w-[300px] w-auto" data-col="muc_dich">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Mục Đích</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="muc_dich" title="Lọc Mục Đích">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="hidden md:table-cell ct-col-nganh px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-32" data-col="nganh">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Ngành</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="nganh" title="Lọc Ngành">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="hidden md:table-cell ct-col-phu-trach px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 w-32" data-col="phu_trach">
                        <div class="tk-th-content">
                            <div class="tk-th-title"><span class="truncate">Phụ Trách</span></div>
                            <button type="button" class="col-filter-btn hidden md:inline-flex" data-col="phu_trach" title="Lọc Phụ Trách">
                                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                        </div>
                    </th>
                    <th class="px-1 py-3 text-center font-bold text-black uppercase tracking-wider border border-gray-300 w-6 md:w-12 md:sticky md:right-0 md:bg-gray-200 z-30 sticky-action-col-mobile">
                    </th>
                </tr></thead>
                <tbody id="chi-tiet-table-body" class="bg-white"></tbody>
            </table>
        </div>
    </div>
    <div class="flex-shrink-0 flex flex-row justify-between items-center mt-1 p-1 md:p-2 bg-white rounded-lg shadow-md flex-nowrap overflow-hidden pagination-bar">
        <span id="chi-tiet-pagination-info" class="text-[8px] text-gray-600 mr-1 whitespace-nowrap flex-shrink-0"></span>
        <div id="ct-summary-info" class="flex-grow flex justify-center items-center overflow-hidden no-scrollbar px-1"></div>
        <div class="flex items-center gap-0.5 flex-nowrap flex-shrink-0">
            <select id="chi-tiet-items-per-page" class="hidden md:block px-2 py-0.5 border rounded-md bg-white text-xs">
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
            </select>
            <button id="chi-tiet-prev-page" class="px-1 py-1 border rounded-md bg-white text-xs">
                <svg class="w-3 h-3 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                <span class="hidden md:inline"></span>
            </button>
            <div class="flex items-center gap-0.5 mx-0.5">
                <input type="number" id="chi-tiet-page-input" class="w-7 md:w-16 text-center border rounded-md p-0.5 text-xs" value="1" min="1">
                <span id="chi-tiet-total-pages" class="text-[8px] text-gray-700 whitespace-nowrap">/1</span>
            </div>
            <button id="chi-tiet-next-page" class="px-1 py-1 border rounded-md bg-white text-xs">
                <svg class="w-3 h-3 fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                <span class="hidden md:inline"></span>
            </button>
        </div>
    </div>
`;

const SETTINGS_MODAL_HTML = `
    <div id="chi-tiet-settings-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center modal-backdrop">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col modal-content-custom">
            <div class="p-4 border-b">
                <h3 class="text-lg font-bold text-gray-800">Cài đặt hiển thị cột chi tiết</h3>
                <p class="text-xs text-gray-500 mt-1">Chọn các cột bạn muốn hiển thị trên màn hình máy tính.</p>
            </div>
            <div class="p-6 overflow-y-auto max-h-[60vh]">
                <div id="chi-tiet-column-toggles" class="grid grid-cols-1 gap-4"></div>
            </div>
            <div class="p-4 border-t flex justify-end">
                <button id="chi-tiet-settings-close-btn" class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-bold shadow-sm">Xong</button>
            </div>
        </div>
    </div>
`;

const getColumnSettingsCT = () => {
    let settings = null;
    try {
        const saved = localStorage.getItem('chiTietColumnSettings');
        if (saved) settings = JSON.parse(saved);
    } catch (e) {}

    const defaultVisible = ['ma-kho', 'ma-vach', 'ten-vt', 'yeu-cau', 'nhap', 'xuat', 'loai', 'muc-dich'];
    if (!settings) {
        return OPTIONAL_COLUMNS_CT.reduce((acc, col) => {
            acc[col.key] = defaultVisible.includes(col.key);
            return acc;
        }, {});
    }
    if (settings['ma-kho'] === undefined) {
        settings['ma-kho'] = true;
    }
    return settings;
};

const saveColumnSettingsCT = (settings) => {
    localStorage.setItem('chiTietColumnSettings', JSON.stringify(settings));
};

function applyChiTietColumnSettings() {
    const settings = getColumnSettingsCT();

    OPTIONAL_COLUMNS_CT.forEach(col => {
        const isVisible = settings[col.key];
        document.querySelectorAll(`.${col.class}`).forEach(el => {
            if (window.innerWidth >= 768) {
                el.classList.toggle('hidden', !isVisible);
                el.classList.toggle('md:table-cell', isVisible);
            } else {
                if (el.classList.contains('md:table-cell')) {
                    el.classList.add('hidden');
                }
            }
        });
    });
}

function openChiTietSettingsModal() {
    const modal = document.getElementById('chi-tiet-settings-modal');
    const container = document.getElementById('chi-tiet-column-toggles');
    const settings = getColumnSettingsCT();

    container.innerHTML = OPTIONAL_COLUMNS_CT.map(col => `
        <label class="flex items-center justify-between p-3 rounded-md bg-gray-50 border hover:bg-gray-100 cursor-pointer">
            <span class="text-sm font-medium text-gray-700">${col.label}</span>
            <input type="checkbox" class="ct-col-toggle-cb w-5 h-5 accent-blue-600" data-key="${col.key}" ${settings[col.key] ? 'checked' : ''}>
        </label>
    `).join('');

    modal.classList.remove('hidden');

    container.querySelectorAll('.ct-col-toggle-cb').forEach(cb => {
        cb.onchange = (e) => {
            const key = e.target.dataset.key;
            settings[key] = e.target.checked;
            saveColumnSettingsCT(settings);
            applyChiTietColumnSettings();
        };
    });
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

async function updateChiTietHeaderCounts() {
    const nhapEl = document.getElementById('chi-tiet-header-nhap-count');
    const xuatEl = document.getElementById('chi-tiet-header-xuat-count');
    const bottomSummaryEl = document.getElementById('ct-summary-info');

    if (!nhapEl || !xuatEl) return;

    [nhapEl, xuatEl].forEach(el => el.textContent = '(...)');
    if (bottomSummaryEl) bottomSummaryEl.innerHTML = '<span class="text-gray-400 font-normal text-[8px] md:text-xs italic">Đang tính toán...</span>';

    try {
        let query = buildChiTietQuery();
        // Lấy ma_nx và ma_vt để đếm duy nhất
        const { data, error } = await query.select('ma_nx, ma_vt, nhap, xuat');
        if (error) throw error;

        let totalNhap = 0;
        let totalXuat = 0;
        const uniqueMaNx = new Set();
        const uniqueMaVt = new Set();

        if (data && data.length > 0) {
            data.forEach(item => {
                totalNhap += (item.nhap || 0);
                totalXuat += (item.xuat || 0);
                if (item.ma_nx) uniqueMaNx.add(item.ma_nx);
                if (item.ma_vt) uniqueMaVt.add(item.ma_vt);
            });
        }

        const nVal = totalNhap.toLocaleString();
        const xVal = totalXuat.toLocaleString();
        const nxCount = uniqueMaNx.size.toLocaleString();
        const vtCount = uniqueMaVt.size.toLocaleString();

        nhapEl.textContent = `(${nVal})`;
        xuatEl.textContent = `(${xVal})`;

        if (bottomSummaryEl) {
            bottomSummaryEl.innerHTML = `
                <div class="flex items-center gap-1 sm:gap-2 text-[7px] sm:text-[10px] md:text-xs font-bold px-2">
                    <span class="text-green-600 whitespace-nowrap hidden md:inline" title="Số lượng Mã NX ">NX: ${nxCount}</span>
                    <span class="text-gray-200 hidden md:inline">|</span>
                    <span class="text-blue-600 whitespace-nowrap hidden md:inline" title="Số lượng Mã VT ">Mã VT: ${vtCount}</span>
                    <span class="text-gray-200 hidden md:inline">|</span>
                    <span class="text-green-600 whitespace-nowrap">N: ${nVal}</span>
                    <span class="text-gray-200">|</span>
                    <span class="text-red-600 whitespace-nowrap">X: ${xVal}</span>
                    <div class="md:hidden flex items-center gap-0.5 ml-1">
                        <span class="text-green-600">(${nxCount})</span>
                        <span class="text-blue-600">(${vtCount})</span>
                    </div>
                </div>
            `;
        }
    } catch (err) {
        console.error("Error calculating chi tiet summary:", err);
        [nhapEl, xuatEl].forEach(el => el.textContent = '(lỗi)');
        if (bottomSummaryEl) bottomSummaryEl.innerHTML = '<span class="text-red-500 text-[8px] md:text-xs">Lỗi tính toán</span>';
    }
}

function buildChiTietQuery() {
    const state = viewStates['view-chi-tiet'];
    let query = sb.from('chi_tiet').select('*', { count: 'exact' });

    if (currentUser.phan_quyen !== 'Admin') {
        const name = currentUser.ho_ten;
        const allowedNganh = (currentUser.xem_data || '').split(',').filter(Boolean);

        if (allowedNganh.length > 0) {
            const nganhListStr = allowedNganh.map(n => `"${n}"`).join(',');
            query = query.or(`phu_trach.eq."${name}",nganh.in.(${nganhListStr})`);
        } else {
            query = query.eq('phu_trach', name);
        }
    }

    if (state.searchTerm) query = query.or(`ma_kho.ilike.%${state.searchTerm}%,ma_nx.ilike.%${state.searchTerm}%,ma_vach.ilike.%${state.searchTerm}%,ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,lot.ilike.%${state.searchTerm}%,loai.ilike.%${state.searchTerm}%,yeu_cau.ilike.%${state.searchTerm}%,muc_dich.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%`);
    if (state.filters.from_date) query = query.gte('thoi_gian', state.filters.from_date);
    if (state.filters.to_date) query = query.lte('thoi_gian', state.filters.to_date);

    // Lọc theo Loại đơn (Nhập / Xuất)
    const loaiDon = state.filters.loai_don || '';
    if (loaiDon === 'Nhập') {
        query = query.or('ma_nx.ilike.%RO%,ma_kho.ilike.IN.%');
    } else if (loaiDon === 'Xuất') {
        query = query.or('ma_nx.ilike.%DO%,ma_kho.ilike.OUT.%');
    }

    // Lọc theo Trạng thái phiếu NX (Đang xử lý / Hoàn thành)
    const trangThai = state.filters.trang_thai || '';
    if (trangThai === 'dang_xu_ly' || trangThai === 'Đang xử lý') {
        query = query.like('ma_nx', '%-');
    } else if (trangThai === 'hoan_thanh' || trangThai === 'Hoàn thành' || trangThai === 'Đã xử lý') {
        query = query.not('ma_nx', 'like', '%-').not('ma_nx', 'is', null);
    }

    // Lọc theo Loại VT (Trưng Bày, Tiêu Hao...)
    if (state.filters.loai?.length > 0) query = query.in('loai', state.filters.loai);

    if (state.filters.ma_kho?.length > 0) query = query.in('ma_kho', state.filters.ma_kho);
    if (state.filters.ma_nx?.length > 0) query = query.in('ma_nx', state.filters.ma_nx);
    if (state.filters.ma_vach?.length > 0) query = query.in('ma_vach', state.filters.ma_vach);
    if (state.filters.ma_vt?.length > 0) query = query.in('ma_vt', state.filters.ma_vt);
    if (state.filters.ten_vt?.length > 0) query = query.in('ten_vt', state.filters.ten_vt);
    if (state.filters.lot?.length > 0) query = query.in('lot', state.filters.lot);
    if (state.filters.date?.length > 0) query = query.in('date', state.filters.date);
    if (state.filters.nganh?.length > 0) query = query.in('nganh', state.filters.nganh);
    if (state.filters.phu_trach?.length > 0) query = query.in('phu_trach', state.filters.phu_trach);
    if (state.filters.yeu_cau?.length > 0) query = query.in('yeu_cau', state.filters.yeu_cau);
    if (state.filters.muc_dich?.length > 0) query = query.in('muc_dich', state.filters.muc_dich);

    return query;
}

export async function fetchChiTiet(page = viewStates['view-chi-tiet'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        viewStates['view-chi-tiet'].currentPage = page;
        const state = viewStates['view-chi-tiet'];
        const { itemsPerPage } = state;

        if (chiTietDisplayMode === 'tree' && window.innerWidth >= 768) {
            // Chế độ NHÁNH (Laptop): Phân trang theo Nhóm Mã Kho để không bị rớt trang/để trống màn hình
            const [baseListRes, _] = await Promise.all([
                buildChiTietQuery().select('ma_kho, thoi_gian').order('thoi_gian', { ascending: false }).order('ma_nx', { ascending: true }).limit(10000),
                updateChiTietHeaderCounts()
            ]);

            if (baseListRes.error) throw baseListRes.error;

            const allRows = baseListRes.data || [];
            const orderedUniqueKho = [];
            const seenKho = new Set();
            allRows.forEach(r => {
                const k = (r.ma_kho && String(r.ma_kho).trim()) ? String(r.ma_kho).trim() : 'Chưa phân kho';
                if (!seenKho.has(k)) {
                    seenKho.add(k);
                    orderedUniqueKho.push(k);
                }
            });

            const totalKhoCount = orderedUniqueKho.length;
            state.totalFilteredCount = totalKhoCount;

            const from = (page - 1) * itemsPerPage;
            const to = Math.min(from + itemsPerPage, totalKhoCount) - 1;
            const pageKhoList = orderedUniqueKho.slice(from, from + itemsPerPage);

            if (pageKhoList.length === 0) {
                cache.chiTietList = [];
                renderChiTietTable([]);
                applyChiTietColumnSettings();
                updateChiTietDisplayModeUI();
                renderChiTietTableHeader();
                renderPagination('chi-tiet', totalKhoCount, from, Math.max(from, to));
                updateMobileFilterIconStatus('chi-tiet');
                return;
            }

            let pageQuery = buildChiTietQuery().order('thoi_gian', { ascending: false }).order('ma_nx', { ascending: true }).order('stt', { ascending: true });

            const hasUnassigned = pageKhoList.includes('Chưa phân kho');
            const validKhoList = pageKhoList.filter(k => k !== 'Chưa phân kho');

            if (hasUnassigned && validKhoList.length > 0) {
                const khoListStr = validKhoList.map(k => `"${k}"`).join(',');
                pageQuery = pageQuery.or(`ma_kho.in.(${khoListStr}),ma_kho.is.null`);
            } else if (hasUnassigned) {
                pageQuery = pageQuery.is('ma_kho', null);
            } else {
                pageQuery = pageQuery.in('ma_kho', validKhoList);
            }

            const { data, error } = await pageQuery.limit(5000);
            if (error) {
                showToast("Không thể tải dữ liệu chi tiết.", 'error');
            } else {
                cache.chiTietList = data || [];
                renderChiTietTable(cache.chiTietList);
                applyChiTietColumnSettings();
                updateChiTietDisplayModeUI();
                renderChiTietTableHeader();
                renderPagination('chi-tiet', totalKhoCount, from, to);
                updateMobileFilterIconStatus('chi-tiet');
            }

        } else {
            // Chế độ XEM THƯỜNG hoặc MOBILE: Phân trang theo từng dòng giao dịch
            const from = (page - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            const query = buildChiTietQuery().order('thoi_gian', { ascending: false }).order('ma_nx', { ascending: true }).order('stt', { ascending: true }).range(from, to);

            const [queryResult, _] = await Promise.all([
                query,
                updateChiTietHeaderCounts()
            ]);

            const { data, error, count } = queryResult;

            if (error) {
                showToast("Không thể tải dữ liệu chi tiết.", 'error');
            } else {
                state.totalFilteredCount = count;
                cache.chiTietList = data;

                renderChiTietTable(data);
                applyChiTietColumnSettings();
                updateChiTietDisplayModeUI();
                renderChiTietTableHeader();
                renderPagination('chi-tiet', count, from, to);
                updateMobileFilterIconStatus('chi-tiet');
            }
        }
    } finally {
        if (showLoader) showLoading(false);
    }
}

export let expandedChiTietRows = new Set();
export let chiTietDisplayMode = localStorage.getItem('chitiet_display_mode') || 'tree';

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function formatCellEmpty(val) {
    if (val === null || val === undefined) return '<span class="text-gray-400 font-normal select-none">-</span>';
    const s = String(val).trim();
    if (s === '' || s === 'null' || s === 'undefined') return '<span class="text-gray-400 font-normal select-none">-</span>';
    return escapeHtml(s);
}

export function setChiTietDisplayMode(mode) {
    chiTietDisplayMode = (mode === 'flat') ? 'flat' : 'tree';
    try { localStorage.setItem('chitiet_display_mode', chiTietDisplayMode); } catch (e) {}
    updateChiTietDisplayModeUI();
    fetchChiTiet(1);
}

export function updateChiTietBranchToggleBtnState() {
    const btn = document.getElementById('chi-tiet-btn-toggle-all-branches');
    if (!btn) return;
    if (chiTietDisplayMode !== 'tree') {
        btn.style.display = 'none';
        return;
    }
    btn.style.display = 'inline-flex';

    const isExpanded = expandedChiTietRows.size > 0;
    if (isExpanded) {
        // Đang đổ xuống: Mũi tên chỉ xuống & sáng lên
        btn.className = 'tk-branch-toggle-btn branch-active';
        btn.title = 'Đang mở rộng toàn bộ nhánh - Nhấn để thu gọn';
        btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="7 13 12 18 17 13"></polyline>
                <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
        `;
    } else {
        // Không đổ xuống: Mũi tên chỉ lên & không sáng
        btn.className = 'tk-branch-toggle-btn';
        btn.title = 'Đang thu gọn - Nhấn để mở rộng toàn bộ nhánh';
        btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="7 11 12 6 17 11"></polyline>
                <polyline points="7 18 12 13 17 18"></polyline>
            </svg>
        `;
    }
}

export function updateChiTietDisplayModeUI() {
    const treeBtn = document.getElementById('ct-mode-tree');
    const flatBtn = document.getElementById('ct-mode-flat');
    const toggleAllBranchesBtn = document.getElementById('chi-tiet-btn-toggle-all-branches');

    if (treeBtn && flatBtn) {
        if (chiTietDisplayMode === 'tree') {
            treeBtn.className = 'tk-segment-btn bg-white shadow-sm font-semibold text-blue-600';
            flatBtn.className = 'tk-segment-btn text-gray-500 hover:text-gray-700';
            if (toggleAllBranchesBtn) {
                toggleAllBranchesBtn.style.display = 'inline-flex';
                updateChiTietBranchToggleBtnState();
            }
        } else {
            flatBtn.className = 'tk-segment-btn bg-white shadow-sm font-semibold text-blue-600';
            treeBtn.className = 'tk-segment-btn text-gray-500 hover:text-gray-700';
            if (toggleAllBranchesBtn) {
                toggleAllBranchesBtn.style.display = 'none';
            }
        }
    }
}

window.setChiTietDisplayMode = setChiTietDisplayMode;

export function toggleChiTietSubRow(khoKey) {
    if (expandedChiTietRows.has(khoKey)) {
        expandedChiTietRows.delete(khoKey);
    } else {
        expandedChiTietRows.add(khoKey);
    }
    updateChiTietBranchToggleBtnState();
    if (cache.chiTietList) {
        renderChiTietTable(cache.chiTietList);
        applyChiTietColumnSettings();
    }
}
window.toggleChiTietSubRow = toggleChiTietSubRow;

export function toggleAllChiTietSubRows(forceExpand = null) {
    if (!cache.chiTietList) return;
    const allKeys = new Set(cache.chiTietList.map(i => (i.ma_kho && String(i.ma_kho).trim()) ? String(i.ma_kho).trim() : 'Chưa phân kho').filter(Boolean));
    const shouldExpand = (typeof forceExpand === 'boolean') ? forceExpand : (expandedChiTietRows.size === 0);
    if (shouldExpand) {
        expandedChiTietRows = allKeys;
    } else {
        expandedChiTietRows.clear();
    }
    updateChiTietBranchToggleBtnState();
    renderChiTietTable(cache.chiTietList);
    applyChiTietColumnSettings();
}
window.toggleAllChiTietSubRows = toggleAllChiTietSubRows;

function renderChiTietTable(data) {
    const tableBody = document.getElementById('chi-tiet-table-body');
    if (!tableBody) return;

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="18" class="text-center py-4 text-gray-500">Không có dữ liệu</td></tr>';
        return;
    }

    const isMobile = window.innerWidth < 768;

    // 1. MOBILE VIEW (unaltered layout)
    if (isMobile) {
        tableBody.innerHTML = data.map(ct => {
            const maNxRaw = ct.ma_nx || '';
            const maNxClass = maNxRaw.endsWith('-') ? 'text-yellow-600 font-semibold' : 'text-green-600 font-semibold';
            const maNxFormatted = maNxRaw
                .replace(/DO/g, '<span class="text-red-600 font-bold">DO</span>')
                .replace(/RO/g, '<span class="text-green-600 font-bold">RO</span>');

            const displaySLValue = ct.nhap > 0 ? ct.nhap : (ct.xuat > 0 ? ct.xuat : 0);
            const slColorClass = ct.nhap > 0 ? 'text-green-600' : (ct.xuat > 0 ? 'text-red-600' : 'text-gray-400');
            const slPrefix = ct.nhap > 0 ? '+' : (ct.xuat > 0 ? '-' : '');

            return `
            <tr class="hover:bg-gray-50 border-b border-gray-200 text-gray-900">
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap">${formatDateToDDMMYYYY(ct.thoi_gian)}</td>
                <td class="hidden md:table-cell ct-col-ma-kho px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap" title="${escapeHtml(ct.ma_kho || '')}">${formatCellEmpty(ct.ma_kho)}</td>
                <td class="sticky left-0 z-10 bg-white px-3 py-2 border-r border-gray-300 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.2)] whitespace-nowrap min-w-max md:whitespace-normal md:min-w-[180px] w-auto">
                    <div class="flex items-center justify-between gap-1.5 w-full">
                        <span class="${maNxClass}" title="${escapeHtml(maNxRaw)}">${maNxFormatted}</span>
                        <button class="copy-ma-nx-btn p-1 text-gray-300 hover:text-blue-500 transition-colors" data-ma-nx="${escapeHtml(maNxRaw)}" title="Copy Mã NX">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </button>
                    </div>
                </td>
                <td class="hidden md:table-cell ct-col-ma-vach px-2 py-2 border-r border-gray-300 text-left whitespace-nowrap" title="${escapeHtml(ct.ma_vach || '')}">${formatCellEmpty(ct.ma_vach)}</td>
                <td class="px-2 py-2 border-r border-gray-300 text-left whitespace-nowrap" title="${escapeHtml(ct.ma_vt || '')}">
                    <div class="flex items-center gap-1">
                        <span class="text-blue-600 font-bold ma-vt-cell">${formatCellEmpty(ct.ma_vt)}</span>
                        <button class="copy-ma-vt-btn p-1 text-gray-300 hover:text-blue-500 transition-colors" data-ma-vt="${escapeHtml(ct.ma_vt || '')}" title="Copy Mã VT">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </button>
                    </div>
                </td>
                <td class="hidden md:table-cell ct-col-ten-vt px-2 py-2 border-r border-gray-300 text-left min-w-[400px]" title="${escapeHtml(ct.ten_vt || '')}">
                    <div class="line-clamp-2 break-words">${formatCellEmpty(ct.ten_vt)}</div>
                </td>
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap">${formatCellEmpty(ct.lot)}</td>
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap">${formatCellEmpty(ct.date)}</td>
                <td class="hidden md:table-cell ct-col-yeu-cau px-2 py-2 border-r border-gray-300 text-center font-bold whitespace-nowrap">${ct.yc_sl || 0}</td>
                <td class="hidden md:table-cell ct-col-nhap px-2 py-2 border-r border-gray-300 text-center text-green-600 font-bold whitespace-nowrap">${ct.nhap || 0}</td>
                <td class="hidden md:table-cell ct-col-xuat px-2 py-2 border-r border-gray-300 text-center text-red-600 font-bold whitespace-nowrap">${ct.xuat || 0}</td>
                <td class="md:hidden px-1 py-2 border-r border-gray-300 text-center font-bold whitespace-nowrap ${slColorClass}">${slPrefix}${displaySLValue}</td>
                <td class="hidden md:table-cell ct-col-loai px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap">${formatCellEmpty(ct.loai)}</td>
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap" title="${escapeHtml(ct.yeu_cau || '')}">${formatCellEmpty(ct.yeu_cau)}</td>
                <td class="hidden md:table-cell ct-col-muc-dich px-2 py-2 border-r border-gray-300 text-left min-w-[300px]" title="${escapeHtml(ct.muc_dich || '')}">
                    <div class="line-clamp-2 break-words">${formatCellEmpty(ct.muc_dich)}</div>
                </td>
                <td class="hidden md:table-cell ct-col-nganh px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap" title="${escapeHtml(ct.nganh || '')}">${formatCellEmpty(ct.nganh)}</td>
                <td class="hidden md:table-cell ct-col-phu-trach px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap" title="${escapeHtml(ct.phu_trach || '')}">${formatCellEmpty(ct.phu_trach)}</td>
                <td class="px-1 py-2 border-r border-gray-300 text-center whitespace-nowrap md:sticky md:right-0 md:bg-white z-10 sticky-action-col-mobile">
                    <button class="text-gray-400 hover:text-indigo-600 p-1 rounded-full hover:bg-gray-100 ct-open-action-menu" data-ct-id="${ct.id}">
                        <svg class="w-2.5 h-2.5 md:w-5 md:h-5 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg>
                    </button>
                </td>
            </tr>
            `;
        }).join('');
        return;
    }

    // 2. LAPTOP VIEW: MODE FLAT (Xem Thường)
    if (chiTietDisplayMode === 'flat') {
        tableBody.innerHTML = data.map(ct => {
            const maNxRaw = ct.ma_nx || '';
            const maNxClass = maNxRaw.endsWith('-') ? 'text-yellow-600 font-semibold' : 'text-green-600 font-semibold';
            const maNxFormatted = maNxRaw
                .replace(/DO/g, '<span class="text-red-600 font-bold">DO</span>')
                .replace(/RO/g, '<span class="text-green-600 font-bold">RO</span>');

            const displaySLValue = ct.nhap > 0 ? ct.nhap : (ct.xuat > 0 ? ct.xuat : 0);
            const slColorClass = ct.nhap > 0 ? 'text-green-600' : (ct.xuat > 0 ? 'text-red-600' : 'text-gray-400');
            const slPrefix = ct.nhap > 0 ? '+' : (ct.xuat > 0 ? '-' : '');

            return `
            <tr class="hover:bg-gray-50 border-b border-gray-200 text-gray-900">
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap">${formatDateToDDMMYYYY(ct.thoi_gian)}</td>
                <td class="hidden md:table-cell ct-col-ma-kho px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap" title="${escapeHtml(ct.ma_kho || '')}">${formatCellEmpty(ct.ma_kho)}</td>
                <td class="sticky left-0 z-10 bg-white px-3 py-2 border-r border-gray-300 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.2)] whitespace-nowrap min-w-max md:whitespace-normal md:min-w-[180px] w-auto">
                    <div class="flex items-center justify-between gap-1.5 w-full">
                        <span class="${maNxClass}" title="${escapeHtml(maNxRaw)}">${maNxFormatted}</span>
                        <button class="copy-ma-nx-btn p-1 text-gray-300 hover:text-blue-500 transition-colors" data-ma-nx="${escapeHtml(maNxRaw)}" title="Copy Mã NX">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </button>
                    </div>
                </td>
                <td class="hidden md:table-cell ct-col-ma-vach px-2 py-2 border-r border-gray-300 text-left whitespace-nowrap" title="${escapeHtml(ct.ma_vach || '')}">${formatCellEmpty(ct.ma_vach)}</td>
                <td class="px-2 py-2 border-r border-gray-300 text-left whitespace-nowrap" title="${escapeHtml(ct.ma_vt || '')}">
                    <div class="flex items-center gap-1">
                        <span class="text-blue-600 font-bold ma-vt-cell">${formatCellEmpty(ct.ma_vt)}</span>
                        <button class="copy-ma-vt-btn p-1 text-gray-300 hover:text-blue-500 transition-colors" data-ma-vt="${escapeHtml(ct.ma_vt || '')}" title="Copy Mã VT">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </button>
                    </div>
                </td>
                <td class="hidden md:table-cell ct-col-ten-vt px-2 py-2 border-r border-gray-300 text-left min-w-[400px]" title="${escapeHtml(ct.ten_vt || '')}">
                    <div class="line-clamp-2 break-words">${formatCellEmpty(ct.ten_vt)}</div>
                </td>
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap">${formatCellEmpty(ct.lot)}</td>
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap">${formatCellEmpty(ct.date)}</td>
                <td class="hidden md:table-cell ct-col-yeu-cau px-2 py-2 border-r border-gray-300 text-center font-bold whitespace-nowrap">${ct.yc_sl || 0}</td>
                <td class="hidden md:table-cell ct-col-nhap px-2 py-2 border-r border-gray-300 text-center text-green-600 font-bold whitespace-nowrap">${ct.nhap || 0}</td>
                <td class="hidden md:table-cell ct-col-xuat px-2 py-2 border-r border-gray-300 text-center text-red-600 font-bold whitespace-nowrap">${ct.xuat || 0}</td>
                <td class="md:hidden px-1 py-2 border-r border-gray-300 text-center font-bold whitespace-nowrap ${slColorClass}">${slPrefix}${displaySLValue}</td>
                <td class="hidden md:table-cell ct-col-loai px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap">${formatCellEmpty(ct.loai)}</td>
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap" title="${escapeHtml(ct.yeu_cau || '')}">${formatCellEmpty(ct.yeu_cau)}</td>
                <td class="hidden md:table-cell ct-col-muc-dich px-2 py-2 border-r border-gray-300 text-left min-w-[300px]" title="${escapeHtml(ct.muc_dich || '')}">
                    <div class="line-clamp-2 break-words">${formatCellEmpty(ct.muc_dich)}</div>
                </td>
                <td class="hidden md:table-cell ct-col-nganh px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap" title="${escapeHtml(ct.nganh || '')}">${formatCellEmpty(ct.nganh)}</td>
                <td class="hidden md:table-cell ct-col-phu-trach px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap" title="${escapeHtml(ct.phu_trach || '')}">${formatCellEmpty(ct.phu_trach)}</td>
                <td class="px-1 py-2 border-r border-gray-300 text-center whitespace-nowrap md:sticky md:right-0 md:bg-white z-10 sticky-action-col-mobile">
                    <button class="text-gray-400 hover:text-indigo-600 p-1 rounded-full hover:bg-gray-100 ct-open-action-menu" data-ct-id="${ct.id}">
                        <svg class="w-2.5 h-2.5 md:w-5 md:h-5 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg>
                    </button>
                </td>
            </tr>
            `;
        }).join('');
        return;
    }

    // 3. LAPTOP VIEW: MODE TREE (Nhánh - Gom nhóm theo Mã Kho)
    const groups = [];
    const groupMap = new Map();

    data.forEach(item => {
        const rawKho = (item.ma_kho && String(item.ma_kho).trim()) ? String(item.ma_kho).trim() : 'Chưa phân kho';
        if (!groupMap.has(rawKho)) {
            const grp = {
                groupKey: rawKho,
                ma_kho: rawKho,
                items: [],
                totalNhap: 0,
                totalXuat: 0,
                totalYc: 0,
                uniqueMaNx: new Set(),
                uniqueMaVt: new Set(),
                uniqueYeuCau: new Set()
            };
            groupMap.set(rawKho, grp);
            groups.push(grp);
        }
        const grp = groupMap.get(rawKho);
        grp.items.push(item);
        grp.totalNhap += (Number(item.nhap) || 0);
        grp.totalXuat += (Number(item.xuat) || 0);
        grp.totalYc += (Number(item.yc_sl) || 0);
        if (item.ma_nx) grp.uniqueMaNx.add(item.ma_nx);
        if (item.ma_vt) grp.uniqueMaVt.add(item.ma_vt);
        if (item.yeu_cau && String(item.yeu_cau).trim()) grp.uniqueYeuCau.add(String(item.yeu_cau).trim());
    });

    const htmlRows = [];

    groups.forEach(group => {
        const isExpanded = expandedChiTietRows.has(group.groupKey);

        let parentYeuCauHtml = '<span class="text-gray-400 font-normal select-none">-</span>';
        if (group.uniqueYeuCau.size === 1) {
            const name = [...group.uniqueYeuCau][0];
            parentYeuCauHtml = `<span class="text-xs font-semibold text-gray-800 truncate" title="${escapeHtml(name)}">${escapeHtml(name)}</span>`;
        } else if (group.uniqueYeuCau.size > 1) {
            const names = [...group.uniqueYeuCau];
            parentYeuCauHtml = `<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer" title="${escapeHtml(names.join(', '))}">${escapeHtml(names[0])} <span class="text-indigo-500 font-normal">(+${names.length - 1})</span></span>`;
        }

        // PARENT ROW (Mã Kho)
        htmlRows.push(`
            <tr class="tk-parent-row cursor-pointer select-none ${isExpanded ? 'is-expanded' : ''}" onclick="toggleChiTietSubRow('${escapeHtml(group.groupKey)}')">
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap text-xs text-gray-600 font-semibold">${formatDateToDDMMYYYY(group.items[0].thoi_gian)}</td>
                <td class="hidden md:table-cell ct-col-ma-kho px-2 py-2 border-r border-gray-300 text-left whitespace-nowrap">
                    <div class="flex items-center gap-1.5 w-full min-w-0">
                        <button type="button" class="btn-subrow-toggle ${isExpanded ? 'active' : ''}" onclick="event.stopPropagation(); toggleChiTietSubRow('${escapeHtml(group.groupKey)}')" title="${isExpanded ? 'Thu gọn' : 'Xem chi tiết ' + group.items.length + ' giao dịch'}">
                            <svg class="w-3 h-3 text-blue-600 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                        <span class="text-blue-700 font-bold truncate">${escapeHtml(group.ma_kho)}</span>
                        <span class="px-1.5 py-0.2 rounded-full text-[9px] bg-blue-100 text-blue-700 font-bold flex-shrink-0">${group.items.length} GD</span>
                    </div>
                </td>
                <td class="sticky left-0 z-10 bg-inherit px-3 py-2 border-r border-gray-300 text-center whitespace-nowrap min-w-max md:whitespace-normal md:min-w-[180px] w-auto">
                    <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded cursor-pointer">${group.uniqueMaNx.size} Mã NX ▾</span>
                </td>
                <td class="hidden md:table-cell ct-col-ma-vach px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap"><span class="text-gray-400 font-normal select-none">-</span></td>
                <td class="px-2 py-2 border-r border-gray-300 text-left whitespace-nowrap">
                    <span class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">${group.uniqueMaVt.size} Mã VT</span>
                </td>
                <td class="hidden md:table-cell ct-col-ten-vt px-2 py-2 border-r border-gray-300 text-left min-w-[400px]">
                    <span class="text-gray-500 font-medium italic select-none">Tổng hợp kho ${escapeHtml(group.ma_kho)} (${group.items.length} giao dịch)</span>
                </td>
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap"><span class="text-gray-400 font-normal select-none">-</span></td>
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap"><span class="text-gray-400 font-normal select-none">-</span></td>
                <td class="hidden md:table-cell ct-col-yeu-cau px-2 py-2 border-r border-gray-300 text-center font-bold whitespace-nowrap text-gray-800">${group.totalYc.toLocaleString()}</td>
                <td class="hidden md:table-cell ct-col-nhap px-2 py-2 border-r border-gray-300 text-center text-green-600 font-bold whitespace-nowrap">${group.totalNhap.toLocaleString()}</td>
                <td class="hidden md:table-cell ct-col-xuat px-2 py-2 border-r border-gray-300 text-center text-red-600 font-bold whitespace-nowrap">${group.totalXuat.toLocaleString()}</td>
                <td class="md:hidden px-1 py-2 border-r border-gray-300 text-center font-bold whitespace-nowrap"><span class="text-gray-400 font-normal select-none">-</span></td>
                <td class="hidden md:table-cell ct-col-loai px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap"><span class="text-gray-400 font-normal select-none">-</span></td>
                <td class="px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap" title="${escapeHtml([...group.uniqueYeuCau].join(', '))}">${parentYeuCauHtml}</td>
                <td class="hidden md:table-cell ct-col-muc-dich px-2 py-2 border-r border-gray-300 text-left min-w-[300px]"><span class="text-gray-400 font-normal select-none">-</span></td>
                <td class="hidden md:table-cell ct-col-nganh px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap"><span class="text-gray-400 font-normal select-none">-</span></td>
                <td class="hidden md:table-cell ct-col-phu-trach px-2 py-2 border-r border-gray-300 text-center whitespace-nowrap"><span class="text-gray-400 font-normal select-none">-</span></td>
                <td class="px-1 py-2 border-r border-gray-300 text-center whitespace-nowrap md:sticky md:right-0 md:bg-white z-10 sticky-action-col-mobile"><span class="text-gray-400 font-normal select-none">-</span></td>
            </tr>
        `);

        // CHILD ROWS (Giao dịch trong kho khi mở rộng)
        if (isExpanded) {
            group.items.forEach((ct, idx) => {
                const isLast = (idx === group.items.length - 1);
                const branchTreeIcon = isLast ? '└─' : '├─';

                const maNxRaw = ct.ma_nx || '';
                const maNxClass = maNxRaw.endsWith('-') ? 'text-yellow-600 font-semibold' : 'text-green-600 font-semibold';
                const maNxFormatted = maNxRaw
                    .replace(/DO/g, '<span class="text-red-600 font-bold">DO</span>')
                    .replace(/RO/g, '<span class="text-green-600 font-bold">RO</span>');

                const displaySLValue = ct.nhap > 0 ? ct.nhap : (ct.xuat > 0 ? ct.xuat : 0);
                const slColorClass = ct.nhap > 0 ? 'text-green-600' : (ct.xuat > 0 ? 'text-red-600' : 'text-gray-400');
                const slPrefix = ct.nhap > 0 ? '+' : (ct.xuat > 0 ? '-' : '');

                htmlRows.push(`
                    <tr class="tk-child-detail-row bg-slate-50/90 hover:bg-blue-50/50 border-b border-gray-200 text-gray-900">
                        <td class="px-2 py-1.5 border-r border-gray-200 text-center whitespace-nowrap text-[11px] text-gray-700">${formatDateToDDMMYYYY(ct.thoi_gian)}</td>
                        <td class="hidden md:table-cell ct-col-ma-kho px-2 py-1.5 border-r border-gray-200 text-left whitespace-nowrap">
                            <div class="flex items-center pl-3 w-full min-w-0">
                                <span class="text-blue-500 font-mono font-bold select-none text-[13px] leading-none tracking-wider">${branchTreeIcon}</span>
                                <span class="text-[11px] text-gray-500 ml-1.5">${formatCellEmpty(ct.ma_kho)}</span>
                            </div>
                        </td>
                        <td class="sticky left-0 z-10 bg-white px-3 py-1.5 border-r border-gray-200 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.2)] whitespace-nowrap min-w-max md:whitespace-normal md:min-w-[180px] w-auto">
                            <div class="flex items-center justify-between gap-1.5 w-full">
                                <span class="${maNxClass} text-[11px]" title="${escapeHtml(maNxRaw)}">${maNxFormatted}</span>
                                <button class="copy-ma-nx-btn p-0.5 text-gray-300 hover:text-blue-500 transition-colors" data-ma-nx="${escapeHtml(maNxRaw)}" title="Copy Mã NX">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                </button>
                            </div>
                        </td>
                        <td class="hidden md:table-cell ct-col-ma-vach px-2 py-1.5 border-r border-gray-200 text-left whitespace-nowrap text-[11px]" title="${escapeHtml(ct.ma_vach || '')}">${formatCellEmpty(ct.ma_vach)}</td>
                        <td class="px-2 py-1.5 border-r border-gray-200 text-left whitespace-nowrap" title="${escapeHtml(ct.ma_vt || '')}">
                            <div class="flex items-center gap-1">
                                <span class="text-blue-600 font-bold ma-vt-cell text-[11px]">${formatCellEmpty(ct.ma_vt)}</span>
                                <button class="copy-ma-vt-btn p-0.5 text-gray-300 hover:text-blue-500 transition-colors" data-ma-vt="${escapeHtml(ct.ma_vt || '')}" title="Copy Mã VT">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                </button>
                            </div>
                        </td>
                        <td class="hidden md:table-cell ct-col-ten-vt px-2 py-1.5 border-r border-gray-200 text-left min-w-[400px] text-[11px]" title="${escapeHtml(ct.ten_vt || '')}">
                            <div class="line-clamp-2 break-words">${formatCellEmpty(ct.ten_vt)}</div>
                        </td>
                        <td class="px-2 py-1.5 border-r border-gray-200 text-center whitespace-nowrap text-[11px]">${formatCellEmpty(ct.lot)}</td>
                        <td class="px-2 py-1.5 border-r border-gray-200 text-center whitespace-nowrap text-[11px]">${formatCellEmpty(ct.date)}</td>
                        <td class="hidden md:table-cell ct-col-yeu-cau px-2 py-1.5 border-r border-gray-200 text-center font-bold whitespace-nowrap text-[11px]">${ct.yc_sl || 0}</td>
                        <td class="hidden md:table-cell ct-col-nhap px-2 py-1.5 border-r border-gray-200 text-center text-green-600 font-bold whitespace-nowrap text-[11px]">${ct.nhap || 0}</td>
                        <td class="hidden md:table-cell ct-col-xuat px-2 py-1.5 border-r border-gray-200 text-center text-red-600 font-bold whitespace-nowrap text-[11px]">${ct.xuat || 0}</td>
                        <td class="md:hidden px-1 py-1.5 border-r border-gray-200 text-center font-bold whitespace-nowrap text-[11px] ${slColorClass}">${slPrefix}${displaySLValue}</td>
                        <td class="hidden md:table-cell ct-col-loai px-2 py-1.5 border-r border-gray-200 text-center whitespace-nowrap text-[11px]">${formatCellEmpty(ct.loai)}</td>
                        <td class="px-2 py-1.5 border-r border-gray-200 text-center whitespace-nowrap text-[11px]" title="${escapeHtml(ct.yeu_cau || '')}">${formatCellEmpty(ct.yeu_cau)}</td>
                        <td class="hidden md:table-cell ct-col-muc-dich px-2 py-1.5 border-r border-gray-200 text-left min-w-[300px] text-[11px]" title="${escapeHtml(ct.muc_dich || '')}">
                            <div class="line-clamp-2 break-words">${formatCellEmpty(ct.muc_dich)}</div>
                        </td>
                        <td class="hidden md:table-cell ct-col-nganh px-2 py-1.5 border-r border-gray-200 text-center whitespace-nowrap text-[11px]" title="${escapeHtml(ct.nganh || '')}">${formatCellEmpty(ct.nganh)}</td>
                        <td class="hidden md:table-cell ct-col-phu-trach px-2 py-1.5 border-r border-gray-200 text-center whitespace-nowrap text-[11px]" title="${escapeHtml(ct.phu_trach || '')}">${formatCellEmpty(ct.phu_trach)}</td>
                        <td class="px-1 py-1.5 border-r border-gray-200 text-center whitespace-nowrap md:sticky md:right-0 md:bg-white z-10 sticky-action-col-mobile">
                            <button class="text-gray-400 hover:text-indigo-600 p-1 rounded-full hover:bg-gray-100 ct-open-action-menu" data-ct-id="${ct.id}">
                                <svg class="w-2.5 h-2.5 md:w-5 md:h-5 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg>
                            </button>
                        </td>
                    </tr>
                `);
            });
        }
    });

    tableBody.innerHTML = htmlRows.join('');
}

function closeActionPopover() {
    if (activeActionPopover) {
        activeActionPopover.remove();
        document.removeEventListener('click', closeActionPopover);
        activeActionPopover = null;
    }
}

function openActionMenu(e, button) {
    e.stopPropagation();

    // Logic Toggle cho menu chi tiết
    if (activeActionPopover) {
        const isSameButton = activeActionPopover._trigger === button;
        activeActionPopover.remove();
        activeActionPopover = null;
        if (isSameButton) return;
    }

    const ctId = String(button.dataset.ctId || '').trim();
    if (!ctId) return;

    const ct = cache.chiTietList.find(i => String(i.id).trim() === ctId);
    if (!ct) {
        showToast("Không tìm thấy dữ liệu dòng này.", "error");
        return;
    }

    const template = document.getElementById('chi-tiet-action-menu-template');
    const popover = template.content.cloneNode(true).querySelector('.action-popover');
    popover._trigger = button; // Lưu nút kích hoạt
    document.body.appendChild(popover);

    const rect = button.getBoundingClientRect();
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        popover.style.position = 'fixed';
        popover.style.right = '10px';
        popover.style.top = `${rect.bottom + 5}px`;
    } else {
        popover.style.position = 'fixed';
        popover.style.left = `${rect.left - 120}px`;
        popover.style.top = `${rect.bottom + 5}px`;
    }

    popover.querySelector('.ct-action-view-purpose').onclick = () => {
        openDetailVtModal(ct, true);
        popover.remove(); activeActionPopover = null;
    };

    popover.querySelector('.ct-action-edit-vt').onclick = () => {
        openDetailVtModal(ct, false);
        popover.remove(); activeActionPopover = null;
    };

    activeActionPopover = popover;

    const closeHandler = (event) => {
        if (popover.contains(event.target) || event.target === button) return;
        popover.remove();
        if (activeActionPopover === popover) activeActionPopover = null;
        document.removeEventListener('click', closeHandler);
    };

    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

async function fetchNameSuggestions() {
    try {
        const [usersRes, chiTietRes] = await Promise.all([
            sb.from('user').select('ho_ten'),
            sb.from('chi_tiet').select('yeu_cau')
        ]);

        const names = new Set();
        (usersRes.data || []).forEach(u => names.add(u.ho_ten));
        (chiTietRes.data || []).forEach(ct => names.add(ct.yeu_cau));

        nameSuggestionsCache = Array.from(names).filter(Boolean).map(n => ({ name: n })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
        console.error("Error fetching name suggestions:", err);
    }
}

/**
 * Làm mới dữ liệu cho modal phân bổ đang mở (Dùng cho Realtime)
 */
export async function refreshCurrentDetailVtModal() {
    if (!currentDistributingItem) return;

    // NÂNG CẤP: Sử dụng String ID an toàn
    const cleanId = String(currentDistributingItem.id).trim();
    const { data, error } = await sb.from('chi_tiet_vt').select('*').eq('id_ct', cleanId).order('created_at', { ascending: true });

    if (!error && data) {
        const isFocusing = document.querySelector('#chi-tiet-vt-table-body input:focus, #chi-tiet-vt-table-body textarea:focus');
        if (!isFocusing) {
            detailVtItems = data;
            initialDetailVtItems = JSON.parse(JSON.stringify(data));
            const isReadOnly = document.getElementById('save-ct-vt-btn').classList.contains('hidden');
            renderDetailVtRows(isReadOnly);
            renderHistory();
        }
    }
}

/**
 * Gán các sự kiện cố định cho Modal Phân bổ chi tiết.
 * Cần chạy hàm này một lần duy nhất.
 */
function ensureModalListenersAttached() {
    if (isModalListenersInitialized) return;

    const closeBtn = document.getElementById('close-ct-vt-modal');
    if (closeBtn) closeBtn.onclick = () => {
        currentDistributingItem = null;
        document.getElementById('chi-tiet-vt-modal').classList.add('hidden');
    };

    const cancelBtn = document.getElementById('cancel-ct-vt-btn');
    if (cancelBtn) cancelBtn.onclick = () => {
        currentDistributingItem = null;
        document.getElementById('chi-tiet-vt-modal').classList.add('hidden');
    };

    const addBtn = document.getElementById('add-ct-vt-row-btn');
    if (addBtn) addBtn.onclick = () => {
        if (!currentDistributingItem) return;
        const newItem = {
            id: crypto.randomUUID(),
            id_ct: String(currentDistributingItem.id).trim(), // Ép kiểu string ID
            nguoi_nhan: '',
            sl: 0,
            dia_diem: '',
            ghi_chu: '',
            trang_thai: '',
            lich_su: '',
            created_at: new Date().toISOString(),
            is_new: true
        };
        detailVtItems.push(newItem);
        renderDetailVtRows(false);
    };

    const saveBtn = document.getElementById('save-ct-vt-btn');
    if (saveBtn) saveBtn.onclick = async () => {
        if (!currentDistributingItem) return;
        const currentActiveSum = detailVtItems.reduce((s, i) => i.trang_thai !== 'Xóa' ? s + (parseFloat(i.sl) || 0) : s, 0);
        const original = parseFloat(document.getElementById('ct-vt-original-qty').textContent) || 0;

        if (currentActiveSum > original) {
            showToast("Tổng số lượng không được vượt quá số gốc.", 'error');
            return;
        }

        showLoading(true);
        try {
            const nowStr = new Date().toLocaleString('vi-VN');
            const currentUserLabel = currentUser.ho_ten || 'Admin';
            const cleanIdCt = String(currentDistributingItem.id).trim();

            const finalDataToSave = detailVtItems.map(item => {
                const initialItem = initialDetailVtItems.find(it => String(it.id).trim() === String(item.id).trim());
                let logs = item.lich_su || '';

                if (!initialItem) {
                    if (item.trang_thai !== 'Xóa') {
                        const log = `${currentUserLabel} thêm mới người nhận [${item.nguoi_nhan || 'N/A'}]: SL ${item.sl} tại ${item.dia_diem || 'N/A'} lúc ${nowStr}`;
                        logs = logs ? `${logs}\n${log}` : log;
                    }
                    item.created_at = new Date().toISOString();
                } else {
                    const hasNameChanged = initialItem.nguoi_nhan !== item.nguoi_nhan;
                    const hasSlChanged = parseFloat(initialItem.sl) !== parseFloat(item.sl);
                    const hasPlaceChanged = initialItem.dia_diem !== item.dia_diem;
                    const hasNoteChanged = initialItem.ghi_chu !== item.ghi_chu;
                    const hasStatusChanged = initialItem.trang_thai !== item.trang_thai;

                    if (hasNameChanged || hasSlChanged || hasPlaceChanged || hasNoteChanged || hasStatusChanged) {
                        let changes = [];
                        if (hasNameChanged) changes.push(`Tên: ${initialItem.nguoi_nhan || 'Trống'} -> ${item.nguoi_nhan || 'Trống'}`);
                        if (hasSlChanged) changes.push(`SL: ${initialItem.sl} -> ${item.sl}`);
                        if (hasPlaceChanged) changes.push(`Địa điểm: ${initialItem.dia_diem || 'Trống'} -> ${item.dia_diem || 'Trống'}`);
                        if (hasNoteChanged) changes.push(`Ghi chú: ${initialItem.ghi_chu || 'Trống'} -> ${item.ghi_chu || 'Trống'}`);

                        if (!hasStatusChanged && (hasNameChanged || hasSlChanged || hasPlaceChanged || hasNoteChanged)) {
                            const log = `${currentUserLabel} cập nhật dòng [${item.nguoi_nhan || 'N/A'}]: ${changes.join(', ')} lúc ${nowStr}`;
                            logs = logs ? `${logs}\n${log}` : log;
                        }
                    }
                    item.created_at = new Date().toISOString();
                }

                return {
                    id: String(item.id).trim(),
                    id_ct: cleanIdCt,
                    nguoi_nhan: item.nguoi_nhan,
                    sl: item.sl,
                    dia_diem: item.dia_diem,
                    ghi_chu: item.ghi_chu,
                    trang_thai: item.trang_thai || '',
                    lich_su: logs,
                    created_at: item.created_at
                };
            });

            // Xóa cũ thêm mới dựa trên Text ID an toàn
            const { error: deleteError } = await sb.from('chi_tiet_vt').delete().eq('id_ct', cleanIdCt);
            if (deleteError) throw deleteError;

            if (finalDataToSave.length > 0) {
                const { error: insertError } = await sb.from('chi_tiet_vt').insert(finalDataToSave);
                if (insertError) throw insertError;
            }

            showToast("Lưu phân bổ thành công!", 'success');
            document.getElementById('chi-tiet-vt-modal').classList.add('hidden');
        } catch (err) {
            showToast("Lỗi khi lưu dữ liệu: " + err.message, 'error');
        } finally {
            showLoading(false);
        }
    };

    isModalListenersInitialized = true;
}

export async function openDetailVtModal(ct, isReadOnly = false) {
    if (!ct || !ct.id) return;

    ensureModalListenersAttached();

    currentDistributingItem = ct;
    const cleanId = String(ct.id).trim(); // Text ID an toàn
    const modal = document.getElementById('chi-tiet-vt-modal');
    const headerEl = document.getElementById('ct-vt-info-header');
    const originalQtyEl = document.getElementById('ct-vt-original-qty');

    if (headerEl) {
        headerEl.innerHTML = `
            <div class="flex flex-col gap-1 md:gap-1.5 overflow-hidden">
                <div class="text-[11px] md:text-lg font-black flex items-center gap-1.5 whitespace-nowrap overflow-x-auto no-scrollbar">
                    <span class="text-gray-800 uppercase tracking-tight flex-shrink-0">Phân bổ:</span>
                    <span class="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex-shrink-0">${ct.ma_vt} - ${ct.lot || 'No LOT'} - ${ct.date || 'No Date'}</span>
                </div>
                <div class="text-[9px] md:text-sm font-bold text-gray-500 flex items-center gap-2 whitespace-nowrap overflow-x-auto no-scrollbar">
                    <span class="text-gray-700 flex-shrink-0">${formatDateToDDMMYYYY(ct.thoi_gian)}</span>
                    <span class="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"></span>
                    <span class="text-indigo-600 flex-shrink-0">${ct.ma_nx}</span>
                    <span class="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"></span>
                    <span class="flex-shrink-0">Y/c: <span class="text-gray-800 underline underline-offset-2">${ct.yeu_cau || 'N/A'}</span></span>
                </div>
                <div class="text-[9px] md:text-xs text-gray-400 mt-1 bg-gray-50 p-1.5 rounded border border-gray-100 italic line-clamp-2" title="${ct.muc_dich || ''}">
                    Mục đích: <span class="text-gray-600 not-italic font-medium">${ct.muc_dich || 'Không có'}</span>
                </div>
            </div>
        `;
    }

    const qty = ct.nhap || ct.xuat || 0;
    if (originalQtyEl) originalQtyEl.textContent = qty;

    const saveBtn = document.getElementById('save-ct-vt-btn');
    const addBtn = document.getElementById('add-ct-vt-row-btn');

    if (isReadOnly) {
        if (saveBtn) saveBtn.classList.add('hidden');
        if (addBtn) addBtn.classList.add('hidden');
        document.querySelectorAll('.ct-vt-col-delete').forEach(el => el.classList.add('hidden'));
    } else {
        if (saveBtn) saveBtn.classList.remove('hidden');
        if (addBtn) addBtn.classList.remove('hidden');
        document.querySelectorAll('.ct-vt-col-delete').forEach(el => el.classList.remove('hidden'));
    }

    showLoading(true);
    try {
        await fetchNameSuggestions();
        // NÂNG CẤP: Ép kiểu Text ID trong query
        const { data, error } = await sb.from('chi_tiet_vt').select('*').eq('id_ct', cleanId).order('created_at', { ascending: true });
        if (error) throw error;

        detailVtItems = data || [];
        initialDetailVtItems = JSON.parse(JSON.stringify(detailVtItems));

        renderDetailVtRows(isReadOnly);
        renderHistory();
        if (modal) modal.classList.remove('hidden');
    } catch (err) {
        showToast(`Lỗi xác thực dữ liệu: ${err.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

function renderHistory() {
    const historyList = document.getElementById('ct-vt-history-list');
    if (!historyList) return;

    historyList.innerHTML = '';

    let allHistory = [];
    detailVtItems.forEach(item => {
        if (item.lich_su) {
            const logs = item.lich_su.split('\n').filter(Boolean);
            logs.forEach((log, index) => {
                allHistory.push({
                    id: String(item.id).trim(),
                    text: log,
                    time: new Date(new Date(item.created_at || Date.now()).getTime() + (index * 1000)).toISOString(),
                    trangThaiHienTai: item.trang_thai
                });
            });
        }
    });

    if (allHistory.length === 0) {
        historyList.innerHTML = '<p class="text-[10px] md:text-xs text-gray-400 italic">Chưa có lịch sử cập nhật cho mục này.</p>';
        return;
    }

    allHistory.sort((a, b) => new Date(b.time) - new Date(a.time));

    historyList.innerHTML = allHistory.map(log => {
        const isDelete = log.text.includes('đã xóa');
        const isRestore = log.text.includes('đã khôi phục');
        const isAdd = log.text.includes('thêm mới');

        let dotColor = 'bg-blue-500';
        if (isDelete) dotColor = 'bg-red-500';
        else if (isAdd) dotColor = 'bg-green-500';

        const showRestoreBtn = isDelete && log.trangThaiHienTai === 'Xóa';
        const restoreBtnHtml = showRestoreBtn ?
            `<button class="ml-2 text-blue-600 font-bold hover:underline ct-vt-restore-btn" data-id="${log.id}">Khôi phục ngay</button>` : '';

        return `
            <div class="flex gap-2 md:gap-3 relative pl-4 border-l-2 border-gray-100 py-1">
                <div class="absolute -left-[7px] top-2 w-3 h-3 rounded-full ${dotColor} border-2 border-white shadow-sm"></div>
                <div class="flex-grow">
                    <p class="text-[9px] md:text-xs text-gray-600 font-medium leading-tight">
                        ${log.text} ${restoreBtnHtml}
                    </p>
                </div>
            </div>
        `;
    }).join('');

    historyList.querySelectorAll('.ct-vt-restore-btn').forEach(btn => {
        btn.onclick = (e) => {
            const id = e.target.dataset.id;
            handleRestoreItem(id);
        };
    });
}

function handleRestoreItem(id) {
    const item = detailVtItems.find(it => String(it.id).trim() === String(id).trim());
    if (!item) return;

    const originalQty = parseFloat(document.getElementById('ct-vt-original-qty').textContent) || 0;
    const currentActiveSum = detailVtItems.reduce((s, i) => i.trang_thai !== 'Xóa' ? s + (parseFloat(i.sl) || 0) : s, 0);
    const itemQty = parseFloat(item.sl) || 0;

    if (currentActiveSum + itemQty > originalQty) {
        showToast(`Không thể khôi phục! Tổng SL (${currentActiveSum + itemQty}) vượt quá SL gốc (${originalQty}).`, 'error');
        return;
    }

    const nowStr = new Date().toLocaleString('vi-VN');
    const currentUserLabel = currentUser.ho_ten || 'Admin';
    const log = `${currentUserLabel} đã khôi phục: người nhận [${item.nguoi_nhan || 'Trống'}]: SL ${item.sl} lúc ${nowStr}`;

    item.trang_thai = '';
    item.lich_su = item.lich_su ? `${item.lich_su}\n${log}` : log;
    item.created_at = new Date().toISOString();

    const isReadOnly = document.getElementById('save-ct-vt-btn').classList.contains('hidden');
    renderDetailVtRows(isReadOnly);
    renderHistory();
    showToast("Đã khôi phục hàng!", 'success');
}

function renderDetailVtRows(isReadOnly = false) {
    const tbody = document.getElementById('chi-tiet-vt-table-body');
    const emptyState = document.getElementById('ct-vt-empty-state');
    const distributedEl = document.getElementById('ct-vt-distributed-qty');
    const originalQtyEl = document.getElementById('ct-vt-original-qty');
    const originalQty = originalQtyEl ? (parseFloat(originalQtyEl.textContent) || 0) : 0;

    if (!tbody) return;
    tbody.innerHTML = '';
    let totalDist = 0;

    const visibleItems = detailVtItems.filter(it => it.trang_thai !== 'Xóa');

    if (visibleItems.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
    } else {
        if (emptyState) emptyState.classList.add('hidden');
        visibleItems.forEach((item) => {
            const actualIndex = detailVtItems.findIndex(it => String(it.id).trim() === String(item.id).trim());

            totalDist += (parseFloat(item.sl) || 0);
            const row = document.createElement('tr');
            row.className = "hover:bg-gray-50 transition-colors border-b";

            row.innerHTML = `
                <td class="border p-0 relative">
                    <input type="text" class="w-full p-2 border-none bg-transparent text-[11px] md:text-sm font-medium vt-input-nguoi-nhan text-center md:text-left" value="${item.nguoi_nhan || ''}" placeholder="..." ${isReadOnly ? 'readonly' : ''}>
                </td>
                <td class="border p-0">
                    <input type="number" class="w-full p-1 border-none bg-transparent text-[11px] md:text-sm font-black text-blue-700 vt-input-sl text-center" value="${item.sl || 0}" step="1" min="0" ${isReadOnly ? 'readonly' : ''}>
                </td>
                <td class="border p-0">
                    <textarea class="w-full p-2 border-none bg-transparent text-[10px] md:text-sm vt-input-dia-diem resize-none line-clamp-2 h-[42px] leading-tight focus:line-clamp-none focus:h-auto cursor-pointer" placeholder="..." ${isReadOnly ? 'readonly' : ''}>${item.dia_diem || ''}</textarea>
                </td>
                <td class="border p-0">
                    <textarea class="w-full p-2 border-none bg-transparent text-[10px] md:text-sm vt-input-ghi-chu resize-none line-clamp-2 h-[42px] leading-tight focus:line-clamp-none focus:h-auto cursor-pointer" placeholder="..." ${isReadOnly ? 'readonly' : ''}>${item.ghi_chu || ''}</textarea>
                </td>
                <td class="border p-0 text-center ct-vt-col-delete ${isReadOnly ? 'hidden' : ''}">
                    <button class="text-red-400 hover:text-red-600 vt-delete-row-btn p-1.5 transition-transform active:scale-125" data-id="${item.id}">
                        <svg class="w-4 h-4 md:w-5 md:h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </td>
            `;

            if (!isReadOnly) {
                const nameInput = row.querySelector('.vt-input-nguoi-nhan');
                const handleNameSearch = () => {
                    const val = nameInput.value.toLowerCase();
                    const suggestions = nameSuggestionsCache.filter(item =>
                        item.name.toLowerCase().includes(val)
                    );
                    openAutocomplete(nameInput, suggestions, {
                        valueKey: 'name',
                        primaryTextKey: 'name',
                        onSelect: (val) => {
                            nameInput.value = val;
                            detailVtItems[actualIndex].nguoi_nhan = val;
                        }
                    });
                };
                nameInput.onfocus = handleNameSearch;
                nameInput.oninput = handleNameSearch;

                const slInput = row.querySelector('.vt-input-sl');
                slInput.oninput = (e) => {
                    let newValue = parseFloat(e.target.value) || 0;
                    if (newValue < 0) newValue = 0;
                    const otherRowsSum = detailVtItems.reduce((sum, it) => (String(it.id).trim() !== String(item.id).trim() && it.trang_thai !== 'Xóa') ? sum + (parseFloat(it.sl) || 0) : sum, 0);
                    const maxAllowed = originalQty - otherRowsSum;
                    if (newValue > maxAllowed) {
                        newValue = maxAllowed;
                        e.target.value = newValue;
                        showToast(`Tổng số lượng không được vượt quá ${originalQty}`, 'info');
                    }
                    detailVtItems[actualIndex].sl = newValue;
                    updateLiveTotal();
                };

                const diaDiemInput = row.querySelector('.vt-input-dia-diem');
                const ghiChuInput = row.querySelector('.vt-input-ghi-chu');
                diaDiemInput.oninput = (e) => detailVtItems[actualIndex].dia_diem = e.target.value;
                ghiChuInput.oninput = (e) => detailVtItems[actualIndex].ghi_chu = e.target.value;

                const showToastIfTruncated = (el, prefix) => {
                    if (el.scrollHeight > el.clientHeight) showToast(`${prefix}: ${el.value}`, 'info');
                };
                diaDiemInput.onclick = (e) => showToastIfTruncated(e.target, 'Địa điểm');
                ghiChuInput.onclick = (e) => showToastIfTruncated(e.target, 'Ghi chú');

                row.querySelector('.vt-delete-row-btn').onclick = (e) => {
                    const id = e.currentTarget.dataset.id;
                    handleDeleteItem(id);
                };
            } else {
                const diaDiemInput = row.querySelector('.vt-input-dia-diem');
                const ghiChuInput = row.querySelector('.vt-input-ghi-chu');
                if (diaDiemInput) diaDiemInput.onclick = (e) => { if (e.target.scrollHeight > e.target.clientHeight) showToast(`Địa điểm: ${e.target.value}`, 'info'); };
                if (ghiChuInput) ghiChuInput.onclick = (e) => { if (e.target.scrollHeight > e.target.clientHeight) showToast(`Ghi chú: ${e.target.value}`, 'info'); };
            }

            tbody.appendChild(row);
        });
    }

    function updateLiveTotal() {
        if (!distributedEl) return;
        const currentSum = detailVtItems.reduce((s, i) => i.trang_thai !== 'Xóa' ? s + (parseFloat(i.sl) || 0) : s, 0);
        distributedEl.textContent = currentSum;
        distributedEl.className = currentSum > originalQty ? 'font-black text-red-600' : 'font-black text-green-700';
    }
    updateLiveTotal();
}

function handleDeleteItem(id) {
    const actualIndex = detailVtItems.findIndex(it => String(it.id).trim() === String(id).trim());
    if (actualIndex === -1) return;

    const item = detailVtItems[actualIndex];
    const nowStr = new Date().toLocaleString('vi-VN');
    const currentUserLabel = currentUser.ho_ten || 'Admin';
    const log = `${currentUserLabel} đã xóa: người nhận [${item.nguoi_nhan || 'Trống'}]: SL ${item.sl} tại ${item.dia_diem || 'Trống'} lúc ${nowStr}`;

    item.trang_thai = 'Xóa';
    item.lich_su = item.lich_su ? `${item.lich_su}\n${log}` : log;
    item.created_at = new Date().toISOString();

    const saveBtn = document.getElementById('save-ct-vt-btn');
    const isReadOnly = saveBtn ? saveBtn.classList.contains('hidden') : true;
    renderDetailVtRows(isReadOnly);
    renderHistory();
}

async function handleExcelExport() {
    const modal = document.getElementById('excel-export-modal');
    if (modal) modal.classList.remove('hidden');

    const exportAndClose = async (exportAll) => {
        if (modal) modal.classList.add('hidden');
        showLoading(true);
        try {
            const query = exportAll ? sb.from('chi_tiet').select('*') : buildChiTietQuery().select('*');
            const { data, error } = await query.order('thoi_gian', { ascending: true })
                                               .order('ma_kho', { ascending: true })
                                               .order('stt', { ascending: true })
                                               .limit(50000);

            if (error) throw error;
            if (!data || data.length === 0) {
                showToast("Không có dữ liệu để xuất.", 'info');
                return;
            }

            // --- NÂNG CẤP: Định dạng cột và sắp xếp thứ tự các cột theo yêu cầu ---
            const formattedData = data.map((item, index) => {
                const maNx = item.ma_nx || '';
                const loai = item.loai || '';
                const nhapVal = parseFloat(item.nhap) || 0;
                const xuatVal = parseFloat(item.xuat) || 0;

                let maNhap = '';
                let maXuat = '';

                if (maNx.includes('RO')) {
                    maNhap = maNx;
                } else if (maNx.includes('DO')) {
                    maXuat = maNx;
                } else if (loai === 'Nhập') {
                    maNhap = maNx;
                } else if (loai === 'Xuất') {
                    maXuat = maNx;
                } else if (nhapVal > 0) {
                    maNhap = maNx;
                } else if (xuatVal > 0) {
                    maXuat = maNx;
                }
                
                return {
                    id: item.id,
                    thoi_gian: formatDateToDDMMYYYY(item.thoi_gian),
                    ma_kho: item.ma_kho,
                    ma_nx: maNx,
                    ma_nhap: maNhap,
                    ma_xuat: maXuat,
                    ma_vach: item.ma_vach,
                    ma_vt: item.ma_vt,
                    ten_vt: item.ten_vt,
                    lot: item.lot,
                    date: item.date,
                    yc_sl: item.yc_sl,
                    nhap: item.nhap,
                    xuat: item.xuat,
                    loai: loai,
                    yeu_cau: item.yeu_cau,
                    muc_dich: item.muc_dich,
                    nganh: item.nganh,
                    stt: item.stt || (index + 1)
                };
            });

            // --- NÂNG CẤP: Làm nổi bật các tiêu đề cột (Viết hoa các cột quan trọng) ---
            const boldColumns = ['thoi_gian', 'ma_nx', 'ma_nhap', 'ma_xuat', 'ma_vt', 'lot', 'date', 'nhap', 'xuat', 'yeu_cau', 'muc_dich'];
            const headerKeys = Object.keys(formattedData[0]);
            const headers = headerKeys.map(k => boldColumns.includes(k) ? k.toUpperCase() : k);
            const dataRows = formattedData.map(item => headerKeys.map(k => item[k]));

            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "ChiTiet");

            // --- NÂNG CẤP: Tên file tối giản (không có tiêu đề cột) ---
            let filename = `ChiTiet_${new Date().toISOString().slice(0, 10)}`;
            if (!exportAll) {
                const state = viewStates['view-chi-tiet'];
                const f = state.filters;
                let suffix = "";
                if (state.searchTerm) suffix += `_${state.searchTerm}`;
                if (f.from_date) suffix += `_${f.from_date}`;
                if (f.to_date) suffix += `_${f.to_date}`;
                
                ['loai', 'ma_kho', 'ma_nx', 'ma_vt', 'lot', 'nganh', 'yeu_cau'].forEach(k => {
                    if (f[k] && f[k].length > 0) {
                        suffix += `_${f[k].join('-')}`;
                    }
                });
                if (suffix) filename += suffix.substring(0, 150);
            }
            
            const safeFilename = filename.replace(/[^a-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\s\-_]/gi, '_');
            XLSX.writeFile(workbook, `${safeFilename.xlsx ? safeFilename : safeFilename + '.xlsx'}`);
            showToast("Xuất Excel thành công!", 'success');
        } catch (err) {
            showToast(`Lỗi khi xuất Excel: ${err.message}`, 'error');
        } finally {
            showLoading(false);
        }
    };

    const filterBtn = document.getElementById('excel-export-filtered-btn');
    const allBtn = document.getElementById('excel-export-all-btn');
    const cancelBtn = document.getElementById('excel-export-cancel-btn');

    if (filterBtn) filterBtn.onclick = () => exportAndClose(false);
    if (allBtn) allBtn.onclick = () => exportAndClose(true);
    if (cancelBtn) cancelBtn.onclick = () => modal.classList.add('hidden');
}


async function openChiTietFilterPopover(button, view) {
    const filterKey = button.dataset.filterKey;
    const state = viewStates[view];

    const template = document.getElementById('filter-popover-template');
    if (!template) return;
    const popoverContent = template.content.cloneNode(true);
    const popover = popoverContent.querySelector('.filter-popover');
    document.body.appendChild(popover);

    const rect = button.getBoundingClientRect();
    if (window.innerWidth <= 768) {
        popover.style.position = 'fixed';
        popover.style.left = '50%';
        popover.style.top = '50%';
        popover.style.transform = 'translate(-50%, -50%)';
        popover.style.zIndex = '100';
    } else {
        popover.style.left = `${rect.left}px`;
        popover.style.top = `${rect.bottom + window.scrollY + 5}px`;
    }

    const optionsList = popover.querySelector('.filter-options-list');
    const applyBtn = popover.querySelector('.filter-apply-btn');
    const searchInput = popover.querySelector('.filter-search-input');
    const selectionCountEl = popover.querySelector('.filter-selection-count');
    const toggleAllBtn = popover.querySelector('.filter-toggle-all-btn');

    const tempSelectedOptions = new Set(state.filters[filterKey] || []);

    const updateSelectionCount = () => {
        const count = tempSelectedOptions.size;
        if (selectionCountEl) selectionCountEl.textContent = count > 0 ? `Đã chọn: ${count}` : '';
    };

    const updateToggleAllButtonState = () => {
        const visibleCheckboxes = optionsList.querySelectorAll('.filter-option-cb');
        if (visibleCheckboxes.length === 0) {
            toggleAllBtn.textContent = 'Tất cả';
            toggleAllBtn.disabled = true;
            return;
        }
        toggleAllBtn.disabled = false;
        const allVisibleSelected = [...visibleCheckboxes].every(cb => cb.checked);
        toggleAllBtn.textContent = allVisibleSelected ? 'Bỏ chọn' : 'Tất cả';
    };

    const renderOptions = (options) => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredOptions = options.filter(option =>
            option && String(option).toLowerCase().includes(searchTerm)
        );
        optionsList.innerHTML = filteredOptions.length > 0 ? filteredOptions.map(option => `
            <label class="flex items-center space-x-2 px-2 py-1 hover:bg-gray-100 rounded">
                <input type="checkbox" value="${option}" class="filter-option-cb" ${tempSelectedOptions.has(String(option)) ? 'checked' : ''}>
                <span class="text-sm">${option}</span>
            </label>
        `).join('') : '<div class="text-center p-4 text-sm text-gray-500">Không có tùy chọn.</div>';
        updateToggleAllButtonState();
    };

    const setupEventListeners = (allOptions) => {
        searchInput.addEventListener('input', () => renderOptions(allOptions));
        optionsList.addEventListener('change', e => {
            const cb = e.target;
            if (cb.type === 'checkbox' && cb.classList.contains('filter-option-cb')) {
                if (cb.checked) tempSelectedOptions.add(cb.value);
                else tempSelectedOptions.delete(cb.value);
                updateSelectionCount();
                updateToggleAllButtonState(optionsList.querySelectorAll('.filter-option-cb'));
            }
        });
        toggleAllBtn.onclick = () => {
            const searchTerm = searchInput.value.toLowerCase();
            const visibleOptions = allOptions.filter(option => option && String(option).toLowerCase().includes(searchTerm));
            const isSelectAllAction = toggleAllBtn.textContent === 'Tất cả';
            visibleOptions.forEach(option => {
                if (isSelectAllAction) tempSelectedOptions.add(String(option));
                else tempSelectedOptions.delete(String(option));
            });
            renderOptions(allOptions);
            updateSelectionCount();
        };
    };

    updateSelectionCount();

    if (filterKey === 'loai') {
        const options = ['Nhập', 'Xuất'];
        renderOptions(options);
        setupEventListeners(options);
        applyBtn.disabled = false;
    } else {
        optionsList.innerHTML = '<div class="text-center p-4 text-sm text-gray-500">Đang tải...</div>';
        applyBtn.disabled = true;
        try {
            const { data, error } = await buildChiTietQuery().select(filterKey);
            if (error) throw error;
            const uniqueOptions = [...new Set(data.map(item => item[filterKey]).filter(Boolean))].sort();
            renderOptions(uniqueOptions);
            setupEventListeners(uniqueOptions);
            applyBtn.disabled = false;
        } catch (error) {
            optionsList.innerHTML = '<div class="text-center p-4 text-sm text-red-500">Lỗi tải bộ lọc.</div>';
        }
    }

    const closePopover = (e) => {
        if (!popover.contains(e.target) && e.target !== button) {
            popover.remove();
            document.removeEventListener('click', closePopover);
        }
    };
    applyBtn.onclick = () => {
        state.filters[filterKey] = [...tempSelectedOptions];
        const defaultText = filterButtonDefaultTexts[button.id] || button.id;
        const newText = tempSelectedOptions.size > 0 ? `${defaultText} (${tempSelectedOptions.size})` : defaultText;
        button.textContent = newText;
        const mobileBtn = document.getElementById(`${button.id}-mobile`);
        if (mobileBtn) mobileBtn.textContent = newText;
        if (view === 'view-chi-tiet') fetchChiTiet(1);
        popover.remove();
        document.removeEventListener('click', closePopover);
    };
    setTimeout(() => document.addEventListener('click', closePopover), 0);
}

const CT_COL_TITLES = {
    ma_kho: 'Mã Kho',
    ma_nx: 'Mã NX',
    ma_vach: 'Code + Lot + EXP',
    ma_vt: 'Mã VT',
    ten_vt: 'Tên VT',
    lot: 'Lot',
    date: 'Date',
    loai: 'Loại',
    yeu_cau: 'Người YC',
    muc_dich: 'Mục Đích',
    nganh: 'Ngành',
    phu_trach: 'Phụ Trách'
};

let activeCtFilterColKey = null;
let currentCtFilterValues = [];
let tempCtFilterSelected = new Set();

export function closeChiTietColumnFilterDropdown() {
    const popover = document.getElementById('chitiet-col-filter-popover');
    if (popover) {
        popover.style.display = 'none';
    }
    activeCtFilterColKey = null;
    currentCtFilterValues = [];
    tempCtFilterSelected.clear();
    const searchInput = document.getElementById('ct-filter-popover-search-input');
    if (searchInput) searchInput.value = '';
}

function renderChiTietFilterPopoverList(filterKey) {
    const listEl = document.getElementById('ct-filter-popover-list');
    const selectAllCb = document.getElementById('ct-popover-select-all');
    const searchInput = document.getElementById('ct-filter-popover-search-input');
    if (!listEl) return;

    const searchTerm = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const filteredValues = currentCtFilterValues.filter(val => 
        val !== null && val !== undefined && String(val).toLowerCase().includes(searchTerm)
    );

    if (filteredValues.length === 0) {
        listEl.innerHTML = '<div class="p-3 text-center text-xs text-gray-400">Không có dữ liệu phù hợp</div>';
        if (selectAllCb) {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
        }
        return;
    }

    listEl.innerHTML = filteredValues.map(val => {
        const strVal = String(val);
        const isChecked = tempCtFilterSelected.has(strVal);
        let displayVal = escapeHtml(strVal);
        return `
            <label class="tk-popover-item flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-100 rounded cursor-pointer text-xs transition">
                <input type="checkbox" class="accent-blue-600 rounded ct-popover-item-cb" value="${escapeHtml(strVal)}" ${isChecked ? 'checked' : ''}>
                <span class="truncate">${displayVal}</span>
            </label>
        `;
    }).join('');

    const allChecked = filteredValues.every(val => tempCtFilterSelected.has(String(val)));
    const someChecked = filteredValues.some(val => tempCtFilterSelected.has(String(val)));
    if (selectAllCb) {
        selectAllCb.checked = allChecked;
        selectAllCb.indeterminate = !allChecked && someChecked;
    }

    listEl.querySelectorAll('.ct-popover-item-cb').forEach(cb => {
        cb.onchange = (e) => {
            const val = e.target.value;
            if (e.target.checked) {
                tempCtFilterSelected.add(val);
            } else {
                tempCtFilterSelected.delete(val);
            }
            const updatedAllChecked = filteredValues.every(v => tempCtFilterSelected.has(String(v)));
            const updatedSomeChecked = filteredValues.some(v => tempCtFilterSelected.has(String(v)));
            if (selectAllCb) {
                selectAllCb.checked = updatedAllChecked;
                selectAllCb.indeterminate = !updatedAllChecked && updatedSomeChecked;
            }
        };
    });
}

export async function toggleChiTietColumnFilterDropdown(triggerBtn, colKey) {
    const popover = document.getElementById('chitiet-col-filter-popover');
    if (!popover) return;

    if (activeCtFilterColKey === colKey && popover.style.display !== 'none') {
        closeChiTietColumnFilterDropdown();
        return;
    }

    activeCtFilterColKey = colKey;
    const colTitle = CT_COL_TITLES[colKey] || colKey;

    const titleEl = document.getElementById('ct-filter-popover-title');
    if (titleEl) titleEl.textContent = `Lọc: ${colTitle}`;

    const searchInput = document.getElementById('ct-filter-popover-search-input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = `Tìm trong ${colTitle}...`;
    }

    const listEl = document.getElementById('ct-filter-popover-list');
    listEl.innerHTML = '<div class="p-4 text-center text-xs text-gray-500 flex items-center justify-center gap-1.5"><svg class="animate-spin h-3.5 w-3.5 text-blue-600" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Đang tải giá trị...</div>';

    // Position popover relative to clicked button
    const btn = (triggerBtn instanceof HTMLElement) ? triggerBtn : (triggerBtn?.target?.closest ? triggerBtn.target.closest('.col-filter-btn') : document.querySelector(`#chi-tiet-table-head .col-filter-btn[data-col="${colKey}"]`));
    popover.style.display = 'flex';

    if (btn) {
        const rect = btn.getBoundingClientRect();
        const popoverWidth = 250;
        let left = rect.left;
        if (left + popoverWidth > window.innerWidth - 12) {
            left = window.innerWidth - popoverWidth - 12;
        }
        if (left < 10) left = 10;

        let top = rect.bottom + 4;
        if (top + 360 > window.innerHeight && rect.top > 370) {
            top = Math.max(10, rect.top - 365);
        }
        popover.style.left = `${Math.round(left)}px`;
        popover.style.top = `${Math.round(top)}px`;
    }

    const state = viewStates['view-chi-tiet'];
    tempCtFilterSelected = new Set(state.filters[colKey] || []);

    const selectAllCb = document.getElementById('ct-popover-select-all');
    if (selectAllCb) {
        selectAllCb.onchange = (e) => {
            const isChecked = e.target.checked;
            const searchVal = (searchInput ? searchInput.value : '').trim().toLowerCase();
            const visibleValues = currentCtFilterValues.filter(val => 
                val !== null && val !== undefined && String(val).toLowerCase().includes(searchVal)
            );
            visibleValues.forEach(val => {
                if (isChecked) {
                    tempCtFilterSelected.add(String(val));
                } else {
                    tempCtFilterSelected.delete(String(val));
                }
            });
            renderChiTietFilterPopoverList(colKey);
        };
    }

    if (searchInput) {
        searchInput.oninput = debounce(() => {
            renderChiTietFilterPopoverList(colKey);
        }, 120);
    }

    const applyBtn = document.getElementById('ct-popover-apply-btn');
    if (applyBtn) {
        applyBtn.onclick = () => {
            state.filters[colKey] = Array.from(tempCtFilterSelected);
            closeChiTietColumnFilterDropdown();
            renderChiTietTableHeader();
            fetchChiTiet(1);
        };
    }

    const clearBtn = document.getElementById('ct-popover-clear-btn');
    if (clearBtn) {
        clearBtn.onclick = () => {
            state.filters[colKey] = [];
            tempCtFilterSelected.clear();
            closeChiTietColumnFilterDropdown();
            renderChiTietTableHeader();
            fetchChiTiet(1);
        };
    }

    const closeBtn = document.getElementById('ct-popover-close-btn');
    if (closeBtn) {
        closeBtn.onclick = () => closeChiTietColumnFilterDropdown();
    }

    try {
        let query = sb.from('chi_tiet').select(colKey);

        if (currentUser.phan_quyen !== 'Admin') {
            const name = currentUser.ho_ten;
            const allowedNganh = (currentUser.xem_data || '').split(',').filter(Boolean);
            if (allowedNganh.length > 0) {
                const nganhListStr = allowedNganh.map(n => `"${n}"`).join(',');
                query = query.or(`phu_trach.eq."${name}",nganh.in.(${nganhListStr})`);
            } else {
                query = query.eq('phu_trach', name);
            }
        }

        if (state.searchTerm) {
            query = query.or(`ma_kho.ilike.%${state.searchTerm}%,ma_nx.ilike.%${state.searchTerm}%,ma_vach.ilike.%${state.searchTerm}%,ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,lot.ilike.%${state.searchTerm}%,loai.ilike.%${state.searchTerm}%,yeu_cau.ilike.%${state.searchTerm}%,muc_dich.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%`);
        }
        if (state.filters.from_date) query = query.gte('thoi_gian', state.filters.from_date);
        if (state.filters.to_date) query = query.lte('thoi_gian', state.filters.to_date);

        // Apply toolbar filters (Loại đơn & Trạng thái)
        if (state.filters.loai_don === 'Nhập') {
            query = query.or('ma_nx.ilike.%RO%,ma_kho.ilike.IN.%');
        } else if (state.filters.loai_don === 'Xuất') {
            query = query.or('ma_nx.ilike.%DO%,ma_kho.ilike.OUT.%');
        }

        if (state.filters.trang_thai === 'dang_xu_ly' || state.filters.trang_thai === 'Đang xử lý') {
            query = query.like('ma_nx', '%-');
        } else if (state.filters.trang_thai === 'hoan_thanh' || state.filters.trang_thai === 'Hoàn thành') {
            query = query.not('ma_nx', 'like', '%-').not('ma_nx', 'is', null);
        }

        // Apply other column filters
        Object.keys(state.filters).forEach(k => {
            if (k !== colKey && k !== 'from_date' && k !== 'to_date' && k !== 'loai_don' && k !== 'trang_thai' && Array.isArray(state.filters[k]) && state.filters[k].length > 0) {
                query = query.in(k, state.filters[k]);
            }
        });

        const { data, error } = await query.limit(10000);
        if (error) throw error;

        let unique = [...new Set((data || []).map(item => item[colKey]).filter(v => v !== null && v !== undefined && String(v).trim() !== ''))];
        unique.sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true }));

        currentCtFilterValues = unique;
        renderChiTietFilterPopoverList(colKey);
    } catch (err) {
        console.error("Lỗi khi tải bộ lọc cột Chi Tiết:", err);
        let unique = [];
        if (cache.chiTietList && cache.chiTietList.length > 0) {
            unique = [...new Set(cache.chiTietList.map(item => item[colKey]).filter(v => v !== null && v !== undefined && String(v).trim() !== ''))];
        }
        if (unique.length > 0) {
            unique.sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true }));
            currentCtFilterValues = unique;
            renderChiTietFilterPopoverList(colKey);
        } else {
            listEl.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Lỗi khi tải dữ liệu lọc</div>';
        }
    }
}

function updateCustomDropdownUI(wrapId, val, defaultText, optionsMap) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const labelEl = wrap.querySelector('.ct-dropdown-label');
    const btn = wrap.querySelector('button');
    const currentText = optionsMap[val] || defaultText;
    if (labelEl) labelEl.textContent = currentText;
    if (btn) {
        btn.classList.toggle('select-active', Boolean(val));
        if (wrap.id.includes('mobile')) {
            btn.classList.toggle('border-blue-500', Boolean(val));
            btn.classList.toggle('bg-blue-50', Boolean(val));
            btn.classList.toggle('text-blue-700', Boolean(val));
            btn.classList.toggle('font-bold', Boolean(val));
        }
    }
    wrap.querySelectorAll('.ct-dropdown-option').forEach(opt => {
        const optVal = opt.dataset.value || '';
        const isSelected = (optVal === val);
        opt.classList.toggle('bg-blue-50', isSelected);
        opt.classList.toggle('font-bold', isSelected);
        const check = opt.querySelector('.ct-opt-check');
        if (check) check.classList.toggle('hidden', !isSelected);
    });
}

export function updateChiTietFilterTogglesUI() {
    const state = viewStates['view-chi-tiet'];
    if (!state || !state.filters) return;
    const currentLoaiDon = state.filters.loai_don || '';
    const currentStatus = state.filters.trang_thai || '';

    const loaiMap = {
        '': 'Loại đơn: Tất cả',
        'Nhập': 'Nhập (RO / IN)',
        'Xuất': 'Xuất (DO / OUT)'
    };
    const statusMap = {
        '': 'Trạng thái: Tất cả',
        'dang_xu_ly': 'Đang xử lý',
        'hoan_thanh': 'Hoàn thành'
    };

    updateCustomDropdownUI('ct-desktop-loai-don-wrap', currentLoaiDon, 'Loại: Tất cả', loaiMap);
    updateCustomDropdownUI('ct-desktop-trang-thai-wrap', currentStatus, 'Trạng thái: Tất cả', statusMap);
    updateCustomDropdownUI('ct-mobile-loai-don-wrap', currentLoaiDon, 'Loại đơn: Tất cả', loaiMap);
    updateCustomDropdownUI('ct-mobile-trang-thai-wrap', currentStatus, 'Trạng thái: Tất cả', statusMap);
}

export function renderChiTietTableHeader() {
    const thead = document.getElementById('chi-tiet-table-head');
    if (!thead) return;
    const state = viewStates['view-chi-tiet'];
    const filters = state?.filters || {};

    let hasAnyActive = Boolean(state?.searchTerm || filters.from_date || filters.to_date || filters.loai_don || filters.trang_thai);

    thead.querySelectorAll('.col-filter-btn').forEach(btn => {
        const colKey = btn.dataset.col;
        const currentVals = filters[colKey] || [];
        const isActive = Array.isArray(currentVals) && currentVals.length > 0;
        if (isActive) hasAnyActive = true;

        btn.classList.toggle('filter-active', isActive);

        let badge = btn.querySelector('.filter-badge');
        if (isActive) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'filter-badge';
                btn.appendChild(badge);
            }
            badge.textContent = currentVals.length;
        } else if (badge) {
            badge.remove();
        }

        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleChiTietColumnFilterDropdown(btn, colKey);
        };
    });

    const resetBtn = document.getElementById('chi-tiet-reset-filters');
    if (resetBtn) {
        resetBtn.classList.toggle('filter-has-active', hasAnyActive);
    }
}

window.closeChiTietColumnFilterDropdown = closeChiTietColumnFilterDropdown;
window.toggleChiTietColumnFilterDropdown = toggleChiTietColumnFilterDropdown;
window.renderChiTietTableHeader = renderChiTietTableHeader;
window.updateChiTietFilterTogglesUI = updateChiTietFilterTogglesUI;

export function initChiTietView() {
    const viewContainer = document.getElementById('view-chi-tiet');

    viewContainer.innerHTML = VIEW_HTML;
    if (!document.getElementById('chi-tiet-settings-modal')) {
        document.body.insertAdjacentHTML('beforeend', SETTINGS_MODAL_HTML);
    }

    applyChiTietColumnSettings();
    ensureModalListenersAttached();

    const handleSearch = debounce(() => {
        const val = (document.getElementById('chi-tiet-search')?.value || document.getElementById('chi-tiet-search-mobile')?.value) || "";
        viewStates['view-chi-tiet'].searchTerm = val;
        fetchChiTiet(1);
    }, 500);

    const searchInput = document.getElementById('chi-tiet-search');
    const searchInputMobile = document.getElementById('chi-tiet-search-mobile');
    const searchClearBtn = document.getElementById('chi-tiet-search-clear');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (searchClearBtn) searchClearBtn.style.display = searchInput.value ? 'block' : 'none';
            handleSearch();
        });
    }
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            searchClearBtn.style.display = 'none';
            viewStates['view-chi-tiet'].searchTerm = '';
            fetchChiTiet(1);
        });
    }
    if (searchInputMobile) searchInputMobile.addEventListener('input', handleSearch);

    updateChiTietDisplayModeUI();
    renderChiTietTableHeader();
    updateChiTietFilterTogglesUI();

    viewContainer.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (btn) openChiTietFilterPopover(btn, 'view-chi-tiet');
        const actionBtn = e.target.closest('.ct-open-action-menu');
        if (actionBtn) openActionMenu(e, actionBtn);
    });

    // Close column filter dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const popover = document.getElementById('chitiet-col-filter-popover');
        if (popover && popover.style.display !== 'none') {
            if (!popover.contains(e.target) && !e.target.closest('.col-filter-btn')) {
                closeChiTietColumnFilterDropdown();
            }
        }
    });

    function setupCustomDropdown(wrapId, onSelect) {
        const wrap = document.getElementById(wrapId);
        if (!wrap) return;
        const btn = wrap.querySelector('button');
        const menu = wrap.querySelector('.ct-custom-dropdown-menu');
        const arrow = wrap.querySelector('.ct-dropdown-arrow');
        if (!btn || !menu) return;

        btn.onclick = (e) => {
            e.stopPropagation();
            const isOpened = !menu.classList.contains('hidden');
            document.querySelectorAll('.ct-custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
            document.querySelectorAll('.ct-dropdown-arrow').forEach(a => a.classList.remove('rotate-180'));
            if (!isOpened) {
                menu.classList.remove('hidden');
                if (arrow) arrow.classList.add('rotate-180');
            }
        };

        wrap.querySelectorAll('.ct-dropdown-option').forEach(opt => {
            opt.onclick = (e) => {
                e.stopPropagation();
                menu.classList.add('hidden');
                if (arrow) arrow.classList.remove('rotate-180');
                const val = opt.dataset.value || '';
                onSelect(val);
            };
        });
    }

    // Close custom dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.ct-custom-dropdown-container')) {
            document.querySelectorAll('.ct-custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
            document.querySelectorAll('.ct-dropdown-arrow').forEach(a => a.classList.remove('rotate-180'));
        }
    });

    const handleLoaiDonSelect = (val) => {
        const state = viewStates['view-chi-tiet'];
        state.filters.loai_don = val;
        updateChiTietFilterTogglesUI();
        renderChiTietTableHeader();
        fetchChiTiet(1);
    };

    const handleTrangThaiSelect = (val) => {
        const state = viewStates['view-chi-tiet'];
        state.filters.trang_thai = val;
        updateChiTietFilterTogglesUI();
        renderChiTietTableHeader();
        fetchChiTiet(1);
    };

    setupCustomDropdown('ct-desktop-loai-don-wrap', handleLoaiDonSelect);
    setupCustomDropdown('ct-desktop-trang-thai-wrap', handleTrangThaiSelect);
    setupCustomDropdown('ct-mobile-loai-don-wrap', handleLoaiDonSelect);
    setupCustomDropdown('ct-mobile-trang-thai-wrap', handleTrangThaiSelect);

    let currentCalTarget = 'from';
    let calViewingMonth = new Date().getMonth();
    let calViewingYear = new Date().getFullYear();

    const fromDesktop = document.getElementById('chi-tiet-filter-from-date');
    const toDesktop = document.getElementById('chi-tiet-filter-to-date');
    const fromBtnMobile = document.getElementById('ct-btn-from-date-mobile');
    const toBtnMobile = document.getElementById('ct-btn-to-date-mobile');
    const calBox = document.getElementById('ct-custom-calendar-box');

    function updateCustomDateLabelsUI() {
        const state = viewStates['view-chi-tiet'];
        const fromVal = state.filters.from_date || '';
        const toVal = state.filters.to_date || '';

        const fromLabel = document.getElementById('ct-label-from-date-mobile');
        const toLabel = document.getElementById('ct-label-to-date-mobile');

        if (fromLabel) fromLabel.textContent = fromVal ? formatDateToDDMMYYYY(fromVal) : 'Chọn ngày';
        if (toLabel) toLabel.textContent = toVal ? formatDateToDDMMYYYY(toVal) : 'Chọn ngày';

        const isCalOpen = calBox && !calBox.classList.contains('hidden');
        if (fromBtnMobile) {
            fromBtnMobile.classList.toggle('border-blue-500', Boolean(fromVal) || (currentCalTarget === 'from' && isCalOpen));
            fromBtnMobile.classList.toggle('bg-blue-50', Boolean(fromVal) || (currentCalTarget === 'from' && isCalOpen));
        }
        if (toBtnMobile) {
            toBtnMobile.classList.toggle('border-blue-500', Boolean(toVal) || (currentCalTarget === 'to' && isCalOpen));
            toBtnMobile.classList.toggle('bg-blue-50', Boolean(toVal) || (currentCalTarget === 'to' && isCalOpen));
        }

        if (fromDesktop && fromDesktop.value !== fromVal) fromDesktop.value = fromVal;
        if (toDesktop && toDesktop.value !== toVal) toDesktop.value = toVal;
    }

    function renderCustomCalendar() {
        const monthYearLabel = document.getElementById('ct-cal-month-year-label');
        const grid = document.getElementById('ct-cal-days-grid');
        if (!monthYearLabel || !grid) return;

        const monthNames = [
            'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
            'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
        ];
        monthYearLabel.textContent = `${monthNames[calViewingMonth]} - ${calViewingYear}`;

        const firstDay = new Date(calViewingYear, calViewingMonth, 1).getDay();
        const startOffset = (firstDay === 0) ? 6 : (firstDay - 1);

        const daysInMonth = new Date(calViewingYear, calViewingMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(calViewingYear, calViewingMonth, 0).getDate();

        const state = viewStates['view-chi-tiet'];
        const selectedDateStr = (currentCalTarget === 'from') ? state.filters.from_date : state.filters.to_date;

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        let html = '';

        for (let i = startOffset - 1; i >= 0; i--) {
            const d = daysInPrevMonth - i;
            html += `<div class="p-1 text-gray-300 select-none text-[10px] flex items-center justify-center">${d}</div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const mm = String(calViewingMonth + 1).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            const dateStr = `${calViewingYear}-${mm}-${dd}`;
            const isSelected = (dateStr === selectedDateStr);
            const isToday = (dateStr === todayStr);

            let cls = 'w-7 h-7 mx-auto flex items-center justify-center rounded-full cursor-pointer transition text-[11px] font-medium ';
            if (isSelected) {
                cls += 'bg-blue-600 text-white font-bold shadow-sm';
            } else if (isToday) {
                cls += 'border border-blue-500 text-blue-600 hover:bg-blue-50';
            } else {
                cls += 'text-gray-700 hover:bg-gray-100';
            }

            html += `<div class="p-0.5"><button type="button" class="${cls}" data-date="${dateStr}">${day}</button></div>`;
        }

        grid.innerHTML = html;

        grid.querySelectorAll('button[data-date]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                selectCalendarDate(btn.dataset.date);
            };
        });
    }

    function selectCalendarDate(dateVal) {
        const state = viewStates['view-chi-tiet'];
        if (currentCalTarget === 'from') {
            state.filters.from_date = dateVal;
        } else {
            state.filters.to_date = dateVal;
        }
        updateCustomDateLabelsUI();
        calBox?.classList.add('hidden');
        renderChiTietTableHeader();
        updateMobileFilterIconStatus('chi-tiet');
        fetchChiTiet(1);
    }

    const openCalendarFor = (target) => {
        currentCalTarget = target;
        const state = viewStates['view-chi-tiet'];
        const currentVal = (target === 'from') ? state.filters.from_date : state.filters.to_date;
        if (currentVal) {
            const parts = currentVal.split('-');
            calViewingYear = parseInt(parts[0], 10);
            calViewingMonth = parseInt(parts[1], 10) - 1;
        } else {
            const today = new Date();
            calViewingYear = today.getFullYear();
            calViewingMonth = today.getMonth();
        }
        calBox?.classList.remove('hidden');
        updateCustomDateLabelsUI();
        renderCustomCalendar();
    };

    if (fromBtnMobile) fromBtnMobile.onclick = (e) => {
        e.stopPropagation();
        openCalendarFor('from');
    };
    if (toBtnMobile) toBtnMobile.onclick = (e) => {
        e.stopPropagation();
        openCalendarFor('to');
    };

    document.getElementById('ct-cal-prev-month')?.addEventListener('click', (e) => {
        e.stopPropagation();
        calViewingMonth--;
        if (calViewingMonth < 0) {
            calViewingMonth = 11;
            calViewingYear--;
        }
        renderCustomCalendar();
    });

    document.getElementById('ct-cal-next-month')?.addEventListener('click', (e) => {
        e.stopPropagation();
        calViewingMonth++;
        if (calViewingMonth > 11) {
            calViewingMonth = 0;
            calViewingYear++;
        }
        renderCustomCalendar();
    });

    document.getElementById('ct-cal-today-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const today = new Date();
        calViewingMonth = today.getMonth();
        calViewingYear = today.getFullYear();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        selectCalendarDate(todayStr);
    });

    document.getElementById('ct-cal-close-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        calBox?.classList.add('hidden');
        updateCustomDateLabelsUI();
    });

    document.getElementById('ct-mobile-date-clear-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const state = viewStates['view-chi-tiet'];
        state.filters.from_date = '';
        state.filters.to_date = '';
        updateCustomDateLabelsUI();
        calBox?.classList.add('hidden');
        renderChiTietTableHeader();
        updateMobileFilterIconStatus('chi-tiet');
        fetchChiTiet(1);
    });

    if (fromDesktop) fromDesktop.addEventListener('change', e => {
        viewStates['view-chi-tiet'].filters.from_date = e.target.value;
        updateCustomDateLabelsUI();
        renderChiTietTableHeader();
        updateMobileFilterIconStatus('chi-tiet');
        fetchChiTiet(1);
    });

    if (toDesktop) toDesktop.addEventListener('change', e => {
        viewStates['view-chi-tiet'].filters.to_date = e.target.value;
        updateCustomDateLabelsUI();
        renderChiTietTableHeader();
        updateMobileFilterIconStatus('chi-tiet');
        fetchChiTiet(1);
    });

    updateCustomDateLabelsUI();

    const resetFilters = () => {
        if (searchInput) searchInput.value = '';
        if (searchClearBtn) searchClearBtn.style.display = 'none';
        if (searchInputMobile) searchInputMobile.value = '';
        if (fromDesktop) fromDesktop.value = '';
        if (toDesktop) toDesktop.value = '';
        updateCustomDateLabelsUI();
        calBox?.classList.add('hidden');
        viewStates['view-chi-tiet'].searchTerm = '';
        viewStates['view-chi-tiet'].filters = { from_date: '', to_date: '', loai_don: '', trang_thai: '', loai: [], ma_kho: [], ma_nx: [], ma_vach: [], ma_vt: [], ten_vt: [], lot: [], date: [], nganh: [], phu_trach: [], yeu_cau: [], muc_dich: [] };
        document.querySelectorAll('#view-chi-tiet .filter-btn').forEach(btn => {
            const defaultText = filterButtonDefaultTexts[btn.id.replace('-mobile', '')];
            if (defaultText) btn.textContent = defaultText;
        });
        updateChiTietFilterTogglesUI();
        closeChiTietColumnFilterDropdown();
        renderChiTietTableHeader();
        fetchChiTiet(1);
    };

    document.getElementById('chi-tiet-reset-filters')?.addEventListener('click', resetFilters);
    document.getElementById('chi-tiet-reset-filters-mobile')?.addEventListener('click', resetFilters);

    const drawer = document.getElementById('ct-filter-drawer');
    const overlay = document.getElementById('ct-filter-drawer-overlay');
    const toggleBtn = document.getElementById('ct-mobile-filter-toggle');
    const closeBtn = document.getElementById('ct-filter-drawer-close');

    const toggleDrawer = (show) => {
        if (show) {
            drawer?.classList.remove('translate-x-full');
            overlay?.classList.remove('hidden');
        } else {
            drawer?.classList.add('translate-x-full');
            overlay?.classList.add('hidden');
        }
    };

    if (toggleBtn) toggleBtn.addEventListener('click', () => toggleDrawer(true));
    if (closeBtn) closeBtn.addEventListener('click', () => toggleDrawer(false));
    if (overlay) overlay.addEventListener('click', () => toggleDrawer(false));

    document.getElementById('chi-tiet-btn-excel')?.addEventListener('click', handleExcelExport);
    document.getElementById('chi-tiet-btn-excel-mobile')?.addEventListener('click', handleExcelExport);

    document.getElementById('chi-tiet-btn-settings')?.addEventListener('click', openChiTietSettingsModal);
    document.getElementById('chi-tiet-settings-close-btn')?.addEventListener('click', () => document.getElementById('chi-tiet-settings-modal').classList.add('hidden'));

    const tableBody = document.getElementById('chi-tiet-table-body');
    if (tableBody) {
        tableBody.addEventListener('click', async (e) => {
            const maVtCell = e.target.closest('.ma-vt-cell');
            const copyNxBtn = e.target.closest('.copy-ma-nx-btn');
            if (maVtCell) {
                const ma_vt = maVtCell.textContent.trim();
                const tonKhoState = viewStates['view-ton-kho'];
                tonKhoState.searchTerm = '';
                tonKhoState.filters = { ma_vt: [ma_vt], lot: [], date: [], ton_cuoi: [], tinh_trang: [], nganh: [], phu_trach: [] };
                tonKhoState.stockAvailability = 'all';
                sessionStorage.setItem('tonKhoStockAvailability', 'all');
                await showView('view-ton-kho');
                return;
            }
            if (copyNxBtn) {
                const maNx = copyNxBtn.dataset.maNx;
                try {
                    await navigator.clipboard.writeText(maNx);
                    showToast('Đã copy Mã NX: ' + maNx, 'success');
                } catch (err) { showToast('Lỗi copy Mã NX', 'error'); }
                return;
            }
        });
    }

    document.getElementById('chi-tiet-items-per-page')?.addEventListener('change', (e) => {
        viewStates['view-chi-tiet'].itemsPerPage = parseInt(e.target.value, 10);
        fetchChiTiet(1);
    });

    document.getElementById('chi-tiet-prev-page')?.addEventListener('click', () => fetchChiTiet(viewStates['view-chi-tiet'].currentPage - 1));
    document.getElementById('chi-tiet-next-page')?.addEventListener('click', () => fetchChiTiet(viewStates['view-chi-tiet'].currentPage + 1));

    const pageInput = document.getElementById('chi-tiet-page-input');
    if (pageInput) {
        const handlePageJump = () => {
            const state = viewStates['view-chi-tiet'];
            let targetPage = parseInt(pageInput.value, 10);
            const totalPages = Math.ceil(state.totalFilteredCount / state.itemsPerPage);
            if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
            else if (targetPage > totalPages && totalPages > 0) targetPage = totalPages;
            pageInput.value = targetPage;
            if (targetPage !== state.currentPage) fetchChiTiet(targetPage);
        };
        pageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handlePageJump(); e.target.blur(); } });
        pageInput.addEventListener('change', handlePageJump);
    }
}
