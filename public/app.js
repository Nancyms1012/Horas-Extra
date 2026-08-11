// ============================================
// OVERTIME TRACKER - Main Application with Supabase
// ============================================

(function() {
    'use strict';

    // ---- Supabase Configuration ----
    const SUPABASE_URL = 'https://hcqykizneteracvmcddc.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjcXlraXpuZXRlcmFjdm1jZGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NjQ2NTIsImV4cCI6MjEwMjA0MDY1Mn0.VpP2iUjnXydVf9vNsbht2yGlypiQhkg_W_DLCPxIiD8';
    
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ---- State Management ----
    const DEFAULT_SETTINGS = {
        workStart: '08:00',
        workEnd: '17:00',
        workDays: [1, 2, 3, 4, 5],
        salary: 0,
        currency: '$'
    };

    let state = {
        user: null,
        settings: { ...DEFAULT_SETTINGS },
        todayEntry: null,
        entries: [],
        cuts: [],
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
        return `${currency}${parseFloat(amount || 0).toFixed(2)}`;
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

    function showLoading(show) {
        document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
    }

    // ---- Overtime Calculation ----
    function calculateOvertimeRate(type) {
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

    // ---- Authentication ----
    async function handleLogin() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        
        if (!email || !password) {
            showAuthError('Ingresa correo y contraseña');
            return;
        }

        showLoading(true);
        hideAuthMessages();

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        
        showLoading(false);
        
        if (error) {
            showAuthError('Credenciales incorrectas. ¿Necesitas crear una cuenta?');
        }
        // onAuthStateChange handles the rest
    }

    async function handleRegister() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        
        if (!email || !password) {
            showAuthError('Ingresa correo y contraseña');
            return;
        }

        if (password.length < 6) {
            showAuthError('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        showLoading(true);
        hideAuthMessages();

        const { data, error } = await supabase.auth.signUp({ email, password });
        
        showLoading(false);
        
        if (error) {
            showAuthError(error.message);
        } else {
            // Check if email confirmation is required
            if (data.user && !data.session) {
                showAuthSuccess('Cuenta creada. Revisa tu correo para confirmar (puede estar en spam). Si no llega, intenta iniciar sesión directamente.');
            }
            // If session exists, user is auto-logged in
        }
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        state.user = null;
        state.entries = [];
        state.cuts = [];
        state.todayEntry = null;
        state.settings = { ...DEFAULT_SETTINGS };
        showAuthScreen();
    }

    function showAuthError(msg) {
        const el = document.getElementById('auth-error');
        el.textContent = msg;
        el.style.display = 'block';
    }

    function showAuthSuccess(msg) {
        const el = document.getElementById('auth-success');
        el.textContent = msg;
        el.style.display = 'block';
    }

    function hideAuthMessages() {
        document.getElementById('auth-error').style.display = 'none';
        document.getElementById('auth-success').style.display = 'none';
    }

    function showAuthScreen() {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-main').style.display = 'none';
    }

    function showAppScreen() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-main').style.display = 'block';
    }

    // ---- Supabase Data Operations ----
    async function loadUserData() {
        if (!state.user) return;
        
        showLoading(true);

        // Load settings
        const { data: settings } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', state.user.id)
            .single();

        if (settings) {
            state.settings = {
                workStart: settings.work_start || '08:00',
                workEnd: settings.work_end || '17:00',
                workDays: settings.work_days || [1, 2, 3, 4, 5],
                salary: parseFloat(settings.salary) || 0,
                currency: settings.currency || '$'
            };
        }

        // Load entries
        const { data: entries } = await supabase
            .from('overtime_entries')
            .select('*')
            .eq('user_id', state.user.id)
            .order('date', { ascending: false });

        state.entries = (entries || []).map(e => ({
            date: e.date,
            checkIn: e.check_in,
            checkOut: e.check_out,
            isHoliday: e.is_holiday,
            overtimeMinutes: e.overtime_minutes,
            amount: parseFloat(e.amount)
        }));

        // Check today's entry
        const today = getToday();
        const todayEntry = state.entries.find(e => e.date === today);
        if (todayEntry) {
            state.todayEntry = todayEntry;
            // Remove from entries array to avoid duplication in display
            state.entries = state.entries.filter(e => e.date !== today || e.checkOut);
        }

        // Load cuts
        const { data: cuts } = await supabase
            .from('period_cuts')
            .select('*')
            .eq('user_id', state.user.id)
            .order('cut_date', { ascending: false });

        state.cuts = (cuts || []).map(c => ({
            date: c.cut_date,
            periodStart: c.period_start,
            periodEnd: c.period_end,
            totalMinutes: c.total_minutes,
            totalAmount: parseFloat(c.total_amount),
            entriesCount: c.entries_count
        }));

        // Determine current period start
        if (state.cuts.length > 0) {
            state.currentPeriodStart = state.cuts[0].periodEnd || state.cuts[0].date;
        }

        showLoading(false);
        renderAll();
    }

    async function saveSettings() {
        if (!state.user) return;

        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: state.user.id,
                work_start: state.settings.workStart,
                work_end: state.settings.workEnd,
                work_days: state.settings.workDays,
                salary: state.settings.salary,
                currency: state.settings.currency,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) {
            console.error('Error saving settings:', error);
            showToast('Error al guardar configuración');
        } else {
            showToast('Configuración guardada ☁️');
        }
    }

    async function saveEntry(entry) {
        if (!state.user) return;

        const { error } = await supabase
            .from('overtime_entries')
            .upsert({
                user_id: state.user.id,
                date: entry.date,
                check_in: entry.checkIn,
                check_out: entry.checkOut,
                is_holiday: entry.isHoliday,
                overtime_minutes: entry.overtimeMinutes,
                amount: entry.amount,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,date' });

        if (error) {
            console.error('Error saving entry:', error);
            showToast('Error al guardar registro');
        }
    }

    async function deleteEntry(date) {
        if (!state.user) return;

        const { error } = await supabase
            .from('overtime_entries')
            .delete()
            .eq('user_id', state.user.id)
            .eq('date', date);

        if (error) {
            console.error('Error deleting entry:', error);
            showToast('Error al eliminar registro');
        }
    }

    async function saveCut(cut) {
        if (!state.user) return;

        const { error } = await supabase
            .from('period_cuts')
            .insert({
                user_id: state.user.id,
                cut_date: cut.date,
                period_start: cut.periodStart,
                period_end: cut.periodEnd,
                total_minutes: cut.totalMinutes,
                total_amount: cut.totalAmount,
                entries_count: cut.entriesCount
            });

        if (error) {
            console.error('Error saving cut:', error);
            showToast('Error al guardar corte');
        }
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

        const todayEntry = state.todayEntry && state.todayEntry.date === today ? state.todayEntry : null;

        const statusText = document.getElementById('status-text');
        const checkInfo = document.getElementById('check-info');
        const btnCheckIn = document.getElementById('btn-check-in');
        const btnCheckOut = document.getElementById('btn-check-out');
        const holidayToggle = document.getElementById('holiday-toggle');
        const overtimeResult = document.getElementById('overtime-result');
        const checkoutRow = document.getElementById('checkout-row');

        if (!todayEntry) {
            statusText.textContent = 'No has registrado entrada hoy';
            checkInfo.style.display = 'none';
            btnCheckIn.style.display = 'block';
            btnCheckOut.style.display = 'none';
            holidayToggle.style.display = 'none';
            overtimeResult.style.display = 'none';
        } else if (!todayEntry.checkOut) {
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
            statusText.textContent = '✅ Día completado';
            checkInfo.style.display = 'block';
            document.getElementById('display-check-in').textContent = formatTime(todayEntry.checkIn);
            document.getElementById('display-scheduled-out').textContent = formatTime(state.settings.workEnd);
            document.getElementById('display-check-out').textContent = formatTime(todayEntry.checkOut);
            checkoutRow.style.display = 'flex';
            btnCheckIn.style.display = 'none';
            btnCheckOut.style.display = 'none';
            holidayToggle.style.display = 'none';

            if (todayEntry.overtimeMinutes > 0) {
                overtimeResult.style.display = 'block';
                document.getElementById('result-overtime').textContent = formatHours(todayEntry.overtimeMinutes);
                document.getElementById('result-money').textContent = formatMoney(todayEntry.amount);
            } else {
                overtimeResult.style.display = 'none';
            }
        }

        renderPeriodSummary();
    }

    function renderPeriodSummary() {
        const periodEntries = state.entries.filter(e => e.date >= state.currentPeriodStart);
        let totalMinutes = 0;
        let totalAmount = 0;
        periodEntries.forEach(e => {
            totalMinutes += e.overtimeMinutes || 0;
            totalAmount += parseFloat(e.amount) || 0;
        });

        if (state.todayEntry && state.todayEntry.checkOut && state.todayEntry.date >= state.currentPeriodStart) {
            totalMinutes += state.todayEntry.overtimeMinutes || 0;
            totalAmount += parseFloat(state.todayEntry.amount) || 0;
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

        let totalMinutes = 0;
        let totalAmount = 0;
        entries.forEach(e => {
            totalMinutes += e.overtimeMinutes || 0;
            totalAmount += parseFloat(e.amount) || 0;
        });
        document.getElementById('total-hours').textContent = formatHours(totalMinutes);
        document.getElementById('total-amount').textContent = formatMoney(totalAmount);

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

        const dayCheckboxes = document.querySelectorAll('.days-grid input[type="checkbox"]');
        dayCheckboxes.forEach(cb => {
            cb.checked = state.settings.workDays.includes(parseInt(cb.value));
        });

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

        // Update user email displays
        if (state.user) {
            document.getElementById('user-email').textContent = state.user.email;
            document.getElementById('settings-email').textContent = state.user.email;
        }
    }

    // ---- Event Handlers ----
    function initEventListeners() {
        // Auth
        document.getElementById('btn-login').addEventListener('click', handleLogin);
        document.getElementById('btn-register').addEventListener('click', handleRegister);
        document.getElementById('btn-logout').addEventListener('click', handleLogout);
        document.getElementById('btn-logout-settings').addEventListener('click', handleLogout);

        // Allow Enter key on auth form
        document.getElementById('auth-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        document.getElementById('auth-email').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('auth-password').focus();
        });

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
        document.getElementById('btn-check-in').addEventListener('click', async () => {
            const today = getToday();
            state.todayEntry = {
                date: today,
                checkIn: getCurrentTime(),
                checkOut: null,
                isHoliday: false,
                overtimeMinutes: 0,
                amount: 0
            };
            await saveEntry(state.todayEntry);
            renderHome();
            showToast('Entrada registrada: ' + formatTime(state.todayEntry.checkIn));
        });

        // Check Out
        document.getElementById('btn-check-out').addEventListener('click', async () => {
            if (!state.todayEntry) return;

            const checkOutTime = getCurrentTime();
            const isHoliday = document.getElementById('is-holiday').checked;
            const overtimeMinutes = calculateOvertime(state.todayEntry.checkIn, checkOutTime, state.settings.workEnd);
            const amount = calculateAmount(overtimeMinutes, isHoliday);

            state.todayEntry.checkOut = checkOutTime;
            state.todayEntry.isHoliday = isHoliday;
            state.todayEntry.overtimeMinutes = overtimeMinutes;
            state.todayEntry.amount = amount;

            await saveEntry(state.todayEntry);

            // Add to local entries list if overtime
            if (overtimeMinutes > 0) {
                state.entries = state.entries.filter(e => e.date !== state.todayEntry.date);
                state.entries.push({ ...state.todayEntry });
            }

            renderAll();

            if (overtimeMinutes > 0) {
                showToast(`Check out! Horas extra: ${formatHours(overtimeMinutes)} = ${formatMoney(amount)}`);
            } else {
                showToast('Check out registrado. No hubo horas extra hoy.');
            }
        });

        // Save Settings
        document.getElementById('btn-save-settings').addEventListener('click', async () => {
            state.settings.workStart = document.getElementById('work-start').value;
            state.settings.workEnd = document.getElementById('work-end').value;
            state.settings.salary = parseFloat(document.getElementById('salary').value) || 0;
            state.settings.currency = document.getElementById('currency').value || '$';

            const workDays = [];
            document.querySelectorAll('.days-grid input[type="checkbox"]:checked').forEach(cb => {
                workDays.push(parseInt(cb.value));
            });
            state.settings.workDays = workDays;

            await saveSettings();
            renderAll();
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
        document.getElementById('btn-cut').addEventListener('click', async () => {
            const periodEntries = state.entries.filter(e => e.date >= state.currentPeriodStart);
            
            if (periodEntries.length === 0) {
                showToast('No hay registros en el período actual para cortar');
                return;
            }

            let totalMinutes = 0;
            let totalAmount = 0;
            periodEntries.forEach(e => {
                totalMinutes += e.overtimeMinutes || 0;
                totalAmount += parseFloat(e.amount) || 0;
            });

            const cut = {
                date: getToday(),
                periodStart: state.currentPeriodStart,
                periodEnd: getToday(),
                totalMinutes,
                totalAmount,
                entriesCount: periodEntries.length
            };

            await saveCut(cut);
            state.cuts.unshift(cut);
            state.currentPeriodStart = getToday();
            renderAll();
            showToast(`Corte realizado: ${formatHours(totalMinutes)} = ${formatMoney(totalAmount)}`);
        });

        // Filter period
        document.getElementById('filter-period').addEventListener('change', () => {
            renderHistory();
        });

        // Delete entry
        document.getElementById('history-list').addEventListener('click', async (e) => {
            const btn = e.target.closest('.entry-delete');
            if (btn) {
                const date = btn.dataset.date;
                if (confirm('¿Eliminar este registro?')) {
                    await deleteEntry(date);
                    state.entries = state.entries.filter(en => en.date !== date);
                    renderAll();
                    showToast('Registro eliminado');
                }
            }
        });
    }

    // ---- PWA Service Worker ----
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('SW registered:', reg.scope))
                .catch(err => console.log('SW registration failed:', err));
        });
    }

    // ---- Auth State Listener ----
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
            state.user = session.user;
            showAppScreen();
            await loadUserData();
        } else {
            state.user = null;
            showAuthScreen();
        }
        showLoading(false);
    });

    // ---- Initialize ----
    function init() {
        showLoading(true);
        initEventListeners();

        // Check existing session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session && session.user) {
                state.user = session.user;
                showAppScreen();
                loadUserData();
            } else {
                showLoading(false);
                showAuthScreen();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
