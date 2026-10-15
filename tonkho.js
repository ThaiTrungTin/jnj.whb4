
import { sb, currentUser, cache, viewStates, showLoading, showToast, showConfirm, debounce, renderPagination, filterButtonDefaultTexts, openAutocomplete, updateTonKhoToggleUI, updateMobileFilterIconStatus } from './app.js';
import { fetchSanPham } from './sanpham.js';
import { startVoiceAssistant, stopVoiceAssistant } from './voice-assistant.js';

// Configuration for toggleable & reorderable columns on Desktop (Excel-style)
export const DEFAULT_TONKHO_COLUMNS = [
    { key: 'full-code', title: 'Code + Lot + EXP', field: 'ma_vach', defaultVisible: false, width: 170, minWidth: 35, align: 'left', sortable: false, filterable: true, class: 'tk-col-full-code' },
    { key: 'ma_vt', title: 'Mã VT', field: 'ma_vt', defaultVisible: true, width: 140, minWidth: 35, align: 'left', sortable: true, filterable: true, class: 'tk-col-ma-vt' },
    { key: 'ten_vt', title: 'Tên VT', field: 'ten_vt', defaultVisible: false, width: 220, minWidth: 35, align: 'left', sortable: true, filterable: true, class: 'tk-col-ten-vt' },
    { key: 'lot', title: 'Lot', field: 'lot', defaultVisible: true, width: 100, minWidth: 35, align: 'center', sortable: true, filterable: true, class: 'tk-col-lot' },
    { key: 'date', title: 'Date', field: 'date', defaultVisible: true, width: 95, minWidth: 35, align: 'center', sortable: true, filterable: true, class: 'tk-col-date' },
    { key: 'dau', title: 'Đầu', field: 'ton_dau', defaultVisible: true, width: 85, minWidth: 35, align: 'center', sortable: true, filterable: true, hasCount: 'ton-kho-header-dau-count', class: 'tk-col-dau' },
    { key: 'nhap', title: 'Nhập', field: 'nhap', defaultVisible: true, width: 85, minWidth: 35, align: 'center', sortable: true, filterable: true, hasCount: 'ton-kho-header-nhap-count', class: 'tk-col-nhap' },
    { key: 'xuat', title: 'Xuất', field: 'xuat', defaultVisible: true, width: 85, minWidth: 35, align: 'center', sortable: true, filterable: true, hasCount: 'ton-kho-header-xuat-count', class: 'tk-col-xuat' },
    { key: 'cuoi', title: 'Cuối', field: 'ton_cuoi', defaultVisible: true, width: 85, minWidth: 35, align: 'center', sortable: true, filterable: true, hasCount: 'ton-kho-header-cuoi-count', class: 'tk-col-cuoi' },
    { key: 'tinh_trang', title: 'T.Trạng', field: 'tinh_trang', defaultVisible: true, width: 130, minWidth: 35, align: 'center', sortable: true, filterable: true, class: 'tk-col-tinh-trang' },
    { key: 'tray', title: 'Tray', field: 'tray', defaultVisible: true, width: 80, minWidth: 35, align: 'center', sortable: false, filterable: true, class: 'tk-col-tray' },
    { key: 'nganh', title: 'Ngành', field: 'nganh', defaultVisible: false, width: 100, minWidth: 35, align: 'center', sortable: true, filterable: true, class: 'tk-col-nganh' },
    { key: 'phu_trach', title: 'Phụ Trách', field: 'phu_trach', defaultVisible: false, width: 110, minWidth: 35, align: 'center', sortable: true, filterable: true, class: 'tk-col-phu-trach' },
    { key: 'ghi_chu', title: 'Ghi chú', field: 'note', defaultVisible: true, width: 75, minWidth: 35, align: 'center', sortable: false, filterable: true, class: 'tk-col-ghi-chu' },
];

// Backward-compatible reference for legacy helper calls
export const OPTIONAL_COLUMNS = [
    { key: 'full-code', label: 'Code + Lot + EXP', class: 'tk-col-full-code' },
    { key: 'ten-vt', label: 'Tên Vật Tư', class: 'tk-col-ten-vt' },
    { key: 'dau', label: 'Tồn Đầu', class: 'tk-col-dau' },
    { key: 'nhap', label: 'Nhập', class: 'tk-col-nhap' },
    { key: 'xuat', label: 'Xuất', class: 'tk-col-xuat' },
    { key: 'tinh_trang', label: 'Tình Trạng', class: 'tk-col-tinh-trang' },
    { key: 'tray', label: 'Tray', class: 'tk-col-tray' },
    { key: 'nganh', label: 'Ngành', class: 'tk-col-nganh' },
    { key: 'phu_trach', label: 'Phụ Trách', class: 'tk-col-phu-trach' },
    { key: 'ghi_chu', label: 'Ghi chú', class: 'tk-col-ghi-chu' },
];

export let tonKhoColsConfig = [];

function initTonKhoColsConfig() {
    try {
        const saved = localStorage.getItem('tonkho_column_order_v2');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                const merged = parsed.map(c => {
                    const def = DEFAULT_TONKHO_COLUMNS.find(d => d.key === c.key);
                    return { ...(def || {}), ...c, filterable: true, minWidth: 35 };
                });
                DEFAULT_TONKHO_COLUMNS.forEach(def => {
                    if (!merged.find(c => c.key === def.key)) {
                        merged.push({ ...def, visible: def.defaultVisible, filterable: true, minWidth: 35 });
                    }
                });
                tonKhoColsConfig = merged;
                return;
            }
        }
    } catch (e) {
        console.warn("Failed to load saved column config", e);
    }

    // Fallback: check older tonKhoColumnSettings if exists
    let oldSettings = {};
    try {
        const old = localStorage.getItem('tonKhoColumnSettings');
        if (old) oldSettings = JSON.parse(old);
    } catch (e) {}

    tonKhoColsConfig = DEFAULT_TONKHO_COLUMNS.map(col => ({
        ...col,
        filterable: true,
        minWidth: 35,
        visible: oldSettings.hasOwnProperty(col.key) ? !!oldSettings[col.key] : col.defaultVisible
    }));
}

function saveTonKhoColsConfig(cols) {
    try {
        localStorage.setItem('tonkho_column_order_v2', JSON.stringify(cols));
        const legacySettings = {};
        cols.forEach(c => { legacySettings[c.key] = !!c.visible; });
        localStorage.setItem('tonKhoColumnSettings', JSON.stringify(legacySettings));
    } catch (e) {}
}

initTonKhoColsConfig();

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const STATUS_ORDER = [
    'Hết hạn sử dụng',
    'Từ 1-30 ngày',
    'Từ 31-60 ngày',
    'Từ 61-90 ngày',
    'Từ 91-120 ngày',
    'Từ 121-150 ngày',
    'Từ 151-180 ngày',
    'Trên 180 ngày',
    'Không có date'
];

// Helper to get UI Configuration (CSS and Label) for Expiry Status
function getStatusUI(statusLabel, daysLeft = null) {
    let bgCss = 'px-1.5 py-0.5 rounded-full shadow-sm font-semibold ';
    let textCss = 'font-bold ';
    let display = statusLabel;
    let mobileDayLabel = '';

    // 1. Determine Colors (Under 180 is Warning, Above is Green)
    if (statusLabel === 'Hết hạn sử dụng') {
        bgCss += 'text-white bg-red-600';
        textCss += 'text-red-600';
        mobileDayLabel = 'Hết hạn';
    } else if (statusLabel === 'Từ 1-30 ngày') {
        bgCss += 'text-white bg-red-400';
        textCss += 'text-red-400';
    } else if (statusLabel === 'Từ 31-60 ngày') {
        bgCss += 'text-white bg-orange-500';
        textCss += 'text-orange-500';
    } else if (statusLabel === 'Từ 61-90 ngày') {
        bgCss += 'text-white bg-orange-400';
        textCss += 'text-orange-400';
    } else if (statusLabel === 'Từ 91-120 ngày') {
        bgCss += 'text-gray-800 bg-amber-400';
        textCss += 'text-amber-500';
    } else if (statusLabel === 'Từ 121-150 ngày') {
        bgCss += 'text-gray-800 bg-yellow-400';
        textCss += 'text-yellow-500';
    } else if (statusLabel === 'Từ 151-180 ngày') {
        bgCss += 'text-gray-800 bg-yellow-200';
        textCss += 'text-yellow-400';
    } else if (statusLabel === 'Trên 180 ngày') {
        bgCss += 'text-white bg-green-600';
        textCss += 'text-green-600';
    } else {
        bgCss += 'text-gray-500 bg-gray-100';
        textCss += 'text-gray-400';
    }

    // 2. Refined Display Logic for detailed days
    if (daysLeft !== null && statusLabel !== 'Không có date' && statusLabel !== 'Hết hạn sử dụng') {
        if (daysLeft > 4000) {
            display = 'Trên 180 ngày ( ... )';
            mobileDayLabel = '...';
        } else {
            display = `${statusLabel} (${daysLeft} ngày)`;
            mobileDayLabel = `${daysLeft} ngày`;
        }
    } else if (statusLabel === 'Trên 180 ngày' && daysLeft === null) {
        display = 'Trên 180 ngày ( chi tiết )';
    }

    return { bgCss, textCss, display, mobileDayLabel };
}

const getColumnSettings = () => {
    const legacy = {};
    tonKhoColsConfig.forEach(c => { legacy[c.key] = !!c.visible; });
    return legacy;
};

const saveColumnSettings = (settings) => {
    tonKhoColsConfig.forEach(c => {
        if (settings.hasOwnProperty(c.key)) c.visible = !!settings[c.key];
    });
    saveTonKhoColsConfig(tonKhoColsConfig);
};

async function updateTonKhoHeaderCounts() {
    const state = viewStates['view-ton-kho'];
    const dauEl = document.getElementById('ton-kho-header-dau-count');
    const nhapEl = document.getElementById('ton-kho-header-nhap-count');
    const xuatEl = document.getElementById('ton-kho-header-xuat-count');
    const cuoiEl = document.getElementById('ton-kho-header-cuoi-count');
    const summaryContainer = document.getElementById('tk-summary-info');

    if (!dauEl || !nhapEl || !xuatEl || !cuoiEl || !summaryContainer) return;

    [dauEl, nhapEl, xuatEl, cuoiEl].forEach(el => el.textContent = '(...)');
    summaryContainer.innerHTML = '<span class="text-gray-400 font-normal text-[8px] md:text-xs italic">Đang tính toán...</span>';

    try {
        let query = buildTonKhoQuery();
        // Cần lấy ma_vt để đếm duy nhất
        const { data, error } = await query.select('ma_vt, ton_dau, nhap, xuat, ton_cuoi');

        if (error) throw error;

        let totalDau = 0, totalNhap = 0, totalXuat = 0, totalCuoi = 0;
        const uniqueMaVts = new Set();
        
        if (data && data.length > 0) {
            data.forEach(item => {
                totalDau += (item.ton_dau || 0);
                totalNhap += (item.nhap || 0);
                totalXuat += (item.xuat || 0);
                totalCuoi += (item.ton_cuoi || 0);
                if(item.ma_vt) uniqueMaVts.add(item.ma_vt);
            });
        }

        const dVal = totalDau.toLocaleString();
        const nVal = totalNhap.toLocaleString();
        const xVal = totalXuat.toLocaleString();
        const cVal = totalCuoi.toLocaleString();
        const vtCount = uniqueMaVts.size.toLocaleString();

        dauEl.textContent = `(${dVal})`;
        nhapEl.textContent = `(${nVal})`;
        xuatEl.textContent = `(${xVal})`;
        cuoiEl.textContent = `(${cVal})`;
        
        // Luôn xanh nếu <= 0, nhưng yêu cầu là màu xanh dương cho C: ở dưới
        cuoiEl.classList.toggle('text-red-600', totalCuoi > 0);
        cuoiEl.classList.toggle('text-green-600', totalCuoi <= 0);

        // Giao diện hợp nhất cho cả Desktop và Mobile
        summaryContainer.innerHTML = `
            <div class="mobile-summary-container">
                <div class="mobile-summary-content flex items-center gap-1 sm:gap-2 text-[7px] sm:text-[10px] md:text-xs font-bold border-x border-gray-100 px-2">
                    <span class="text-blue-600 whitespace-nowrap hidden md:inline" title="Số lượng mã vật tư duy nhất">Mã VT: ${vtCount}</span>
                    <span class="text-gray-200 hidden md:inline">|</span>
                    <span class="text-black whitespace-nowrap">Đ:${dVal}</span>
                    <span class="text-gray-200">|</span>
                    <span class="text-green-600 whitespace-nowrap">N:${nVal}</span>
                    <span class="text-gray-200">|</span>
                    <span class="text-red-500 whitespace-nowrap">X:${xVal}</span>
                    <span class="text-gray-200">|</span>
                    <div class="flex items-center gap-0.5">
                        <span class="text-blue-600 whitespace-nowrap">C:${cVal}</span>
                        <span class="text-blue-600 font-bold md:hidden">(${vtCount})</span>
                    </div>
                </div>
            </div>
        `;
        
        // Tự động cuộn cho mobile
        const container = summaryContainer.querySelector('.mobile-summary-container');
        if (container && window.innerWidth <= 768) {
            setTimeout(() => { container.scrollLeft = container.scrollWidth; }, 50);
        }

    } catch (err) {
        console.error("Error updating counts:", err);
        [dauEl, nhapEl, xuatEl, cuoiEl].forEach(el => el.textContent = '(lỗi)');
        summaryContainer.innerHTML = '<span class="text-red-500 text-[8px] md:text-xs">Lỗi tính toán</span>';
    }
}

function buildTonKhoQuery() {
    const state = viewStates['view-ton-kho'];
    let query = sb.from('ton_kho_update').select('*', { count: 'exact' });

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
        query = query.or(`ma_vach.ilike.%${state.searchTerm}%,ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,lot.ilike.%${state.searchTerm}%,tinh_trang.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%,note.ilike.%${state.searchTerm}%`);
    }

    if (state.stockAvailability === 'available') {
        query = query.gt('ton_cuoi', 0);
    }

    if (state.filters.ma_vt?.length > 0) query = query.in('ma_vt', state.filters.ma_vt);
    if (state.filters.lot?.length > 0) query = query.in('lot', state.filters.lot);
    if (state.filters.date?.length > 0) query = query.in('date', state.filters.date);
    if (state.filters.tinh_trang?.length > 0) query = query.in('tinh_trang', state.filters.tinh_trang);
    if (state.filters.nganh?.length > 0) query = query.in('nganh', state.filters.nganh);
    if (state.filters.phu_trach?.length > 0) query = query.in('phu_trach', state.filters.phu_trach);
    if (state.filters.ten_vt?.length > 0) query = query.in('ten_vt', state.filters.ten_vt);
    if (state.filters.tray?.length > 0) query = query.in('tray', state.filters.tray);
    if (state.filters.ma_vach?.length > 0) query = query.in('ma_vach', state.filters.ma_vach);
    if (state.filters['full-code']?.length > 0) query = query.in('ma_vach', state.filters['full-code']);
    if (state.filters.dau?.length > 0) query = query.in('ton_dau', state.filters.dau.map(Number));
    if (state.filters.ton_dau?.length > 0) query = query.in('ton_dau', state.filters.ton_dau.map(Number));
    if (state.filters.nhap?.length > 0) query = query.in('nhap', state.filters.nhap.map(Number));
    if (state.filters.xuat?.length > 0) query = query.in('xuat', state.filters.xuat.map(Number));
    if (state.filters.cuoi?.length > 0) query = query.in('ton_cuoi', state.filters.cuoi.map(Number));
    if (state.filters.ton_cuoi?.length > 0) query = query.in('ton_cuoi', state.filters.ton_cuoi.map(Number));
    if (state.filters.ghi_chu?.length > 0) query = query.in('note', state.filters.ghi_chu);
    if (state.filters.note?.length > 0) query = query.in('note', state.filters.note);
    
    return query;
}

export async function fetchTonKho(page = viewStates['view-ton-kho'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        viewStates['view-ton-kho'].currentPage = page;
        const state = viewStates['view-ton-kho'];
        state.selected.clear();
        updateTonKhoToggleUI();

        const { itemsPerPage } = state;

        let sortCol = state.sortCol || 'ma_vach';
        const sortDir = state.sortCol ? (state.sortDir === 'asc') : true;
        
        let dbSortCol = sortCol;
        if (sortCol === 'tinh_trang') {
            dbSortCol = 'ngay_con_lai';
        }

        const isTreeMode = (window.innerWidth >= 768 && tonKhoDisplayMode === 'tree');

        if (isTreeMode) {
            // Chế độ nhánh trên desktop: gom nhóm theo Mã VT và phân trang theo số lượng Mã VT
            // để khi thu lại ("thu"), các Mã VT của các trang khác tràn lên đủ itemsPerPage (ví dụ 50)
            let query = buildTonKhoQuery().order(dbSortCol, { ascending: sortDir, nullsFirst: false }).limit(10000);

            const [queryResult, _] = await Promise.all([
                query,
                updateTonKhoHeaderCounts()
            ]);

            const { data, error } = queryResult;

            if (error) {
                showToast("Không thể tải dữ liệu tồn kho.", 'error');
            } else {
                // Gom nhóm theo Mã VT (hoặc mã vạch nếu không có mã VT)
                const groupMap = new Map();
                const allGroups = [];

                (data || []).forEach(item => {
                    const key = item.ma_vt || item.ma_vach || 'KHAC';
                    if (!groupMap.has(key)) {
                        const grp = {
                            groupKey: key,
                            ma_vt: item.ma_vt || '',
                            ten_vt: item.ten_vt || '',
                            nganh: item.nganh || '',
                            phu_trach: item.phu_trach || '',
                            ton_dau: 0,
                            nhap: 0,
                            xuat: 0,
                            ton_cuoi: 0,
                            items: [],
                            minDaysLeft: Infinity,
                            worstStatusItem: item,
                            firstDbIndex: allGroups.length
                        };
                        groupMap.set(key, grp);
                        allGroups.push(grp);
                    }
                    const grp = groupMap.get(key);
                    grp.items.push(item);
                    grp.ton_dau += (Number(item.ton_dau) || 0);
                    grp.nhap += (Number(item.nhap) || 0);
                    grp.xuat += (Number(item.xuat) || 0);
                    grp.ton_cuoi += (Number(item.ton_cuoi) || 0);
                    if (!grp.ten_vt && item.ten_vt) grp.ten_vt = item.ten_vt;
                    if (!grp.nganh && item.nganh) grp.nganh = item.nganh;
                    if (!grp.phu_trach && item.phu_trach) grp.phu_trach = item.phu_trach;

                    const days = item.ngay_con_lai !== null && item.ngay_con_lai !== undefined ? Number(item.ngay_con_lai) : 999999;
                    if (days < grp.minDaysLeft) {
                        grp.minDaysLeft = days;
                        grp.worstStatusItem = item;
                    }
                });

                // Sắp xếp các nhóm nếu người dùng chọn sắp xếp cột
                if (state.sortCol) {
                    const isAsc = state.sortDir === 'asc';
                    allGroups.sort((a, b) => {
                        let cmp = 0;
                        const col = state.sortCol;
                        if (col === 'ma_vt') {
                            cmp = (a.ma_vt || '').localeCompare(b.ma_vt || '', 'vi', { numeric: true });
                        } else if (col === 'ten_vt') {
                            cmp = (a.ten_vt || '').localeCompare(b.ten_vt || '', 'vi');
                        } else if (col === 'dau' || col === 'ton_dau') {
                            cmp = a.ton_dau - b.ton_dau;
                        } else if (col === 'nhap') {
                            cmp = a.nhap - b.nhap;
                        } else if (col === 'xuat') {
                            cmp = a.xuat - b.xuat;
                        } else if (col === 'cuoi' || col === 'ton_cuoi') {
                            cmp = a.ton_cuoi - b.ton_cuoi;
                        } else if (col === 'tinh_trang') {
                            cmp = a.minDaysLeft - b.minDaysLeft;
                        } else if (col === 'date') {
                            const dateA = a.worstStatusItem?.date || '';
                            const dateB = b.worstStatusItem?.date || '';
                            cmp = dateA.localeCompare(dateB);
                        } else if (col === 'lot') {
                            const lotA = a.items[0]?.lot || '';
                            const lotB = b.items[0]?.lot || '';
                            cmp = lotA.localeCompare(lotB);
                        } else if (col === 'nganh') {
                            cmp = (a.nganh || '').localeCompare(b.nganh || '', 'vi');
                        } else if (col === 'phu_trach') {
                            cmp = (a.phu_trach || '').localeCompare(b.phu_trach || '', 'vi');
                        } else {
                            cmp = a.firstDbIndex - b.firstDbIndex;
                        }
                        return isAsc ? cmp : -cmp;
                    });
                }

                const totalGroups = allGroups.length;
                const totalPages = Math.ceil(totalGroups / itemsPerPage) || 1;
                if (page > totalPages) page = totalPages;
                if (page < 1) page = 1;
                state.currentPage = page;

                const fromGroup = (page - 1) * itemsPerPage;
                const toGroup = Math.min(fromGroup + itemsPerPage, totalGroups);
                const pagedGroups = allGroups.slice(fromGroup, toGroup);
                const pagedItems = pagedGroups.flatMap(g => g.items);

                state.totalFilteredCount = totalGroups;
                cache.tonKhoList = pagedItems;

                renderTonKhoTableHeader();
                updateTonKhoDisplayModeUI();
                renderTonKhoTable(pagedItems);
                renderPagination('ton-kho', totalGroups, fromGroup, Math.max(0, toGroup - 1));
                updateFilterButtonTexts('ton-kho');
                updateMobileFilterIconStatus('ton-kho');

                const hasAnyActiveFilter = Object.values(state.filters || {}).some(arr => Array.isArray(arr) && arr.length > 0) || (state.searchTerm && state.searchTerm.trim().length > 0);
                const resetBtn = document.getElementById('ton-kho-reset-filters');
                if (resetBtn) {
                    resetBtn.classList.toggle('filter-has-active', !!hasAnyActiveFilter);
                }
            }
        } else {
            // Chế độ xem thường (Flat) hoặc trên Mobile: phân trang theo dòng dữ liệu (lô)
            const from = (page - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            let query = buildTonKhoQuery().order(dbSortCol, { ascending: sortDir, nullsFirst: false }).range(from, to);

            const [queryResult, _] = await Promise.all([
                query,
                updateTonKhoHeaderCounts()
            ]);
            
            const { data, error, count } = queryResult;

            if (error) {
                showToast("Không thể tải dữ liệu tồn kho.", 'error');
            } else {
                state.totalFilteredCount = count;
                cache.tonKhoList = data;
                
                renderTonKhoTableHeader();
                updateTonKhoDisplayModeUI();
                renderTonKhoTable(data);
                renderPagination('ton-kho', count, from, to);
                updateFilterButtonTexts('ton-kho');
                updateMobileFilterIconStatus('ton-kho');

                const hasAnyActiveFilter = Object.values(state.filters || {}).some(arr => Array.isArray(arr) && arr.length > 0) || (state.searchTerm && state.searchTerm.trim().length > 0);
                const resetBtn = document.getElementById('ton-kho-reset-filters');
                if (resetBtn) {
                    resetBtn.classList.toggle('filter-has-active', !!hasAnyActiveFilter);
                }
            }
        }
    } finally {
        if (showLoader) showLoading(false);
    }
}

// Global helper for opening modal from row click
window.openTonKhoModalFromRow = function(maVach) {
    const tk = (cache.tonKhoList || []).find(i => i.ma_vach === maVach);
    if (tk) openTonKhoModal(tk, 'view');
};

// Backwards compatibility stub
export function applyTonKhoColumnSettings() {
    renderTonKhoTableHeader();
}

export function updateTonKhoTableWidth() {
    if (window.innerWidth < 768) return;
    const table = document.getElementById('ton-kho-main-table');
    const container = document.querySelector('#view-ton-kho .table-container');
    if (!table) return;

    const visibleCols = tonKhoColsConfig.filter(c => c.visible);
    const totalColsWidth = visibleCols.reduce((sum, col) => sum + (col.width || 100), 0);
    const containerWidth = container ? container.clientWidth : 0;

    if (containerWidth > 0 && totalColsWidth < containerWidth) {
        table.style.width = '100%';
        table.style.minWidth = '100%';
    } else {
        table.style.width = `${totalColsWidth}px`;
        table.style.minWidth = `${totalColsWidth}px`;
    }
}

export function renderTonKhoTableHeader() {
    const thead = document.getElementById('ton-kho-table-head');
    if (!thead) return;
    const table = document.getElementById('ton-kho-main-table');

    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        if (table) {
            table.style.width = '';
            table.style.minWidth = '';
        }
        // Mobile view: keep EXACT original static markup untouched
        thead.innerHTML = `
            <tr>
                <th class="tk-col-full-code hidden md:table-cell px-1 py-1.5 text-center font-bold text-black uppercase tracking-wider border border-gray-300 text-xs">
                    Code + Lot + EXP</th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 px-1 py-1.5 text-center font-bold text-black uppercase tracking-wider border border-gray-300 text-xs" data-sort="ma_vt">
                    <div class="flex items-center justify-center">Mã VT<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div></th>
                <th class="tk-col-ten-vt hidden md:table-cell px-1 py-1.5 text-center font-bold text-black uppercase tracking-wider border border-gray-300 text-xs">
                    Tên VT</th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 px-1 py-1.5 text-center font-bold text-black uppercase tracking-wider border border-gray-300 text-xs" data-sort="lot">
                    <div class="flex items-center justify-center">Lot<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div></th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 px-1 py-1.5 text-center font-bold text-black uppercase tracking-wider border border-gray-300 text-xs" data-sort="date">
                    <div class="flex items-center justify-center">Date<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div></th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 tk-col-dau hidden md:table-cell px-1 py-1.5 text-center font-bold text-black uppercase tracking-wider border border-gray-300 text-xs" data-sort="ton_dau">
                    <div class="flex items-center justify-center flex-col">
                        <div class="flex items-center">Đầu<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div>
                        <span id="ton-kho-header-dau-count" class="block font-bold text-black text-[7px]"></span>
                    </div></th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 tk-col-nhap hidden md:table-cell px-1 py-1.5 text-center font-bold text-black uppercase tracking-wider border border-gray-300 text-xs" data-sort="nhap">
                    <div class="flex items-center justify-center flex-col">
                        <div class="flex items-center">Nhập<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div>
                        <span id="ton-kho-header-nhap-count" class="block font-bold text-green-600 text-[7px]"></span>
                    </div></th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 tk-col-xuat hidden md:table-cell px-1 py-1.5 text-center font-bold text-black uppercase tracking-wider border border-gray-300 text-xs" data-sort="xuat">
                    <div class="flex items-center justify-center flex-col">
                        <div class="flex items-center">Xuất<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div>
                        <span id="ton-kho-header-xuat-count" class="block font-bold text-red-600 text-[7px]"></span>
                    </div></th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 px-1 py-1.5 text-center font-bold text-black uppercase tracking-wider border border-gray-300 text-xs" data-sort="ton_cuoi">
                    <div class="flex items-center justify-center flex-col">
                        <div class="flex items-center">Cuối<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div>
                        <span id="ton-kho-header-cuoi-count" class="hidden md:block font-bold text-red-600 text-[7px]"></span>
                    </div>
                </th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 tk-col-tinh-trang hidden md:table-cell px-1 py-1.5 border border-gray-300 text-center uppercase tracking-wider font-bold text-xs" data-sort="tinh_trang">
                    <div class="flex items-center justify-center">T.Trạng<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div></th>
                <th class="tk-col-tray px-1 py-1.5 border border-gray-300 text-center uppercase tracking-wider font-bold text-[10px] md:text-xs">
                    <span class="hidden md:inline">Tray</span>
                    <span class="md:hidden flex justify-center items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </span>
                </th>
                <th class="tk-col-nganh hidden md:table-cell px-1 py-1.5 text-[8px] text-gray-600 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis">
                    Ngành</th>
                <th class="tk-col-phu-trach hidden md:table-cell px-1 py-1.5 text-xs text-gray-600 border border-gray-300 text-center">
                    Phụ Trách</th>
                <th class="tk-col-ghi-chu hidden md:table-cell px-1 py-1.5 border border-gray-300 text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </th>
            </tr>
        `;
        return;
    }

    // Laptop/Desktop View: Dynamic ordered columns with in-header filters and excel-style resize handles!
    const state = viewStates['view-ton-kho'] || {};
    const visibleCols = tonKhoColsConfig.filter(c => c.visible);

    updateTonKhoTableWidth();

    const thHtml = visibleCols.map(col => {
        const isSorted = state.sortCol === (col.field || col.key);
        const sortDir = state.sortDir;
        let sortIconSvg = '<svg class="w-2.5 h-2.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg>';
        if (isSorted) {
            sortIconSvg = sortDir === 'asc'
                ? '<svg class="w-2.5 h-2.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path class="text-blue-600" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4"></path><path class="text-gray-300" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg>'
                : '<svg class="w-2.5 h-2.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path class="text-gray-300" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4"></path><path class="text-blue-600" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg>';
        }

        const filterKey = col.field || col.key;
        const currentSelected = state.filters ? (state.filters[filterKey] || []) : [];
        const isFilterActive = Array.isArray(currentSelected) && currentSelected.length > 0;

        const countBadge = col.hasCount ? `<span id="${col.hasCount}" class="block font-bold text-[7px] text-center mx-0.5"></span>` : '';

        const filterBtnHtml = col.filterable ? `
            <button type="button" class="col-filter-btn ${isFilterActive ? 'filter-active' : ''}" data-col="${filterKey}" title="Lọc ${escapeHtml(col.title)}">
                <svg class="w-2.5 h-2.5 funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
                ${isFilterActive ? `<span class="filter-badge">${currentSelected.length}</span>` : ''}
            </button>
        ` : '';

        const sortableClass = col.sortable ? 'tk-sortable-header cursor-pointer hover:bg-gray-300' : '';
        const colW = col.width || 100;

        return `
            <th class="${sortableClass} ${col.class || ''} px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 text-[11.5px]"
                data-sort="${col.sortable ? (col.field || col.key) : ''}"
                data-col-key="${col.key}"
                style="width: ${colW}px; min-width: ${colW}px; max-width: ${colW}px;">
                <div class="tk-th-content">
                    <div class="tk-th-title ${col.sortable ? 'cursor-pointer' : ''}">
                        <span class="truncate">${escapeHtml(col.title)}</span>
                        ${col.sortable ? `<span class="sort-icon ml-0.5 text-gray-400 flex-shrink-0">${sortIconSvg}</span>` : ''}
                    </div>
                    ${countBadge}
                    ${filterBtnHtml}
                </div>
                <div class="col-resizer" data-col-key="${col.key}" title="Kéo để chỉnh độ rộng. Nhấp đúp để về mặc định"></div>
            </th>
        `;
    }).join('');

    const fillerTh = `<th class="tk-col-filler"></th>`;
    thead.innerHTML = `<tr>${thHtml}${fillerTh}</tr>`;
    thead.querySelectorAll('.col-filter-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const colKey = btn.dataset.col;
            toggleColumnFilterDropdown(btn, colKey);
        };
    });
    initColumnResizing();
}

export let expandedTonKhoRows = new Set();
export let tonKhoDisplayMode = localStorage.getItem('tonkho_display_mode') || 'tree';

export function formatCellEmpty(val) {
    if (val === null || val === undefined) return '<span class="text-gray-400 font-normal select-none">-</span>';
    const s = String(val).trim();
    if (s === '' || s === 'null' || s === 'undefined') return '<span class="text-gray-400 font-normal select-none">-</span>';
    return escapeHtml(s);
}

export function setTonKhoDisplayMode(mode) {
    tonKhoDisplayMode = (mode === 'flat') ? 'flat' : 'tree';
    try { localStorage.setItem('tonkho_display_mode', tonKhoDisplayMode); } catch (e) {}
    updateTonKhoDisplayModeUI();
    fetchTonKho(1);
}

export function updateBranchToggleBtnState() {
    const btn = document.getElementById('ton-kho-btn-toggle-all-branches');
    if (!btn) return;
    if (tonKhoDisplayMode !== 'tree') {
        btn.style.display = 'none';
        return;
    }
    btn.style.display = 'inline-flex';

    const isExpanded = expandedTonKhoRows.size > 0;
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

export function updateTonKhoDisplayModeUI() {
    const treeBtn = document.getElementById('tk-mode-tree');
    const flatBtn = document.getElementById('tk-mode-flat');
    const toggleAllBranchesBtn = document.getElementById('ton-kho-btn-toggle-all-branches');

    if (treeBtn && flatBtn) {
        if (tonKhoDisplayMode === 'tree') {
            treeBtn.className = 'tk-segment-btn bg-white shadow-sm font-semibold text-blue-600';
            flatBtn.className = 'tk-segment-btn text-gray-500 hover:text-gray-700';
            if (toggleAllBranchesBtn) {
                toggleAllBranchesBtn.style.display = 'inline-flex';
                updateBranchToggleBtnState();
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

window.setTonKhoDisplayMode = setTonKhoDisplayMode;

export function toggleTonKhoSubRow(groupKey) {
    if (expandedTonKhoRows.has(groupKey)) {
        expandedTonKhoRows.delete(groupKey);
    } else {
        expandedTonKhoRows.add(groupKey);
    }
    updateBranchToggleBtnState();
    if (cache.tonKhoList) {
        renderTonKhoTable(cache.tonKhoList);
    }
}

export function toggleAllTonKhoSubRows(forceExpand = null) {
    if (!cache.tonKhoList) return;
    const allKeys = new Set(cache.tonKhoList.map(i => i.ma_vt || i.ma_vach).filter(Boolean));
    const shouldExpand = (typeof forceExpand === 'boolean') ? forceExpand : (expandedTonKhoRows.size === 0);
    if (shouldExpand) {
        expandedTonKhoRows = allKeys;
    } else {
        expandedTonKhoRows.clear();
    }
    updateBranchToggleBtnState();
    renderTonKhoTable(cache.tonKhoList);
}

window.toggleTonKhoSubRow = toggleTonKhoSubRow;
window.toggleAllTonKhoSubRows = toggleAllTonKhoSubRows;
window.updateBranchToggleBtnState = updateBranchToggleBtnState;

function renderTonKhoTable(data) {
    const tkTableBody = document.getElementById('ton-kho-table-body');
    if (!tkTableBody) return;

    if (!data || data.length === 0) {
        tkTableBody.innerHTML = '<tr><td colspan="15" class="text-center py-4 text-gray-500">Không có dữ liệu</td></tr>';
        return;
    }

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
        // Mobile View: Exactly preserve the original compact layout & classes
        const html = data.map(tk => {
            const tonCuoiClass = tk.ton_cuoi > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
            const ui = getStatusUI(tk.tinh_trang, tk.ngay_con_lai);

            const noteHtml = tk.note ? `
                <div class="group relative flex justify-center items-center h-full">
                    <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    <div class="absolute bottom-full right-full mb-2 mr-2 w-max max-w-xs scale-0 transform rounded bg-gray-800 p-2 text-sm text-white transition-all group-hover:scale-100 origin-bottom-right pointer-events-none z-20 whitespace-pre-wrap">${escapeHtml(tk.note)}</div>
                </div>
            ` : '';
            
            return `
                <tr data-id="${tk.ma_vach}" class="hover:bg-gray-50">
                    <td class="tk-col-full-code hidden md:table-cell px-1 py-1 text-xs font-medium text-blue-600 hover:underline border border-gray-300 text-left cursor-pointer">
                        ${tk.ma_vach}
                    </td>
                    <td class="px-1 py-0.5 text-[9px] font-medium border border-gray-300 text-left max-w-[40vw] sm:max-w-[50vw] md:max-w-none cursor-pointer" title="${escapeHtml(tk.ma_vt)}" ondblclick="showColumnDetail('Mã VT', '${escapeHtml(tk.ma_vt)}')">
                        <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-1 w-full">
                                <span class="text-blue-600 font-bold truncate">${escapeHtml(tk.ma_vt)}</span>
                                <button class="copy-ma-vt-btn p-0.5 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0" title="Copy mã VT">
                                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                </button>
                            </div>
                            <div class="md:hidden text-[7px] text-gray-500 truncate mt-0.5 leading-tight font-normal hover:text-blue-500 hover:underline cursor-pointer mobile-ten-vt-trigger" title="${escapeHtml(tk.ten_vt)}">${escapeHtml(tk.ten_vt)}</div>
                        </div>
                    </td>
                    <td class="tk-col-ten-vt hidden md:table-cell px-1 py-0.5 text-xs text-gray-600 border border-gray-300 text-left whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.ten_vt)}" ondblclick="showColumnDetail('Tên VT', '${escapeHtml(tk.ten_vt)}')">${escapeHtml(tk.ten_vt)}</td>
                    <td class="px-1 py-0.5 text-[8px] text-gray-600 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer max-w-[50px] md:max-w-none" title="${escapeHtml(tk.lot || '')}" ondblclick="showColumnDetail('Lot', '${escapeHtml(tk.lot || '')}')">${escapeHtml(tk.lot || '')}</td>
                    <td class="px-1 py-0.5 text-[8px] text-gray-600 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.date || '')}" ondblclick="showColumnDetail('Date', '${escapeHtml(tk.date || '')}')">
                        ${escapeHtml(tk.date || '')}
                        <div class="md:hidden text-[6px] mt-0.5 leading-tight ${ui.textCss}">
                            ${ui.mobileDayLabel}
                        </div>
                    </td>
                    <td class="tk-col-dau hidden md:table-cell px-1 py-0.5 text-xs text-black font-bold border border-gray-300 text-center">${(tk.ton_dau || 0).toLocaleString()}</td>
                    <td class="tk-col-nhap hidden md:table-cell px-1 py-0.5 text-xs text-green-600 border border-gray-300 text-center">${(tk.nhap || 0).toLocaleString()}</td>
                    <td class="tk-col-xuat hidden md:table-cell px-1 py-0.5 text-xs text-red-600 border border-gray-300 text-center">${(tk.xuat || 0).toLocaleString()}</td>
                    <td class="px-1 py-0.5 text-[9px] border border-gray-300 text-center ${tonCuoiClass}">${(tk.ton_cuoi || 0).toLocaleString()}</td>
                    <td class="tk-col-tinh-trang hidden md:table-cell px-1 py-0.5 border border-gray-300 text-center whitespace-nowrap">
                        <span class="text-[8px] ${ui.bgCss}">${ui.display}</span>
                    </td>
                    <td class="tk-col-tray px-1 py-0.5 text-[7px] md:text-xs text-gray-600 border border-gray-300 text-center max-w-[30px] md:max-w-none break-words" title="${escapeHtml(tk.tray || '')}">${escapeHtml(tk.tray || '')}</td>
                    <td class="tk-col-nganh hidden md:table-cell px-1 py-0.5 text-[8px] text-gray-600 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.nganh || '')}" ondblclick="showColumnDetail('Ngành', '${escapeHtml(tk.nganh || '')}')">${escapeHtml(tk.nganh || '')}</td>
                    <td class="tk-col-phu-trach hidden md:table-cell px-1 py-0.5 text-xs text-gray-600 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.phu_trach || '')}" ondblclick="showColumnDetail('Phụ Trách', '${escapeHtml(tk.phu_trach || '')}')">${escapeHtml(tk.phu_trach || '')}</td>
                    <td class="tk-col-ghi-chu hidden md:table-cell px-1 py-0.5 border border-gray-300 text-center">${noteHtml}</td>
                </tr>
            `;
        }).join('');
        tkTableBody.innerHTML = html;
        return;
    }

    // Laptop/Desktop View: Renders according to configured column order and visibility!
    const visibleCols = tonKhoColsConfig.filter(c => c.visible);

    // MODE 1: FLAT VIEW (Xem thường - không phân nhánh)
    if (tonKhoDisplayMode === 'flat') {
        const html = data.map(tk => {
            const tonCuoiClass = tk.ton_cuoi > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
            const ui = getStatusUI(tk.tinh_trang, tk.ngay_con_lai);
            const noteHtml = tk.note ? `
                <div class="group relative flex justify-center items-center h-full">
                    <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    <div class="absolute bottom-full right-full mb-2 mr-2 w-max max-w-xs scale-0 transform rounded bg-gray-800 p-2 text-xs text-white transition-all group-hover:scale-100 origin-bottom-right pointer-events-none z-20 whitespace-pre-wrap">${escapeHtml(tk.note)}</div>
                </div>
            ` : '<span class="text-gray-400 font-normal select-none">-</span>';

            const tdList = visibleCols.map(col => {
                switch (col.key) {
                    case 'full-code':
                        return `<td class="px-1.5 py-1 text-xs font-medium text-blue-600 hover:underline border border-gray-300 text-left cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis" onclick="openTonKhoModalFromRow('${tk.ma_vach}')">${formatCellEmpty(tk.ma_vach)}</td>`;
                    case 'ma_vt':
                        return `
                            <td class="px-1.5 py-0.5 text-xs font-medium border border-gray-300 text-left cursor-pointer" title="${escapeHtml(tk.ma_vt)}" ondblclick="showColumnDetail('Mã VT', '${escapeHtml(tk.ma_vt)}')">
                                <div class="flex items-center justify-between gap-1 w-full min-w-0">
                                    <span class="text-blue-600 font-bold truncate">${escapeHtml(tk.ma_vt)}</span>
                                    <button class="copy-ma-vt-btn p-0.5 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0" title="Copy mã VT" onclick="event.stopPropagation(); navigator.clipboard.writeText('${escapeHtml(tk.ma_vt)}').then(() => showToast('Đã copy mã VT', 'success'))">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                    </button>
                                </div>
                            </td>`;
                    case 'ten_vt':
                        return `<td class="px-1.5 py-0.5 text-xs text-gray-700 border border-gray-300 text-left whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.ten_vt || '')}" ondblclick="showColumnDetail('Tên VT', '${escapeHtml(tk.ten_vt || '')}')">${formatCellEmpty(tk.ten_vt)}</td>`;
                    case 'lot':
                        return `<td class="px-1.5 py-0.5 text-xs text-gray-800 font-medium border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.lot || '')}" ondblclick="showColumnDetail('Lot', '${escapeHtml(tk.lot || '')}')">${formatCellEmpty(tk.lot)}</td>`;
                    case 'date':
                        return `<td class="px-1.5 py-0.5 text-xs text-gray-700 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.date || '')}" ondblclick="showColumnDetail('Date', '${escapeHtml(tk.date || '')}')">${formatCellEmpty(tk.date)}</td>`;
                    case 'dau':
                        return `<td class="px-1.5 py-0.5 text-xs font-semibold text-black border border-gray-300 text-right whitespace-nowrap overflow-hidden text-ellipsis">${(tk.ton_dau || 0).toLocaleString()}</td>`;
                    case 'nhap':
                        return `<td class="px-1.5 py-0.5 text-xs font-semibold text-green-600 border border-gray-300 text-right whitespace-nowrap overflow-hidden text-ellipsis">${(tk.nhap || 0).toLocaleString()}</td>`;
                    case 'xuat':
                        return `<td class="px-1.5 py-0.5 text-xs font-semibold text-red-600 border border-gray-300 text-right whitespace-nowrap overflow-hidden text-ellipsis">${(tk.xuat || 0).toLocaleString()}</td>`;
                    case 'cuoi':
                        return `<td class="px-1.5 py-0.5 text-xs ${tonCuoiClass} border border-gray-300 text-right whitespace-nowrap overflow-hidden text-ellipsis">${(tk.ton_cuoi || 0).toLocaleString()}</td>`;
                    case 'tinh_trang':
                        return `<td class="px-1.5 py-0.5 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis"><span class="text-[9px] ${ui.bgCss}">${ui.display}</span></td>`;
                    case 'tray':
                        return `<td class="px-1.5 py-0.5 text-xs text-gray-600 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.tray || '')}" ondblclick="showColumnDetail('Tray', '${escapeHtml(tk.tray || '')}')">${formatCellEmpty(tk.tray)}</td>`;
                    case 'nganh':
                        return `<td class="px-1.5 py-0.5 text-xs text-gray-600 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.nganh || '')}" ondblclick="showColumnDetail('Ngành', '${escapeHtml(tk.nganh || '')}')">${formatCellEmpty(tk.nganh)}</td>`;
                    case 'phu_trach':
                        return `<td class="px-1.5 py-0.5 text-xs text-gray-600 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.phu_trach || '')}" ondblclick="showColumnDetail('Phụ Trách', '${escapeHtml(tk.phu_trach || '')}')">${formatCellEmpty(tk.phu_trach)}</td>`;
                    case 'ghi_chu':
                        return `<td class="px-1.5 py-0.5 border border-gray-300 text-center">${noteHtml}</td>`;
                    default:
                        return `<td class="px-1.5 py-0.5 border border-gray-300 text-center">${formatCellEmpty(tk[col.field || col.key])}</td>`;
                }
            }).join('');

            const fillerTd = '<td class="tk-col-filler"></td>';
            return `<tr data-id="${tk.ma_vach}" class="hover:bg-blue-50/40">${tdList}${fillerTd}</tr>`;
        }).join('');

        tkTableBody.innerHTML = html;
        updateTonKhoTableWidth();
        return;
    }

    // MODE 2: TREE VIEW (Xem dạng nhánh - gom nhóm theo vật tư)
    // Group items by ma_vt (or ma_vach if ma_vt is missing)
    const groups = [];
    const groupMap = new Map();
    data.forEach(item => {
        const key = item.ma_vt || item.ma_vach || 'KHAC';
        if (!groupMap.has(key)) {
            const grp = {
                groupKey: key,
                ma_vt: item.ma_vt || '',
                ten_vt: item.ten_vt || '',
                nganh: item.nganh || '',
                phu_trach: item.phu_trach || '',
                ton_dau: 0,
                nhap: 0,
                xuat: 0,
                ton_cuoi: 0,
                items: [],
                minDaysLeft: Infinity,
                worstStatusItem: item
            };
            groupMap.set(key, grp);
            groups.push(grp);
        }
        const grp = groupMap.get(key);
        grp.items.push(item);
        grp.ton_dau += (Number(item.ton_dau) || 0);
        grp.nhap += (Number(item.nhap) || 0);
        grp.xuat += (Number(item.xuat) || 0);
        grp.ton_cuoi += (Number(item.ton_cuoi) || 0);
        if (!grp.ten_vt && item.ten_vt) grp.ten_vt = item.ten_vt;
        if (!grp.nganh && item.nganh) grp.nganh = item.nganh;
        if (!grp.phu_trach && item.phu_trach) grp.phu_trach = item.phu_trach;

        const days = item.ngay_con_lai !== null && item.ngay_con_lai !== undefined ? Number(item.ngay_con_lai) : 999999;
        if (days < grp.minDaysLeft) {
            grp.minDaysLeft = days;
            grp.worstStatusItem = item;
        }
    });

    const htmlRows = [];

    groups.forEach(group => {
        const isExpanded = expandedTonKhoRows.has(group.groupKey);
        const hasMultiple = group.items.length > 1;
        const tonCuoiClass = group.ton_cuoi > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
        const ui = getStatusUI(group.worstStatusItem.tinh_trang, group.worstStatusItem.ngay_con_lai);

        const parentNotes = group.items.map(i => i.note).filter(Boolean);
        const parentNoteHtml = parentNotes.length > 0 ? `
            <div class="group relative flex justify-center items-center h-full">
                <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                <div class="absolute bottom-full right-full mb-2 mr-2 w-max max-w-xs scale-0 transform rounded bg-gray-800 p-2 text-xs text-white transition-all group-hover:scale-100 origin-bottom-right pointer-events-none z-20 whitespace-pre-wrap">${escapeHtml(parentNotes.join('\n---\n'))}</div>
            </div>
        ` : '<span class="text-gray-400 font-normal select-none">-</span>';

        // PARENT ROW (prominently highlighted)
        const parentTds = visibleCols.map(col => {
            switch (col.key) {
                case 'full-code':
                    if (!hasMultiple) {
                        return `<td class="px-1.5 py-1 text-xs font-medium text-blue-600 hover:underline border border-gray-300 text-left cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis" onclick="openTonKhoModalFromRow('${group.items[0].ma_vach}')">${formatCellEmpty(group.items[0].ma_vach)}</td>`;
                    }
                    return `<td class="px-1.5 py-1 text-xs text-blue-600 hover:underline border border-gray-300 text-left cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis" onclick="toggleTonKhoSubRow('${escapeHtml(group.groupKey)}')"><span class="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded cursor-pointer" title="Nhấn để xem ${group.items.length} mã vạch">${group.items.length} mã vạch ▾</span></td>`;

                case 'ma_vt':
                    return `
                        <td class="px-1.5 py-0.5 text-xs font-medium border border-gray-300 text-left" title="${escapeHtml(group.ma_vt)}" ondblclick="showColumnDetail('Mã VT', '${escapeHtml(group.ma_vt)}')">
                            <div class="flex items-center gap-1.5 w-full min-w-0">
                                <button type="button" class="btn-subrow-toggle ${isExpanded ? 'active' : ''}" onclick="event.stopPropagation(); toggleTonKhoSubRow('${escapeHtml(group.groupKey)}')" title="${isExpanded ? 'Thu gọn' : 'Xem chi tiết ' + group.items.length + ' lô'}">
                                    <svg class="w-3 h-3 text-blue-600 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg>
                                </button>
                                <span class="text-blue-700 font-bold truncate cursor-pointer hover:underline" onclick="toggleTonKhoSubRow('${escapeHtml(group.groupKey)}')">${escapeHtml(group.ma_vt)}</span>
                                ${hasMultiple ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] bg-blue-100 text-blue-700 font-bold flex-shrink-0 cursor-pointer" onclick="event.stopPropagation(); toggleTonKhoSubRow('${escapeHtml(group.groupKey)}')">${group.items.length} Lô</span>` : ''}
                                <button type="button" class="copy-ma-vt-btn p-0.5 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0 ml-auto" title="Copy mã VT" onclick="event.stopPropagation(); navigator.clipboard.writeText('${escapeHtml(group.ma_vt)}').then(() => showToast('Đã copy mã VT', 'success'))">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                </button>
                            </div>
                        </td>`;

                case 'ten_vt':
                    return `<td class="px-1.5 py-0.5 text-xs text-gray-800 font-semibold border border-gray-300 text-left whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(group.ten_vt || '')}" ondblclick="showColumnDetail('Tên VT', '${escapeHtml(group.ten_vt || '')}')">${formatCellEmpty(group.ten_vt)}</td>`;

                case 'lot':
                    if (!hasMultiple) {
                        return `<td class="px-1.5 py-0.5 text-xs text-gray-700 font-medium border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(group.items[0].lot || '')}" ondblclick="showColumnDetail('Lot', '${escapeHtml(group.items[0].lot || '')}')">${formatCellEmpty(group.items[0].lot)}</td>`;
                    }
                    return `<td class="px-1.5 py-0.5 text-xs border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" onclick="toggleTonKhoSubRow('${escapeHtml(group.groupKey)}')"><span class="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded cursor-pointer" title="${group.items.length} lô khác nhau">${group.items.length} lots ▾</span></td>`;

                case 'date':
                    if (!hasMultiple) {
                        return `<td class="px-1.5 py-0.5 text-xs text-gray-700 font-medium border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(group.items[0].date || '')}" ondblclick="showColumnDetail('Date', '${escapeHtml(group.items[0].date || '')}')">${formatCellEmpty(group.items[0].date)}</td>`;
                    }
                    return `<td class="px-1.5 py-0.5 text-xs text-gray-700 font-medium border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="Hạn gần nhất: ${escapeHtml(group.worstStatusItem.date || '')}" onclick="toggleTonKhoSubRow('${escapeHtml(group.groupKey)}')"><span class="text-[11px] text-gray-800 font-semibold">${formatCellEmpty(group.worstStatusItem.date)}</span></td>`;

                case 'dau':
                    return `<td class="px-1.5 py-0.5 text-xs font-bold text-black border border-gray-300 text-right whitespace-nowrap overflow-hidden text-ellipsis">${group.ton_dau.toLocaleString()}</td>`;

                case 'nhap':
                    return `<td class="px-1.5 py-0.5 text-xs font-bold text-green-600 border border-gray-300 text-right whitespace-nowrap overflow-hidden text-ellipsis">${group.nhap.toLocaleString()}</td>`;

                case 'xuat':
                    return `<td class="px-1.5 py-0.5 text-xs font-bold text-red-600 border border-gray-300 text-right whitespace-nowrap overflow-hidden text-ellipsis">${group.xuat.toLocaleString()}</td>`;

                case 'cuoi':
                    return `<td class="px-1.5 py-0.5 text-xs ${tonCuoiClass} border border-gray-300 text-right whitespace-nowrap overflow-hidden text-ellipsis">${group.ton_cuoi.toLocaleString()}</td>`;

                case 'tinh_trang':
                    return `<td class="px-1.5 py-0.5 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis"><span class="text-[9px] ${ui.bgCss}">${ui.display}</span></td>`;

                case 'tray':
                    const trayText = group.items.map(i => i.tray).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || '';
                    return `<td class="px-1.5 py-0.5 text-xs text-gray-700 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(trayText)}" ondblclick="showColumnDetail('Tray', '${escapeHtml(trayText)}')">${formatCellEmpty(trayText)}</td>`;

                case 'nganh':
                    return `<td class="px-1.5 py-0.5 text-xs text-gray-700 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(group.nganh || '')}" ondblclick="showColumnDetail('Ngành', '${escapeHtml(group.nganh || '')}')">${formatCellEmpty(group.nganh)}</td>`;

                case 'phu_trach':
                    return `<td class="px-1.5 py-0.5 text-xs text-gray-700 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(group.phu_trach || '')}" ondblclick="showColumnDetail('Phụ Trách', '${escapeHtml(group.phu_trach || '')}')">${formatCellEmpty(group.phu_trach)}</td>`;

                case 'ghi_chu':
                    return `<td class="px-1.5 py-0.5 border border-gray-300 text-center">${parentNoteHtml}</td>`;

                default:
                    return `<td class="px-1.5 py-0.5 border border-gray-300 text-center">${formatCellEmpty(group.items[0][col.field || col.key])}</td>`;
            }
        }).join('');

        const fillerTd = '<td class="tk-col-filler"></td>';
        htmlRows.push(`<tr data-id="${group.items[0].ma_vach}" data-group-key="${escapeHtml(group.groupKey)}" class="tk-parent-row ${isExpanded ? 'is-expanded' : ''}">${parentTds}${fillerTd}</tr>`);

        // CHILD ROWS (if expanded)
        if (isExpanded) {
            group.items.forEach((tk, idx) => {
                const isLast = (idx === group.items.length - 1);
                const branchTreeIcon = isLast ? '└─' : '├─';
                const childTonCuoiClass = tk.ton_cuoi > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
                const childUi = getStatusUI(tk.tinh_trang, tk.ngay_con_lai);
                const childNoteHtml = tk.note ? `
                    <div class="group relative flex justify-center items-center h-full">
                        <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                        <div class="absolute bottom-full right-full mb-2 mr-2 w-max max-w-xs scale-0 transform rounded bg-gray-800 p-2 text-xs text-white transition-all group-hover:scale-100 origin-bottom-right pointer-events-none z-20 whitespace-pre-wrap">${escapeHtml(tk.note)}</div>
                    </div>
                ` : '<span class="text-gray-400 font-normal select-none">-</span>';

                const childTds = visibleCols.map(col => {
                    switch (col.key) {
                        case 'full-code':
                            return `<td class="px-1.5 py-0.5 text-[11px] font-medium text-blue-600 hover:underline border border-gray-200 text-left cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis" onclick="openTonKhoModalFromRow('${tk.ma_vach}')">${formatCellEmpty(tk.ma_vach)}</td>`;

                        case 'ma_vt':
                            return `
                                <td class="px-1.5 py-0.5 text-[11px] border border-gray-200 text-left whitespace-nowrap overflow-hidden text-ellipsis">
                                    <div class="flex items-center pl-4 w-full min-w-0">
                                        <span class="text-blue-500 font-mono font-bold select-none text-[13px] leading-none tracking-wider">${branchTreeIcon}</span>
                                    </div>
                                </td>`;

                        case 'ten_vt':
                            return `<td class="px-1.5 py-0.5 text-[11px] text-gray-500 border border-gray-200 text-left whitespace-nowrap overflow-hidden text-ellipsis italic" title="${escapeHtml(tk.ten_vt || '')}">↳ ${formatCellEmpty(tk.ten_vt)}</td>`;

                        case 'lot':
                            return `<td class="px-1.5 py-0.5 text-[11px] text-gray-800 font-semibold border border-gray-200 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.lot || '')}" ondblclick="showColumnDetail('Lot', '${escapeHtml(tk.lot || '')}')">${formatCellEmpty(tk.lot)}</td>`;

                        case 'date':
                            return `<td class="px-1.5 py-0.5 text-[11px] text-gray-700 border border-gray-200 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.date || '')}" ondblclick="showColumnDetail('Date', '${escapeHtml(tk.date || '')}')">${formatCellEmpty(tk.date)}</td>`;

                        case 'dau':
                            return `<td class="px-1.5 py-0.5 text-[11px] text-gray-600 border border-gray-200 text-right whitespace-nowrap overflow-hidden text-ellipsis">${(tk.ton_dau || 0).toLocaleString()}</td>`;

                        case 'nhap':
                            return `<td class="px-1.5 py-0.5 text-[11px] text-green-600 border border-gray-200 text-right whitespace-nowrap overflow-hidden text-ellipsis">${(tk.nhap || 0).toLocaleString()}</td>`;

                        case 'xuat':
                            return `<td class="px-1.5 py-0.5 text-[11px] text-red-600 border border-gray-200 text-right whitespace-nowrap overflow-hidden text-ellipsis">${(tk.xuat || 0).toLocaleString()}</td>`;

                        case 'cuoi':
                            return `<td class="px-1.5 py-0.5 text-[11px] ${childTonCuoiClass} border border-gray-200 text-right whitespace-nowrap overflow-hidden text-ellipsis">${(tk.ton_cuoi || 0).toLocaleString()}</td>`;

                        case 'tinh_trang':
                            return `<td class="px-1.5 py-0.5 border border-gray-200 text-center whitespace-nowrap overflow-hidden text-ellipsis"><span class="text-[8.5px] ${childUi.bgCss}">${childUi.display}</span></td>`;

                        case 'tray':
                            return `<td class="px-1.5 py-0.5 text-[11px] text-gray-600 border border-gray-200 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.tray || '')}" ondblclick="showColumnDetail('Tray', '${escapeHtml(tk.tray || '')}')">${formatCellEmpty(tk.tray)}</td>`;

                        case 'nganh':
                            return `<td class="px-1.5 py-0.5 text-[11px] text-gray-500 border border-gray-200 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.nganh || '')}" ondblclick="showColumnDetail('Ngành', '${escapeHtml(tk.nganh || '')}')">${formatCellEmpty(tk.nganh)}</td>`;

                        case 'phu_trach':
                            return `<td class="px-1.5 py-0.5 text-[11px] text-gray-500 border border-gray-200 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(tk.phu_trach || '')}" ondblclick="showColumnDetail('Phụ Trách', '${escapeHtml(tk.phu_trach || '')}')">${formatCellEmpty(tk.phu_trach)}</td>`;

                        case 'ghi_chu':
                            return `<td class="px-1.5 py-0.5 border border-gray-200 text-center">${childNoteHtml}</td>`;

                        default:
                            return `<td class="px-1.5 py-0.5 border border-gray-200 text-center">${formatCellEmpty(tk[col.field || col.key])}</td>`;
                    }
                }).join('');

                const childFillerTd = '<td class="tk-col-filler"></td>';
                htmlRows.push(`<tr data-id="${tk.ma_vach}" data-parent-vt="${escapeHtml(group.ma_vt)}" class="tk-child-detail-row bg-slate-50/90 hover:bg-blue-50/50">${childTds}${childFillerTd}</tr>`);
            });
        }
    });

    tkTableBody.innerHTML = htmlRows.join('');
    updateTonKhoTableWidth();
}

async function openTonKhoModal(tk = null, mode = 'view') {
    const modal = document.getElementById('ton-kho-modal');
    const form = document.getElementById('ton-kho-form');
    form.reset();
    
    form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
    document.getElementById('save-ton-kho-btn').classList.add('hidden');
    document.getElementById('cancel-ton-kho-btn').classList.add('hidden');
    document.getElementById('close-ton-kho-view-btn').classList.remove('hidden');
    document.getElementById('ton-kho-modal-ma-vach-display-container').classList.remove('hidden');
    
    document.getElementById('ton-kho-modal-title').textContent = 'Chi Tiết Tồn Kho';
    document.getElementById('ton-kho-edit-mode-ma-vach').value = tk.ma_vach;
    
    Object.keys(tk).forEach(key => {
        const input = document.getElementById(`ton-kho-modal-${key.replace(/_/g, '-')}`);
        if (input) input.value = tk[key] || '';
    });

    const container = document.getElementById('ton-kho-modal-tinh-trang-container');
    container.innerHTML = `<input type="text" value="${tk.tinh_trang}" disabled class="block w-full border rounded-md p-2 bg-gray-100">`;

    modal.classList.remove('hidden');
}

async function handleTonKhoExcelExport() {
    if (typeof window.XLSX === 'undefined') {
        showToast("Thư viện Excel đang tải, vui lòng thử lại sau giây lát.", "info");
        return;
    }

    const modal = document.getElementById('excel-export-modal');
    modal.classList.remove('hidden');

    const exportAndClose = async (exportAll) => {
        modal.classList.add('hidden');
        showLoading(true);
        try {
            const query = exportAll ? sb.from('ton_kho_update').select('*') : buildTonKhoQuery();
            const { data, error } = await query.order('ma_vach', { ascending: true }).limit(30000);
            
            if (error) throw error;
            if (!data || data.length === 0) {
                showToast("Không có dữ liệu để xuất.", 'info');
                return;
            }

            const worksheet = window.XLSX.utils.json_to_sheet(data);
            const workbook = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(workbook, worksheet, "TonKho");
            window.XLSX.writeFile(workbook, `TonKho_${new Date().toISOString().slice(0,10)}.xlsx`);
            showToast("Xuất Excel thành công!", 'success');
        } catch (err) {
            showToast(`Lỗi khi xuất Excel: ${err.message}`, 'error');
        } finally {
            showLoading(false);
        }
    };
    document.getElementById('excel-export-filtered-btn').onclick = () => exportAndClose(false);
    document.getElementById('excel-export-all-btn').onclick = () => exportAndClose(true);
    document.getElementById('excel-export-cancel-btn').onclick = () => modal.classList.add('hidden');
}

let isResizingColumn = false;
let activeFilterColKey = null;
let currentFilterValues = [];
let tempFilterSelected = new Set();
let pendingTonKhoColsConfig = [];

function initColumnResizing() {
    if (window.innerWidth < 768) return;
    const thead = document.getElementById('ton-kho-table-head');
    if (!thead) return;
    const table = document.getElementById('ton-kho-main-table');

    thead.querySelectorAll('.col-resizer').forEach(resizer => {
        // Double-click to reset column to default initial width
        resizer.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const th = resizer.closest('th');
            if (!th) return;
            const colKey = resizer.dataset.colKey || th.dataset.colKey;
            const colDef = tonKhoColsConfig.find(c => c.key === colKey);
            const defaultDef = DEFAULT_TONKHO_COLUMNS.find(d => d.key === colKey);
            const resetWidth = defaultDef ? (defaultDef.width || 100) : 100;

            if (colDef) {
                colDef.width = resetWidth;
                saveTonKhoColsConfig(tonKhoColsConfig);

                th.style.width = `${resetWidth}px`;
                th.style.minWidth = `${resetWidth}px`;
                th.style.maxWidth = `${resetWidth}px`;

                updateTonKhoTableWidth();
                showToast(`Đã khôi phục cột "${colDef.title}" về kích thước gốc (${resetWidth}px)`, 'info');
            }
        };

        resizer.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizingColumn = true;
            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const th = resizer.closest('th');
            if (!th) return;
            const colKey = resizer.dataset.colKey || th.dataset.colKey;
            const startX = e.pageX;
            const startWidth = th.getBoundingClientRect().width;
            const colDef = tonKhoColsConfig.find(c => c.key === colKey);
            const minWidth = 35;
            let currentNewWidth = startWidth;
            let hasMoved = false;

            const visibleCols = tonKhoColsConfig.filter(c => c.visible);
            const startTotalColsWidth = visibleCols.reduce((sum, c) => sum + (c.width || 100), 0);
            const container = document.querySelector('#view-ton-kho .table-container');
            const containerWidth = container ? container.clientWidth : 0;

            const onMouseMove = (moveEvent) => {
                const diff = moveEvent.pageX - startX;
                if (Math.abs(diff) > 2) hasMoved = true;
                currentNewWidth = Math.max(minWidth, Math.round(startWidth + diff));
                const widthDiff = currentNewWidth - startWidth;

                th.style.width = `${currentNewWidth}px`;
                th.style.minWidth = `${currentNewWidth}px`;
                th.style.maxWidth = `${currentNewWidth}px`;

                if (table) {
                    const newTotalColsWidth = Math.max(100, Math.round(startTotalColsWidth + widthDiff));
                    if (containerWidth > 0 && newTotalColsWidth < containerWidth) {
                        table.style.width = '100%';
                        table.style.minWidth = '100%';
                    } else {
                        table.style.width = `${newTotalColsWidth}px`;
                        table.style.minWidth = `${newTotalColsWidth}px`;
                    }
                }
            };

            const onMouseUp = (upEvent) => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                resizer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                if (hasMoved) {
                    const diff = (upEvent && upEvent.pageX !== undefined ? upEvent.pageX : e.pageX) - startX;
                    const finalWidth = Math.max(minWidth, Math.round(startWidth + diff));

                    th.style.width = `${finalWidth}px`;
                    th.style.minWidth = `${finalWidth}px`;
                    th.style.maxWidth = `${finalWidth}px`;

                    if (colDef) {
                        colDef.width = finalWidth;
                        saveTonKhoColsConfig(tonKhoColsConfig);
                    }
                }

                updateTonKhoTableWidth();

                setTimeout(() => {
                    isResizingColumn = false;
                }, 120);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
    });
}

function closeColumnFilterDropdown() {
    const popover = document.getElementById('tonkho-col-filter-popover');
    if (popover) {
        popover.style.display = 'none';
    }
    activeFilterColKey = null;
    currentFilterValues = [];
    tempFilterSelected.clear();
    const searchInput = document.getElementById('tk-filter-popover-search-input');
    if (searchInput) searchInput.value = '';
}

function renderFilterPopoverList(filterKey) {
    const listEl = document.getElementById('tk-filter-popover-list');
    const selectAllCb = document.getElementById('tk-popover-select-all');
    const searchInput = document.getElementById('tk-filter-popover-search-input');
    if (!listEl) return;

    const searchTerm = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const filteredValues = currentFilterValues.filter(val => 
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
        const isChecked = tempFilterSelected.has(strVal);
        let displayVal = escapeHtml(strVal);
        let colorClasses = '';
        if (filterKey === 'tinh_trang') {
            const ui = getStatusUI(strVal);
            colorClasses = ui.bgCss;
            displayVal = ui.display;
        }
        return `
            <label class="tk-popover-item flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-100 rounded cursor-pointer text-xs transition">
                <input type="checkbox" class="accent-blue-600 rounded tk-popover-item-cb" value="${escapeHtml(strVal)}" ${isChecked ? 'checked' : ''}>
                <span class="truncate ${colorClasses}">${displayVal}</span>
            </label>
        `;
    }).join('');

    const allChecked = filteredValues.every(val => tempFilterSelected.has(String(val)));
    const someChecked = filteredValues.some(val => tempFilterSelected.has(String(val)));
    if (selectAllCb) {
        selectAllCb.checked = allChecked;
        selectAllCb.indeterminate = !allChecked && someChecked;
    }

    listEl.querySelectorAll('.tk-popover-item-cb').forEach(cb => {
        cb.onchange = (e) => {
            const val = e.target.value;
            if (e.target.checked) {
                tempFilterSelected.add(val);
            } else {
                tempFilterSelected.delete(val);
            }
            const updatedAllChecked = filteredValues.every(v => tempFilterSelected.has(String(v)));
            const updatedSomeChecked = filteredValues.some(v => tempFilterSelected.has(String(v)));
            if (selectAllCb) {
                selectAllCb.checked = updatedAllChecked;
                selectAllCb.indeterminate = !updatedAllChecked && updatedSomeChecked;
            }
        };
    });
}

async function toggleColumnFilterDropdown(triggerBtn, colKey) {
    const popover = document.getElementById('tonkho-col-filter-popover');
    if (!popover) return;

    if (activeFilterColKey === colKey && popover.style.display !== 'none') {
        closeColumnFilterDropdown();
        return;
    }

    activeFilterColKey = colKey;
    const colDef = tonKhoColsConfig.find(c => (c.field || c.key) === colKey || c.key === colKey);
    const colTitle = colDef ? colDef.title : colKey;
    const filterField = (colDef && colDef.field) ? colDef.field : colKey;

    const titleEl = document.getElementById('tk-filter-popover-title');
    if (titleEl) titleEl.textContent = `Lọc: ${colTitle}`;

    const searchInput = document.getElementById('tk-filter-popover-search-input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = `Tìm trong ${colTitle}...`;
    }

    const listEl = document.getElementById('tk-filter-popover-list');
    listEl.innerHTML = '<div class="p-4 text-center text-xs text-gray-500 flex items-center justify-center gap-1.5"><svg class="animate-spin h-3.5 w-3.5 text-blue-600" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Đang tải giá trị...</div>';

    // Position popover relative to the clicked button
    const btn = (triggerBtn instanceof HTMLElement) ? triggerBtn : (triggerBtn?.target?.closest ? triggerBtn.target.closest('.col-filter-btn') : document.querySelector(`.col-filter-btn[data-col="${colKey}"]`));
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

    const state = viewStates['view-ton-kho'];
    tempFilterSelected = new Set(state.filters[colKey] || []);

    const selectAllCb = document.getElementById('tk-popover-select-all');
    if (selectAllCb) {
        selectAllCb.onchange = (e) => {
            const isChecked = e.target.checked;
            const searchVal = (searchInput ? searchInput.value : '').trim().toLowerCase();
            const visibleValues = currentFilterValues.filter(val => 
                val !== null && val !== undefined && String(val).toLowerCase().includes(searchVal)
            );
            visibleValues.forEach(val => {
                if (isChecked) {
                    tempFilterSelected.add(String(val));
                } else {
                    tempFilterSelected.delete(String(val));
                }
            });
            renderFilterPopoverList(colKey);
        };
    }

    if (searchInput) {
        searchInput.oninput = debounce(() => {
            renderFilterPopoverList(colKey);
        }, 120);
    }

    const applyBtn = document.getElementById('tk-popover-apply-btn');
    if (applyBtn) {
        applyBtn.onclick = () => {
            state.filters[colKey] = Array.from(tempFilterSelected);
            updateFilterButtonTexts('ton-kho');
            closeColumnFilterDropdown();
            renderTonKhoTableHeader();
            fetchTonKho(1);
        };
    }

    const clearBtn = document.getElementById('tk-popover-clear-btn');
    if (clearBtn) {
        clearBtn.onclick = () => {
            state.filters[colKey] = [];
            tempFilterSelected.clear();
            updateFilterButtonTexts('ton-kho');
            closeColumnFilterDropdown();
            renderTonKhoTableHeader();
            fetchTonKho(1);
        };
    }

    const closeBtn = document.getElementById('tk-popover-close-btn');
    if (closeBtn) {
        closeBtn.onclick = () => closeColumnFilterDropdown();
    }

    try {
        let query = sb.from('ton_kho_update').select(filterField);

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
            query = query.or(`ma_vach.ilike.%${state.searchTerm}%,ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,lot.ilike.%${state.searchTerm}%,tinh_trang.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%,note.ilike.%${state.searchTerm}%`);
        }

        if (state.stockAvailability === 'available') {
            query = query.gt('ton_cuoi', 0);
        }

        Object.keys(state.filters).forEach(k => {
            if (k !== colKey && state.filters[k] && state.filters[k].length > 0) {
                const targetCol = tonKhoColsConfig.find(c => c.key === k);
                const fieldName = (targetCol && targetCol.field) ? targetCol.field : k;
                query = query.in(fieldName, state.filters[k]);
            }
        });

        const { data, error } = await query.limit(10000);
        if (error) throw error;

        let unique = [...new Set((data || []).map(item => item[filterField]).filter(v => v !== null && v !== undefined && String(v).trim() !== ''))];
        if (colKey === 'tinh_trang') {
            unique.sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));
        } else {
            unique.sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true }));
        }

        currentFilterValues = unique;
        renderFilterPopoverList(colKey);
    } catch (err) {
        console.error("Lỗi khi tải bộ lọc cột:", err);
        let unique = [];
        if (cache.tonKhoList && cache.tonKhoList.length > 0) {
            unique = [...new Set(cache.tonKhoList.map(item => item[filterField]).filter(v => v !== null && v !== undefined && String(v).trim() !== ''))];
        }
        if (unique.length > 0) {
            if (colKey === 'tinh_trang') {
                unique.sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));
            } else {
                unique.sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true }));
            }
            currentFilterValues = unique;
            renderFilterPopoverList(colKey);
        } else {
            listEl.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Lỗi khi tải dữ liệu lọc</div>';
        }
    }
}

function openTonKhoSettingsModal() {
    const modal = document.getElementById('ton-kho-settings-modal');
    if (!modal) return;

    pendingTonKhoColsConfig = JSON.parse(JSON.stringify(tonKhoColsConfig));
    renderTonKhoSettingsModalList();
    modal.classList.remove('hidden');
}

function renderTonKhoSettingsModalList() {
    const container = document.getElementById('ton-kho-column-toggles');
    if (!container) return;

    container.innerHTML = pendingTonKhoColsConfig.map((col, index) => {
        const isVisible = !!col.visible;
        const isFirst = index === 0;
        const isLast = index === pendingTonKhoColsConfig.length - 1;

        return `
            <div class="col-config-item flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-lg transition hover:bg-gray-100" data-col-key="${col.key}">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <button type="button" class="btn-col-toggle-vis p-1 text-gray-500 hover:text-blue-600 rounded transition cursor-pointer" data-index="${index}" title="${isVisible ? 'Ẩn cột' : 'Hiện cột'}">
                        ${isVisible ? `
                            <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        ` : `
                            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                            </svg>
                        `}
                    </button>
                    <span class="text-xs font-semibold ${isVisible ? 'text-gray-800' : 'text-gray-400 line-through'} truncate">${escapeHtml(col.title)}</span>
                    <span class="text-[10px] text-gray-400 font-mono">(${escapeHtml(col.key)})</span>
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" class="btn-col-move p-1 text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-white cursor-pointer" data-action="up" data-index="${index}" ${isFirst ? 'disabled' : ''} title="Di chuyển lên">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
                    </button>
                    <button type="button" class="btn-col-move p-1 text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-white cursor-pointer" data-action="down" data-index="${index}" ${isLast ? 'disabled' : ''} title="Di chuyển xuống">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.btn-col-toggle-vis').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.index, 10);
            if (!isNaN(idx) && pendingTonKhoColsConfig[idx]) {
                pendingTonKhoColsConfig[idx].visible = !pendingTonKhoColsConfig[idx].visible;
                renderTonKhoSettingsModalList();
            }
        };
    });

    container.querySelectorAll('.btn-col-move').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.index, 10);
            const action = btn.dataset.action;
            if (isNaN(idx)) return;

            if (action === 'up' && idx > 0) {
                const temp = pendingTonKhoColsConfig[idx];
                pendingTonKhoColsConfig[idx] = pendingTonKhoColsConfig[idx - 1];
                pendingTonKhoColsConfig[idx - 1] = temp;
                renderTonKhoSettingsModalList();
            } else if (action === 'down' && idx < pendingTonKhoColsConfig.length - 1) {
                const temp = pendingTonKhoColsConfig[idx];
                pendingTonKhoColsConfig[idx] = pendingTonKhoColsConfig[idx + 1];
                pendingTonKhoColsConfig[idx + 1] = temp;
                renderTonKhoSettingsModalList();
            }
        };
    });
}

function updateFilterButtonTexts(viewPrefix) {
    const state = viewStates[`view-${viewPrefix}`];
    if (!state) return;
    
    const viewContainer = document.getElementById(`view-${viewPrefix}`);
    if (!viewContainer) return;

    viewContainer.querySelectorAll('.filter-btn').forEach(btn => {
        const filterKey = btn.dataset.filterKey;
        if (filterKey && state.filters.hasOwnProperty(filterKey)) {
            const selectedOptions = state.filters[filterKey] || [];
            const defaultText = filterButtonDefaultTexts[btn.id.replace('-mobile', '')] || 'Filter';
            
            if (Array.isArray(selectedOptions)) {
                const newText = selectedOptions.length > 0 ? `${defaultText} (${selectedOptions.length})` : defaultText;
                btn.textContent = newText;
                const mobileBtn = document.getElementById(`${btn.id.replace('-mobile', '')}-mobile`);
                if(mobileBtn) mobileBtn.textContent = newText;
            }
        }
    });
}

export function initTonKhoView() {
    const viewContainer = document.getElementById('view-ton-kho');
    renderTonKhoTableHeader();

    const handleSearch = debounce((e) => {
        viewStates['view-ton-kho'].searchTerm = e.target.value;
        fetchTonKho(1);
    }, 500);

    document.getElementById('ton-kho-search').addEventListener('input', handleSearch);
    document.getElementById('ton-kho-search-mobile').addEventListener('input', handleSearch);
    
    viewContainer.addEventListener('click', e => {
        const colFilterBtn = e.target.closest('.col-filter-btn');
        if (colFilterBtn) {
            e.preventDefault();
            e.stopPropagation();
            const colKey = colFilterBtn.dataset.col;
            toggleColumnFilterDropdown(colFilterBtn, colKey);
            return;
        }

        if (e.target.closest('.col-resizer') || isResizingColumn) {
            return;
        }

        const btn = e.target.closest('.filter-btn');
        if (btn) openTonKhoFilterPopoverCustom(btn, 'view-ton-kho');

        const sortHeader = e.target.closest('.tk-sortable-header');
        if (sortHeader) {
            const col = sortHeader.dataset.sort;
            if (col) {
                const state = viewStates['view-ton-kho'];
                if (state.sortCol === col) {
                    if (state.sortDir === 'asc') {
                        state.sortDir = 'desc';
                    } else if (state.sortDir === 'desc') {
                        state.sortCol = null;
                        state.sortDir = null;
                    }
                } else {
                    state.sortCol = col;
                    state.sortDir = 'asc';
                }
                
                renderTonKhoTableHeader();
                fetchTonKho(1);
            }
        }
    });

    document.addEventListener('click', (e) => {
        const popover = document.getElementById('tonkho-col-filter-popover');
        if (!popover || popover.style.display === 'none') return;
        if (!popover.contains(e.target) && !e.target.closest('.col-filter-btn')) {
            closeColumnFilterDropdown();
        }
    });

    const toggleAvailableBtn = document.getElementById('ton-kho-toggle-available');
    const toggleAllBtn = document.getElementById('ton-kho-toggle-all');
    const toggleAvailableBtnMobile = document.getElementById('ton-kho-toggle-available-mobile');
    const toggleAllBtnMobile = document.getElementById('ton-kho-toggle-all-mobile');
    const state = viewStates['view-ton-kho'];

    const handleToggleClick = (e) => {
        const mode = e.currentTarget.dataset.stockMode;
        if (state.stockAvailability !== mode) {
            state.stockAvailability = mode;
            sessionStorage.setItem('tonKhoStockAvailability', mode);
            updateTonKhoToggleUI();
            fetchTonKho(1);
        }
    };
    
    if(toggleAvailableBtn) toggleAvailableBtn.addEventListener('click', handleToggleClick);
    if(toggleAllBtn) toggleAllBtn.addEventListener('click', handleToggleClick);
    if(toggleAvailableBtnMobile) toggleAvailableBtnMobile.addEventListener('click', handleToggleClick);
    if(toggleAllBtnMobile) toggleAllBtnMobile.addEventListener('click', handleToggleClick);
    
    state.stockAvailability = sessionStorage.getItem('tonKhoStockAvailability') || 'available';
    updateTonKhoToggleUI();

    const resetFilters = () => {
        document.getElementById('ton-kho-search').value = '';
        document.getElementById('ton-kho-search-mobile').value = '';
        viewStates['view-ton-kho'].searchTerm = '';
        viewStates['view-ton-kho'].filters = { 
            ma_vt: [], lot: [], date: [], tinh_trang: [], nganh: [], phu_trach: [], 
            ten_vt: [], tray: [], ma_vach: [], 'full-code': [], 
            dau: [], ton_dau: [], nhap: [], xuat: [], cuoi: [], ton_cuoi: [], ghi_chu: [], note: [] 
        };
        
        viewContainer.querySelectorAll('.filter-btn').forEach(btn => {
            const baseId = btn.id.replace('-mobile', '');
            btn.textContent = filterButtonDefaultTexts[baseId] || 'Lọc';
        });
        
        closeColumnFilterDropdown();
        renderTonKhoTableHeader();

        state.stockAvailability = 'available';
        sessionStorage.setItem('tonKhoStockAvailability', 'available');
        updateTonKhoToggleUI();
        fetchTonKho(1);
    };

    document.getElementById('ton-kho-reset-filters').addEventListener('click', resetFilters);
    document.getElementById('ton-kho-reset-filters-mobile').addEventListener('click', resetFilters);

    const drawer = document.getElementById('tk-filter-drawer');
    const overlay = document.getElementById('tk-filter-drawer-overlay');
    const toggleBtn = document.getElementById('tk-mobile-filter-toggle');
    const closeBtn = document.getElementById('tk-filter-drawer-close');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            drawer.classList.remove('translate-x-full');
            overlay.classList.remove('hidden');
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            drawer.classList.add('translate-x-full');
            overlay.classList.add('hidden');
        });
    }
    if (overlay) {
        overlay.addEventListener('click', () => {
            drawer.classList.add('translate-x-full');
            overlay.classList.add('hidden');
        });
    }

    const settingsBtn = document.getElementById('ton-kho-btn-settings');
    if (settingsBtn) settingsBtn.onclick = openTonKhoSettingsModal;

    const modalCloseX = document.getElementById('ton-kho-settings-close-x');
    if (modalCloseX) modalCloseX.onclick = () => document.getElementById('ton-kho-settings-modal').classList.add('hidden');

    const modalCancelBtn = document.getElementById('ton-kho-settings-cancel-btn');
    if (modalCancelBtn) modalCancelBtn.onclick = () => document.getElementById('ton-kho-settings-modal').classList.add('hidden');

    const modalResetBtn = document.getElementById('ton-kho-settings-reset-btn');
    if (modalResetBtn) {
        modalResetBtn.onclick = () => {
            pendingTonKhoColsConfig = DEFAULT_TONKHO_COLUMNS.map(c => ({
                ...c,
                visible: c.defaultVisible
            }));
            renderTonKhoSettingsModalList();
        };
    }

    const modalSaveBtn = document.getElementById('ton-kho-settings-close-btn');
    if (modalSaveBtn) {
        modalSaveBtn.onclick = () => {
            tonKhoColsConfig = JSON.parse(JSON.stringify(pendingTonKhoColsConfig));
            saveTonKhoColsConfig(tonKhoColsConfig);
            document.getElementById('ton-kho-settings-modal').classList.add('hidden');
            renderTonKhoTableHeader();
            if (cache.tonKhoList && cache.tonKhoList.length > 0) {
                renderTonKhoTable(cache.tonKhoList);
            } else {
                fetchTonKho(1);
            }
            showToast("Đã lưu cài đặt cột thành công!", 'success');
        };
    }

    let lastWidth = window.innerWidth;
    window.addEventListener('resize', debounce(() => {
        const currentWidth = window.innerWidth;
        const crossedBreakpoint = (lastWidth < 768 && currentWidth >= 768) || (lastWidth >= 768 && currentWidth < 768);
        lastWidth = currentWidth;
        if (crossedBreakpoint) {
            renderTonKhoTableHeader();
            fetchTonKho(1);
        } else if (currentWidth >= 768) {
            updateTonKhoTableWidth();
        }
    }, 200));

    document.getElementById('ton-kho-table-body').addEventListener('click', async e => {
        // 1. Logic Copy Mã VT
        const copyBtn = e.target.closest('.copy-ma-vt-btn');
        if (copyBtn) {
            const row = copyBtn.closest('tr');
            const id = row.dataset.id;
            const tk = cache.tonKhoList.find(i => i.ma_vach === id);
            if (tk) {
                try {
                    await navigator.clipboard.writeText(tk.ma_vt);
                    showToast('Đã copy mã VT: ' + tk.ma_vt, 'success');
                } catch (err) {
                    showToast('Lỗi khi copy mã VT.', 'error');
                }
            }
            return;
        }

        // 2. Logic Mở Form Xem (Chỉ khi nhấn vào cột Code hoặc đúng Tên VT trên mobile)
        const openTrigger = e.target.closest('.tk-col-full-code') || e.target.closest('.mobile-ten-vt-trigger');
        if (!openTrigger) return;

        const row = openTrigger.closest('tr');
        if (!row || !row.dataset.id) return;
        const id = row.dataset.id;
        const tk = cache.tonKhoList.find(i => i.ma_vach === id);
        if(tk) openTonKhoModal(tk, 'view');
    });

    document.getElementById('ton-kho-btn-excel').addEventListener('click', handleTonKhoExcelExport);
    document.getElementById('ton-kho-btn-excel-mobile').addEventListener('click', handleTonKhoExcelExport);

    document.getElementById('ton-kho-items-per-page').addEventListener('change', (e) => {
        viewStates['view-ton-kho'].itemsPerPage = parseInt(e.target.value, 10);
        fetchTonKho(1);
    });
    document.getElementById('ton-kho-prev-page').addEventListener('click', () => fetchTonKho(viewStates['view-ton-kho'].currentPage - 1));
    document.getElementById('ton-kho-next-page').addEventListener('click', () => fetchTonKho(viewStates['view-ton-kho'].currentPage + 1));
    
    const pageInput = document.getElementById('ton-kho-page-input');
    const handlePageJump = () => {
        let targetPage = parseInt(pageInput.value, 10);
        const totalPages = Math.ceil(state.totalFilteredCount / state.itemsPerPage);
        if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
        else if (targetPage > totalPages && totalPages > 0) targetPage = totalPages;
        pageInput.value = targetPage;
        if (targetPage !== state.currentPage) fetchTonKho(targetPage);
    };
    pageInput.addEventListener('change', handlePageJump);
    
    document.getElementById('close-ton-kho-view-btn').onclick = () => {
        document.getElementById('ton-kho-modal').classList.add('hidden');
    };

    // Voice Assistant Event Listeners
    const voiceBtn = document.getElementById('voice-assistant-trigger');
    if (voiceBtn) {
        voiceBtn.onclick = () => {
            startVoiceAssistant();
        };
    }
    const closeVoiceBtn = document.getElementById('close-voice-chat-btn');
    if (closeVoiceBtn) {
        closeVoiceBtn.onclick = () => {
            stopVoiceAssistant();
        };
    }
}

async function openTonKhoFilterPopoverCustom(button, view) {
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
        popover.style.width = '90%';
        popover.style.maxWidth = '300px';
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
        selectionCountEl.textContent = count > 0 ? `Đã chọn: ${count}` : '';
    };

    const updateToggleAllButtonState = (visibleCheckboxes) => {
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

        if (filteredOptions.length > 0) {
            optionsList.innerHTML = filteredOptions.map(option => {
                let colorClasses = '';
                let displayLabel = option;
                if (filterKey === 'tinh_trang') {
                    const ui = getStatusUI(option);
                    colorClasses = ui.bgCss;
                    displayLabel = ui.display;
                }
                return `
                <label class="flex items-center space-x-2 px-2 py-1 hover:bg-gray-100 rounded cursor-pointer"><input type="checkbox" value="${option}" class="filter-option-cb" ${tempSelectedOptions.has(String(option)) ? 'checked' : ''}><span class="text-sm ${colorClasses}">${displayLabel}</span></label>`}).join('');
        } else {
            optionsList.innerHTML = '<div class="text-center p-4 text-sm text-gray-500">Không có tùy chọn.</div>';
        }
        updateToggleAllButtonState(optionsList.querySelectorAll('.filter-option-cb'));
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
            const visibleOptions = allOptions.filter(option => 
                option && String(option).toLowerCase().includes(searchTerm)
            );
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
    optionsList.innerHTML = '<div class="text-center p-4 text-sm text-gray-500">Đang tải...</div>';
    applyBtn.disabled = true;

    try {
        let query = sb.from('ton_kho_update').select(filterKey);

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
            query = query.or(`ma_vach.ilike.%${state.searchTerm}%,ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,lot.ilike.%${state.searchTerm}%,tinh_trang.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%,note.ilike.%${state.searchTerm}%`);
        }
        if (state.stockAvailability === 'available') {
            query = query.gt('ton_cuoi', 0);
        }

        Object.keys(state.filters).forEach(key => {
            if (key !== filterKey && state.filters[key] && state.filters[key].length > 0) {
                query = query.in(key, state.filters[key]);
            }
        });

        const { data, error } = await query.limit(10000);
        if (error) throw error;
        
        let uniqueOptions = [...new Set(data.map(item => item[filterKey]).filter(Boolean))];
        if (filterKey === 'tinh_trang') {
            uniqueOptions.sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));
        } else uniqueOptions.sort();

        renderOptions(uniqueOptions);
        setupEventListeners(uniqueOptions);
        applyBtn.disabled = false;
    } catch (error) {
        console.error("Filter popover error:", error);
        optionsList.innerHTML = '<div class="text-center p-4 text-sm text-red-500">Lỗi tải bộ lọc.</div>';
    }
    
    const closePopover = (e) => {
        if (!popover.contains(e.target) && e.target !== button) {
            popover.remove();
            document.removeEventListener('click', closePopover);
        }
    };
    applyBtn.onclick = async () => {
        state.filters[filterKey] = [...tempSelectedOptions];
        const baseId = button.id.replace('-mobile', '');
        const defText = filterButtonDefaultTexts[baseId] || baseId;
        const newTxt = tempSelectedOptions.size > 0 ? `${defText} (${tempSelectedOptions.size})` : defText;
        
        const dBtn = document.getElementById(baseId);
        const mBtn = document.getElementById(`${baseId}-mobile`);
        if(dBtn) dBtn.textContent = newTxt;
        if(mBtn) mBtn.textContent = newTxt;

        fetchTonKho(1);
        popover.remove();
        document.removeEventListener('click', closePopover);
    };
    setTimeout(() => document.addEventListener('click', closePopover), 0);
}

// Function to show column detail on double-click
function showColumnDetail(columnName, content) {
    // Create or update detail modal
    let modal = document.getElementById('column-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'column-detail-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="text-lg font-bold text-gray-800" id="column-detail-title"></h3>
                    <button onclick="document.getElementById('column-detail-modal').classList.add('hidden')" class="text-gray-500 hover:text-gray-700">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div class="p-4 overflow-y-auto max-h-96">
                    <div class="text-sm text-gray-700 break-words whitespace-pre-wrap" id="column-detail-content"></div>
                </div>
                <div class="p-4 border-t bg-gray-50">
                    <button onclick="document.getElementById('column-detail-modal').classList.add('hidden')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">
                        Đóng
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('column-detail-title').textContent = columnName;
    document.getElementById('column-detail-content').textContent = content;
    modal.classList.remove('hidden');
}
// (global exposure handled separately in index.html)
