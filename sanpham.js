import { sb, cache, viewStates, showLoading, showToast, showConfirm, debounce, renderPagination, sanitizeFileName, filterButtonDefaultTexts, PLACEHOLDER_IMAGE_URL, currentUser, showView, updateMobileFilterIconStatus } from './app.js';

// Configuration for toggleable & reorderable columns on Desktop (Excel-style)
export const DEFAULT_SANPHAM_COLUMNS = [
    { key: 'hinh_anh', title: 'Ảnh', field: 'url_hinh_anh', defaultVisible: true, width: 75, minWidth: 40, align: 'center', sortable: false, filterable: false, class: 'sp-col-hinh-anh' },
    { key: 'ma_vt', title: 'Mã VT', field: 'ma_vt', defaultVisible: true, width: 150, minWidth: 50, align: 'left', sortable: true, filterable: true, class: 'sp-col-ma-vt' },
    { key: 'ten_vt', title: 'Tên VT', field: 'ten_vt', defaultVisible: true, width: 350, minWidth: 80, align: 'left', sortable: true, filterable: true, class: 'sp-col-ten-vt', isFlex: true },
    { key: 'ton_cuoi', title: 'Tồn Cuối', field: 'total_ton_cuoi', defaultVisible: true, width: 100, minWidth: 50, align: 'right', sortable: true, filterable: false, class: 'sp-col-ton-cuoi' },
    { key: 'nganh', title: 'Ngành', field: 'nganh', defaultVisible: true, width: 120, minWidth: 50, align: 'center', sortable: true, filterable: true, class: 'sp-col-nganh' },
    { key: 'phu_trach', title: 'Phụ Trách', field: 'phu_trach', defaultVisible: true, width: 140, minWidth: 50, align: 'center', sortable: true, filterable: true, class: 'sp-col-phu-trach' },
];

export let sanPhamColsConfig = [];

function initSanPhamColsConfig() {
    try {
        const saved = localStorage.getItem('sanpham_column_order_v2');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                const merged = parsed.map(c => {
                    const def = DEFAULT_SANPHAM_COLUMNS.find(d => d.key === c.key);
                    return { ...(def || {}), ...c, minWidth: 40 };
                });
                DEFAULT_SANPHAM_COLUMNS.forEach(def => {
                    if (!merged.find(c => c.key === def.key)) {
                        merged.push({ ...def, visible: def.defaultVisible, minWidth: 40 });
                    }
                });
                sanPhamColsConfig = merged;
                return;
            }
        }
    } catch (e) {
        console.warn("Failed to load saved sanpham column config", e);
    }

    sanPhamColsConfig = DEFAULT_SANPHAM_COLUMNS.map(col => ({
        ...col,
        minWidth: 40,
        visible: col.defaultVisible
    }));
}

function saveSanPhamColsConfig(cols) {
    try {
        localStorage.setItem('sanpham_column_order_v2', JSON.stringify(cols));
    } catch (e) {}
}

initSanPhamColsConfig();

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

function buildSanPhamQuery() {
    const state = viewStates['view-san-pham'];
    let query = sb.from('san_pham').select('*', { count: 'exact' });

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

    if (state.searchTerm) query = query.or(`ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%`);
    if (state.filters.ma_vt?.length > 0) query = query.in('ma_vt', state.filters.ma_vt);
    if (state.filters.ten_vt?.length > 0) query = query.in('ten_vt', state.filters.ten_vt);
    if (state.filters.nganh?.length > 0) query = query.in('nganh', state.filters.nganh);
    if (state.filters.phu_trach?.length > 0) query = query.in('phu_trach', state.filters.phu_trach);
    
    return query;
}

export async function fetchSanPham(page = viewStates['view-san-pham'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        viewStates['view-san-pham'].currentPage = page;
        const state = viewStates['view-san-pham'];
        state.selected.clear();
        updateSanPhamSelectionInfo(); 

        const from = (page - 1) * state.itemsPerPage;
        const to = from + state.itemsPerPage - 1;
        
        const sortCol = state.sortCol || 'ma_vt';
        const sortDir = state.sortDir === 'desc' ? false : true;
        
        let query = buildSanPhamQuery();
        if (sortCol !== 'ton_cuoi' && sortCol !== 'total_ton_cuoi') {
            query = query.order(sortCol, { ascending: sortDir });
        } else {
            query = query.order('ma_vt', { ascending: true });
        }
        query = query.range(from, to);

        const { data, error, count } = await query;
        
        if (error) {
            showToast("Không thể tải dữ liệu sản phẩm.", 'error');
        } else {
            state.totalFilteredCount = count; 
            let dataWithStock = data || [];
            if (dataWithStock.length > 0) {
                const maVts = dataWithStock.map(p => p.ma_vt);
                const { data: stockData } = await sb.from('ton_kho_update').select('ma_vt, ton_cuoi').in('ma_vt', maVts);
                const stockMap = new Map();
                (stockData || []).forEach(item => stockMap.set(item.ma_vt, (stockMap.get(item.ma_vt) || 0) + (item.ton_cuoi || 0)));
                dataWithStock = dataWithStock.map(sp => ({ ...sp, total_ton_cuoi: stockMap.get(sp.ma_vt) || 0 }));
            }

            // In-memory sort by total_ton_cuoi if requested
            if (sortCol === 'ton_cuoi' || sortCol === 'total_ton_cuoi') {
                dataWithStock.sort((a, b) => {
                    const diff = (a.total_ton_cuoi || 0) - (b.total_ton_cuoi || 0);
                    return sortDir ? diff : -diff;
                });
            }

            cache.sanPhamList = dataWithStock;
            renderSanPhamTableHeader();
            renderSanPhamTable(dataWithStock);
            renderPagination('san-pham', count, from, to);
            updateMobileFilterIconStatus('san-pham');
            updateSanPhamFilterButtonTexts();
        }
    } finally { if (showLoader) showLoading(false); }
}

export function updateSanPhamTableWidth() {
    if (window.innerWidth < 768) return;
    const table = document.getElementById('san-pham-main-table');
    const container = document.querySelector('#view-san-pham .table-container');
    if (!table) return;

    const visibleCols = sanPhamColsConfig.filter(c => c.visible);
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

export function renderSanPhamTableHeader() {
    const thead = document.getElementById('san-pham-table-head');
    if (!thead) return;
    const table = document.getElementById('san-pham-main-table');

    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        if (table) {
            table.style.width = '';
            table.style.minWidth = '';
        }
        // Mobile view: keep original static markup untouched (no column filter buttons)
        thead.innerHTML = `
            <tr>
                <th class="px-2 md:px-4 py-2 text-center font-bold text-black uppercase tracking-wider border border-gray-300 w-[15%] md:w-[7%]">
                    Ảnh</th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 px-2 md:px-6 py-2 text-center font-bold text-black uppercase tracking-wider border border-gray-300 w-auto md:w-[20%]" data-sort="ma_vt">
                    <div class="flex items-center justify-center">Mã VT<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div></th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 hidden md:table-cell px-6 py-2 text-center font-bold text-black uppercase tracking-wider border border-gray-300"
                    style="width: 40%;" data-sort="ten_vt"><div class="flex items-center justify-center">Tên VT<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div></th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 px-2 md:px-6 py-2 text-center font-bold text-black uppercase tracking-wider border border-gray-300 w-1 whitespace-nowrap" data-sort="nganh">
                    <div class="flex items-center justify-center">Ngành<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div></th>
                <th class="tk-sortable-header cursor-pointer hover:bg-gray-300 hidden md:table-cell px-6 py-2 text-center font-bold text-black uppercase tracking-wider border border-gray-300 w-1 whitespace-nowrap" data-sort="phu_trach">
                    <div class="flex items-center justify-center">Phụ Trách<span class="sort-icon ml-1 text-gray-400"><svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg></span></div></th>
            </tr>
        `;
        return;
    }

    // Laptop/Desktop View: Dynamic ordered columns with in-header filters and excel-style resize handles!
    const state = viewStates['view-san-pham'] || {};
    const visibleCols = sanPhamColsConfig.filter(c => c.visible);
    const container = document.querySelector('#view-san-pham .table-container');
    const containerWidth = container ? container.clientWidth : 0;
    const totalColsWidth = visibleCols.reduce((sum, col) => sum + (col.width || 100), 0);

    updateSanPhamTableWidth();

    const thHtml = visibleCols.map(col => {
        const sortField = col.field || col.key;
        const isSorted = state.sortCol === sortField || (col.key === 'ton_cuoi' && state.sortCol === 'total_ton_cuoi');
        const sortDir = state.sortDir;
        let sortIconSvg = '<svg class="w-2.5 h-2.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4 M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg>';
        if (isSorted) {
            sortIconSvg = sortDir === 'asc'
                ? '<svg class="w-2.5 h-2.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path class="text-blue-600" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4"></path><path class="text-gray-300" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg>'
                : '<svg class="w-2.5 h-2.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path class="text-gray-300" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20V4m0 0L3 8m4-4l4 4"></path><path class="text-blue-600" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 4v16m0 0l4-4m-4 4l-4-4"></path></svg>';
        }

        const filterKey = col.key;
        const currentSelected = state.filters ? (state.filters[filterKey] || []) : [];
        const isFilterActive = Array.isArray(currentSelected) && currentSelected.length > 0;

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
        const widthStyle = (col.key === 'ten_vt' && totalColsWidth <= containerWidth)
            ? `min-width: ${colW}px; width: auto;`
            : `width: ${colW}px; min-width: ${colW}px;`;

        return `
            <th class="${sortableClass} ${col.class || ''} px-1.5 py-1 text-center font-bold text-gray-900 uppercase tracking-wider border border-gray-300 text-[11.5px]"
                data-sort="${col.sortable ? (col.field || col.key) : ''}"
                data-col-key="${col.key}"
                style="${widthStyle}">
                <div class="tk-th-content">
                    <div class="tk-th-title ${col.sortable ? 'cursor-pointer' : ''}">
                        <span class="truncate">${escapeHtml(col.title)}</span>
                        ${col.sortable ? `<span class="sort-icon ml-0.5 text-gray-400 flex-shrink-0">${sortIconSvg}</span>` : ''}
                    </div>
                    ${filterBtnHtml}
                </div>
                <div class="col-resizer" data-col-key="${col.key}" title="Kéo để chỉnh độ rộng. Nhấp đúp để về mặc định"></div>
            </th>
        `;
    }).join('');

    thead.innerHTML = `<tr>${thHtml}</tr>`;

    thead.querySelectorAll('.col-filter-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const colKey = btn.dataset.col;
            toggleSanPhamColumnFilterDropdown(btn, colKey);
        };
    });

    initSanPhamColumnResizing();
}

window.renderSanPhamTableHeader = renderSanPhamTableHeader;

function renderSanPhamTable(data) {
    const spTableBody = document.getElementById('san-pham-table-body');
    if (!spTableBody) return;

    if (!data || data.length === 0) {
        spTableBody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-gray-500">Không có dữ liệu</td></tr>';
        return;
    }

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
        // Mobile view: keep exact original compact layout untouched
        spTableBody.innerHTML = data.map(sp => {
            const imageHtml = sp.url_hinh_anh ? `<img src="${sp.url_hinh_anh}" class="w-8 h-8 md:w-12 md:h-12 object-cover rounded-md thumbnail-image" data-large-src="${sp.url_hinh_anh}">` : `<div class="w-8 h-8 md:w-12 md:h-12 bg-gray-200 rounded-md flex items-center justify-center text-gray-400">...</div>`;
            const tonCuoiClass = sp.total_ton_cuoi > 0 ? 'text-green-600' : 'text-red-500';
            return `
                <tr data-id="${sp.ma_vt}" class="cursor-pointer hover:bg-gray-50">
                    <td class="px-1 md:px-4 py-1 border border-gray-300 flex justify-center items-center">${imageHtml}</td>
                    <td class="px-2 md:px-6 py-1 border border-gray-300">
                        <div class="flex flex-col">
                            <div class="flex justify-between items-center w-full gap-2">
                                <button data-ma-vt="${sp.ma_vt}" class="san-pham-ma-vt-link text-blue-600 font-bold hover:underline break-all text-left uppercase text-[10px] md:text-sm">${sp.ma_vt}</button>
                                <span class="text-[10px] md:text-sm font-bold whitespace-nowrap ${tonCuoiClass}">Tồn: ${sp.total_ton_cuoi.toLocaleString()}</span>
                            </div>
                            <span class="md:hidden text-[9px] text-gray-500 break-words mt-0.5 leading-tight">${sp.ten_vt}</span>
                        </div>
                    </td>
                    <td class="hidden md:table-cell px-6 py-1 text-sm text-gray-600 break-words border border-gray-300">${sp.ten_vt}</td>
                    <td class="px-1 md:px-6 py-1 text-[10px] md:text-sm text-gray-600 border border-gray-300 text-center">${sp.nganh || ''}</td>
                    <td class="hidden md:table-cell px-6 py-1 text-sm text-gray-600 border border-gray-300 text-center">${sp.phu_trach || ''}</td>
                </tr>`;
        }).join('');
        return;
    }

    // Laptop/Desktop View: Dynamic ordered columns matching Ton Kho & Chi Tiet
    const visibleCols = sanPhamColsConfig.filter(c => c.visible);
    spTableBody.innerHTML = data.map(sp => {
        const tonCuoiClass = (sp.total_ton_cuoi || 0) > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold';
        const imageHtml = sp.url_hinh_anh 
            ? `<img src="${sp.url_hinh_anh}" class="w-8 h-8 md:w-10 md:h-10 object-cover rounded-md thumbnail-image mx-auto shadow-xs" data-large-src="${sp.url_hinh_anh}">` 
            : `<div class="w-8 h-8 md:w-10 md:h-10 bg-gray-200 rounded-md flex items-center justify-center text-gray-400 mx-auto text-xs">...</div>`;

        const tdList = visibleCols.map(col => {
            switch (col.key) {
                case 'hinh_anh':
                    return `<td class="px-1 py-1 border border-gray-300 text-center flex justify-center items-center">${imageHtml}</td>`;
                case 'ma_vt':
                    return `<td class="px-2 py-1 text-xs font-bold border border-gray-300 text-left whitespace-nowrap overflow-hidden text-ellipsis">
                        <button data-ma-vt="${sp.ma_vt}" class="san-pham-ma-vt-link text-blue-600 font-bold hover:underline break-all uppercase text-xs">${escapeHtml(sp.ma_vt)}</button>
                    </td>`;
                case 'ten_vt':
                    return `<td class="px-2 py-1 text-xs text-gray-700 border border-gray-300 text-left whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(sp.ten_vt || '')}" ondblclick="showColumnDetail('Tên VT', '${escapeHtml(sp.ten_vt || '')}')">${formatCellEmpty(sp.ten_vt)}</td>`;
                case 'ton_cuoi':
                    return `<td class="px-2 py-1 text-xs ${tonCuoiClass} border border-gray-300 text-right whitespace-nowrap overflow-hidden text-ellipsis">${(sp.total_ton_cuoi || 0).toLocaleString()}</td>`;
                case 'nganh':
                    return `<td class="px-2 py-1 text-xs text-gray-600 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(sp.nganh || '')}" ondblclick="showColumnDetail('Ngành', '${escapeHtml(sp.nganh || '')}')">${formatCellEmpty(sp.nganh)}</td>`;
                case 'phu_trach':
                    return `<td class="px-2 py-1 text-xs text-gray-600 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer" title="${escapeHtml(sp.phu_trach || '')}" ondblclick="showColumnDetail('Phụ Trách', '${escapeHtml(sp.phu_trach || '')}')">${formatCellEmpty(sp.phu_trach)}</td>`;
                default:
                    return `<td class="px-2 py-1 border border-gray-300 text-center whitespace-nowrap overflow-hidden text-ellipsis">${formatCellEmpty(sp[col.field || col.key])}</td>`;
            }
        }).join('');

        return `<tr data-id="${sp.ma_vt}" class="hover:bg-blue-50/40 cursor-pointer">${tdList}</tr>`;
    }).join('');

    updateSanPhamTableWidth();
}

let isResizingColumn = false;

function initSanPhamColumnResizing() {
    if (window.innerWidth < 768) return;
    const thead = document.getElementById('san-pham-table-head');
    if (!thead) return;
    const table = document.getElementById('san-pham-main-table');

    thead.querySelectorAll('.col-resizer').forEach(resizer => {
        // Double-click to reset column to default initial width
        resizer.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const th = resizer.closest('th');
            if (!th) return;
            const colKey = resizer.dataset.colKey || th.dataset.colKey;
            const colDef = sanPhamColsConfig.find(c => c.key === colKey);
            const defaultDef = DEFAULT_SANPHAM_COLUMNS.find(d => d.key === colKey);
            const resetWidth = defaultDef ? (defaultDef.width || 100) : 100;

            if (colDef) {
                colDef.width = resetWidth;
                saveSanPhamColsConfig(sanPhamColsConfig);

                th.style.width = `${resetWidth}px`;
                th.style.minWidth = `${resetWidth}px`;

                updateSanPhamTableWidth();
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
            const colDef = sanPhamColsConfig.find(c => c.key === colKey);
            const minWidth = 40;
            let currentNewWidth = startWidth;
            let hasMoved = false;

            const visibleCols = sanPhamColsConfig.filter(c => c.visible);
            const startTotalColsWidth = visibleCols.reduce((sum, c) => sum + (c.width || 100), 0);
            const container = document.querySelector('#view-san-pham .table-container');
            const containerWidth = container ? container.clientWidth : 0;

            const onMouseMove = (moveEvent) => {
                const diff = moveEvent.pageX - startX;
                if (Math.abs(diff) > 2) hasMoved = true;
                currentNewWidth = Math.max(minWidth, Math.round(startWidth + diff));
                const widthDiff = currentNewWidth - startWidth;

                th.style.width = `${currentNewWidth}px`;
                th.style.minWidth = `${currentNewWidth}px`;

                if (table) {
                    const newTotalColsWidth = Math.max(100, Math.round(startTotalColsWidth + widthDiff));
                    if (containerWidth > 0 && newTotalColsWidth <= containerWidth) {
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

                    if (colDef) {
                        colDef.width = finalWidth;
                        saveSanPhamColsConfig(sanPhamColsConfig);
                    }
                }

                updateSanPhamTableWidth();

                setTimeout(() => {
                    isResizingColumn = false;
                }, 120);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
    });
}

let pendingSanPhamColsConfig = [];

function openSanPhamSettingsModal() {
    const modal = document.getElementById('san-pham-settings-modal');
    if (!modal) return;

    pendingSanPhamColsConfig = JSON.parse(JSON.stringify(sanPhamColsConfig));
    renderSanPhamSettingsModalList();
    modal.classList.remove('hidden');
}

function renderSanPhamSettingsModalList() {
    const container = document.getElementById('san-pham-column-toggles');
    if (!container) return;

    container.innerHTML = pendingSanPhamColsConfig.map((col, index) => {
        const isVisible = !!col.visible;
        const isFirst = index === 0;
        const isLast = index === pendingSanPhamColsConfig.length - 1;

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
            if (!isNaN(idx) && pendingSanPhamColsConfig[idx]) {
                pendingSanPhamColsConfig[idx].visible = !pendingSanPhamColsConfig[idx].visible;
                renderSanPhamSettingsModalList();
            }
        };
    });

    container.querySelectorAll('.btn-col-move').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.index, 10);
            const action = btn.dataset.action;
            if (isNaN(idx)) return;

            if (action === 'up' && idx > 0) {
                const temp = pendingSanPhamColsConfig[idx];
                pendingSanPhamColsConfig[idx] = pendingSanPhamColsConfig[idx - 1];
                pendingSanPhamColsConfig[idx - 1] = temp;
                renderSanPhamSettingsModalList();
            } else if (action === 'down' && idx < pendingSanPhamColsConfig.length - 1) {
                const temp = pendingSanPhamColsConfig[idx];
                pendingSanPhamColsConfig[idx] = pendingSanPhamColsConfig[idx + 1];
                pendingSanPhamColsConfig[idx + 1] = temp;
                renderSanPhamSettingsModalList();
            }
        };
    });
}

let activeFilterColKeySP = null;
let currentFilterValuesSP = [];
let tempFilterSelectedSP = new Set();

function closeSanPhamColumnFilterDropdown() {
    const popover = document.getElementById('sanpham-col-filter-popover');
    if (popover) popover.style.display = 'none';
    activeFilterColKeySP = null;
}

function renderFilterPopoverListSP(colKey) {
    const listEl = document.getElementById('sp-filter-popover-list');
    const searchInput = document.getElementById('sp-filter-popover-search-input');
    const searchVal = (searchInput ? searchInput.value : '').trim().toLowerCase();

    const filtered = currentFilterValuesSP.filter(val => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(searchVal);
    });

    if (filtered.length === 0) {
        listEl.innerHTML = '<div class="p-3 text-center text-xs text-gray-400">Không tìm thấy kết quả phù hợp</div>';
        return;
    }

    listEl.innerHTML = filtered.map((val) => {
        const valStr = String(val);
        const isChecked = tempFilterSelectedSP.has(valStr);
        return `
            <div class="tk-popover-item">
                <label class="flex items-center gap-2 cursor-pointer w-full text-xs text-gray-800">
                    <input type="checkbox" class="sp-popover-item-cb accent-blue-600 rounded" data-value="${escapeHtml(valStr)}" ${isChecked ? 'checked' : ''}>
                    <span class="truncate flex-1">${escapeHtml(valStr)}</span>
                </label>
            </div>
        `;
    }).join('');

    const selectAllCb = document.getElementById('sp-popover-select-all');
    if (selectAllCb) {
        const allChecked = filtered.length > 0 && filtered.every(v => tempFilterSelectedSP.has(String(v)));
        const someChecked = filtered.some(v => tempFilterSelectedSP.has(String(v)));
        selectAllCb.checked = allChecked;
        selectAllCb.indeterminate = !allChecked && someChecked;
    }

    listEl.querySelectorAll('.sp-popover-item-cb').forEach(cb => {
        cb.onchange = (e) => {
            const v = e.target.dataset.value;
            if (e.target.checked) {
                tempFilterSelectedSP.add(v);
            } else {
                tempFilterSelectedSP.delete(v);
            }
            if (selectAllCb) {
                const updatedAllChecked = filtered.length > 0 && filtered.every(val => tempFilterSelectedSP.has(String(val)));
                const updatedSomeChecked = filtered.some(val => tempFilterSelectedSP.has(String(val)));
                selectAllCb.checked = updatedAllChecked;
                selectAllCb.indeterminate = !updatedAllChecked && updatedSomeChecked;
            }
        };
    });
}

async function toggleSanPhamColumnFilterDropdown(triggerBtn, colKey) {
    const popover = document.getElementById('sanpham-col-filter-popover');
    if (!popover) return;

    if (activeFilterColKeySP === colKey && popover.style.display !== 'none') {
        closeSanPhamColumnFilterDropdown();
        return;
    }

    activeFilterColKeySP = colKey;
    const colDef = sanPhamColsConfig.find(c => c.key === colKey);
    const colTitle = colDef ? colDef.title : colKey;
    const filterField = (colDef && colDef.field) ? colDef.field : colKey;

    const titleEl = document.getElementById('sp-filter-popover-title');
    if (titleEl) titleEl.textContent = `Lọc: ${colTitle}`;

    const searchInput = document.getElementById('sp-filter-popover-search-input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = `Tìm trong ${colTitle}...`;
    }

    const listEl = document.getElementById('sp-filter-popover-list');
    listEl.innerHTML = '<div class="p-4 text-center text-xs text-gray-500 flex items-center justify-center gap-1.5"><svg class="animate-spin h-3.5 w-3.5 text-blue-600" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Đang tải giá trị...</div>';

    popover.style.display = 'flex';

    const btn = (triggerBtn instanceof HTMLElement) ? triggerBtn : (triggerBtn?.target?.closest ? triggerBtn.target.closest('.col-filter-btn') : document.querySelector(`.col-filter-btn[data-col="${colKey}"]`));
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

    const state = viewStates['view-san-pham'];
    tempFilterSelectedSP = new Set(state.filters[colKey] || []);

    const selectAllCb = document.getElementById('sp-popover-select-all');
    if (selectAllCb) {
        selectAllCb.onchange = (e) => {
            const isChecked = e.target.checked;
            const searchVal = (searchInput ? searchInput.value : '').trim().toLowerCase();
            const visibleValues = currentFilterValuesSP.filter(val => 
                val !== null && val !== undefined && String(val).toLowerCase().includes(searchVal)
            );
            visibleValues.forEach(val => {
                if (isChecked) {
                    tempFilterSelectedSP.add(String(val));
                } else {
                    tempFilterSelectedSP.delete(String(val));
                }
            });
            renderFilterPopoverListSP(colKey);
        };
    }

    if (searchInput) {
        searchInput.oninput = debounce(() => {
            renderFilterPopoverListSP(colKey);
        }, 120);
    }

    const applyBtn = document.getElementById('sp-popover-apply-btn');
    if (applyBtn) {
        applyBtn.onclick = () => {
            state.filters[colKey] = Array.from(tempFilterSelectedSP);
            updateSanPhamFilterButtonTexts();
            closeSanPhamColumnFilterDropdown();
            renderSanPhamTableHeader();
            fetchSanPham(1);
        };
    }

    const clearBtn = document.getElementById('sp-popover-clear-btn');
    if (clearBtn) {
        clearBtn.onclick = () => {
            state.filters[colKey] = [];
            tempFilterSelectedSP.clear();
            updateSanPhamFilterButtonTexts();
            closeSanPhamColumnFilterDropdown();
            renderSanPhamTableHeader();
            fetchSanPham(1);
        };
    }

    const closeBtn = document.getElementById('sp-popover-close-btn');
    if (closeBtn) {
        closeBtn.onclick = () => closeSanPhamColumnFilterDropdown();
    }

    try {
        let query = sb.from('san_pham').select(filterField);

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
            query = query.or(`ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%`);
        }

        Object.keys(state.filters).forEach(k => {
            if (k !== colKey && state.filters[k] && state.filters[k].length > 0) {
                const targetCol = sanPhamColsConfig.find(c => c.key === k);
                const fieldName = (targetCol && targetCol.field) ? targetCol.field : k;
                query = query.in(fieldName, state.filters[k]);
            }
        });

        const { data, error } = await query.limit(10000);
        if (error) throw error;

        let unique = [...new Set((data || []).map(item => item[filterField]).filter(v => v !== null && v !== undefined && String(v).trim() !== ''))];
        unique.sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true }));

        currentFilterValuesSP = unique;
        renderFilterPopoverListSP(colKey);
    } catch (err) {
        console.error("Lỗi khi tải bộ lọc cột sản phẩm:", err);
        listEl.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Lỗi khi tải dữ liệu lọc</div>';
    }
}

function updateSanPhamFilterButtonTexts() {
    const state = viewStates['view-san-pham'];
    if (!state) return;

    let hasAnyActiveFilter = !!state.searchTerm;
    Object.keys(state.filters).forEach(k => {
        if (state.filters[k]?.length > 0) hasAnyActiveFilter = true;
    });

    const resetBtn = document.getElementById('san-pham-reset-filters');
    if (resetBtn) {
        resetBtn.classList.toggle('filter-has-active', hasAnyActiveFilter);
    }

    ['ma_vt', 'ten_vt', 'nganh', 'phu_trach'].forEach(k => {
        const selected = state.filters[k] || [];
        const baseId = `san-pham-filter-${k.replace('_', '-')}-btn`;
        const def = filterButtonDefaultTexts[baseId] || k;
        const txt = selected.length > 0 ? `${def} (${selected.length})` : def;
        const dBtn = document.getElementById(baseId);
        const mBtn = document.getElementById(`${baseId}-mobile`);
        if (dBtn) dBtn.textContent = txt;
        if (mBtn) mBtn.textContent = txt;
    });
}

function updateSanPhamSelectionInfo() {
    const s = viewStates['view-san-pham'];
    const el = document.getElementById('san-pham-selection-info');
    if (el) el.textContent = `${s.selected.size} / ${s.totalFilteredCount} hàng được chọn`;
}

async function handleSanPhamExcelExport() {
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
            const query = exportAll ? sb.from('san_pham').select('*') : buildSanPhamQuery();
            const { data, error } = await query.order('ma_vt', { ascending: true }).limit(30000);
            
            if (error) throw error;
            if (!data || data.length === 0) {
                showToast("Không có dữ liệu để xuất.", 'info');
                return;
            }

            const worksheet = window.XLSX.utils.json_to_sheet(data);
            const workbook = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(workbook, worksheet, "SanPham");
            window.XLSX.writeFile(workbook, `SanPham_${new Date().toISOString().slice(0,10)}.xlsx`);
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

async function openFilterPopover(button, view) {
    const filterKey = button.dataset.filterKey;
    const state = viewStates[view];
    const template = document.getElementById('filter-popover-template');
    if (!template) return;
    const popover = template.content.cloneNode(true).querySelector('.filter-popover');
    document.body.appendChild(popover);
    const rect = button.getBoundingClientRect();

    if (window.innerWidth <= 768) {
        // Tối ưu vị trí cho Mobile
        popover.style.position = 'fixed';
        popover.style.left = '50%';
        popover.style.top = '50%';
        popover.style.transform = 'translate(-50%, -50%)';
        popover.style.width = '90%';
        popover.style.maxWidth = '300px';
        popover.style.zIndex = '100';
    } else {
        // Desktop
        if (button.closest('#sp-filter-drawer')) {
            popover.style.position = 'fixed';
            popover.style.right = '280px';
            popover.style.top = `${rect.top}px`;
        } else {
            popover.style.left = `${rect.left}px`;
            popover.style.top = `${rect.bottom + window.scrollY + 5}px`;
        }
    }

    const optList = popover.querySelector('.filter-options-list');
    const applyBtn = popover.querySelector('.filter-apply-btn');
    const searchInput = popover.querySelector('.filter-search-input');
    const countEl = popover.querySelector('.filter-selection-count');
    const toggleBtn = popover.querySelector('.filter-toggle-all-btn');
    const tempSel = new Set(state.filters[filterKey] || []);

    const render = (opts) => {
        const term = searchInput.value.toLowerCase();
        const filtered = opts.filter(o => o && String(o).toLowerCase().includes(term));
        optList.innerHTML = filtered.length > 0 ? filtered.map(o => `<label class="flex items-center space-x-2 px-2 py-1 hover:bg-gray-100 rounded cursor-pointer"><input type="checkbox" value="${o}" class="filter-option-cb" ${tempSel.has(String(o)) ? 'checked' : ''}><span class="text-xs md:text-sm">${o}</span></label>`).join('') : '<div class="text-center p-4 text-xs text-gray-500">Không có tùy chọn.</div>';
        const visible = optList.querySelectorAll('.filter-option-cb');
        toggleBtn.disabled = visible.length === 0;
        toggleBtn.textContent = visible.length > 0 && [...visible].every(cb => cb.checked) ? 'Bỏ chọn' : 'Tất cả';
    };

    optList.innerHTML = '<div class="text-center p-4 text-xs">Đang tải...</div>';
    applyBtn.disabled = true;
    try {
        let query = buildSanPhamQuery();
        Object.keys(state.filters).forEach(k => { if (k !== filterKey && state.filters[k]?.length > 0) query = query.in(k, state.filters[k]); });
        const { data } = await query.select(filterKey);
        const unique = [...new Set((data || []).map(i => i[filterKey]).filter(Boolean))].sort();
        render(unique);
        searchInput.oninput = () => render(unique);
        optList.onchange = e => { if (e.target.checked) tempSel.add(e.target.value); else tempSel.delete(e.target.value); countEl.textContent = tempSel.size > 0 ? `Đã chọn: ${tempSel.size}` : ''; render(unique); };
        toggleBtn.onclick = () => {
            const term = searchInput.value.toLowerCase();
            const visible = unique.filter(o => o && String(o).toLowerCase().includes(term));
            const isAll = toggleBtn.textContent === 'Tất cả';
            visible.forEach(o => isAll ? tempSel.add(String(o)) : tempSel.delete(String(o)));
            render(unique); countEl.textContent = tempSel.size > 0 ? `Đã chọn: ${tempSel.size}` : '';
        };
        applyBtn.disabled = false;
    } catch (e) { optList.innerHTML = '<div class="text-center p-4 text-xs text-red-500">Lỗi.</div>'; }

    const close = (e) => { if (!popover.contains(e.target) && e.target !== button) { popover.remove(); document.removeEventListener('click', close); } };
    applyBtn.onclick = () => {
        state.filters[filterKey] = [...tempSel];
        const def = filterButtonDefaultTexts[button.id.replace('-mobile', '')] || button.id;
        const txt = tempSel.size > 0 ? `${def} (${tempSel.size})` : def;
        const dBtn = document.getElementById(`san-pham-filter-${filterKey.replace('_', '-')}-btn`);
        const mBtn = document.getElementById(`san-pham-filter-${filterKey.replace('_', '-')}-btn-mobile`);
        if(dBtn) dBtn.textContent = txt; if(mBtn) mBtn.textContent = txt;
        fetchSanPham(1); popover.remove(); document.removeEventListener('click', close);
    };
    setTimeout(() => document.addEventListener('click', close), 0);
}

export function initSanPhamView() {
    const view = document.getElementById('view-san-pham');
    renderSanPhamTableHeader();

    document.getElementById('san-pham-search').oninput = debounce(e => { viewStates['view-san-pham'].searchTerm = e.target.value; fetchSanPham(1); }, 500);
    document.getElementById('san-pham-search-mobile').oninput = debounce(e => { viewStates['view-san-pham'].searchTerm = e.target.value; fetchSanPham(1); }, 500);

    view.onclick = async e => { 
        // 1. Funnel filter buttons on column header
        const colFilterBtn = e.target.closest('.col-filter-btn');
        if (colFilterBtn) {
            e.preventDefault();
            e.stopPropagation();
            const colKey = colFilterBtn.dataset.col;
            toggleSanPhamColumnFilterDropdown(colFilterBtn, colKey);
            return;
        }

        if (e.target.closest('.col-resizer') || isResizingColumn) {
            return;
        }

        // 2. Toolbar filter buttons (mobile drawer or desktop toolbar)
        const btn = e.target.closest('.filter-btn'); 
        if (btn) {
            openFilterPopover(btn, 'view-san-pham');
            return;
        }

        // 3. Sortable headers
        const sortHeader = e.target.closest('.tk-sortable-header');
        if (sortHeader) {
            const col = sortHeader.dataset.sort;
            if (col) {
                const state = viewStates['view-san-pham'];
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
                
                renderSanPhamTableHeader();
                fetchSanPham(1);
            }
            return;
        }

        // 4. Navigate to Ton Kho when clicking Mã VT
        const vtLink = e.target.closest('.san-pham-ma-vt-link');
        if (vtLink) {
            const ma_vt = vtLink.dataset.maVt;
            const tkState = viewStates['view-ton-kho'];
            
            tkState.searchTerm = '';
            tkState.filters = { ma_vt: [ma_vt], lot: [], date: [], tinh_trang: [], nganh: [], phu_trach: [] };
            tkState.stockAvailability = 'all';
            sessionStorage.setItem('tonKhoStockAvailability', 'all');
            
            await showView('view-ton-kho');
            return;
        }

        // 5. Image Preview
        if (e.target.closest('.thumbnail-image')) {
            document.getElementById('image-viewer-img').src = e.target.closest('.thumbnail-image').dataset.largeSrc;
            document.getElementById('image-viewer-modal').classList.remove('hidden'); 
            return;
        }
    };

    // Close column filter popover when clicking outside
    document.addEventListener('click', (e) => {
        const popover = document.getElementById('sanpham-col-filter-popover');
        if (!popover || popover.style.display === 'none') return;
        if (!popover.contains(e.target) && !e.target.closest('.col-filter-btn')) {
            closeSanPhamColumnFilterDropdown();
        }
    });

    // Reset filters
    const reset = () => {
        document.getElementById('san-pham-search').value = ''; 
        document.getElementById('san-pham-search-mobile').value = '';
        viewStates['view-san-pham'].searchTerm = '';
        viewStates['view-san-pham'].filters = { ma_vt: [], ten_vt: [], nganh: [], phu_trach: [] };
        
        ['ma_vt', 'ten_vt', 'nganh', 'phu_trach'].forEach(k => {
             const def = filterButtonDefaultTexts[`san-pham-filter-${k.replace('_', '-')}-btn`];
             const d = document.getElementById(`san-pham-filter-${k.replace('_', '-')}-btn`);
             const m = document.getElementById(`san-pham-filter-${k.replace('_', '-')}-btn-mobile`);
             if(d) d.textContent = def; if(m) m.textContent = def;
        });

        closeSanPhamColumnFilterDropdown();
        updateSanPhamFilterButtonTexts();
        renderSanPhamTableHeader();
        fetchSanPham(1);
    };

    document.getElementById('san-pham-reset-filters').onclick = reset;
    document.getElementById('san-pham-reset-filters-mobile').onclick = reset;

    // Settings Modal
    const settingsBtn = document.getElementById('san-pham-btn-settings');
    if (settingsBtn) settingsBtn.onclick = openSanPhamSettingsModal;

    const modalCloseX = document.getElementById('san-pham-settings-close-x');
    if (modalCloseX) modalCloseX.onclick = () => document.getElementById('san-pham-settings-modal').classList.add('hidden');

    const modalCancelBtn = document.getElementById('san-pham-settings-cancel-btn');
    if (modalCancelBtn) modalCancelBtn.onclick = () => document.getElementById('san-pham-settings-modal').classList.add('hidden');

    const modalResetBtn = document.getElementById('san-pham-settings-reset-btn');
    if (modalResetBtn) {
        modalResetBtn.onclick = () => {
            pendingSanPhamColsConfig = DEFAULT_SANPHAM_COLUMNS.map(c => ({
                ...c,
                visible: c.defaultVisible
            }));
            renderSanPhamSettingsModalList();
        };
    }

    const modalSaveBtn = document.getElementById('san-pham-settings-close-btn');
    if (modalSaveBtn) {
        modalSaveBtn.onclick = () => {
            sanPhamColsConfig = JSON.parse(JSON.stringify(pendingSanPhamColsConfig));
            saveSanPhamColsConfig(sanPhamColsConfig);
            document.getElementById('san-pham-settings-modal').classList.add('hidden');
            renderSanPhamTableHeader();
            if (cache.sanPhamList && cache.sanPhamList.length > 0) {
                renderSanPhamTable(cache.sanPhamList);
            } else {
                fetchSanPham(1);
            }
            showToast("Đã lưu cài đặt cột sản phẩm thành công!", 'success');
        };
    }

    // Mobile drawer toggle
    const drw = document.getElementById('sp-filter-drawer');
    const ovl = document.getElementById('sp-filter-drawer-overlay');
    document.getElementById('sp-mobile-filter-toggle').onclick = () => { drw.classList.remove('translate-x-full'); ovl.classList.remove('hidden'); };
    document.getElementById('sp-filter-drawer-close').onclick = () => { drw.classList.add('translate-x-full'); ovl.classList.add('hidden'); };
    ovl.onclick = () => { drw.classList.add('translate-x-full'); ovl.classList.add('hidden'); };

    // Excel export
    document.getElementById('san-pham-btn-excel').onclick = handleSanPhamExcelExport;
    document.getElementById('san-pham-btn-excel-mobile').onclick = handleSanPhamExcelExport;

    // Pagination
    document.getElementById('san-pham-items-per-page').onchange = e => { viewStates['view-san-pham'].itemsPerPage = parseInt(e.target.value); fetchSanPham(1); };
    document.getElementById('san-pham-prev-page').onclick = () => fetchSanPham(viewStates['view-san-pham'].currentPage - 1);
    document.getElementById('san-pham-next-page').onclick = () => fetchSanPham(viewStates['view-san-pham'].currentPage + 1);

    // Responsive resize handler
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', debounce(() => {
        const currentWidth = window.innerWidth;
        const crossedBreakpoint = (lastWidth < 768 && currentWidth >= 768) || (lastWidth >= 768 && currentWidth < 768);
        lastWidth = currentWidth;
        if (crossedBreakpoint) {
            renderSanPhamTableHeader();
            if (cache.sanPhamList && cache.sanPhamList.length > 0) {
                renderSanPhamTable(cache.sanPhamList);
            }
        } else if (currentWidth >= 768) {
            updateSanPhamTableWidth();
        }
    }, 200));
}