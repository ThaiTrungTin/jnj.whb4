
import { sb, cache, currentUser, showLoading, showToast, showConfirm, DEFAULT_AVATAR_URL, updateSidebarAvatar, sanitizeFileName, onlineUsers, lastSeenMap, openAutocomplete } from './app.js';

let selectedAvatarFile = null;

const AVAILABLE_VIEWS = [
    { id: 'view-phat-trien', label: 'Tổng Quan' },
    { id: 'view-san-pham', label: 'Sản Phẩm' },
    { id: 'view-ton-kho', label: 'Tồn Kho' },
    { id: 'view-chi-tiet', label: 'Chi Tiết' },
    { id: 'view-request', label: 'Request' },
    { id: 'view-hang-no', label: 'Hàng Nợ' }
];

let currentSearchTerm = '';
let cachedEnrichedNganh = [];

/**
 * Loại bỏ dấu tiếng Việt để tìm kiếm đa năng không phụ thuộc dấu
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

/**
 * Kiểm tra xem người dùng có khớp với từ khóa tìm kiếm đa năng không
 */
function matchesUser(user, term) {
    if (!term) return true;
    const cleanTerm = removeVietnameseTones(term);
    const nameNorm = removeVietnameseTones(user.ho_ten || '');
    const emailNorm = String(user.gmail || '').toLowerCase();
    const roleNorm = removeVietnameseTones(user.phan_quyen || '');
    const statusNorm = removeVietnameseTones(user.stt || '');
    const viewNorm = removeVietnameseTones(user.xem_view || '');
    const dataNorm = removeVietnameseTones(user.xem_data || '');

    // Kiểm tra trạng thái hiện diện online/offline
    const presence = onlineUsers.get(user.gmail);
    const status = presence ? (presence.status || 'online') : 'offline';
    const statusLabel = status === 'online' ? 'dang hoat dong online' : (status === 'away' ? 'vang mat away' : 'ngoai tuyen offline');

    return (
        nameNorm.includes(cleanTerm) ||
        emailNorm.includes(cleanTerm) ||
        roleNorm.includes(cleanTerm) ||
        statusNorm.includes(cleanTerm) ||
        viewNorm.includes(cleanTerm) ||
        dataNorm.includes(cleanTerm) ||
        statusLabel.includes(cleanTerm)
    );
}

/**
 * Hàm mở Droplist Checklist (Popover) - Tối ưu nhỏ gọn, chuẩn Enterprise ERP, không màu mè AI
 */
function openMultiSelectDroplist(button, options, currentSelected, onApply, title = 'Lựa chọn') {
    if (!button) return;
    const oldPopover = document.getElementById('settings-droplist-popover');
    if (oldPopover) oldPopover.remove();

    const popover = document.createElement('div');
    popover.id = 'settings-droplist-popover';
    const isMobile = window.innerWidth <= 768;

    popover.className = isMobile
        ? 'fixed inset-x-4 top-20 bottom-20 z-[100] bg-white border border-slate-200 rounded-xl shadow-xl p-3 flex flex-col'
        : 'fixed z-[100] bg-white border border-slate-200 rounded-xl shadow-xl p-3 flex flex-col w-[300px] text-xs';

    if (!isMobile) {
        const rect = button.getBoundingClientRect();
        let top = rect.bottom + 6;
        let left = rect.left;
        if (left + 300 > window.innerWidth) left = window.innerWidth - 315;
        if (top + 340 > window.innerHeight) top = rect.top - 340;
        popover.style.top = `${Math.max(10, top)}px`;
        popover.style.left = `${Math.max(10, left)}px`;
    }

    const selectedSet = new Set(currentSelected.map(s => s.trim()).filter(Boolean));

    popover.innerHTML = `
        <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <span class="font-bold text-slate-800 text-xs">${title}</span>
            <button id="droplist-close" type="button" class="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors text-base leading-none">&times;</button>
        </div>
        
        <div class="relative mb-2">
            <input type="text" id="droplist-search" placeholder="Lọc nhanh..." 
                class="w-full pl-7 pr-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
            <svg class="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
        </div>

        <div class="flex items-center justify-between text-[11px] text-slate-500 mb-1.5 px-0.5">
            <span id="droplist-count-info">Đã chọn: <b class="text-blue-600" id="droplist-selected-count">${selectedSet.size}</b>/${options.length}</span>
            <div class="flex items-center gap-2">
                <button type="button" id="droplist-select-all" class="text-blue-600 hover:underline font-medium">Tất cả</button>
                <span class="text-slate-300">|</span>
                <button type="button" id="droplist-clear-all" class="text-slate-500 hover:text-red-600 font-medium">Bỏ chọn</button>
            </div>
        </div>

        <div id="droplist-items" class="max-h-[220px] overflow-y-auto space-y-0.5 border border-slate-100 rounded-md p-1 bg-slate-50/50">
            ${options.map(opt => `
                <label class="flex items-center px-2 py-1.5 hover:bg-blue-50/80 rounded cursor-pointer transition-colors text-xs text-slate-700">
                    <input type="checkbox" value="${opt.id}" class="droplist-cb w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-0 mr-2 cursor-pointer" ${selectedSet.has(opt.id) ? 'checked' : ''}>
                    <span class="flex-1 truncate font-medium">${opt.label}</span>
                    ${opt.subInfo ? `<span class="text-[10px] text-slate-400 ml-1.5 flex-shrink-0">${opt.subInfo}</span>` : ''}
                </label>
            `).join('')}
        </div>

        <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button type="button" id="droplist-cancel" class="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-md transition-colors font-medium">Hủy</button>
            <button type="button" id="droplist-apply" class="px-3.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold transition-colors shadow-sm">Xác nhận</button>
        </div>
    `;

    document.body.appendChild(popover);

    const countEl = popover.querySelector('#droplist-selected-count');
    const updateCount = () => {
        const count = popover.querySelectorAll('.droplist-cb:checked').length;
        if (countEl) countEl.textContent = count;
    };

    popover.querySelectorAll('.droplist-cb').forEach(cb => cb.addEventListener('change', updateCount));

    const searchInput = popover.querySelector('#droplist-search');
    searchInput.focus();
    searchInput.oninput = (e) => {
        const term = removeVietnameseTones(e.target.value);
        popover.querySelectorAll('#droplist-items label').forEach(label => {
            const text = removeVietnameseTones(label.textContent);
            label.classList.toggle('hidden', !text.includes(term));
        });
    };

    popover.querySelector('#droplist-select-all').onclick = () => {
        popover.querySelectorAll('#droplist-items label:not(.hidden) .droplist-cb').forEach(cb => cb.checked = true);
        updateCount();
    };

    popover.querySelector('#droplist-clear-all').onclick = () => {
        popover.querySelectorAll('.droplist-cb').forEach(cb => cb.checked = false);
        updateCount();
    };

    popover.querySelector('#droplist-close').onclick = () => popover.remove();
    popover.querySelector('#droplist-cancel').onclick = () => popover.remove();

    popover.querySelector('#droplist-apply').onclick = () => {
        const checkedValues = Array.from(popover.querySelectorAll('.droplist-cb:checked')).map(cb => cb.value);
        onApply(checkedValues);
        popover.remove();
    };

    const closeHandler = (e) => {
        if (!isMobile && !popover.contains(e.target) && !button.contains(e.target)) {
            popover.remove();
            document.removeEventListener('mousedown', closeHandler);
        }
    };
    if (!isMobile) setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);
}

// Hiển thị khoảng thời gian kể từ timestamp ISO (ví dụ "2 giờ trước")
function formatTimeAgo(isoString) {
    try {
        const then = new Date(isoString).getTime();
        const now = Date.now();
        const diff = Math.max(0, Math.floor((now - then) / 1000)); // seconds
        if (diff < 60) return `${diff}s trước`;
        const mins = Math.floor(diff / 60);
        if (mins < 60) return `${mins} phút trước`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} giờ trước`;
        const days = Math.floor(hours / 24);
        return `${days} ngày trước`;
    } catch (e) {
        return '';
    }
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const ho_ten = document.getElementById('profile-ho-ten').value.trim();
    const old_password = document.getElementById('profile-old-password').value;
    const new_password = document.getElementById('profile-new-password').value;
    const confirm_password = document.getElementById('profile-confirm-password').value;
    let anh_dai_dien_url = document.getElementById('profile-current-avatar-url').value;

    showLoading(true);
    try {
        // Cập nhật mật khẩu qua Supabase Auth nếu người dùng nhập mật khẩu mới
        if (new_password) {
            if (new_password.length < 6) {
                showToast("Mật khẩu mới phải từ 6 ký tự trở lên.", 'error');
                showLoading(false);
                return;
            }
            if (new_password !== confirm_password) {
                showToast("Mật khẩu mới không khớp.", 'error');
                showLoading(false);
                return;
            }
            const { error: authPwdErr } = await sb.auth.updateUser({ password: new_password });
            if (authPwdErr) {
                console.warn("Auth updateUser error:", authPwdErr.message);
            }
        }

        if (selectedAvatarFile) {
            const fileName = sanitizeFileName(`${currentUser.gmail}-${Date.now()}-${selectedAvatarFile.name}`);
            const { error: uploadError } = await sb.storage.from('anh_dai_dien').upload(`public/${fileName}`, selectedAvatarFile);
            if (uploadError) throw uploadError;
            const { data: urlData } = sb.storage.from('anh_dai_dien').getPublicUrl(`public/${fileName}`);
            anh_dai_dien_url = urlData.publicUrl;
        }

        const updateData = { ho_ten, anh_dai_dien_url };

        const { data, error } = await sb.from('user').update(updateData).eq('gmail', currentUser.gmail).select().single();
        if (error) throw error;

        Object.assign(currentUser, data);
        sessionStorage.setItem('loggedInUser', JSON.stringify(data));

        document.getElementById('user-ho-ten').textContent = data.ho_ten;
        updateSidebarAvatar(data.anh_dai_dien_url);
        initProfileAvatarState();

        // Reset trường mật khẩu sau khi lưu thành công
        document.getElementById('profile-old-password').value = '';
        document.getElementById('profile-new-password').value = '';
        document.getElementById('profile-confirm-password').value = '';

        showToast("Đã cập nhật thông tin cá nhân!", "success");
        closeProfileModal();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        showLoading(false);
    }
}

export async function fetchUsers() {
    const [{ data: users, error: userErr }, { data: nganhData, error: nganhErr }] = await Promise.all([
        sb.from('user').select('*').order('ho_ten'),
        sb.from('san_pham').select('nganh, phu_trach')
    ]);
    if (userErr) console.warn('fetchUsers user error:', userErr);
    if (nganhErr) console.warn('fetchUsers nganh error:', nganhErr);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const safeUsers = (users || []).filter(u => u && u.gmail && emailRegex.test(u.gmail.trim()));
    const industryMap = new Map();
    (nganhData || []).forEach(item => { if (item.nganh && !industryMap.has(item.nganh)) industryMap.set(item.nganh, item.phu_trach || ''); });
    const enrichedNganh = Array.from(industryMap, ([nganh, pt]) => ({ id: nganh, label: nganh, subInfo: pt })).sort((a, b) => a.label.localeCompare(b.label));
    cache.userList = safeUsers;
    cachedEnrichedNganh = enrichedNganh;

    // populate lastSeenMap from persisted DB values so last-online survives reloads
    try {
        safeUsers.forEach(u => {
            if (u && u.gmail && u.last_online_at) {
                lastSeenMap.set(u.gmail, u.last_online_at);
            }
        });
    } catch (e) {
        console.debug('populate lastSeenMap error', e);
    }

    // Xóa triệt để giá trị autofill mặc định của trình duyệt nếu có
    const searchInput = document.getElementById('user-omni-search');
    if (searchInput) {
        if (searchInput.value === currentUser?.gmail || !currentSearchTerm) {
            searchInput.value = '';
            currentSearchTerm = '';
            const searchClear = document.getElementById('user-omni-search-clear');
            if (searchClear) searchClear.classList.add('hidden');
        }
    }

    filterAndRenderUsers();
}

export function filterAndRenderUsers() {
    const rawUsers = cache.userList || [];
    const term = currentSearchTerm.trim();
    const filteredUsers = term ? rawUsers.filter(u => matchesUser(u, term)) : rawUsers;
    renderUserList(filteredUsers, cachedEnrichedNganh, Boolean(term), rawUsers.length);
}

function renderUserList(users, allNganhEnriched, isSearching = false, totalCount = 0) {
    const container = document.getElementById('user-list-body');
    if (!container) return;
    container.innerHTML = '';

    const totalBadge = document.getElementById('user-total-badge');
    if (totalBadge) {
        if (isSearching) {
            totalBadge.textContent = `${users.length} / ${totalCount} thành viên`;
        } else {
            totalBadge.textContent = `${users.length} thành viên`;
        }
    }

    if (users.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="6" class="py-10 text-center text-slate-400">
                <div class="flex flex-col items-center justify-center gap-1.5">
                    <svg class="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <span class="text-xs font-medium text-slate-500">Không tìm thấy thành viên nào phù hợp</span>
                    <span class="text-[11px] text-slate-400">Thử tìm theo tên, email, vai trò, menu view hoặc ngành...</span>
                </div>
            </td>
        `;
        container.appendChild(tr);
        return;
    }

    const statusPriority = (gmail) => {
        const presence = onlineUsers.get(gmail);
        const status = presence ? (presence.status || 'online') : 'offline';
        if (status === 'online') return 0;
        if (status === 'away') return 1;
        return 2;
    };

    const myEmail = String(currentUser?.gmail || '').trim().toLowerCase();

    // Sắp xếp: Nếu người dùng cá nhân (currentUser) có trong danh sách hiển thị, luôn ưu tiên hiển thị ở TRÊN CÙNG
    const sortedUsers = [...users].sort((a, b) => {
        const aEmail = String(a.gmail || '').trim().toLowerCase();
        const bEmail = String(b.gmail || '').trim().toLowerCase();
        const aIsMe = aEmail === myEmail;
        const bIsMe = bEmail === myEmail;
        if (aIsMe) return -1;
        if (bIsMe) return 1;
        return statusPriority(a.gmail) - statusPriority(b.gmail);
    });

    sortedUsers.forEach(user => {
        const userEmail = String(user.gmail || '').trim().toLowerCase();
        const isMe = userEmail === myEmail;
        const viewCnt = (user.xem_view || '').split(',').filter(Boolean).length;
        const dataCnt = (user.xem_data || '').split(',').filter(Boolean).length;
        const isLocked = user.stt === 'Khóa';

        const presence = onlineUsers.get(user.gmail);
        const status = presence ? (presence.status || 'online') : 'offline';
        let statusDotClass = 'bg-slate-300';
        let statusBadgeText = 'Ngoại tuyến';
        let statusTextClass = 'text-slate-500';

        if (status === 'online') {
            statusDotClass = 'bg-emerald-500';
            statusBadgeText = 'Đang hoạt động';
            statusTextClass = 'text-emerald-600 font-medium';
        } else if (status === 'away') {
            statusDotClass = 'bg-amber-400';
            statusBadgeText = 'Vắng mặt';
            statusTextClass = 'text-amber-600 font-medium';
        }

        const lastSeenIso = (presence && presence.online_at) ? presence.online_at : (lastSeenMap.get(user.gmail) || '');
        const lastSeenText = (status === 'offline' && lastSeenIso) ? ` • ${formatTimeAgo(lastSeenIso)}` : '';

        const tr = document.createElement('tr');
        tr.className = isMe 
            ? 'bg-blue-50/50 hover:bg-blue-50/80 transition-colors' 
            : (isLocked ? 'bg-red-50/30 hover:bg-red-50/50 transition-colors' : 'hover:bg-slate-50/80 transition-colors');

        tr.innerHTML = `
            <td class="py-2.5 px-3.5 whitespace-nowrap">
                <div class="flex items-center gap-2.5">
                    <div class="relative flex-shrink-0">
                        <img src="${user.anh_dai_dien_url || DEFAULT_AVATAR_URL}" class="w-8 h-8 rounded-full object-cover border border-slate-200">
                        <span class="absolute -bottom-0.5 -right-0.5 block h-2 w-2 rounded-full ${statusDotClass} ring-2 ring-white"></span>
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="font-semibold text-slate-800 truncate">${user.ho_ten || 'Chưa đặt tên'}</span>
                            ${isMe ? '<span class="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.2 rounded">Bạn</span>' : ''}
                            ${isLocked ? '<span class="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.2 rounded">Khóa</span>' : ''}
                        </div>
                        <p class="text-[11px] text-slate-400 truncate">${user.gmail || ''}</p>
                    </div>
                </div>
            </td>

            <td class="py-2.5 px-3 whitespace-nowrap">
                <div class="flex items-center gap-1.5 ${statusTextClass}">
                    <span class="w-1.5 h-1.5 rounded-full ${statusDotClass}"></span>
                    <span>${statusBadgeText}${lastSeenText}</span>
                </div>
            </td>

            <td class="py-2.5 px-3 whitespace-nowrap">
                <select data-gmail="${user.gmail}" class="user-role-select bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors cursor-pointer" ${isMe ? 'disabled' : ''}>
                    <option value="Admin" ${user.phan_quyen === 'Admin' ? 'selected' : ''}>Admin</option>
                    <option value="User" ${user.phan_quyen === 'User' ? 'selected' : ''}>User</option>
                    <option value="View" ${user.phan_quyen === 'View' ? 'selected' : ''}>View</option>
                </select>
            </td>

            <td class="py-2.5 px-3 whitespace-nowrap text-center">
                <button type="button" class="trigger-view-list inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium text-xs transition-colors" data-gmail="${user.gmail}">
                    <span>${viewCnt} view</span>
                    <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-width="2" stroke-linecap="round"></path></svg>
                </button>
            </td>

            <td class="py-2.5 px-3 whitespace-nowrap text-center">
                <button type="button" class="trigger-data-list inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium text-xs transition-colors" data-gmail="${user.gmail}">
                    <span>${dataCnt > 0 ? `${dataCnt} ngành` : (user.phan_quyen === 'Admin' ? 'Tất cả' : '0 ngành')}</span>
                    <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-width="2" stroke-linecap="round"></path></svg>
                </button>
            </td>

            <td class="py-2.5 px-3 whitespace-nowrap text-right relative">
                <button type="button" data-gmail="${user.gmail}" class="user-options-btn p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg>
                </button>
                <div id="popover-${user.gmail.replace(/[@.]/g, '')}" class="hidden absolute right-3 top-9 w-40 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 text-left">
                    <button class="change-name-btn flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50" data-gmail="${user.gmail}" data-name="${user.ho_ten}">
                        <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        Đổi tên
                    </button>
                    <div class="h-px bg-slate-100 my-1"></div>
                    <button class="user-status-option flex items-center gap-2 w-full px-3 py-1.5 text-xs ${isLocked ? 'text-emerald-600' : 'text-amber-600'} hover:bg-slate-50" data-gmail="${user.gmail}" data-status="${isLocked ? 'Đã Duyệt' : 'Khóa'}">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                        ${isLocked ? 'Mở khóa' : 'Khóa tài khoản'}
                    </button>
                    <button class="user-delete-option flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 font-semibold hover:bg-red-50" data-gmail="${user.gmail}">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        Xóa tài khoản
                    </button>
                </div>
            </td>
        `;

        tr.querySelector('.trigger-view-list').onclick = (e) => {
            openMultiSelectDroplist(e.currentTarget, AVAILABLE_VIEWS, (user.xem_view || '').split(','), async (vals) => {
                showLoading(true);
                const { error } = await sb.from('user').update({ xem_view: vals.join(',') }).eq('gmail', user.gmail);
                if (!error) {
                    user.xem_view = vals.join(',');
                    filterAndRenderUsers();
                    showToast("Đã cập nhật phân quyền view.", "success");
                }
                showLoading(false);
            }, 'Phân quyền Menu View');
        };

        tr.querySelector('.trigger-data-list').onclick = (e) => {
            openMultiSelectDroplist(e.currentTarget, allNganhEnriched, (user.xem_data || '').split(','), async (vals) => {
                showLoading(true);
                const { error } = await sb.from('user').update({ xem_data: vals.join(',') }).eq('gmail', user.gmail);
                if (!error) {
                    user.xem_data = vals.join(',');
                    filterAndRenderUsers();
                    showToast("Đã cập nhật phân quyền ngành.", "success");
                }
                showLoading(false);
            }, 'Phân quyền Dữ liệu Ngành');
        };

        container.appendChild(tr);
    });
}

async function handleUpdateUserStatus(gmail, status) {
    showLoading(true);
    const { error } = await sb.from('user').update({ stt: status }).eq('gmail', gmail);
    showLoading(false);
    if (!error) { showToast(status === 'Khóa' ? "Đã khóa." : "Đã mở.", 'success'); fetchUsers(); }
}

async function handleDeleteUser(gmail) {
    const confirmed = await showConfirm(`Xóa tài khoản ${gmail}?`);
    if (!confirmed) return;
    showLoading(true);
    const { error } = await sb.from('user').delete().eq('gmail', gmail);
    showLoading(false);
    if (!error) { showToast("Đã xóa.", 'success'); fetchUsers(); }
}

export async function initProfileAvatarState() {
    selectedAvatarFile = null;
    const preview = document.getElementById('profile-image-preview');
    const removeBtn = document.getElementById('profile-remove-image-btn');
    const urlInput = document.getElementById('profile-current-avatar-url');
    preview.src = currentUser.anh_dai_dien_url || DEFAULT_AVATAR_URL;
    urlInput.value = currentUser.anh_dai_dien_url || '';
    removeBtn.classList.toggle('hidden', !currentUser.anh_dai_dien_url);

    const container = document.getElementById('profile-user-data-access-container');
    if (currentUser.phan_quyen === 'User') {
        container.classList.remove('hidden');
        renderProfileDataTrigger();
    } else {
        container.classList.add('hidden');
    }
}

async function renderProfileDataTrigger() {
    const optionsContainer = document.getElementById('profile-xem-data-options');
    if (!optionsContainer) return;
    optionsContainer.className = "mt-2";
    const dataCount = (currentUser.xem_data || '').split(',').filter(Boolean).length;

    optionsContainer.innerHTML = `
        <button type="button" id="profile-data-droplist-btn" class="w-full flex justify-between items-center bg-white border border-blue-100 p-2.5 rounded-xl active:bg-blue-50 transition-all shadow-sm">
            <div class="flex items-center space-x-2.5">
                <div class="bg-blue-600 p-1.5 rounded-lg shadow-sm">
                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <div class="text-left">
                    <p class="text-[11px] font-bold text-gray-800 leading-tight">Ngành theo dõi</p>
                    <p class="text-[9px] text-gray-400 font-medium">Đã chọn: <span class="text-blue-600">${dataCount}</span></p>
                </div>
            </div>
            <svg class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"></path></svg>
        </button>
    `;

    document.getElementById('profile-data-droplist-btn').onclick = async (e) => {
        const targetBtn = e.currentTarget;
        showLoading(true);
        try {
            const { data: nganhData } = await sb.from('san_pham').select('nganh, phu_trach');
            const industryMap = new Map();
            (nganhData || []).forEach(item => { if (item.nganh && !industryMap.has(item.nganh)) industryMap.set(item.nganh, item.phu_trach || ''); });
            const enrichedNganh = Array.from(industryMap, ([nganh, pt]) => ({ id: nganh, label: nganh, subInfo: pt })).sort((a, b) => a.label.localeCompare(b.label));
            showLoading(false);
            openMultiSelectDroplist(targetBtn, enrichedNganh, (currentUser.xem_data || '').split(','), async (vals) => {
                showLoading(true);
                const { data, error } = await sb.from('user').update({ xem_data: vals.join(',') }).eq('gmail', currentUser.gmail).select().single();
                if (!error) {
                    Object.assign(currentUser, data);
                    sessionStorage.setItem('loggedInUser', JSON.stringify(data));
                    renderProfileDataTrigger();
                    showToast("Đã lưu.", "success");
                }
                showLoading(false);
            });
        } catch (err) { showLoading(false); showToast("Lỗi tải.", "error"); }
    };
}

async function handleBackupExcel() {
    const confirmed = await showConfirm("Tải Excel backup?");
    if (!confirmed) return;
    showLoading(true);
    try {
        const tables = ['user', 'san_pham', 'ton_kho', 'chi_tiet'];
        const wb = XLSX.utils.book_new();
        for (const table of tables) {
            const { data } = await sb.from(table).select('*').limit(50000);
            if (data) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), table);
        }
        XLSX.writeFile(wb, `Backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast("Xong.", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { showLoading(false); }
}

export function initCaiDatView() {
    // --- BỘ LỌC TÌM KIẾM ĐA NĂNG THÀNH VIÊN ---
    const searchInput = document.getElementById('user-omni-search');
    const searchClear = document.getElementById('user-omni-search-clear');

    if (searchInput) {
        // Xóa sạch giá trị tìm kiếm khi khởi tạo, tránh bị trình duyệt tự điền email cá nhân
        searchInput.value = '';
        currentSearchTerm = '';
        if (searchClear) searchClear.classList.add('hidden');

        searchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value || '';
            if (searchClear) searchClear.classList.toggle('hidden', !currentSearchTerm);
            filterAndRenderUsers();
        });

        // Chống autofill trình duyệt tự động điền tài khoản đã lưu sau 100-200ms
        setTimeout(() => {
            if (searchInput.value === currentUser?.gmail || (!currentSearchTerm && searchInput.value.includes('@'))) {
                searchInput.value = '';
                currentSearchTerm = '';
                if (searchClear) searchClear.classList.add('hidden');
                filterAndRenderUsers();
            }
        }, 150);
    }

    if (searchClear) {
        searchClear.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            currentSearchTerm = '';
            searchClear.classList.add('hidden');
            filterAndRenderUsers();
        });
    }

    document.getElementById('profile-form').addEventListener('submit', handleProfileUpdate);
    document.getElementById('user-list-body').addEventListener('change', e => {
        if (e.target.classList.contains('user-role-select')) {
            const gmail = e.target.dataset.gmail;
            const newRole = e.target.value;
            sb.from('user').update({ phan_quyen: newRole }).eq('gmail', gmail).then(() => {
                showToast("Đã đổi quyền.", "success");
                fetchUsers();
            });
        }
    });

    document.getElementById('user-list-body').addEventListener('click', e => {
        const optBtn = e.target.closest('.user-options-btn');
        if (optBtn) {
            const gmail = optBtn.dataset.gmail;
            const popId = `popover-${gmail.replace(/[@.]/g, '')}`;
            document.querySelectorAll('[id^="popover-"]').forEach(p => { if (p.id !== popId) p.classList.add('hidden'); });
            document.getElementById(popId).classList.toggle('hidden');
            return;
        }
        const changeNameBtn = e.target.closest('.change-name-btn');
        if (changeNameBtn) {
            document.getElementById('change-name-gmail').value = changeNameBtn.dataset.gmail;
            document.getElementById('change-name-gmail-display').textContent = changeNameBtn.dataset.gmail;
            document.getElementById('change-name-input').value = changeNameBtn.dataset.name;
            document.getElementById('change-name-modal').classList.remove('hidden');
            return;
        }

        const statusBtn = e.target.closest('.user-status-option');
        if (statusBtn) handleUpdateUserStatus(statusBtn.dataset.gmail, statusBtn.dataset.status);
        const delBtn = e.target.closest('.user-delete-option');
        if (delBtn) handleDeleteUser(delBtn.dataset.gmail);
    });

    document.getElementById('change-name-form').addEventListener('submit', async e => {
        e.preventDefault();
        const gmail = document.getElementById('change-name-gmail').value;
        const newName = document.getElementById('change-name-input').value.trim();
        if (!newName) return;
        showLoading(true);
        const { error } = await sb.from('user').update({ ho_ten: newName }).eq('gmail', gmail);
        showLoading(false);
        if (!error) {
            showToast("Đã đổi tên.", 'success');
            document.getElementById('change-name-modal').classList.add('hidden');
            fetchUsers();
        } else {
            showToast("Lỗi khi đổi tên.", 'error');
        }
    });
    
    document.getElementById('cancel-change-name-btn').onclick = () => document.getElementById('change-name-modal').classList.add('hidden');
    document.getElementById('backup-excel-btn').onclick = handleBackupExcel;

    const processAvatar = (file) => {
        if (file && file.type.startsWith('image/')) {
            selectedAvatarFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('profile-image-preview').src = e.target.result;
                document.getElementById('profile-remove-image-btn').classList.remove('hidden');
                document.getElementById('profile-current-avatar-url').value = 'new';
            };
            reader.readAsDataURL(file);
        }
    };
    document.getElementById('profile-image-upload').onchange = (e) => processAvatar(e.target.files[0]);
    document.getElementById('profile-image-paste-area').onpaste = (e) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) processAvatar(items[i].getAsFile()); }
    };
    document.getElementById('profile-remove-image-btn').onclick = () => {
        selectedAvatarFile = null;
        document.getElementById('profile-image-preview').src = DEFAULT_AVATAR_URL;
        document.getElementById('profile-remove-image-btn').classList.add('hidden');
        document.getElementById('profile-current-avatar-url').value = '';
    };

    document.getElementById('close-profile-modal-btn')?.addEventListener('click', closeProfileModal);
    document.getElementById('profile-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'profile-modal') closeProfileModal();
    });
    document.getElementById('btn-open-profile-from-settings')?.addEventListener('click', openProfileModal);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-options-btn') && !e.target.closest('[id^="popover-"]')) {
            document.querySelectorAll('[id^="popover-"]').forEach(p => p.classList.add('hidden'));
        }
    });
}

export function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    const hoTenInput = document.getElementById('profile-ho-ten');
    if (hoTenInput && currentUser) hoTenInput.value = currentUser.ho_ten || '';
    initProfileAvatarState();
    modal.classList.remove('hidden');
}

export function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.add('hidden');
}
