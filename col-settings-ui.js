/**
 * UI dùng chung cho modal "Cài đặt & Sắp xếp thứ tự cột" (giống View Tồn Kho)
 * - Bấm mắt để ẩn/hiện, bấm ▲/▼ để đổi vị trí.
 * list: [{ key, title, visible, canHide? }]
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EYE_ON = `
    <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>`;
const EYE_OFF = `
    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
    </svg>`;

/**
 * Tạo HTML khung modal theo chuẩn Tồn Kho
 */
export function buildColumnSettingsModalHtml(prefix, title = 'Cài đặt & Sắp xếp thứ tự cột', zClass = 'z-50') {
    return `
    <div id="${prefix}-settings-modal" class="hidden fixed inset-0 ${zClass} flex items-center justify-center modal-backdrop bg-black/50">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col modal-content-custom overflow-hidden border border-gray-200">
            <div class="p-4 border-b bg-gray-50 flex justify-between items-center">
                <div>
                    <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
                        <svg class="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                        ${title}
                    </h3>
                    <p class="text-[11px] text-gray-500 mt-0.5">Bấm mắt (👁) để ẩn/hiện, bấm (▲/▼) để đổi vị trí hiển thị.</p>
                </div>
                <button type="button" id="${prefix}-settings-close-x" class="text-gray-400 hover:text-gray-700 text-2xl font-bold leading-none p-1">&times;</button>
            </div>
            <div class="p-4 overflow-y-auto max-h-[60vh]">
                <div id="${prefix}-column-toggles" class="flex flex-col gap-2"></div>
            </div>
            <div class="p-3 border-t bg-gray-50 flex justify-between items-center">
                <button type="button" id="${prefix}-settings-reset-btn"
                    class="px-3 py-1.5 text-xs text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-md border border-gray-300 font-medium transition">
                    Khôi phục mặc định
                </button>
                <div class="flex items-center gap-2">
                    <button type="button" id="${prefix}-settings-cancel-btn"
                        class="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-md font-medium transition">
                        Đóng
                    </button>
                    <button type="button" id="${prefix}-settings-save-btn"
                        class="px-5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-bold shadow-sm transition">
                        Lưu cấu hình
                    </button>
                </div>
            </div>
        </div>
    </div>`;
}

/**
 * Render danh sách cột (mắt + ▲/▼) vào container; thao tác trực tiếp trên mảng list.
 */
export function renderColumnConfigList(container, list) {
    if (!container) return;

    container.innerHTML = list.map((col, index) => {
        const isVisible = col.canHide === false ? true : !!col.visible;
        const lockVis = col.canHide === false;
        const isFirst = index === 0;
        const isLast = index === list.length - 1;
        return `
            <div class="col-config-item flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-lg transition hover:bg-gray-100" data-col-key="${esc(col.key)}">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <button type="button" class="btn-col-toggle-vis p-1 text-gray-500 hover:text-blue-600 rounded transition ${lockVis ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}" data-index="${index}" ${lockVis ? 'disabled title="Cột bắt buộc, không thể ẩn"' : `title="${isVisible ? 'Ẩn cột' : 'Hiện cột'}"`}>
                        ${isVisible ? EYE_ON : EYE_OFF}
                    </button>
                    <span class="text-xs font-semibold ${isVisible ? 'text-gray-800' : 'text-gray-400 line-through'} truncate">${esc(col.title)}</span>
                    <span class="text-[10px] text-gray-400 font-mono">(${esc(col.key)})</span>
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" class="btn-col-move p-1 text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-white cursor-pointer" data-action="up" data-index="${index}" ${isFirst ? 'disabled' : ''} title="Di chuyển lên">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
                    </button>
                    <button type="button" class="btn-col-move p-1 text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-white cursor-pointer" data-action="down" data-index="${index}" ${isLast ? 'disabled' : ''} title="Di chuyển xuống">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                </div>
            </div>`;
    }).join('');

    container.querySelectorAll('.btn-col-toggle-vis').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.index, 10);
            const col = list[idx];
            if (!col || col.canHide === false) return;
            col.visible = !col.visible;
            renderColumnConfigList(container, list);
        };
    });

    container.querySelectorAll('.btn-col-move').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.index, 10);
            const action = btn.dataset.action;
            if (isNaN(idx)) return;
            const target = action === 'up' ? idx - 1 : idx + 1;
            if (target < 0 || target >= list.length) return;
            [list[idx], list[target]] = [list[target], list[idx]];
            renderColumnConfigList(container, list);
        };
    });
}

/**
 * Gắn sự kiện đóng/khôi phục/lưu cho modal
 */
export function bindColumnSettingsModal(prefix, { onReset, onSave }) {
    const modal = document.getElementById(`${prefix}-settings-modal`);
    if (!modal) return;
    const close = () => modal.classList.add('hidden');
    const x = document.getElementById(`${prefix}-settings-close-x`);
    const cancel = document.getElementById(`${prefix}-settings-cancel-btn`);
    const reset = document.getElementById(`${prefix}-settings-reset-btn`);
    const save = document.getElementById(`${prefix}-settings-save-btn`);
    if (x) x.onclick = close;
    if (cancel) cancel.onclick = close;
    if (reset) reset.onclick = () => onReset?.();
    if (save) save.onclick = () => { onSave?.(); close(); };

    let downOnBackdrop = false;
    modal.onmousedown = (e) => { downOnBackdrop = e.target === modal; };
    modal.onclick = (e) => { if (downOnBackdrop && e.target === modal) close(); downOnBackdrop = false; };
}
