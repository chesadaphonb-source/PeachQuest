// ⚠️ อัปเดต URL นี้เป็น URL ของ Web App ที่ deploy จาก Code.gs ใหม่ทุกครั้งที่ deploy ใหม่
const API_URL = 'https://script.google.com/macros/s/AKfycbykZTLrbAQnDfGVl8IyVXIiZbspxqcj2DggS2bFzSilzIM4EonuVBVQnNEnMwMwA68/exec';

// --- ช่างผู้รับผิดชอบ (ระบบนี้มีช่างคนเดียว จึง auto-assign ให้ทันทีตอนกด "รับเรื่อง") ---
const TECHNICIAN_NAME = 'นายพีรภัทร ด้วงสโมสร';

// --- ตัวแปรเก็บไฟล์รูปที่แนบในฟอร์มแจ้งซ่อม (ไม่เกิน 3 รูป) ---
let selectedPhotoFiles = [];

// --- ข้อมูลชั้นของแต่ละอาคาร ---
const buildingData = {
    "อาคาร 1": [
        "ชั้น 1",
        "ชั้นลอย",
        "ชั้น 2 (ห้องเรียน/ห้องประชุม)",
        "ชั้น 3 (ภาควิทย์)",
        "ชั้น 4 (ภาคเทคโน)",
        "ชั้น 5 (ภาคเทคโน)",
        "ชั้น 6 (ภาควิทย์)",
        "ชั้น 7"
    ],
    "อาคาร 2": [
        "ชั้น 1",
        "ชั้น 2",
        "ชั้น 3",
        "ชั้น 4"
    ]
};

// ฟังก์ชันอัปเดตตัวเลือกชั้น (เรียกใช้เมื่อเลือกอาคาร)
function updateFloors() {
    const buildingSelect = document.getElementById("location");
    const floorSelect = document.getElementById("floor");
    const selectedBuilding = buildingSelect.value;

    floorSelect.innerHTML = '<option value="" disabled selected>-- กรุณาเลือกชั้น --</option>';

    if (selectedBuilding && buildingData[selectedBuilding]) {
        floorSelect.disabled = false;
        floorSelect.classList.remove("bg-gray-50", "cursor-not-allowed");

        buildingData[selectedBuilding].forEach(floorName => {
            const option = document.createElement("option");
            option.value = floorName;
            option.textContent = floorName;
            floorSelect.appendChild(option);
        });
    } else {
        floorSelect.disabled = true;
        floorSelect.classList.add("bg-gray-50", "cursor-not-allowed");
        floorSelect.innerHTML = '<option value="" disabled selected>-- กรุณาเลือกอาคารก่อน --</option>';
    }
}

// ตัวแปรเก็บข้อมูลทั้งหมด (เอาไว้ใช้กรองเดือน โดยไม่ต้องโหลดใหม่)
let allTicketsCache = [];

// ==========================================
// 1. DATA MANAGEMENT (API)
// ==========================================

async function fetchTickets() {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching data:', error);
    return [];
  }
}

async function fetchRoomBookings() {
  try {
    const response = await fetch(API_URL + '?type=rooms');
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching room bookings:', error);
    return [];
  }
}

// จองห้องประชุม: ใช้ fetch แบบอ่าน response ได้จริง (ไม่ใช้ no-cors)
// เพื่อให้ backend ตอบกลับได้ว่าห้องไม่ว่าง/จองซ้อนหรือไม่
async function saveRoomBooking(bookingData) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'room_booking', ...bookingData })
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error saving room booking:', error);
    return { status: 'error', message: 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง' };
  }
}

async function saveTicketToSheet(ticketData) {
    await fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            "Content-Type": "text/plain",
        },
        body: JSON.stringify({ action: 'create', ...ticketData })
    });
    return true;
}

async function updateStatusInSheet(id, newStatus, technician) {
    await fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            "Content-Type": "text/plain",
        },
        body: JSON.stringify({ action: 'update', id: id, status: newStatus, technician: technician || '' })
    });
    return true;
}

// ==========================================
// 2. UI LOGIC (User & Admin)
// ==========================================
let currentView = 'user';

document.addEventListener('DOMContentLoaded', () => {
    const contactInput = document.getElementById('contact');

    const monthFilter = document.getElementById('monthFilter');
    const typeFilter = document.getElementById('typeFilter');
    if (monthFilter) monthFilter.addEventListener('change', applyFilters);
    if (typeFilter) typeFilter.addEventListener('change', applyFilters);
    if(contactInput) {
        contactInput.addEventListener('input', function() {
            this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
        });
    }

    const searchInput = document.getElementById('search-input');
    if(searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchTicket();
        });
    }

    flatpickr("#input_date", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "j F Y",
        minDate: "today",
        locale: "th",
        disableMobile: true
    });

    flatpickr("#input_time", {
      enableTime: true,
      noCalendar: true,
      dateFormat: "H:i",
      time_24hr: true,
      altInput: true,
      altFormat: "H:i น.",
      disableMobile: true
    });

    const isLoggedIn = localStorage.getItem('isAdminLoggedIn');
    if (isLoggedIn === 'true') {
        switchView('admin');
    }

    const roomContactInput = document.getElementById('room-contact');
    if (roomContactInput) {
      roomContactInput.addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
      });
    }

    // 🟢 จำกัดวันที่จองห้องให้เลือกได้ตั้งแต่วันนี้เป็นต้นไป
    const roomDateInput = document.getElementById('room-date');
    if (roomDateInput) {
      roomDateInput.min = new Date().toISOString().split('T')[0];
    }

    // 🟢 ตั้งค่าช่องแนบรูปภาพ (ไม่เกิน 3 รูป, ย่อขนาดอัตโนมัติ)
    const photosInput = document.getElementById('photos');
    if (photosInput) {
      photosInput.addEventListener('change', handlePhotoSelection);
    }
});

// ==========================================
// 📷 จัดการรูปภาพแนบ (บีบอัด + พรีวิว)
// ==========================================
async function handlePhotoSelection(e) {
    const files = Array.from(e.target.files || []);

    if (files.length > 3) {
        Swal.fire({ icon: 'warning', title: 'แนบได้สูงสุด 3 รูป', text: 'กรุณาเลือกรูปใหม่ไม่เกิน 3 รูป', confirmButtonColor: '#ea580c' });
        e.target.value = '';
        selectedPhotoFiles = [];
        renderPhotoPreview();
        return;
    }

    const previewEl = document.getElementById('photo-preview');
    if (previewEl) previewEl.innerHTML = '<div class="text-xs text-gray-400">กำลังประมวลผลรูปภาพ...</div>';

    try {
        selectedPhotoFiles = await Promise.all(files.map(file => compressImageToBase64(file)));
        renderPhotoPreview();
    } catch (err) {
        console.error('Photo compress error:', err);
        Swal.fire({ icon: 'error', title: 'ไม่สามารถประมวลผลรูปภาพได้', confirmButtonColor: '#ea580c' });
        selectedPhotoFiles = [];
        renderPhotoPreview();
    }
}

function compressImageToBase64(file, maxWidth = 1280, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve({
                    filename: file.name,
                    mimeType: 'image/jpeg',
                    base64: dataUrl.split(',')[1],
                    previewUrl: dataUrl
                });
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderPhotoPreview() {
    const previewEl = document.getElementById('photo-preview');
    if (!previewEl) return;
    if (selectedPhotoFiles.length === 0) {
        previewEl.innerHTML = '';
        return;
    }
    previewEl.innerHTML = selectedPhotoFiles.map((p, idx) => `
        <div class="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 shadow-sm group">
            <img src="${p.previewUrl}" class="w-full h-full object-cover">
            <button type="button" onclick="removePhoto(${idx})" class="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 text-white text-xs rounded-full flex items-center justify-center hover:bg-red-500 transition-colors">✕</button>
        </div>
    `).join('');
}

function removePhoto(index) {
    selectedPhotoFiles.splice(index, 1);
    renderPhotoPreview();
    // sync ค่าใน input file ไม่ได้โดยตรง แต่ selectedPhotoFiles คือค่าจริงที่จะถูกส่งไปตอน submit
}

// รหัสผ่านสำหรับระบบช่าง (ค่าปัจจุบัน: 1234)
const ENCRYPTED_PASS = "MTIzNA==";

function checkAdminPassword() {
    const isLoggedIn = localStorage.getItem('isAdminLoggedIn');

    if (isLoggedIn === 'true' || currentView === 'admin') {
        switchView('admin');
        return;
    }

    Swal.fire({
        title: '🔧 ยืนยันตัวตนช่าง',
        text: 'กรุณากรอกรหัสผ่านสำหรับเจ้าหน้าที่ช่าง',
        input: 'password',
        inputAttributes: {
            autocapitalize: 'off',
            placeholder: 'รหัสผ่าน...'
        },
        showCancelButton: true,
        confirmButtonText: 'เข้าสู่ระบบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#ea580c',
        showLoaderOnConfirm: true,
        preConfirm: (password) => {
            const inputEncrypted = btoa(password);
            if (inputEncrypted !== ENCRYPTED_PASS) {
                Swal.showValidationMessage('❌ รหัสผ่านไม่ถูกต้อง')
            }
            return inputEncrypted === ENCRYPTED_PASS;
        },
        allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.setItem('isAdminLoggedIn', 'true');
            switchView('admin');

            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });
            Toast.fire({
                icon: 'success',
                title: `เข้าสู่ระบบช่างเรียบร้อย (${TECHNICIAN_NAME})`
            });
        }
    });
}

function switchView(view) {
    currentView = view;
    document.getElementById('user-view').classList.toggle('hidden', view !== 'user');
    document.getElementById('admin-view').classList.toggle('hidden', view !== 'admin');

    const btnUser = document.getElementById('btn-user');
    const btnAdmin = document.getElementById('btn-admin');

    if (view === 'user') {
        btnUser.classList.add('bg-orange-600', 'text-white');
        btnUser.classList.remove('bg-white', 'text-gray-600');
        btnAdmin.classList.add('bg-white', 'text-gray-600');
        btnAdmin.classList.remove('bg-orange-600', 'text-white');
    } else {
        btnAdmin.classList.add('bg-orange-600', 'text-white');
        btnAdmin.classList.remove('bg-white', 'text-gray-600');
        btnUser.classList.add('bg-white', 'text-gray-600');
        btnUser.classList.remove('bg-orange-600', 'text-white');
        renderAdminView();
    }
}

function switchUserTab(tabName) {
    document.getElementById('form-section').classList.add('hidden');
    document.getElementById('calendar-section').classList.add('hidden');
    document.getElementById('track-section').classList.add('hidden');

    ['form', 'calendar', 'track'].forEach(t => {
        const btn = document.getElementById('tab-' + t);
        if (btn) {
            btn.classList.remove('bg-white', 'text-orange-600', 'ring-2', 'ring-orange-50');
            btn.classList.add('bg-gray-100', 'text-gray-500');
        }
    });

    const activeSection = document.getElementById(tabName + '-section');
    const activeBtn = document.getElementById('tab-' + tabName);

    if (activeSection) activeSection.classList.remove('hidden');

    if (activeBtn) {
        activeBtn.classList.remove('bg-gray-100', 'text-gray-500');
        activeBtn.classList.add('bg-white', 'text-orange-600', 'ring-2', 'ring-orange-50');
    }

    if (tabName === 'calendar') {
        const loadingEl = document.getElementById('calendar-loading');
        if (loadingEl) loadingEl.classList.remove('hidden');
        fetchTickets().then((tickets) => {
            allTicketsCache = tickets;

            if (typeof renderPublicCalendar === 'function') renderPublicCalendar();
            if (typeof initCalendar === 'function') initCalendar(allTicketsCache);
            if (loadingEl) loadingEl.classList.add('hidden');
        }).catch(err => {
            console.error('โหลดข้อมูลไม่สำเร็จ', err);
            if (loadingEl) loadingEl.classList.add('hidden');
        });
    }
}

// --- ส่วนจัดการฟอร์ม ---
document.getElementById('report-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const nameInput = document.getElementById('full-name');
    const contactInput = document.getElementById('contact');
    const emailInput = document.getElementById('email');
    const locationInput = document.getElementById('location');
    const floorInput = document.getElementById('floor');
    const problemInput = document.getElementById('problem');
    const detailsInput = document.getElementById('details');
    const dateInput = document.getElementById('input_date');
    const timeInput = document.getElementById('input_time');

    if (!nameInput || !problemInput) {
        console.error("หา Input ไม่เจอ! กรุณาเช็ค id ในไฟล์ HTML");
        return;
    }

    Swal.fire({
        title: 'กำลังส่งข้อมูล...',
        text: 'กรุณารอสักครู่ ระบบกำลังบันทึกข้อมูลคำร้องแจ้งซ่อม',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    const ticketId = 'MT' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');

    const formData = {
        id: ticketId,
        full_name: nameInput.value,
        contact: contactInput ? contactInput.value : '-',
        email: emailInput ? emailInput.value.trim() : '',
        location: locationInput ? locationInput.value : '-',
        floor: floorInput ? floorInput.value : '-',
        room: document.getElementById('room') ? document.getElementById('room').value : '',
        problem: problemInput.value,
        details: detailsInput ? detailsInput.value : '-',
        appointment_date: (function() {
            if (dateInput && timeInput && dateInput.value && timeInput.value) {
                return `${dateInput.value} ${timeInput.value}`;
            }
            return '';
        })(),
        photos: selectedPhotoFiles.map(p => ({ filename: p.filename, mimeType: p.mimeType, base64: p.base64 }))
    };

    try {
        await saveTicketToSheet(formData);
        allTicketsCache = await fetchTickets();
        Swal.fire({
            icon: 'success',
            title: 'ส่งแจ้งซ่อมบำรุงสำเร็จ!',
            html: `รหัสติดตามของคุณคือ: <br><b class="text-orange-600 text-3xl">${ticketId}</b><br><span class="text-sm text-gray-500">แคปหน้าจอนี้ไว้ตรวจสอบสถานะงานซ่อม</span>`,
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#ea580c'
        }).then(() => {
            document.getElementById('report-form').reset();
            if (typeof clearAppointment === 'function') {
                clearAppointment();
            }
            selectedPhotoFiles = [];
            renderPhotoPreview();
            switchUserTab('calendar');
        });
    } catch (err) {
        console.error(err);
        Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: 'ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
        });
    }
});

// --- ส่วนค้นหา ---
async function searchTicket() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const resultsDiv = document.getElementById('search-results');

    resultsDiv.innerHTML = '<div class="text-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div><p class="mt-2 text-gray-500">กำลังค้นหา...</p></div>';

    const allItems = await fetchTickets();

    if (!query) {
        if(allItems.length > 0) {
            renderSearchResults(allItems.slice(0, 5), resultsDiv);
        } else {
             resultsDiv.innerHTML = '<p class="text-center text-gray-400 py-8">ยังไม่มีข้อมูลในระบบ</p>';
        }
        return;
    }

    const found = allItems.filter(t => {
        const idVal = String(t.id || '').toLowerCase();
        const nameVal = String(t.full_name || '').toLowerCase();
        return idVal.includes(query) || nameVal.includes(query);
    });

    renderSearchResults(found, resultsDiv);
}

function renderSearchResults(tickets, container) {
    if (tickets.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8">
                <p class="text-gray-500">❌ ไม่พบข้อมูลที่ค้นหา</p>
            </div>`;
        return;
    }

    container.innerHTML = tickets.map(t => `
        <div class="bg-white rounded-xl p-4 border border-gray-200 mb-4 shadow-sm relative overflow-hidden">

            <div class="flex justify-between items-center mb-3 pb-2 border-b border-gray-50">
                <span class="font-mono text-xs font-bold text-gray-400 tracking-wider">#${t.id}</span>
                ${getStatusBadge(t.status)}
            </div>

            <div class="flex gap-3">
                <div class="flex-shrink-0 w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-xl border border-gray-100 shadow-sm">
                    ${getIcon(t.problem)}
                </div>

                <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-gray-800 text-base mb-1">${t.problem}</h4>

                    <div class="text-sm text-gray-600 space-y-1">
                        <p class="flex items-start gap-1.5">
                            <span class="text-gray-400 mt-0.5 text-xs">📍</span>
                            <span class="leading-snug">${t.location} <span class="text-gray-300">|</span> ชั้น ${t.floor}</span>
                        </p>
                        <p class="flex items-start gap-1.5">
                            <span class="text-gray-400 mt-0.5 text-xs">👤</span>
                            <span class="leading-snug">${t.full_name}</span>
                        </p>
                    </div>
                </div>
            </div>

            <div class="mt-3 pl-14"> <p class="text-xs text-gray-400 mb-2">แจ้งเมื่อ: ${formatDate(t.date)}</p>

                 ${t.details ? `
                 <div class="text-xs text-gray-500 bg-gray-50 p-2 rounded border border-gray-100 italic mb-2">
                    "${t.details}"
                 </div>` : ''}

                 ${t.assigned_technician ? `
                 <div class="flex items-center gap-2 bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg text-xs font-semibold border border-orange-100 mb-2">
                    🔧 ช่างผู้รับผิดชอบ: ${t.assigned_technician}
                 </div>
                 ` : ''}

                 ${renderPhotoLinks(t.photos)}

                 ${t.appointment_date ? `
                 <div class="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg text-sm font-semibold border border-emerald-100 shadow-sm">
                    📅 คิวเข้าซ่อม: ${formatDate(t.appointment_date)}
                 </div>
                 ` : ''}
            </div>

        </div>
    `).join('');
}

// ==========================================
// 3. ADMIN & FILTER LOGIC
// ==========================================

async function renderAdminView() {
    document.getElementById('tickets-list').innerHTML = '<div class="text-center py-12"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600 mx-auto"></div><p class="mt-4 text-gray-500">กำลังโหลดข้อมูล...</p></div>';
    allTicketsCache = await fetchTickets();
    setupMonthFilter(allTicketsCache);
    setupTypeFilter(allTicketsCache);
    applyFilters();
    renderRoomBookingsList();
}

async function renderRoomBookingsList() {
    const listDiv = document.getElementById('room-bookings-list');
    if (!listDiv) return;
    listDiv.innerHTML = '<div class="text-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div></div>';

    const bookings = await fetchRoomBookings();

    if (bookings.length === 0) {
        listDiv.innerHTML = '<div class="p-8 text-center text-gray-400">ยังไม่มีการจองห้องประชุม</div>';
        return;
    }

    const sorted = bookings.slice().sort((a, b) => {
        const dateA = new Date(`${a.booking_date}T${a.start_time || '00:00'}`);
        const dateB = new Date(`${b.booking_date}T${b.start_time || '00:00'}`);
        return dateA - dateB;
    });

    listDiv.innerHTML = sorted.map(b => `
        <div class="p-4 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
            <div class="flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-gray-800">${b.room}</span>
                    <span class="text-xs font-mono text-gray-400">#${b.id}</span>
                    <span class="px-2 py-0.5 rounded text-xs font-bold ${b.mode === 'ออนไลน์' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}">${b.mode === 'ออนไลน์' ? '💻 ออนไลน์' : '🧑‍🤝‍🧑 ออฟไลน์'}</span>
                </div>
                <p class="text-sm text-gray-600 mt-1">👤 ${b.full_name} • 📞 ${b.contact}</p>
                <p class="text-sm text-gray-600">📅 ${formatThaiDate(b.booking_date)} ⏰ ${b.start_time} - ${b.end_time} น.</p>
                <p class="text-sm text-gray-500 italic mt-1">"${b.purpose}"</p>
            </div>
        </div>
    `).join('');
}

function formatThaiDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function setupMonthFilter(data) {
    const filterSelect = document.getElementById('monthFilter');
    if (!filterSelect) return;
    filterSelect.innerHTML = '<option value="all">📅 ทั้งหมด</option>';
    if (data.length === 0) return;

    const months = new Set();
    data.forEach(ticket => {
        if(ticket.date) months.add(ticket.date.substring(0, 7));
    });

    const sortedMonths = Array.from(months).sort().reverse();
    const thaiMonthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

    sortedMonths.forEach(ym => {
        const [year, month] = ym.split('-');
        if(year && month) {
            const thaiYear = parseInt(year) + 543;
            const monthName = thaiMonthNames[parseInt(month) - 1];
            const option = document.createElement('option');
            option.value = ym;
            option.text = `${monthName} ${thaiYear}`;
            filterSelect.appendChild(option);
        }
    });
}

function setupTypeFilter(data) {
    const typeSelect = document.getElementById('typeFilter');
    if (!typeSelect) return;
    typeSelect.innerHTML = '<option value="all">🔧 ทุกประเภท</option>';
    if (data.length === 0) return;

    const types = new Set();
    data.forEach(ticket => {
        if(ticket.problem) types.add(ticket.problem);
    });

    const sortedTypes = Array.from(types).sort();
    sortedTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.text = `${getIcon(type)} ${type}`;
        typeSelect.appendChild(option);
    });
}

function applyFilters() {
    const monthVal = document.getElementById('monthFilter') ? document.getElementById('monthFilter').value : 'all';
    const typeVal = document.getElementById('typeFilter') ? document.getElementById('typeFilter').value : 'all';

    let filteredData = allTicketsCache;

    if (monthVal !== 'all') {
        filteredData = filteredData.filter(t => t.date && t.date.startsWith(monthVal));
    }
    if (typeVal !== 'all') {
        filteredData = filteredData.filter(t => t.problem === typeVal);
    }

    updateDashboardStats(filteredData);
    renderTicketList(filteredData);
}

function updateDashboardStats(data) {
    document.getElementById('stat-total').innerText = data.length;
    document.getElementById('stat-pending').innerText = data.filter(t => t.status === 'pending').length;
    document.getElementById('stat-completed').innerText = data.filter(t => t.status === 'completed').length;
    document.getElementById('stat-cancelled').innerText = data.filter(t => t.status === 'cancelled').length;
}

function renderTicketList(tickets) {
    const listDiv = document.getElementById('tickets-list');
    if (tickets.length === 0) {
        listDiv.innerHTML = '<div class="p-8 text-center text-gray-400">ไม่มีรายการในช่วงเวลานี้</div>';
        return;
    }
    listDiv.innerHTML = tickets.map(t => `
        <div class="p-4 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center border-b border-gray-100 last:border-0">
            <div class="flex items-start gap-3 w-full sm:w-2/3"> <div class="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-lg border border-orange-100 flex-shrink-0">${getIcon(t.problem)}</div>
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-gray-800">${t.problem}</span>
                        <span class="text-xs font-mono text-gray-400">#${t.id}</span>
                    </div>

                    ${t.assigned_technician ? `
                        <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-xs font-bold my-1">
                            🔧 ผู้รับผิดชอบ: ${t.assigned_technician}
                        </div>
                    ` : ''}

                    ${t.appointment_date ? `
                        <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs font-bold my-1">
                            📅 คิวเข้าซ่อม: ${formatDate(t.appointment_date)}
                        </div>
                    ` : ''}

                    <p class="text-sm text-gray-600">${t.location} ชั้น ${t.floor} • ${t.full_name}</p>

                    ${t.details ? `
                        <div class="mt-2 text-sm text-gray-600 bg-gray-100 p-2 rounded border border-gray-200 italic">
                            "${t.details}"
                        </div>
                    ` : ''}
                    ${renderPhotoLinks(t.photos)}
                    <p class="text-xs text-gray-400 mt-1">แจ้งเมื่อ: ${formatDate(t.date)}</p>
                </div>
            </div>
            <div class="flex flex-col sm:flex-row gap-2 w-full sm:w-auto mt-2 sm:mt-0 items-end">
                <div class="mb-2 sm:mb-0">${getStatusBadge(t.status)}</div>
                <div class="flex gap-1">
                    ${t.status === 'pending' ? `
                        <button onclick="changeStatus('${t.id}', 'in_progress')" class="px-3 py-1.5 bg-blue-500 text-white text-xs rounded shadow hover:bg-blue-600">🛠️ รับเรื่อง</button>
                        <button onclick="changeStatus('${t.id}', 'cancelled')" class="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded shadow hover:bg-gray-200">❌ ยกเลิก</button>
                    ` : ''}
                    ${t.status === 'in_progress' ? `
                        <button onclick="changeStatus('${t.id}', 'completed')" class="px-3 py-1.5 bg-emerald-500 text-white text-xs rounded shadow hover:bg-emerald-600">✅ เสร็จสิ้น</button>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

async function changeStatus(id, newStatus) {
    Swal.fire({ title: 'กำลังอัปเดต...', didOpen: () => Swal.showLoading() });
    try {
        // ตอนกด "รับเรื่อง" ระบบจะผูกชื่อช่างที่ล็อกอินอยู่ให้อัตโนมัติ (ระบบนี้มีช่างคนเดียว)
        const technician = (newStatus === 'in_progress') ? TECHNICIAN_NAME : undefined;
        await updateStatusInSheet(id, newStatus, technician);
        setTimeout(async () => {
            Swal.close();
            allTicketsCache = await fetchTickets();
            applyFilters();
            const msg = newStatus === 'completed'
                ? 'ปิดงานเรียบร้อย (ส่งอีเมลแจ้งผู้แจ้งแล้ว ถ้ามีอีเมลในระบบ)'
                : 'เรียบร้อย';
            Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 }).fire({ icon: 'success', title: msg });
        }, 1500);
    } catch (error) { Swal.close(); renderAdminView(); }
}

function getStatusBadge(status) {
    if (status === 'pending') return '<span class="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold border border-amber-200 whitespace-nowrap">⏳ รอดำเนินการ</span>';
    if (status === 'in_progress') return '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold border border-blue-200 whitespace-nowrap">🛠️ กำลังดำเนินการ</span>';
    if (status === 'completed') return '<span class="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200 whitespace-nowrap">✅ เสร็จสิ้น</span>';
    return '<span class="px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold border border-red-200 whitespace-nowrap">❌ ยกเลิก</span>';
}

function renderPhotoLinks(photosField) {
    if (!photosField) return '';
    const links = String(photosField).split(',').map(s => s.trim()).filter(Boolean);
    if (links.length === 0) return '';
    return `
        <div class="flex flex-wrap gap-2 my-2">
            ${links.map((url, idx) => `
                <a href="${url}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors">
                    📷 รูปที่ ${idx + 1}
                </a>
            `).join('')}
        </div>
    `;
}

function getIcon(problem) {
    const icons = {
        'Electricity': '⚡',
        'Plumbing': '🚰',
        'AirConditioner': '❄️',
        'Carpentry': '🪚',
        'Building': '🧱',
        'Other': '📦'
    };
    return icons[problem] || '🔧';
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const normalized = String(dateString).replace(' ', 'T');
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) + ' น.';
}

async function renderPublicCalendar() {
    const container = document.getElementById('calendar-grid');
    container.innerHTML = '<div class="col-span-full text-center py-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div><p class="mt-2 text-gray-500">กำลังดึงตารางงาน...</p></div>';

    let tickets = allTicketsCache.length > 0 ? allTicketsCache : await fetchTickets();

    const upcoming = tickets.filter(t =>
        t.status !== 'cancelled' && t.status !== 'completed'
    ).sort((a, b) => {
        const dateA = new Date(a.appointment_date || a.date);
        const dateB = new Date(b.appointment_date || b.date);
        return dateA - dateB;
    });

    if (upcoming.length === 0) {
        container.innerHTML = '<div class="col-span-full text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400">📅 ไม่มีคิวงานเร็วๆ นี้</div>';
        return;
    }

    container.innerHTML = upcoming.map(t => {
        const isAppointment = !!t.appointment_date;
        const showDate = t.appointment_date || t.date;
        const dateObj = new Date(showDate.replace(" ", "T"));

        const day = dateObj.getDate();
        const month = dateObj.toLocaleString('th-TH', { month: 'short' });
        const time = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const timeLabel = isAppointment ? "เวลานัด" : "เวลาแจ้ง";
        const timeLabelColor = isAppointment ? "text-emerald-600" : "text-gray-400";

        return `
        <div class="relative bg-white p-4 rounded-xl border ${isAppointment ? 'border-emerald-200 bg-emerald-50/30' : 'border-blue-100 bg-blue-50/30'} shadow-sm hover:shadow-md transition-all">
            <div class="flex items-start gap-3">

                <div class="flex flex-col items-center justify-center bg-white border border-gray-200 rounded-lg p-1 min-w-[70px] h-[85px]">
                    <span class="text-xs text-gray-500 -mb-1">${month}</span>
                    <span class="text-2xl font-bold ${isAppointment ? 'text-emerald-600' : 'text-blue-600'}">${day}</span>

                    <div class="flex flex-col items-center mt-1 w-full border-t border-gray-100 pt-1">
                        <span class="text-[9px] ${timeLabelColor} leading-none mb-0.5">${timeLabel}</span>
                        <span class="text-xs font-bold text-gray-700 leading-none">${time} น.</span>
                    </div>
                </div>

                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-xl">${getIcon(t.problem)}</span>
                        <span class="font-bold text-gray-800 line-clamp-1">${t.problem}</span>
                    </div>
                    <p class="text-sm text-gray-600 line-clamp-1">📍 ${t.location} ชั้น ${t.floor}</p>
                    <p class="text-xs text-gray-400 mt-1">แจ้งโดย: ${t.full_name}</p>
                    ${isAppointment
                        ? '<span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500"></span>'
                        : '<span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-400"></span>'
                    }
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function clearAppointment() {
    const dateInput = document.getElementById('input_date');
    const timeInput = document.getElementById('input_time');
    if (dateInput && dateInput._flatpickr) dateInput._flatpickr.clear();
    if (timeInput && timeInput._flatpickr) timeInput._flatpickr.clear();

    const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, timerProgressBar: true });
    Toast.fire({ icon: 'info', title: 'ล้างค่าวันนัดหมายแล้ว' });
}

function adminLogout() {
    Swal.fire({
        title: 'ออกจากระบบ?',
        text: "คุณต้องการออกจากระบบช่างใช่หรือไม่",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ใช่, ออกเลย',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#d33'
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem('isAdminLoggedIn');
            location.reload();
        }
    });
}

// ==========================================
// 🗓️ ระบบจองห้องประชุม
// ==========================================

document.getElementById('room-request-form').addEventListener('submit', async function(e) {
  e.preventDefault();

  const modeInput = document.querySelector('input[name="room-mode"]:checked');
  const startVal = document.getElementById('room-start').value;
  const endVal = document.getElementById('room-end').value;

  if (startVal >= endVal) {
    Swal.fire({ icon: 'warning', title: 'ช่วงเวลาไม่ถูกต้อง', text: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม', confirmButtonColor: '#ea580c' });
    return;
  }

  const bookingData = {
    id: 'RB' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0'),
    full_name: document.getElementById('room-name').value,
    contact: document.getElementById('room-contact').value,
    room: document.getElementById('room-select').value,
    booking_date: document.getElementById('room-date').value,
    start_time: startVal,
    end_time: endVal,
    mode: modeInput ? modeInput.value : '',
    purpose: document.getElementById('room-purpose').value
  };

  Swal.fire({
    title: 'กำลังตรวจสอบคิวห้อง...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  const result = await saveRoomBooking(bookingData);

  if (result.status === 'success') {
    Swal.fire({
      icon: 'success',
      title: 'จองห้องสำเร็จ!',
      html: `รหัสการจองของคุณคือ:<br><b class="text-orange-600 text-2xl">${bookingData.id}</b><br>
             <span class="text-sm text-gray-500">${bookingData.room} • ${bookingData.booking_date} เวลา ${bookingData.start_time}-${bookingData.end_time} น.</span>`,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#ea580c'
    }).then(() => {
      document.getElementById('room-request-form').reset();
      closeRoomModal();
    });
  } else {
    Swal.fire({
      icon: 'error',
      title: 'จองห้องไม่สำเร็จ',
      text: result.message || 'ห้องนี้อาจถูกจองในช่วงเวลานี้แล้ว กรุณาเลือกเวลาหรือห้องอื่น',
      confirmButtonColor: '#ea580c'
    });
  }
});
