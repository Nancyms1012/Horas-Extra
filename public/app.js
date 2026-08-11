// ============================================
// OVERTIME TRACKER - Main Application
// ============================================

(function() {
    'use strict';

    // ---- State Management ----
    const DEFAULT_SETTINGS = {
        workStart: '08:00',
        workEnd: '17:00',
        workDays: [1, 2, 3, 4, 5], // Mon-Fri
        salary: 0,
        currency: '$'
    };

    let state = {
        settings: { ...DEFAULT_SETTINGS },
        todayEntry: null,  // { date, checkIn, checkOut, isHoliday, overtimeMinutes, amount }
        entries: [],       // historical entries
        cuts: [],          // past period cuts
        currentPeriodStart: new Date().toISOString().split('T')[0]
    };

    // ---- Utility Functions ----
    function formatDate(dateStr) {
        const date = new Date(dateStr + 'T12:00:00');
        return date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatTime(timeStr) {
        if (!timeStr) return '--:--';
        const [h, m] = timeStr.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 || 12;
        return `${h12}:${m} ${ampm}`;
    }

    function formatHours(minutes) {
        if (minutes <= 0) return '0h 0m';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${m}m`;
    }

    function formatMoney(amount) {
        const currency = state.settings.currency || '$';
        return `${currency}${amount.toFixed(2)}`;
    }

    function getCurrentTime() {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    function getToday() {
        return new Date().toISOString().split('T')[0];
    }

    function timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // ---- Overtime Calculation ----
    function calculateOvertimeRate(type) {
        // Simple OT: (salary / 240) * 1.5
        // Double OT (holiday): (salary / 240) * 2
        const salary = state.settings.salary || 0;
        const baseRate = salary / 240;
        return type === 'double' ? baseRate * 2 : baseRate * 1.5;
    }

    function calculateOvertime(checkIn, checkOut, workEnd) {
        const checkOutMinutes = timeToMinutes(checkOut);
        const workEndMinutes = timeToMinutes(workEnd);
        const overtime = checkOutMinutes - workEndMinutes;
        return Math.max(0, overtime);
    }

    function calculateAmount(overtimeMinutes, isHoliday) {
        const hourlyRate = calculateOvertimeRate(isHoliday ? 'double' : 'simple');
        return (overtimeMinutes / 60) * hourlyRate;
    }

    // ---- Data Persistence ----
    function saveState() {
        localStorage.setItem('overtime_tracker_state', JSON.stringify(state));
    }

    function loadState() {
        const saved = localStorage.getItem('overtime_tracker_state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                state = { ...state, ...parsed };
                // Ensure settings has all keys
                state.settings = { ...DEFAULT_SETTINGS, ...state.settings };
            } catch (e) {
                console.error('Error loading state:', e);
            }
        }
    }

    function exportData() {
        const dataStr = JSON.stringify(state, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `horas_extra_${getToday()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Datos exportados correctamente');
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const imported = JSON.parse(e.target.result);
                // Merge entries (avoid duplicates by date)
                const existingDates = new Set(state.entries.map(en => en.date));
                const newEntries = imported.entries ? imported.entries.filter(en => !existingDates.has(en.date)) : [];
                state.entries = [...state.entries, ...newEntries].sort((a, b) => b.date.localeCompare(a.date));
                
                // Merge cuts
                if (imported.cuts) {
                    const existingCutDates = new Set(state.cuts.map(c => c.date));
                    const newCuts = imported.cuts.filter(c => !existingCutDates.has(c.date));
                    state.cuts = [...state.cuts, ...newCuts].sort((a, b) => b.date.localeCompare(a.date));
                }

                // Update settings if current are default
                if (imported.settings && state.settings.salary === 0) {
                    state.settings = { ...DEFAULT_SETTINGS, ...imported.settings };
                }

                saveState();
                renderAll();
                showToast('Datos importados y fusionados correctamente');
            } catch (err) {
                showToast('Error al importar: archivo inválido');
                console.error('Import error:', err);
            }
        };
        reader.readAsText(file);
    }

    // ---- Rendering ----
    function renderAll() {
        renderHome();
        renderHistory();
        renderSettings();
    }

    function renderHome() {
        const today = getToday();
        document.getElementById('today-date').textContent = formatDate(today);

        // Check if there's a today entry
        const todayEntry = state.todayEntry && state.todayEntry.date === today ? state.todayEntry : null;

        const statusText = document.getElementById('status-text');
        const checkInfo = document.getElementById('check-info');
        const btnCheckIn = document.getElementById('btn-check-in');
        const btnCheckOut = document.getElementById('btn-check-out');
        const holidayToggle = document.getElementById('holiday-toggle');
        const overtimeResult = document.getElementById('overtime-result');
        const checkoutRow = document.getElementById('checkout-row');

        if (!todayEntry) {
            // No entry today
            statusText.textContent = 'No has registrado entrada hoy';
            checkInfo.style.display = 'none';
            btnCheckIn.style.display = 'block';
            btnCheckOut.style.display = 'none';
            holidayToggle.style.display = 'none';
            overtimeResult.style.display = 'none';
        } else if (!todayEntry.checkOut) {
            // Checked in, not checked out
            statusText.textContent = '🟢 Trabajando...';
            checkInfo.style.display = 'block';
            document.getElementById('display-check-in').textContent = formatTime(todayEntry.checkIn);
            document.getElementById('display-scheduled-out').textContent = formatTime(state.settings.workEnd);
            checkoutRow.style.display = 'none';
            btnCheckIn.style.display = 'none';
            btnCheckOut.style.display = 'block';
            holidayToggle.style.display = 'block';
            overtimeResult.style.display = 'none';
        } else {
            // Checked out
            statusText.textContent = '✅ Día completado';
            checkInfo.style.display = 'block';
            document.getElementById('display-check-in').textContent = formatTime(todayEntry.checkIn);
            document.getElementById('display-scheduled-out').textContent = formatTime(state.settings.workEnd);
            document.getElementById('display-check-out').textContent = formatTime(todayEntry.checkOut);
            checkoutRow.style.display = 'flex';
            btnCheckIn.style.display = 'none';
            btnCheckOut.style.display = 'none';
            holidayToggle.style.display = 'none';

            // Show overtime result
            if (todayEntry.overtimeMinutes > 0) {
                overtimeResult.style.display = 'block';
                document.getElementById('result-overtime').textContent = formatHours(todayEntry.overtimeMinutes);
                document.getElementById('result-money').textContent = formatMoney(todayEntry.amount);
            } else {
                overtimeResult.style.display = 'none';
            }
        }

        // Period Summary
        renderPeriodSummary();
    }

    function renderPeriodSummary() {
        const periodEntries = state.entries.filter(e => e.date >= state.currentPeriodStart);
        let totalMinutes = 0;
        let totalAmount = 0;
        periodEntries.forEach(e => {
            totalMinutes += e.overtimeMinutes || 0;
            totalAmount += e.amount || 0;
        });

        // Include today if completed
        if (state.todayEntry && state.todayEntry.checkOut && state.todayEntry.date >= state.currentPeriodStart) {
            totalMinutes += state.todayEntry.overtimeMinutes || 0;
            totalAmount += state.todayEntry.amount || 0;
        }

        document.getElementById('period-hours').textContent = formatHours(totalMinutes);
        document.getElementById('period-amount').textContent = formatMoney(totalAmount);
    }

    function renderHistory() {
        const filter = document.getElementById('filter-period').value;
        let entries = [...state.entries];
        
        if (filter === 'current') {
            entries = entries.filter(e => e.date >= state.currentPeriodStart);
        }

        entries.sort((a, b) => b.date.localeCompare(a.date));

        const historyList = document.getElementById('history-list');
        
        if (entries.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No hay registros aún</p>';
        } else {
            historyList.innerHTML = entries.map(entry => `
                <div class="history-entry ${entry.isHoliday ? 'holiday' : ''}">
                    <div>
                        <div class="entry-date">${formatDate(entry.date)} ${entry.isHoliday ? '🎉' : ''}</div>
                        <div class="entry-details">${formatTime(entry.checkIn)} - ${formatTime(entry.checkOut)}</div>
                    </div>
                    <div style="text-align: right;">
                        <div class="entry-hours">${formatHours(entry.overtimeMinutes)}</div>
                        <div class="entry-amount">${formatMoney(entry.amount)}</div>
                    </div>
                    <button class="entry-delete" data-date="${entry.date}" title="Eliminar">🗑️</button>
                </div>
            `).join('');
        }

        // Totals
        let totalMinutes = 0;
        let totalAmount = 0;
        entries.forEach(e => {
            totalMinutes += e.overtimeMinutes || 0;
            totalAmount += e.amount || 0;
        });
        document.getElementById('total-hours').textContent = formatHours(totalMinutes);
        document.getElementById('total-amount').textContent = formatMoney(totalAmount);

        // Cuts section
        const cutsSection = document.getElementById('cuts-section');
        const cutsList = document.getElementById('cuts-list');
        if (state.cuts.length > 0) {
            cutsSection.style.display = 'block';
            cutsList.innerHTML = state.cuts.map(cut => `
                <div class="cut-item">
                    <h4>Corte: ${formatDate(cut.date)}</h4>
                    <p>Período: ${formatDate(cut.periodStart)} - ${formatDate(cut.periodEnd)}</p>
                    <p>Total horas: <strong>${formatHours(cut.totalMinutes)}</strong> | Total monto: <strong>${formatMoney(cut.totalAmount)}</strong></p>
                    <p>Registros: ${cut.entriesCount}</p>
                </div>
            `).join('');
        } else {
            cutsSection.style.display = 'none';
        }
    }

    function renderSettings() {
        document.getElementById('work-start').value = state.settings.workStart;
        document.getElementById('work-end').value = state.settings.workEnd;
        document.getElementById('salary').value = state.settings.salary || '';
        document.getElementById('currency').value = state.settings.currency || '$';

        // Work days checkboxes
        const dayCheckboxes = document.querySelectorAll('.days-grid input[type="checkbox"]');
        dayCheckboxes.forEach(cb => {
            cb.checked = state.settings.workDays.includes(parseInt(cb.value));
        });

        // Salary info
        const salaryInfo = document.getElementById('salary-info');
        if (state.settings.salary > 0) {
            salaryInfo.style.display = 'block';
            const simpleRate = calculateOvertimeRate('simple');
            const doubleRate = calculateOvertimeRate('double');
            document.getElementById('rate-simple').textContent = formatMoney(simpleRate);
            document.getElementById('rate-double').textContent = formatMoney(doubleRate);
        } else {
            salaryInfo.style.display = 'none';
        }
    }

    // ---- Event Handlers ----
    function initEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`tab-${tab}`).classList.add('active');
            });
        });

        // Check In
        document.getElementById('btn-check-in').addEventListener('click', () => {
            const today = getToday();
            state.todayEntry = {
                date: today,
                checkIn: getCurrentTime(),
                checkOut: null,
                isHoliday: false,
                overtimeMinutes: 0,
                amount: 0
            };
            saveState();
            renderHome();
            showToast('Entrada registrada: ' + formatTime(state.todayEntry.checkIn));
        });

        // Check Out
        document.getElementById('btn-check-out').addEventListener('click', () => {
            if (!state.todayEntry) return;

            const checkOutTime = getCurrentTime();
            const isHoliday = document.getElementById('is-holiday').checked;
            const overtimeMinutes = calculateOvertime(state.todayEntry.checkIn, checkOutTime, state.settings.workEnd);
            const amount = calculateAmount(overtimeMinutes, isHoliday);

            state.todayEntry.checkOut = checkOutTime;
            state.todayEntry.isHoliday = isHoliday;
            state.todayEntry.overtimeMinutes = overtimeMinutes;
            state.todayEntry.amount = amount;

            // Save to history if there was overtime
            if (overtimeMinutes > 0) {
                // Remove existing entry for today if any
                state.entries = state.entries.filter(e => e.date !== state.todayEntry.date);
                state.entries.push({ ...state.todayEntry });
            }

            saveState();
            renderAll();

            if (overtimeMinutes > 0) {
                showToast(`Check out! Horas extra: ${formatHours(overtimeMinutes)} = ${formatMoney(amount)}`);
            } else {
                showToast('Check out registrado. No hubo horas extra hoy.');
            }
        });

        // Save Settings
        document.getElementById('btn-save-settings').addEventListener('click', () => {
            state.settings.workStart = document.getElementById('work-start').value;
            state.settings.workEnd = document.getElementById('work-end').value;
            state.settings.salary = parseFloat(document.getElementById('salary').value) || 0;
            state.settings.currency = document.getElementById('currency').value || '$';

            const workDays = [];
            document.querySelectorAll('.days-grid input[type="checkbox"]:checked').forEach(cb => {
                workDays.push(parseInt(cb.value));
            });
            state.settings.workDays = workDays;

            saveState();
            renderAll();
            showToast('Configuración guardada');
        });

        // Salary live preview
        document.getElementById('salary').addEventListener('input', () => {
            const salary = parseFloat(document.getElementById('salary').value) || 0;
            const salaryInfo = document.getElementById('salary-info');
            if (salary > 0) {
                salaryInfo.style.display = 'block';
                const baseRate = salary / 240;
                const currency = document.getElementById('currency').value || '$';
                document.getElementById('rate-simple').textContent = `${currency}${(baseRate * 1.5).toFixed(2)}`;
                document.getElementById('rate-double').textContent = `${currency}${(baseRate * 2).toFixed(2)}`;
            } else {
                salaryInfo.style.display = 'none';
            }
        });

        // Make Cut
        document.getElementById('btn-cut').addEventListener('click', () => {
            const periodEntries = state.entries.filter(e => e.date >= state.currentPeriodStart);
            
            if (periodEntries.length === 0) {
                showToast('No hay registros en el período actual para cortar');
                return;
            }

            let totalMinutes = 0;
            let totalAmount = 0;
            periodEntries.forEach(e => {
                totalMinutes += e.overtimeMinutes || 0;
                totalAmount += e.amount || 0;
            });

            const cut = {
                date: getToday(),
                periodStart: state.currentPeriodStart,
                periodEnd: getToday(),
                totalMinutes,
                totalAmount,
                entriesCount: periodEntries.length
            };

            state.cuts.unshift(cut);
            state.currentPeriodStart = getToday();
            saveState();
            renderAll();
            showToast(`Corte realizado: ${formatHours(totalMinutes)} = ${formatMoney(totalAmount)}`);
        });

        // Filter period
        document.getElementById('filter-period').addEventListener('change', () => {
            renderHistory();
        });

        // Delete entry
        document.getElementById('history-list').addEventListener('click', (e) => {
            const btn = e.target.closest('.entry-delete');
            if (btn) {
                const date = btn.dataset.date;
                if (confirm('¿Eliminar este registro?')) {
                    state.entries = state.entries.filter(en => en.date !== date);
                    saveState();
                    renderAll();
                    showToast('Registro eliminado');
                }
            }
        });

        // Export
        document.getElementById('btn-export').addEventListener('click', exportData);

        // Import
        document.getElementById('btn-import').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });

        document.getElementById('import-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importData(file);
                e.target.value = '';
            }
        });

        // Sync button (export for now)
        document.getElementById('btn-sync').addEventListener('click', exportData);

        // Clear data
        document.getElementById('btn-clear-data').addEventListener('click', () => {
            if (confirm('¿Estás segura de que deseas borrar TODOS los datos? Esta acción no se puede deshacer.')) {
                if (confirm('⚠️ Última confirmación: Se borrarán todos los registros, historial y configuración.')) {
                    localStorage.removeItem('overtime_tracker_state');
                    state = {
                        settings: { ...DEFAULT_SETTINGS },
                        todayEntry: null,
                        entries: [],
                        cuts: [],
                        currentPeriodStart: getToday()
                    };
                    renderAll();
                    showToast('Todos los datos han sido borrados');
                }
            }
        });
    }

    // ---- PWA Install ----
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        // Could show install banner here
    });

    // ---- Service Worker Registration ----
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('SW registered:', reg.scope))
                .catch(err => console.log('SW registration failed:', err));
        });
    }

    // ---- Initialize ----
    function init() {
        loadState();

        // Check if todayEntry is from a different day
        if (state.todayEntry && state.todayEntry.date !== getToday()) {
            // If it was checked in but not checked out (forgot), don't save it
            if (state.todayEntry.checkOut && state.todayEntry.overtimeMinutes > 0) {
                // Already saved in entries from checkout handler
            }
            state.todayEntry = null;
            saveState();
        }

        renderAll();
        initEventListeners();
    }

    // Start the app
    document.addEventListener('DOMContentLoaded', init);
})();
