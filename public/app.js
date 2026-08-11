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
        workStart: '06:00',
        workEnd: '15:00',
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

    let editingDate = null; // track if we're editing an existing entry


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
    // Rates:
    //   Sencilla = salary / 240
    //   Tiempo y medio = (salary / 240) * 1.5
    //   Doble = (salary / 240) * 2
    //
    // Holiday logic:
    //   8 normal hours at simple rate (salary/240)
    //   + any extra hours at double rate (salary/240 * 2)
    
    function getHourlyRate() {
        return (state.settings.salary || 0) / 240;
    }

    function calculateOvertimeMinutes(checkOut, workEnd) {
        const checkOutMin = timeToMinutes(checkOut);
        const workEndMin = timeToMinutes(workEnd);
        return Math.max(0, checkOutMin - workEndMin);
    }

    function calculateEntryAmount(overtimeMinutes, isHoliday, otMultiplier) {
        const baseRate = getHourlyRate();
        
        if (isHoliday) {
            // Holiday: 8 normal hours at simple rate + extras at double
            const normalHoursAmount = 8 * baseRate; // 8hrs at sencilla
            const extraHoursAmount = (overtimeMinutes / 60) * (baseRate * 2); // extras at double
            return normalHoursAmount + extraHoursAmount;
        } else {
            // Normal day: overtime at the selected multiplier (1.5 or 2)
            return (overtimeMinutes / 60) * (baseRate * otMultiplier);
        }
    }

    function getEntryBreakdown(overtimeMinutes, isHoliday, otMultiplier) {
        const baseRate = getHourlyRate();
        
        if (isHoliday) {
            const normalAmount = 8 * baseRate;
            const extraAmount = (overtimeMinutes / 60) * (baseRate * 2);
            return {
                lines: [
                    `8h normales × ${formatMoney(baseRate)}/h (sencilla) = ${formatMoney(normalAmount)}`,
                    overtimeMinutes > 0 ? `${formatHours(overtimeMinutes)} extra × ${formatMoney(baseRate * 2)}/h (doble) = ${formatMoney(extraAmount)}` : null
                ].filter(Boolean),
                total: normalAmount + extraAmount
            };
        } else {
            const rate = baseRate * otMultiplier;
            const amount = (overtimeMinutes / 60) * rate;
            const label = otMultiplier === 2 ? 'doble' : 'tiempo y medio';
            return {
                lines: [
                    `${formatHours(overtimeMinutes)} × ${formatMoney(rate)}/h (${label}) = ${formatMoney(amount)}`
                ],
                total: amount
            };
        }
    }


    // ---- Authentication ----
    function loadSavedCredentials() {
        const saved = localStorage.getItem('ot_remember_credentials');
        if (saved) {
            try {
                const { email, password } = JSON.parse(saved);
                document.getElementById('auth-email').value = email || '';
                document.getElementById('auth-password').value = password || '';
                document.getElementById('remember-me').checked = true;
            } catch(e) {}
        }
    }

    function saveCredentials(email, password) {
        if (document.getElementById('remember-me').checked) {
            localStorage.setItem('ot_remember_credentials', JSON.stringify({ email, password }));
        } else {
            localStorage.removeItem('ot_remember_credentials');
        }
    }

    async function handleLogin() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        if (!email || !password) { showAuthError('Ingresa correo y contraseña'); return; }
        showLoading(true);
        hideAuthMessages();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        showLoading(false);
        if (error) { showAuthError('Credenciales incorrectas. ¿Necesitas crear una cuenta?'); }
        else { saveCredentials(email, password); }
    }

    async function handleRegister() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        if (!email || !password) { showAuthError('Ingresa correo y contraseña'); return; }
        if (password.length < 6) { showAuthError('La contraseña debe tener al menos 6 caracteres'); return; }
        showLoading(true);
        hideAuthMessages();
        const { data, error } = await supabase.auth.signUp({ email, password });
        showLoading(false);
        if (error) { showAuthError(error.message); }
        else {
            saveCredentials(email, password);
            if (data.user && !data.session) {
                showAuthSuccess('Cuenta creada. Revisa tu correo para confirmar. Si no llega, intenta iniciar sesión directamente.');
            }
        }
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        state.user = null; state.entries = []; state.cuts = [];
        state.todayEntry = null; state.settings = { ...DEFAULT_SETTINGS };
        showAuthScreen();
    }

    function showAuthError(msg) { const el = document.getElementById('auth-error'); el.textContent = msg; el.style.display = 'block'; }
    function showAuthSuccess(msg) { const el = document.getElementById('auth-success'); el.textContent = msg; el.style.display = 'block'; }
    function hideAuthMessages() { document.getElementById('auth-error').style.display = 'none'; document.getElementById('auth-success').style.display = 'none'; }
    function showAuthScreen() { document.getElementById('auth-screen').style.display = 'flex'; document.getElementById('app-main').style.display = 'none'; }
    function showAppScreen() { document.getElementById('auth-screen').style.display = 'none'; document.getElementById('app-main').style.display = 'block'; }


    // ---- Supabase Data Operations ----
    async function loadUserData() {
        if (!state.user) return;
        showLoading(true);

        const { data: settings } = await supabase
            .from('user_settings').select('*')
            .eq('user_id', state.user.id).single();

        if (settings) {
            state.settings = {
                workStart: settings.work_start || '06:00',
                workEnd: settings.work_end || '15:00',
                workDays: settings.work_days || [1, 2, 3, 4, 5],
                salary: parseFloat(settings.salary) || 0,
                currency: settings.currency || '$'
            };
        }

        const { data: entries } = await supabase
            .from('overtime_entries').select('*')
            .eq('user_id', state.user.id)
            .order('date', { ascending: false });

        state.entries = (entries || []).map(e => ({
            date: e.date,
            checkIn: e.check_in,
            checkOut: e.check_out,
            isHoliday: e.is_holiday,
            otMultiplier: e.ot_multiplier || 1.5,
            overtimeMinutes: e.overtime_minutes,
            amount: parseFloat(e.amount)
        }));

        // Check today's entry
        const today = getToday();
        const todayEntry = state.entries.find(e => e.date === today);
        if (todayEntry) {
            state.todayEntry = todayEntry;
            state.entries = state.entries.filter(e => e.date !== today);
        } else {
            state.todayEntry = null;
        }

        const { data: cuts } = await supabase
            .from('period_cuts').select('*')
            .eq('user_id', state.user.id)
            .order('cut_date', { ascending: false });

        state.cuts = (cuts || []).map(c => ({
            date: c.cut_date, periodStart: c.period_start, periodEnd: c.period_end,
            totalMinutes: c.total_minutes, totalAmount: parseFloat(c.total_amount),
            entriesCount: c.entries_count
        }));

        if (state.cuts.length > 0) {
            state.currentPeriodStart = state.cuts[0].periodEnd || state.cuts[0].date;
        }

        showLoading(false);
        renderAll();
    }

    async function saveSettings() {
        if (!state.user) return;
        const { error } = await supabase.from('user_settings').upsert({
            user_id: state.user.id,
            work_start: state.settings.workStart, work_end: state.settings.workEnd,
            work_days: state.settings.workDays, salary: state.settings.salary,
            currency: state.settings.currency, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) { console.error('Error saving settings:', error); showToast('Error al guardar'); }
        else { showToast('Configuración guardada ☁️'); }
    }

    async function saveEntry(entry) {
        if (!state.user) return;
        const { error } = await supabase.from('overtime_entries').upsert({
            user_id: state.user.id, date: entry.date,
            check_in: entry.checkIn, check_out: entry.checkOut,
            is_holiday: entry.isHoliday, ot_multiplier: entry.otMultiplier,
            overtime_minutes: entry.overtimeMinutes, amount: entry.amount,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,date' });
        if (error) { console.error('Error saving entry:', error); showToast('Error al guardar registro'); }
    }

    async function deleteEntry(date) {
        if (!state.user) return;
        const { error } = await supabase.from('overtime_entries').delete()
            .eq('user_id', state.user.id).eq('date', date);
        if (error) { console.error('Error deleting:', error); showToast('Error al eliminar'); }
    }

    async function saveCut(cut) {
        if (!state.user) return;
        const { error } = await supabase.from('period_cuts').insert({
            user_id: state.user.id, cut_date: cut.date,
            period_start: cut.periodStart, period_end: cut.periodEnd,
            total_minutes: cut.totalMinutes, total_amount: cut.totalAmount,
            entries_count: cut.entriesCount
        });
        if (error) { console.error('Error saving cut:', error); showToast('Error al guardar corte'); }
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
        document.getElementById('display-schedule').textContent = 
            `${formatTime(state.settings.workStart)} a ${formatTime(state.settings.workEnd)}`;

        const todayEntry = state.todayEntry;
        const statusText = document.getElementById('status-text');
        const checkoutRow = document.getElementById('checkout-row');
        const overtimeResult = document.getElementById('overtime-result');
        const btnCheckOut = document.getElementById('btn-check-out');
        const holidayToggle = document.getElementById('holiday-toggle');
        const otTypeSelector = document.getElementById('ot-type-selector');

        if (!todayEntry || !todayEntry.checkOut) {
            // Not checked out yet today
            statusText.textContent = '🟢 Jornada en curso';
            checkoutRow.style.display = 'none';
            btnCheckOut.style.display = 'block';
            holidayToggle.style.display = 'block';
            otTypeSelector.style.display = 'block';
            overtimeResult.style.display = 'none';
            document.getElementById('btn-reset-today').style.display = 'none';
        } else {
            // Already checked out
            statusText.textContent = '✅ Día completado';
            document.getElementById('display-check-out').textContent = formatTime(todayEntry.checkOut);
            checkoutRow.style.display = 'flex';
            btnCheckOut.style.display = 'none';
            holidayToggle.style.display = 'none';
            otTypeSelector.style.display = 'none';

            if (todayEntry.amount > 0) {
                overtimeResult.style.display = 'block';
                document.getElementById('result-overtime').textContent = formatHours(todayEntry.overtimeMinutes);
                document.getElementById('result-money').textContent = formatMoney(todayEntry.amount);
                // Breakdown
                const breakdown = getEntryBreakdown(todayEntry.overtimeMinutes, todayEntry.isHoliday, todayEntry.otMultiplier || 1.5);
                document.getElementById('result-breakdown').innerHTML = breakdown.lines.map(l => `<p class="breakdown-line">${l}</p>`).join('');
            } else {
                overtimeResult.style.display = 'none';
            }

            // Show reset button
            document.getElementById('btn-reset-today').style.display = 'block';
        }

        renderPeriodSummary();
    }

    function renderPeriodSummary() {
        const today = getToday();
        let allEntries = [...state.entries];
        // Include today's entry if checked out and not already in entries
        if (state.todayEntry && state.todayEntry.checkOut) {
            const alreadyIncluded = allEntries.some(e => e.date === state.todayEntry.date);
            if (!alreadyIncluded) {
                allEntries.push({ ...state.todayEntry });
            }
        }
        const periodEntries = allEntries.filter(e => e.date >= state.currentPeriodStart);
        let totalMinutes = 0, totalAmount = 0;
        periodEntries.forEach(e => {
            totalMinutes += e.overtimeMinutes || 0;
            totalAmount += parseFloat(e.amount) || 0;
        });
        document.getElementById('period-hours').textContent = formatHours(totalMinutes);
        document.getElementById('period-amount').textContent = formatMoney(totalAmount);
    }


    function renderHistory() {
        const filter = document.getElementById('filter-period').value;
        let entries = [...state.entries];
        // Include today's entry in history if it has a checkout
        if (state.todayEntry && state.todayEntry.checkOut) {
            const alreadyIncluded = entries.some(e => e.date === state.todayEntry.date);
            if (!alreadyIncluded) {
                entries.push({ ...state.todayEntry });
            }
        }
        if (filter === 'current') { entries = entries.filter(e => e.date >= state.currentPeriodStart); }
        entries.sort((a, b) => b.date.localeCompare(a.date));

        const historyList = document.getElementById('history-list');
        if (entries.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No hay registros aún</p>';
        } else {
            historyList.innerHTML = entries.map(entry => {
                const typeLabel = entry.isHoliday ? '🎉 Feriado' : (entry.otMultiplier === 2 ? '×2' : '×1.5');
                return `
                <div class="history-entry ${entry.isHoliday ? 'holiday' : ''}">
                    <div>
                        <div class="entry-date">${formatDate(entry.date)} <span class="entry-type-badge">${typeLabel}</span></div>
                        <div class="entry-details">Salida: ${formatTime(entry.checkOut)}</div>
                    </div>
                    <div style="text-align: right;">
                        <div class="entry-hours">${formatHours(entry.overtimeMinutes)}</div>
                        <div class="entry-amount">${formatMoney(entry.amount)}</div>
                    </div>
                    <div class="entry-actions">
                        <button class="entry-edit" data-date="${entry.date}" title="Editar">✏️</button>
                        <button class="entry-delete" data-date="${entry.date}" title="Eliminar">🗑️</button>
                    </div>
                </div>`;
            }).join('');
        }

        let totalMinutes = 0, totalAmount = 0;
        entries.forEach(e => { totalMinutes += e.overtimeMinutes || 0; totalAmount += parseFloat(e.amount) || 0; });
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
                    <p>Total horas: <strong>${formatHours(cut.totalMinutes)}</strong> | Total: <strong>${formatMoney(cut.totalAmount)}</strong></p>
                    <p>Registros: ${cut.entriesCount}</p>
                </div>`).join('');
        } else { cutsSection.style.display = 'none'; }
    }

    function renderSettings() {
        document.getElementById('work-start').value = state.settings.workStart;
        document.getElementById('work-end').value = state.settings.workEnd;
        document.getElementById('salary').value = state.settings.salary || '';
        document.getElementById('currency').value = state.settings.currency || '$';

        const dayCheckboxes = document.querySelectorAll('.days-grid input[type="checkbox"]');
        dayCheckboxes.forEach(cb => { cb.checked = state.settings.workDays.includes(parseInt(cb.value)); });

        const salaryInfo = document.getElementById('salary-info');
        if (state.settings.salary > 0) {
            salaryInfo.style.display = 'block';
            const base = getHourlyRate();
            document.getElementById('rate-simple').textContent = formatMoney(base);
            document.getElementById('rate-150').textContent = formatMoney(base * 1.5);
            document.getElementById('rate-double').textContent = formatMoney(base * 2);
        } else { salaryInfo.style.display = 'none'; }

        if (state.user) {
            document.getElementById('user-email').textContent = state.user.email;
            document.getElementById('settings-email').textContent = state.user.email;
        }
    }


    // ---- Modal for Add/Edit ----
    function openModal(entry) {
        const modal = document.getElementById('entry-modal');
        modal.style.display = 'flex';
        
        if (entry) {
            // Editing existing
            editingDate = entry.date;
            document.getElementById('modal-title').textContent = 'Editar Registro';
            document.getElementById('modal-date').value = entry.date;
            document.getElementById('modal-checkout').value = entry.checkOut || '';
            document.getElementById('modal-holiday').value = entry.isHoliday ? 'holiday' : 'normal';
            document.getElementById('modal-ot-type').value = String(entry.otMultiplier || 1.5);
        } else {
            // Adding new
            editingDate = null;
            document.getElementById('modal-title').textContent = 'Agregar Registro';
            document.getElementById('modal-date').value = getToday();
            document.getElementById('modal-checkout').value = '';
            document.getElementById('modal-holiday').value = 'normal';
            document.getElementById('modal-ot-type').value = '1.5';
        }
        updateModalPreview();
    }

    function closeModal() {
        document.getElementById('entry-modal').style.display = 'none';
        editingDate = null;
    }

    function updateModalPreview() {
        const checkout = document.getElementById('modal-checkout').value;
        const isHoliday = document.getElementById('modal-holiday').value === 'holiday';
        const otMultiplier = parseFloat(document.getElementById('modal-ot-type').value);
        const preview = document.getElementById('modal-preview');
        const otTypeGroup = document.getElementById('modal-ot-type-group');

        // Hide OT type selector when holiday (holidays always use double for extras)
        otTypeGroup.style.display = isHoliday ? 'none' : 'block';

        if (!checkout || state.settings.salary <= 0) {
            preview.innerHTML = '<p class="help-text">Ingresa hora de salida para ver el cálculo</p>';
            return;
        }

        const overtimeMinutes = calculateOvertimeMinutes(checkout, state.settings.workEnd);
        const amount = calculateEntryAmount(overtimeMinutes, isHoliday, otMultiplier);
        const breakdown = getEntryBreakdown(overtimeMinutes, isHoliday, otMultiplier);

        let html = '<div class="modal-preview-content">';
        if (isHoliday) {
            html += `<p><strong>Feriado:</strong> 8h a tarifa sencilla + extras a doble</p>`;
        }
        if (overtimeMinutes > 0) {
            html += `<p>Tiempo extra: <strong>${formatHours(overtimeMinutes)}</strong></p>`;
        }
        breakdown.lines.forEach(l => { html += `<p>${l}</p>`; });
        html += `<p class="preview-total">Total: <strong>${formatMoney(amount)}</strong></p>`;
        html += '</div>';
        preview.innerHTML = html;
    }

    async function saveModalEntry() {
        const date = document.getElementById('modal-date').value;
        const checkOut = document.getElementById('modal-checkout').value;
        const isHoliday = document.getElementById('modal-holiday').value === 'holiday';
        const otMultiplier = parseFloat(document.getElementById('modal-ot-type').value);

        if (!date || !checkOut) { showToast('Completa fecha y hora de salida'); return; }

        const overtimeMinutes = calculateOvertimeMinutes(checkOut, state.settings.workEnd);
        const amount = calculateEntryAmount(overtimeMinutes, isHoliday, otMultiplier);

        const entry = {
            date, checkIn: state.settings.workStart, checkOut,
            isHoliday, otMultiplier, overtimeMinutes, amount
        };

        await saveEntry(entry);

        // Update local state
        if (date === getToday()) {
            state.todayEntry = entry;
        } else {
            state.entries = state.entries.filter(e => e.date !== date);
            if (amount > 0 || isHoliday) { state.entries.push(entry); }
        }

        closeModal();
        renderAll();
        showToast(editingDate ? 'Registro actualizado ☁️' : 'Registro agregado ☁️');
    }


    // ---- Event Handlers ----
    function initEventListeners() {
        // Auth
        document.getElementById('btn-login').addEventListener('click', handleLogin);
        document.getElementById('btn-register').addEventListener('click', handleRegister);
        document.getElementById('btn-logout').addEventListener('click', handleLogout);
        document.getElementById('btn-logout-settings').addEventListener('click', handleLogout);

        // Toggle password visibility
        document.getElementById('btn-toggle-password').addEventListener('click', () => {
            const pwField = document.getElementById('auth-password');
            const btn = document.getElementById('btn-toggle-password');
            if (pwField.type === 'password') {
                pwField.type = 'text';
                btn.textContent = '🙈';
                btn.title = 'Ocultar contraseña';
            } else {
                pwField.type = 'password';
                btn.textContent = '👁️';
                btn.title = 'Ver contraseña';
            }
        });
        document.getElementById('auth-password').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
        document.getElementById('auth-email').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('auth-password').focus(); });

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

        // Check Out (today) - uses current time
        document.getElementById('btn-check-out').addEventListener('click', async () => {
            const checkOutTime = getCurrentTime();
            const isHoliday = document.getElementById('is-holiday').checked;
            const otMultiplier = parseFloat(document.getElementById('ot-type').value);
            const overtimeMinutes = calculateOvertimeMinutes(checkOutTime, state.settings.workEnd);
            const amount = calculateEntryAmount(overtimeMinutes, isHoliday, otMultiplier);

            const entry = {
                date: getToday(), checkIn: state.settings.workStart, checkOut: checkOutTime,
                isHoliday, otMultiplier, overtimeMinutes, amount
            };

            state.todayEntry = entry;
            await saveEntry(entry);

            // Also add to entries list for history
            state.entries = state.entries.filter(e => e.date !== entry.date);
            if (amount > 0 || isHoliday) { state.entries.push(entry); }

            renderAll();
            if (amount > 0) {
                showToast(`Check out! ${formatHours(overtimeMinutes)} extra = ${formatMoney(amount)}`);
            } else {
                showToast('Check out registrado. No hubo horas extra.');
            }
        });

        // Save Settings
        document.getElementById('btn-save-settings').addEventListener('click', async () => {
            state.settings.workStart = document.getElementById('work-start').value;
            state.settings.workEnd = document.getElementById('work-end').value;
            state.settings.salary = parseFloat(document.getElementById('salary').value) || 0;
            state.settings.currency = document.getElementById('currency').value || '$';
            const workDays = [];
            document.querySelectorAll('.days-grid input[type="checkbox"]:checked').forEach(cb => { workDays.push(parseInt(cb.value)); });
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
                const base = salary / 240;
                const currency = document.getElementById('currency').value || '$';
                document.getElementById('rate-simple').textContent = `${currency}${base.toFixed(2)}`;
                document.getElementById('rate-150').textContent = `${currency}${(base * 1.5).toFixed(2)}`;
                document.getElementById('rate-double').textContent = `${currency}${(base * 2).toFixed(2)}`;
            } else { salaryInfo.style.display = 'none'; }
        });

        // Add entry button
        document.getElementById('btn-add-entry').addEventListener('click', () => { openModal(null); });

        // Edit/Delete entry from history
        document.getElementById('history-list').addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.entry-edit');
            const deleteBtn = e.target.closest('.entry-delete');
            if (editBtn) {
                const date = editBtn.dataset.date;
                const entry = state.entries.find(en => en.date === date);
                if (entry) openModal(entry);
            }
            if (deleteBtn) {
                const date = deleteBtn.dataset.date;
                if (confirm('¿Eliminar este registro?')) {
                    await deleteEntry(date);
                    state.entries = state.entries.filter(en => en.date !== date);
                    renderAll();
                    showToast('Registro eliminado');
                }
            }
        });

        // Make Cut
        document.getElementById('btn-cut').addEventListener('click', async () => {
            const periodEntries = state.entries.filter(e => e.date >= state.currentPeriodStart);
            if (periodEntries.length === 0) { showToast('No hay registros en el período actual'); return; }
            let totalMinutes = 0, totalAmount = 0;
            periodEntries.forEach(e => { totalMinutes += e.overtimeMinutes || 0; totalAmount += parseFloat(e.amount) || 0; });
            const cut = { date: getToday(), periodStart: state.currentPeriodStart, periodEnd: getToday(), totalMinutes, totalAmount, entriesCount: periodEntries.length };
            await saveCut(cut);
            state.cuts.unshift(cut);
            state.currentPeriodStart = getToday();
            renderAll();
            showToast(`Corte: ${formatHours(totalMinutes)} = ${formatMoney(totalAmount)}`);
        });

        // Filter
        document.getElementById('filter-period').addEventListener('change', () => { renderHistory(); });

        // Reset today's entry
        document.getElementById('btn-reset-today').addEventListener('click', async () => {
            if (confirm('¿Borrar el registro de hoy?')) {
                await deleteEntry(getToday());
                state.todayEntry = null;
                state.entries = state.entries.filter(e => e.date !== getToday());
                renderAll();
                showToast('Registro de hoy borrado');
            }
        });

        // Modal events
        document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
        document.getElementById('btn-modal-save').addEventListener('click', saveModalEntry);
        document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
        document.getElementById('modal-checkout').addEventListener('input', updateModalPreview);
        document.getElementById('modal-holiday').addEventListener('change', updateModalPreview);
        document.getElementById('modal-ot-type').addEventListener('change', updateModalPreview);
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
        loadSavedCredentials();
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
