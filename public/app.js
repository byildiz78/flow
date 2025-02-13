// Initialize Socket.IO connection
const socket = io();

// DOM Elements
const emailList = document.getElementById('email-list');
const notificationToast = document.getElementById('notification-toast');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const statusFilter = document.getElementById('status-filter');
const startDateFilter = document.getElementById('start-date');
const endDateFilter = document.getElementById('end-date');
const clearFilters = document.getElementById('clear-filters');
const loadMoreBtn = document.querySelector('#load-more button');
const loadingSpinner = document.querySelector('.loading-spinner');

// Bootstrap toast instance
const toast = new bootstrap.Toast(notificationToast);

// Global state
let currentPage = 1;
let pageSize = 10;
let totalEmails = 0;
let currentSearch = '';
let currentStatusFilter = '';
let currentStartDate = '';
let currentEndDate = '';

// Track statistics
let stats = {
    total: 0,
    success: 0
};

// Global variables for filters
let currentFilters = {
    search: '',
    status: '',
    date: ''
};

// Global variable for current email ID
let currentEmailId = null;

// Show notification
function showNotification(message, type = 'success') {
    const toastBody = notificationToast.querySelector('.toast-body');
    toastBody.textContent = message;
    notificationToast.classList.remove('bg-success', 'bg-danger');
    notificationToast.classList.add(type === 'success' ? 'bg-success' : 'bg-danger', 'text-white');
    toast.show();
}

// Update statistics
function updateStatistics(data) {
    const total = data.total || 0;
    const successCount = data.successCount || 0;
    const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;

    document.getElementById('total-emails').textContent = total;
    document.getElementById('success-rate').textContent = `${successRate}%`;
}

// Format date
function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return dateString;
    }
}

// Create email row
function createEmailRow(email) {
    const tr = document.createElement('tr');
    tr.dataset.emailId = email.id;
    
    tr.innerHTML = `
        <td class="date-col">
            <div class="d-flex align-items-center">
                ${email.flagged ? '<i class="bi bi-flag-fill text-danger me-2"></i>' : ''}
                <span>${formatDate(email.received_date)}</span>
            </div>
        </td>
        <td class="sender-col" title="${email.from_address}">${email.from_address}</td>
        <td class="subject-col" title="${email.subject || ''}">${email.subject || ''}</td>
        <td class="status-col">
            <span class="badge ${email.flow_status === 1 ? 'bg-success' : email.flow_status === 0 ? 'bg-danger' : 'bg-warning'}">
                Flow: ${email.flow_status === 1 ? 'Başarılı' : email.flow_status === 0 ? 'Başarısız' : 'Beklemede'}
            </span>
        </td>
        <td class="actions-col">
            <div class="btn-group">
                <button class="btn btn-sm btn-outline-primary" onclick="viewEmailContent(${email.id})" title="İçeriği Görüntüle">
                    <i class="bi bi-eye"></i>
                </button>
                <button class="btn btn-sm btn-outline-info" onclick="sendToFlow(${email.id})" title="Flow'a Gönder">
                    <i class="bi bi-arrow-right-circle"></i> Flow
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="viewLogs(${email.id})" title="Logları Görüntüle">
                    <i class="bi bi-list-ul"></i>
                </button>
            </div>
        </td>
    `;
    
    return tr;
}

// Load email history
async function loadEmailHistory(loadMore = false) {
    if (!loadMore) {
        currentPage = 1;
        emailList.innerHTML = '';
    }

    loadingSpinner.classList.remove('d-none');
    loadMoreBtn.classList.add('d-none');

    try {
        const params = new URLSearchParams();
        params.append('page', currentPage);
        params.append('limit', pageSize);
        
        if (currentSearch) params.append('search', currentSearch);
        if (currentStatusFilter) params.append('status', currentStatusFilter);
        if (currentStartDate) params.append('startDate', currentStartDate);
        if (currentEndDate) params.append('endDate', currentEndDate);

        console.log('API isteği parametreleri:', Object.fromEntries(params));

        const response = await fetch(`/api/emails?${params}`);
        const data = await response.json();

        if (data.emails.length > 0) {
            data.emails.forEach(email => {
                emailList.appendChild(createEmailRow(email));
            });

            if (currentPage < data.totalPages) {
                loadMoreBtn.classList.remove('d-none');
            }

            if (!loadMore) {
                updateStatistics(data);
            }
        } else if (!loadMore) {
            emailList.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-4">
                        <div class="text-muted">
                            <i class="bi bi-inbox fs-2 mb-2"></i>
                            <p>Hiç e-posta bulunamadı</p>
                        </div>
                    </td>
                </tr>
            `;
            updateStatistics({ total: 0, successCount: 0 });
        }
    } catch (error) {
        console.error('Error loading emails:', error);
        showNotification('E-postalar yüklenirken hata oluştu', 'error');
    } finally {
        loadingSpinner.classList.add('d-none');
    }
}

// E-posta listesini güncelle
async function updateEmailList(page = 1) {
    const pageSize = document.getElementById('pageSize')?.value || 10;
    const startDate = document.getElementById('startDate')?.value || '';
    const endDate = document.getElementById('endDate')?.value || '';

    fetch(`/api/emails?page=${page}&limit=${pageSize}&startDate=${startDate}&endDate=${endDate}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const tbody = document.querySelector('#emailTable tbody');
                if (!tbody) {
                    console.error('E-posta tablosu bulunamadı');
                    return;
                }
                
                tbody.innerHTML = '';
                data.emails.forEach(email => addEmailToTable(email));
                
                // Sayfalama
                updatePagination(data.currentPage, data.totalPages);
            } else {
                showNotification('E-posta listesi alınırken bir hata oluştu', 'error');
            }
        })
        .catch(error => {
            console.error('E-posta listesi alınırken hata:', error);
            showNotification('E-posta listesi alınırken bir hata oluştu', 'error');
        });
}

// Yeni e-postayı tabloya ekle
function addEmailToTable(email) {
    const tbody = document.querySelector('#emailTable tbody');
    if (!tbody) {
        console.error('E-posta tablosu bulunamadı');
        return;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${email.id}</td>
        <td>${email.from_address}</td>
        <td>${email.subject}</td>
        <td>${formatDate(email.received_date)}</td>
        <td>
            <span class="badge ${getWebhookStatusBadgeClass(email.webhook_status)}">
                ${getWebhookStatusText(email.webhook_status)}
            </span>
        </td>
        <td>
            <button class="btn btn-sm btn-primary" onclick="viewLogs(${email.id})">
                Logları Görüntüle
            </button>
        </td>
    `;
    tbody.insertBefore(tr, tbody.firstChild);
}

// JSON syntax highlighting
function syntaxHighlight(json) {
    try {
        // HTML karakterleri escape et
        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };

        // JSON'ı formatlı string'e çevir
        let formattedJson;
        if (typeof json === 'string') {
            formattedJson = JSON.stringify(JSON.parse(json), null, 2);
        } else {
            formattedJson = JSON.stringify(json, null, 2);
        }

        // HTML'i escape et ve döndür
        return escapeHtml(formattedJson);
    } catch (error) {
        console.error('JSON işlenirken hata:', error);
        return typeof json === 'string' ? escapeHtml(json) : escapeHtml(JSON.stringify(json));
    }
}

// View logs (both webhook and flow)
async function viewLogs(emailId) {
    try {
        console.log('Log görüntüleme başladı, emailId:', emailId);
        
        // API çağrısını debug et
        const url = `/api/emails/${emailId}/flow-logs`;
        console.log('API çağrısı yapılıyor:', url);
        
        const response = await fetch(url);
        console.log('API yanıtı status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API yanıt data:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Bilinmeyen bir hata oluştu');
        }

        // Modal elementini kontrol et
        let modalElement = document.getElementById('logsModal');
        
        // Modal yoksa oluştur
        if (!modalElement) {
            const modalHtml = `
                <div class="modal fade" id="logsModal" tabindex="-1" aria-labelledby="logsModalLabel" aria-hidden="true">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="logsModalLabel">Log Detayları</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body"></div>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modalElement = document.getElementById('logsModal');
        }

        // Modal instance oluştur
        const modal = new bootstrap.Modal(modalElement);
        const modalBody = modalElement.querySelector('.modal-body');

        console.log('İşlenecek loglar:', data.logs);
        
        if (!Array.isArray(data.logs)) {
            console.error('Loglar array değil:', typeof data.logs, data.logs);
            throw new Error('Log verisi geçersiz format');
        }

        const logsHtml = data.logs.map(log => {
            console.log('Log işleniyor:', log);
            try {
                const formattedResponse = syntaxHighlight(log.response_data);
                console.log('Format sonrası response_data:', formattedResponse);
                
                return `
                    <div class="log-entry ${log.success ? 'success' : 'error'}">
                        <div class="log-header">
                            <span class="log-date">${log.created_at}</span>
                            <span class="log-status">${log.success ? 'Başarılı' : 'Başarısız'}</span>
                            ${log.status_code ? `<span class="log-status-code">HTTP ${log.status_code}</span>` : ''}
                        </div>
                        ${log.error_message ? `<div class="log-error">${log.error_message}</div>` : ''}
                        ${log.response_data ? `<pre class="log-response">${formattedResponse}</pre>` : ''}
                    </div>
                `;
            } catch (err) {
                console.error('Log işlenirken hata:', err, log);
                return `<div class="log-entry error">
                    <div class="log-header">
                        <span class="log-date">${log.created_at}</span>
                        <span class="log-status">Hata</span>
                    </div>
                    <div class="log-error">Log görüntülenirken hata oluştu: ${err.message}</div>
                </div>`;
            }
        }).join('');

        // Modal içeriğini güncelle
        modalBody.innerHTML = logsHtml || '<div class="no-logs">Hiç log bulunamadı</div>';
        
        // Modalı göster
        modal.show();

    } catch (error) {
        console.error('Log görüntüleme hatası:', error);
        showNotification('Loglar alınırken bir hata oluştu: ' + error.message, 'error');
    }
}

// Detaylı yanıtı göster/gizle
function toggleFullResponse(button) {
    const pre = button.nextElementSibling;
    if (pre.classList.contains('d-none')) {
        pre.classList.remove('d-none');
        button.textContent = 'Yanıtı Gizle';
    } else {
        pre.classList.add('d-none');
        button.textContent = 'Yanıt Detayı';
    }
}

// Handle search
function handleSearch() {
    currentSearch = searchInput.value.trim();
    loadEmailHistory();
}

// Handle status filter
function handleStatusFilter() {
    const status = statusFilter.value;
    currentStatusFilter = status;
    loadEmailHistory();
}

// Handle date filter
function handleDateFilter() {
    currentStartDate = startDateFilter.value;
    currentEndDate = endDateFilter.value;
    
    console.log('Seçilen tarih aralığı:', {
        startDate: currentStartDate,
        endDate: currentEndDate
    });
    
    // Validate date range
    if (currentStartDate && currentEndDate && currentStartDate > currentEndDate) {
        showNotification('Başlangıç tarihi bitiş tarihinden sonra olamaz', 'error');
        return;
    }
    
    loadEmailHistory();
}

// Clear filters
function clearAllFilters() {
    searchInput.value = '';
    statusFilter.value = '';
    startDateFilter.value = '';
    endDateFilter.value = '';
    
    currentSearch = '';
    currentStatusFilter = '';
    currentStartDate = '';
    currentEndDate = '';
    
    loadEmailHistory();
}

// E-posta detaylarını görüntüle
async function viewEmailContent(emailId) {
    try {
        console.log('E-posta detayları isteniyor, ID:', emailId);
        const response = await fetch(`/api/emails/${emailId}`);
        console.log('API yanıtı:', response.status);
        
        const data = await response.json();
        console.log('E-posta detayları:', data);

        if (!data.success) {
            throw new Error(data.error || 'E-posta detayları alınamadı');
        }

        const email = data.email;
        if (!email) {
            throw new Error('E-posta bulunamadı');
        }

        // Modal başlığını güncelle
        const modalTitle = document.getElementById('emailModalLabel');
        if (modalTitle) {
            modalTitle.textContent = 'E-posta Detayları';
        }

        // Modal içeriğini güncelle
        const modalBody = document.getElementById('emailModalBody');
        if (!modalBody) {
            throw new Error('Modal body elementi bulunamadı');
        }

        modalBody.innerHTML = `
            <div class="email-details">
                <div class="mb-3">
                    <strong>Gönderen:</strong> ${email.from_address || 'N/A'}
                </div>
                <div class="mb-3">
                    <strong>Konu:</strong> ${email.subject || 'N/A'}
                </div>
                <div class="mb-3">
                    <strong>Tarih:</strong> ${formatDate(email.received_date)}
                </div>
                <div class="mb-3">
                    <strong>Webhook Durumu:</strong>
                    <span class="badge ${email.webhook_status === 1 ? 'bg-success' : email.webhook_status === 0 ? 'bg-danger' : 'bg-warning'}">
                        ${email.webhook_status === 1 ? 'Başarılı' : email.webhook_status === 0 ? 'Başarısız' : 'Beklemede'}
                    </span>
                </div>
                <div class="email-content">
                    <div class="content-header mb-2">
                        <strong>İçerik:</strong>
                    </div>
                    <div class="content-body border rounded p-3 bg-light">
                        ${email.content || 'İçerik bulunamadı'}
                    </div>
                </div>
            </div>`;

        // Modal'ı göster
        const emailModal = new bootstrap.Modal(document.getElementById('emailModal'));
        emailModal.show();
    } catch (error) {
        console.error('E-posta detayları yüklenirken hata:', error);
        showNotification('E-posta detayları yüklenirken hata oluştu: ' + error.message, 'danger');
    }
}

// Flow'a gönder
async function sendToFlow(emailId) {
    try {
        const response = await fetch(`/api/emails/${emailId}/send-to-flow`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Flow\'a gönderim başarısız oldu');
        }

        const result = await response.json();
        showNotification('Flow\'a başarıyla gönderildi', 'success');
        
        // Flow durumunu güncelle
        updateFlowStatus(emailId, true);
        
        // Flow loglarını güncelle
        await updateFlowLogs(emailId);
        
    } catch (error) {
        console.error('Error sending to flow:', error);
        showNotification('Flow\'a gönderim başarısız: ' + error.message, 'error');
        
        // Flow durumunu güncelle
        updateFlowStatus(emailId, false);
        
        // Flow loglarını güncelle
        await updateFlowLogs(emailId);
    }
}

// Flow durumunu kontrol et
async function checkFlowStatus(emailId) {
    try {
        const response = await fetch(`/api/flow/status/${emailId}`);
        const data = await response.json();

        const emailRow = document.querySelector(`tr[data-email-id="${emailId}"]`);
        if (emailRow) {
            const statusCell = emailRow.querySelector('.status-col');
            if (statusCell) {
                const status = data.status;
                const badgeClass = status === 1 ? 'bg-success' : status === 0 ? 'bg-danger' : 'bg-warning';
                const statusText = status === 1 ? 'Başarılı' : status === 0 ? 'Başarısız' : 'Beklemede';
                
                statusCell.innerHTML = `
                    <span class="badge ${badgeClass}">
                        Flow: ${statusText}
                    </span>
                `;

                // Eğer hala beklemedeyse, tekrar kontrol et
                if (status === 2) {
                    setTimeout(() => checkFlowStatus(emailId), 2000);
                }
            }
        }
    } catch (error) {
        console.error('Error checking flow status:', error);
    }
}

// Handle resend webhook
async function resendWebhook(emailId) {
    try {
        const response = await fetch(`/api/emails/${emailId}/resend`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Webhook yeniden gönderimi başarısız oldu');
        }
        
        showNotification('Webhook yeniden gönderimi başlatıldı');
    } catch (error) {
        console.error('Error resending webhook:', error);
        showNotification(error.message, 'error');
    }
}

// Detaylı yanıtı göster/gizle
function toggleFullResponse(button) {
    const pre = button.nextElementSibling;
    if (pre.classList.contains('d-none')) {
        pre.classList.remove('d-none');
        button.textContent = 'Yanıtı Gizle';
    } else {
        pre.classList.add('d-none');
        button.textContent = 'Yanıt Detayı';
    }
}

// Socket event handlers for both webhook and flow events
socket.on('webhook_success', (data) => {
    showNotification(`Webhook başarıyla gönderildi: ${data.emailId}`, 'success');
    updateEmailList();
});

socket.on('webhook_error', (data) => {
    showNotification(`Webhook gönderimi başarısız: ${data.error}`, 'error');
    updateEmailList();
});

socket.on('flow_success', (data) => {
    showNotification(`Flow başarıyla gönderildi: ${data.emailId}`, 'success');
    updateEmailList();
});

socket.on('flow_error', (data) => {
    showNotification(`Flow gönderimi başarısız: ${data.error}`, 'error');
    updateEmailList();
});

// Socket event handlers
socket.on('connect', () => {
    showNotification('Sunucu bağlantısı kuruldu');
    loadEmailHistory();
});

socket.on('disconnect', () => {
    showNotification('Sunucu bağlantısı kesildi', 'error');
});

socket.on('webhook_status', (data) => {
    const row = emailList.querySelector(`tr[data-email-id="${data.emailId}"]`);
    if (row) {
        loadEmailHistory(); // Refresh the list to show updated status
    }
});

socket.on('new_email', (email) => {
    console.log('Yeni e-posta:', email);
    addEmailToTable(email);
    showNotification('Yeni e-posta alındı', 'info');
});

// E-posta satırını tabloya ekle
function addEmailToTable(email) {
    const table = document.getElementById('emailTable');
    const tbody = table.querySelector('tbody');
    
    // Yeni satır oluştur
    const row = document.createElement('tr');
    row.setAttribute('data-email-id', email.id);
    
    // Tarih formatla
    const date = new Date(email.received_date);
    const formattedDate = date.toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    // Webhook durumu için sınıf belirle
    let statusClass = 'status-pending';
    let statusText = 'Bekliyor';
    
    if (email.webhook_status === 1) {
        statusClass = 'status-success';
        statusText = 'Başarılı';
    } else if (email.webhook_status === 0) {
        statusClass = 'status-pending';
        statusText = 'Bekliyor';
    } else {
        statusClass = 'status-error';
        statusText = 'Başarısız';
    }

    // Satır içeriğini oluştur
    row.innerHTML = `
        <td>
            <div class="d-flex align-items-center">
                ${email.flagged ? '<i class="bi bi-flag-fill text-danger me-2"></i>' : ''}
                <span>${formattedDate}</span>
            </div>
        </td>
        <td>${email.from_address}</td>
        <td>${email.subject}</td>
        <td>
            <span class="status-badge ${statusClass}">${statusText}</span>
        </td>
        <td>
            <div class="btn-group">
                <button class="btn btn-sm btn-outline-secondary" onclick="viewEmailContent(${email.id})">
                    <i class="bi bi-eye"></i>
                </button>
                <button class="btn btn-sm btn-outline-primary" onclick="resendWebhook(${email.id})">
                    <i class="bi bi-arrow-repeat"></i>
                </button>
                <button class="btn btn-sm btn-outline-success" onclick="sendToFlow(${email.id})">
                    <i class="bi bi-box-arrow-up-right"></i>
                </button>
            </div>
        </td>
    `;
    
    // Satırı tablonun başına ekle
    tbody.insertBefore(row, tbody.firstChild);
    
    // Satırı vurgula
    row.classList.add('highlight');
    setTimeout(() => row.classList.remove('highlight'), 2000);
}

// Tüm e-postaları listele
async function listAllEmails() {
    try {
        const response = await fetch('/api/emails/all');
        const data = await response.json();
        
        if (data.success) {
            const tbody = document.getElementById('emailTable').querySelector('tbody');
            tbody.innerHTML = '';
            
            data.emails.forEach(email => {
                const row = document.createElement('tr');
                row.setAttribute('data-email-id', email.id);
                
                const date = new Date(email.received_date);
                const formattedDate = date.toLocaleString('tr-TR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                let statusClass = 'status-pending';
                let statusText = 'Bekliyor';
                
                if (email.webhook_status === 1) {
                    statusClass = 'status-success';
                    statusText = 'Başarılı';
                } else if (email.webhook_status === 0) {
                    statusClass = 'status-pending';
                    statusText = 'Bekliyor';
                } else {
                    statusClass = 'status-error';
                    statusText = 'Başarısız';
                }

                row.innerHTML = `
                    <td>
                        <div class="d-flex align-items-center">
                            ${email.flagged ? '<i class="bi bi-flag-fill text-danger me-2"></i>' : ''}
                            <span>${formattedDate}</span>
                        </div>
                    </td>
                    <td>${email.from_address}</td>
                    <td>${email.subject}</td>
                    <td>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary" onclick="viewEmailContent(${email.id})">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-primary" onclick="resendWebhook(${email.id})">
                                <i class="bi bi-arrow-repeat"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-success" onclick="sendToFlow(${email.id})">
                                <i class="bi bi-box-arrow-up-right"></i>
                            </button>
                        </div>
                    </td>
                `;
                
                tbody.appendChild(row);
            });
            
            // Sayfalama kontrollerini gizle
            const paginationContainer = document.getElementById('paginationContainer');
            if (paginationContainer) {
                paginationContainer.style.display = 'none';
            }
            
        } else {
            console.error('E-postalar alınamadı:', data.error);
            showNotification('E-postalar alınamadı: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('E-posta listesi alınırken hata:', error);
        showNotification('E-posta listesi alınırken hata oluştu', 'error');
    }
}

// Flow durumunu güncelle
function updateFlowStatus(emailId, success) {
    const emailRow = document.querySelector(`tr[data-email-id="${emailId}"]`);
    if (emailRow) {
        const statusCell = emailRow.querySelector('.flow-status-col');
        if (statusCell) {
            if (success) {
                statusCell.innerHTML = `
                    <span class="badge bg-success">
                        Flow: Başarılı
                    </span>
                `;
            } else {
                statusCell.innerHTML = `
                    <span class="badge bg-danger">
                        Flow: Başarısız
                    </span>
                `;
            }
        }
    }
}

// Flow loglarını güncelle
async function updateFlowLogs(emailId) {
    try {
        const response = await fetch(`/api/emails/${emailId}/flow-logs`);
        if (!response.ok) {
            throw new Error('Flow logları alınamadı');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Flow logları alınamadı');
        }

        // Log tablosunu güncelle
        const logsContainer = document.querySelector(`#flowLogs_${emailId}`);
        if (logsContainer) {
            let logsHtml = '<table class="table table-sm">';
            logsHtml += '<thead><tr><th>Tarih</th><th>Durum</th><th>Detay</th></tr></thead><tbody>';
            
            data.logs.forEach(log => {
                const date = new Date(log.timestamp).toLocaleString();
                const status = log.success ? 
                    '<span class="badge bg-success">Başarılı</span>' : 
                    '<span class="badge bg-danger">Başarısız</span>';
                
                logsHtml += `
                    <tr>
                        <td>${date}</td>
                        <td>${status}</td>
                        <td>${log.error || 'Başarılı'}</td>
                    </tr>
                `;
            });
            
            logsHtml += '</tbody></table>';
            logsContainer.innerHTML = logsHtml;
        }

    } catch (error) {
        console.error('Flow logları güncellenirken hata:', error);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Search event listeners
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    searchButton.addEventListener('click', handleSearch);
    
    // Filter event listeners
    statusFilter.addEventListener('change', handleStatusFilter);
    startDateFilter.addEventListener('change', handleDateFilter);
    endDateFilter.addEventListener('change', handleDateFilter);
    clearFilters.addEventListener('click', clearAllFilters);

    // Load initial data
    loadEmailHistory();

    // Load more button event listener
    loadMoreBtn.addEventListener('click', () => {
        currentPage++;
        loadEmailHistory(true);
    });

    // Tarih filtresi event listener'ları
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (startDateInput && endDateInput) {
        startDateInput.addEventListener('change', () => {
            currentPage = 1;
            updateEmailList();
        });
        
        endDateInput.addEventListener('change', () => {
            currentPage = 1;
            updateEmailList();
        });
    }

    // Tüm e-postaları listele butonu
    const listAllButton = document.createElement('button');
    listAllButton.className = 'btn btn-outline-primary ms-2';
    listAllButton.innerHTML = '<i class="bi bi-list"></i> Tümünü Göster';
    listAllButton.onclick = listAllEmails;
    
    // Butonu filtre alanının yanına ekle
    const filterContainer = document.querySelector('.filter-container');
    if (filterContainer) {
        filterContainer.appendChild(listAllButton);
    }
    
    // İlk yüklemede normal listeyi göster
    updateEmailList();
});

// Debounce function for search input
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
