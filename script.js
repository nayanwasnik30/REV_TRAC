import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, onSnapshot, doc, updateDoc, deleteDoc, setDoc, getDoc, runTransaction, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "DEMO_KEY", authDomain: "DEMO.firebaseapp.com", projectId: "DEMO" };
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

let app, auth, db, userId;
let itemsUnsubscribe = null, statsUnsubscribe = null;
let allItems = [], userStats = {}, currentTopicFilter = 'all', currentDate = new Date();

const el = id => document.getElementById(id);
const loadingOverlay = el('loading-overlay'), mainView = el('main-view'), analyticsView = el('analytics-view'), addItemForm = el('add-item-form'), itemQuestionInput = el('item-question'), itemLinkInput = el('item-link'), itemTopicInput = el('item-topic'), todayRevisionsList = el('today-revisions-list'), allItemsList = el('all-items-list'), todayCountEl = el('today-count'), addItemBtn = el('add-item-btn'), toastContainer = el('toast-container'), modal = el('modal'), modalContent = el('modal-content'), modalTitle = el('modal-title'), modalBody = el('modal-body'), modalCancelBtn = el('modal-cancel-btn'), modalConfirmBtn = el('modal-confirm-btn'), analyticsBtn = el('analytics-btn'), backToMainBtn = el('back-to-main-btn'), cramBtn = el('cram-btn'), topicFilterContainer = el('topic-filter-container'), calendarHeader = el('calendar-header'), calendarBody = el('calendar-body'), prevMonthBtn = el('prev-month'), nextMonthBtn = el('next-month'), scheduleTypeSelect = el('schedule-type'), fixedScheduleContainer = el('fixed-schedule-container'), fixedIntervalsInput = el('fixed-intervals');

const getLocalDateString = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
const todayString = getLocalDateString(new Date());

const ACHIEVEMENTS = {
    first_item: { title: "First Step", icon: "fa-shoe-prints", desc: "Add your first item." },
    first_review: { title: "Apprentice", icon: "fa-book-open", desc: "Complete your first review." },
    streak_3: { title: "On a Roll", icon: "fa-fire-alt", desc: "Maintain a 3-day streak." },
    streak_7: { title: "Week Warrior", icon: "fa-calendar-week", desc: "Maintain a 7-day streak." },
    master_10: { title: "Adept Learner", icon: "fa-brain", desc: "Master 10 items." },
};

const switchView = (viewName) => {
    mainView.classList.add('hidden');
    analyticsView.classList.add('hidden');
    if (viewName === 'analytics') { analyticsView.classList.remove('hidden'); renderAnalytics(); }
    else { mainView.classList.remove('hidden'); }
};

const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    if (type === 'achievement') {
         toast.innerHTML = `<i class="fas fa-trophy mr-3 text-yellow-400"></i> <div class="flex flex-col"><span class="font-bold">Achievement Unlocked!</span><span>${message}</span></div>`;
    } else {
         toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-3"></i> ${message}`;
    }
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4000);
};

let confirmCallback = null;
const showModal = (title, bodyContent, confirmText, confirmClass, onConfirm, cancelText = 'Cancel') => {
    modalTitle.textContent = title;
    modalBody.innerHTML = '';
    if (typeof bodyContent === 'string') modalBody.innerHTML = bodyContent;
    else modalBody.appendChild(bodyContent);
    modalConfirmBtn.textContent = confirmText;
    modalConfirmBtn.className = `ds-button py-2 px-4 rounded-md ${confirmClass}`;
    modalCancelBtn.textContent = cancelText;
    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); modalContent.classList.remove('opacity-0', 'scale-95'); }, 10);
    confirmCallback = onConfirm;
};
const hideModal = () => {
    modal.classList.add('opacity-0');
    modalContent.classList.add('opacity-0', 'scale-95');
    setTimeout(() => { modal.classList.add('hidden'); confirmCallback = null; }, 300);
};

const handleCramSession = () => {
    let itemsToCram = allItems;
    if (currentTopicFilter !== 'all') {
        itemsToCram = allItems.filter(item => item.topic === currentTopicFilter);
    }
    if (itemsToCram.length === 0) return showToast(`No items to cram for "${currentTopicFilter}".`, "error");

    let currentIndex = 0;
    const showCramItem = () => {
        const item = itemsToCram[currentIndex];
        const body = document.createElement('div');
        body.innerHTML = `<div class="prose-styles">${marked.parse(item.question)}</div>`;
        showModal(`Cram Session (${currentIndex + 1}/${itemsToCram.length})`, body, "Next", '', () => {
            currentIndex = (currentIndex + 1) % itemsToCram.length;
            showCramItem();
        }, "End");
    };
    showCramItem();
};

const calculateSmartRevision = (item, quality) => {
    let { efactor = 2.5, repetition = 0, interval = 0 } = item;
    if (quality < 3) { repetition = 0; interval = 1; } 
    else {
        efactor = Math.max(1.3, efactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
        repetition += 1;
        if (repetition === 1) interval = 1;
        else if (repetition === 2) interval = 6;
        else interval = Math.ceil(interval * efactor);
    }
    const nextRevision = new Date();
    nextRevision.setDate(nextRevision.getDate() + interval);
    return { nextRevisionDate: getLocalDateString(nextRevision), efactor, repetition, interval, scheduleType: 'smart', status: 'pending' };
};

const calculateFixedRevision = (item) => {
    const { schedule, revisionIndex = 0, addedDate } = item;
    const newIndex = revisionIndex + 1;
    if (newIndex >= schedule.length) {
        return { status: 'completed', revisionIndex: newIndex, nextRevisionDate: null };
    }
    const nextInterval = schedule[newIndex];
    const baseDate = new Date(addedDate); // Base date is always the creation date for predictable scheduling.
    baseDate.setDate(baseDate.getDate() + nextInterval);
    return { revisionIndex: newIndex, nextRevisionDate: getLocalDateString(baseDate), status: 'pending' };
};

const createTodayRevisionHTML = item => {
    const topicTag = item.topic ? `<span class="inline-block bg-yellow-900/70 text-[var(--theme-yellow)] text-xs font-semibold px-2 py-0.5 rounded-full">${item.topic}</span>` : '';
    let buttonsHTML;
    if (item.scheduleType === 'fixed') {
        buttonsHTML = `<button data-id="${item.id}" class="review-btn-fixed text-sm py-1 px-4 rounded-md bg-blue-700/80 hover:bg-blue-600/80 transition text-white">Done</button>`;
    } else {
        buttonsHTML = `<button data-id="${item.id}" data-quality="1" class="review-btn-smart text-xs py-1 px-3 rounded-md bg-red-800/80 hover:bg-red-700/80 transition text-white">Hard</button>
                    <button data-id="${item.id}" data-quality="3" class="review-btn-smart text-xs py-1 px-3 rounded-md bg-amber-600/80 hover:bg-amber-500/80 transition text-white">Good</button>
                    <button data-id="${item.id}" data-quality="5" class="review-btn-smart text-xs py-1 px-3 rounded-md bg-green-700/80 hover:bg-green-600/80 transition text-white">Easy</button>`;
    }
    return `<div class="bg-black/20 p-3 rounded-md">
                <div class="prose-styles mb-2">${marked.parse(item.question)}</div>
                ${topicTag ? `<div class="mt-1.5">${topicTag}</div>` : ''}
                <div class="flex justify-end space-x-2 mt-2">${buttonsHTML}</div>
            </div>`;
}

const createTrackerItemHTML = item => {
     const topicTag = item.topic ? `<span class="ml-2 inline-block bg-yellow-900/70 text-[var(--theme-yellow)] text-xs font-semibold px-2.5 py-1 rounded-full">${item.topic}</span>` : '';
     const scheduleIcon = item.scheduleType === 'fixed' ? `<i class="fas fa-calendar-alt text-slate-500" title="Fixed Schedule"></i>` : `<i class="fas fa-lightbulb text-slate-500" title="Smart Schedule"></i>`;
     const nextDateText = item.status === 'completed' ? 'Completed' : (item.nextRevisionDate ? `Next: ${item.nextRevisionDate}` : 'Scheduled');
    return `<div class="bg-black/20 p-4 rounded-md flex justify-between items-center">
                <div class="flex-1 pr-4">
                    <div class="prose-styles">${marked.parse(item.question)}</div>
                    <p class="text-xs text-slate-400 mt-1">${nextDateText}</p>
                </div>
                <div class="flex items-center space-x-3">
                     ${topicTag} ${scheduleIcon}
                    <button data-id="${item.id}" class="edit-item-btn text-slate-500 hover:text-[var(--theme-yellow)] transition"><i class="fas fa-pencil-alt"></i></button>
                    <button data-id="${item.id}" class="delete-item-btn text-slate-500 hover:text-[var(--theme-red)] transition"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
}

const renderAll = () => {
    const todaysItems = allItems.filter(item => item.nextRevisionDate && item.nextRevisionDate <= todayString && item.status !== 'completed');
    todayCountEl.textContent = todaysItems.length;
    todayRevisionsList.innerHTML = todaysItems.length > 0 ? todaysItems.map(createTodayRevisionHTML).join('') : `<div class="text-center py-4"><i class="fas fa-moon text-2xl text-slate-500 mb-2"></i><p class="text-slate-400">All clear for today.</p></div>`;
    
    renderTopicFilters();
    renderAllItemsTracker();
    renderCalendar();
};

const renderAllItemsTracker = () => {
     let filteredItems = allItems;
    if (currentTopicFilter !== 'all') {
        filteredItems = allItems.filter(item => item.topic === currentTopicFilter);
    }
    const sortedItems = [...filteredItems].sort((a,b) => (a.nextRevisionDate || 'z').localeCompare(b.nextRevisionDate || 'z'));
    allItemsList.innerHTML = sortedItems.length > 0 ? sortedItems.map(createTrackerItemHTML).join('') : `<div class="text-center py-8"><i class="fas fa-feather-alt text-3xl text-slate-500 mb-3"></i><p class="text-slate-400">No items${currentTopicFilter !== 'all' ? ` for topic "${currentTopicFilter}"` : ''}.</p></div>`;
};

const renderTopicFilters = () => {
    const topics = [...new Set(allItems.map(item => item.topic).filter(Boolean))];
    topics.sort();
    let filterHtml = `<select id="topic-filter" class="ds-select w-full sm:w-48 rounded-md p-2 text-sm appearance-none bg-no-repeat bg-right pr-8" style="background-image: url('data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3e%3cpath fill=%27none%27 stroke=%27%23ffc300%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27m2 5 6 6 6-6%27/%3e%3c/svg%3e');"><option value="all">All Topics</option>${topics.map(topic => `<option value="${topic}" ${currentTopicFilter === topic ? 'selected' : ''}>${topic}</option>`).join('')}</select>`;
    topicFilterContainer.innerHTML = filterHtml;
};

const renderCalendar = () => {
    calendarBody.innerHTML = '';
    const { year, month } = { year: currentDate.getFullYear(), month: currentDate.getMonth() };
    calendarHeader.textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;
    
    const revisionDatesSet = new Set();
    allItems.forEach(item => {
        if (item.status === 'completed') return;

        if (item.scheduleType === 'smart' && item.nextRevisionDate) {
            revisionDatesSet.add(item.nextRevisionDate);
        } else if (item.scheduleType === 'fixed' && item.schedule && typeof item.revisionIndex !== 'undefined') {
            for (let i = item.revisionIndex; i < item.schedule.length; i++) {
                const interval = item.schedule[i];
                const baseDate = new Date(item.addedDate);
                const revisionDate = new Date(baseDate);
                revisionDate.setDate(revisionDate.getDate() + interval);
                revisionDatesSet.add(getLocalDateString(revisionDate));
            }
        }
    });

    const firstDay = new Date(year, month, 1).getDay(), lastDate = new Date(year, month + 1, 0).getDate();
    let cells = Array.from({ length: firstDay }, () => '<div></div>');
    for (let day = 1; day <= lastDate; day++) {
        const dateStr = getLocalDateString(new Date(year, month, day));
        const isTodayClass = dateStr === todayString ? 'is-today' : '';
        const hasRevisionClass = revisionDatesSet.has(dateStr) ? 'has-revision' : '';
        cells.push(`<div class="calendar-day ${isTodayClass} ${hasRevisionClass}">${day}</div>`);
    }
    calendarBody.innerHTML = cells.join('');
};

const renderAnalytics = () => {
    el('stats-current-streak').textContent = userStats.currentStreak || 0;
    el('stats-longest-streak').textContent = userStats.longestStreak || 0;
    el('stats-items-mastered').textContent = userStats.itemsMastered || 0;
    renderHeatmap();
    renderAchievements();
};

const renderHeatmap = () => {
    const container = el('heatmap-calendar'); container.innerHTML = ''; const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = monthDate.toLocaleString('default', { month: 'long' });
        const monthEl = document.createElement('div');
        monthEl.innerHTML = `<h4 class="font-display text-2xl text-white tracking-wider mb-2">${monthName}</h4>`;
        const grid = document.createElement('div'); grid.className = 'grid grid-cols-7 gap-2';
        const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay();
        for (let j = 0; j < firstDay; j++) grid.appendChild(document.createElement('div'));
        const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            const dateStr = getLocalDateString(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
            const count = userStats.revisionHistory?.[dateStr] || 0;
            let colorClass = 'bg-slate-700/30';
            if (count > 0) colorClass = 'bg-yellow-800/70'; if (count > 2) colorClass = 'bg-yellow-600/80'; if (count > 5) colorClass = 'bg-yellow-400/90';
            dayEl.className = `w-full h-8 rounded ${colorClass}`; dayEl.title = `${dateStr}: ${count} reviews`;
            grid.appendChild(dayEl);
        }
        monthEl.appendChild(grid); container.appendChild(monthEl);
    }
};

const renderAchievements = () => {
    const container = el('achievements-list');
    container.innerHTML = Object.entries(ACHIEVEMENTS).map(([id, ach]) => {
        const unlocked = userStats.achievements?.includes(id);
        return `<div class="flex flex-col items-center p-4 rounded-lg ${unlocked ? 'bg-yellow-900/50' : 'bg-slate-800/50 opacity-50'}"><i class="fas ${ach.icon} text-4xl ${unlocked ? 'text-[var(--theme-yellow)]' : 'text-slate-500'} mb-2"></i><h5 class="font-bold text-lg">${ach.title}</h5><p class="text-xs text-slate-400">${ach.desc}</p></div>`;
    }).join('');
};

const grantAchievement = async (achievementId) => {
    if (!userStats.achievements?.includes(achievementId)) {
        await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/stats/main`), { achievements: arrayUnion(achievementId) });
        showToast(ACHIEVEMENTS[achievementId].title, 'achievement');
    }
};

const handleAddItem = async e => {
    e.preventDefault();
    const question = itemQuestionInput.value.trim();
    if (!question) return;
    toggleButtonLoading(addItemBtn, true);
    
    let newItemData = {
        question, 
        link: itemLinkInput.value.trim(), 
        topic: itemTopicInput.value.trim(), 
        addedDate: todayString,
        scheduleType: scheduleTypeSelect.value
    };

    if (newItemData.scheduleType === 'fixed') {
        const intervals = fixedIntervalsInput.value.split(',').map(s => parseInt(s.trim())).filter(num => !isNaN(num) && num > 0);
        if (intervals.length === 0) {
            showToast("Please provide valid, positive numbers for intervals.", "error");
            toggleButtonLoading(addItemBtn, false);
            return;
        }
        newItemData.schedule = intervals;
        newItemData.revisionIndex = 0; // Index of the upcoming revision
        const baseDate = new Date(newItemData.addedDate); // Base date is the creation date
        baseDate.setDate(baseDate.getDate() + (intervals[0] || 0));
        newItemData.nextRevisionDate = getLocalDateString(baseDate);
        newItemData.status = 'pending';
    } else {
        newItemData = {...newItemData, ...calculateSmartRevision({}, 3)};
    }

    try {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/revisit_items`), newItemData);
        showToast("Item Forged!");
        addItemForm.reset();
        scheduleTypeSelect.value = 'smart';
        fixedScheduleContainer.classList.add('hidden');
        grantAchievement('first_item');
    } catch (e) { console.error("Error adding item: ", e); showToast("Failed to add item.", "error"); } 
    finally { toggleButtonLoading(addItemBtn, false); }
};

const handleReviewItem = async (itemId, quality = null) => {
    const item = allItems.find(i => i.id === itemId); if (!item) return;
    const updates = item.scheduleType === 'fixed' ? calculateFixedRevision(item) : calculateSmartRevision(item, quality);
    const statsRef = doc(db, `artifacts/${appId}/users/${userId}/stats/main`);
    try {
        await runTransaction(db, async (transaction) => {
            const statsDoc = await transaction.get(statsRef); if (!statsDoc.exists()) throw "Stats document does not exist!";
            let { currentStreak = 0, longestStreak = 0, lastCompletedDate = '', revisionHistory = {}, itemsMastered = 0 } = statsDoc.data();
            if (lastCompletedDate !== todayString) {
                 const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
                 currentStreak = lastCompletedDate === getLocalDateString(yesterday) ? currentStreak + 1 : 1;
                 lastCompletedDate = todayString;
                 if (currentStreak > longestStreak) longestStreak = currentStreak;
            }
            const newHistoryCount = (revisionHistory[todayString] || 0) + 1;
            const newMasteredCount = item.status === 'completed' ? itemsMastered : (updates.status === 'completed' || (updates.interval && updates.interval > 30) ? itemsMastered + 1 : itemsMastered);
            
            transaction.update(doc(db, `artifacts/${appId}/users/${userId}/revisit_items/${itemId}`), updates);
            transaction.update(statsRef, { currentStreak, longestStreak, lastCompletedDate, [`revisionHistory.${todayString}`]: newHistoryCount, itemsMastered: newMasteredCount });
        });
        showToast("Revision logged.");
        grantAchievement('first_review');
        if (userStats.currentStreak >= 2) grantAchievement('streak_3');
        if (userStats.currentStreak >= 6) grantAchievement('streak_7');
        if (userStats.itemsMastered >= 9) grantAchievement('master_10');
    } catch (e) { console.error("Error reviewing item:", e); showToast("Failed to log review.", 'error'); }
};

const handleEditItem = (itemId) => {
    const item = allItems.find(i => i.id === itemId); if (!item) return;
    const formContent = document.createElement('div');
    let scheduleHTML = '';
     if (item.scheduleType === 'fixed') {
        const progress = item.revisionIndex < item.schedule.length ? `Progress: Step ${item.revisionIndex + 1} of ${item.schedule.length}` : 'Completed';
        scheduleHTML = `
            <label class="block text-sm font-medium text-slate-400 mt-4 mb-2">Intervals</label>
            <input id="edit-intervals-input" type="text" value="${item.schedule.join(', ')}" class="ds-input w-full rounded-md p-3" placeholder="Intervals...">
            <p class="text-xs text-slate-400 mt-2">${progress}</p>
        `;
    }
    formContent.innerHTML = `<textarea id="edit-question-input" class="ds-input w-full rounded-md p-3" rows="5">${item.question}</textarea><input id="edit-link-input" type="url" value="${item.link || ''}" class="ds-input w-full rounded-md p-3 mt-4" placeholder="Reference link..."><input id="edit-topic-input" type="text" value="${item.topic || ''}" list="topics-list" class="ds-input w-full rounded-md p-3 mt-4" placeholder="Topic...">${scheduleHTML}`;
    showModal('Edit Item', formContent, 'Save', '', async () => {
        const newQuestion = el('edit-question-input').value.trim();
        if (!newQuestion) return showToast("Question cannot be empty.", "error");
        
        let updates = {
            question: newQuestion,
            link: el('edit-link-input').value.trim(),
            topic: el('edit-topic-input').value.trim()
        };

        if (item.scheduleType === 'fixed') {
            const intervals = el('edit-intervals-input').value.split(',').map(s => parseInt(s.trim())).filter(num => !isNaN(num) && num > 0);
            if (intervals.length === 0) return showToast("Invalid intervals.", "error");
            updates.schedule = intervals;
        }
        
        try {
            await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/revisit_items/${itemId}`), updates);
            showToast("Item updated.");
            hideModal();
        } catch (e) { console.error("Error updating item:", e); showToast("Failed to update item.", "error"); }
    });
};

const handleDeleteItem = itemId => showModal('Delete Item', '<p>Are you sure?</p>', 'Delete', 'red', async () => {
    try {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/revisit_items/${itemId}`));
        showToast("Item deleted.");
    } catch (e) { console.error("Error deleting item:", e); showToast("Failed to delete item.", "error"); } 
    finally { hideModal(); }
});

const setupListenersForUser = () => {
    const itemsQuery = query(collection(db, `artifacts/${appId}/users/${userId}/revisit_items`));
    itemsUnsubscribe = onSnapshot(itemsQuery, snapshot => {
        allItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAll();
        loadingOverlay.style.opacity = '0';
        setTimeout(() => loadingOverlay.style.display = 'none', 300);
    }, e => { console.error("Data listener error:", e); showToast("Could not load data.", "error"); });

    const statsRef = doc(db, `artifacts/${appId}/users/${userId}/stats/main`);
    statsUnsubscribe = onSnapshot(statsRef, (docSnap) => {
        if (docSnap.exists()) {
             userStats = docSnap.data();
        } else {
            setDoc(statsRef, { currentStreak: 0, longestStreak: 0, lastCompletedDate: '', revisionHistory: {}, itemsMastered: 0, achievements: [] });
        }
    });
};

const cleanupListeners = () => {
    if (itemsUnsubscribe) itemsUnsubscribe();
    if (statsUnsubscribe) statsUnsubscribe();
};

const initialize = async () => {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        onAuthStateChanged(auth, user => {
            cleanupListeners();
            if (user) { userId = user.uid; setupListenersForUser(); switchView('main'); } 
            else {
                userId = null; allItems = []; renderAll(); switchView('main');
                loadingOverlay.style.opacity = '0';
                setTimeout(() => loadingOverlay.style.display = 'none', 300);
            }
        });
        if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
        else await signInAnonymously(auth);
    } catch (e) { console.error("Initialization Error:", e); loadingOverlay.innerHTML = `<p class="text-red-400">Error initializing.</p>`; }
};

const toggleButtonLoading = (btn, isLoading) => {
    const btnText = btn.querySelector('.btn-text'), btnLoader = btn.querySelector('.btn-loader');
    btn.disabled = isLoading;
    btnText.classList.toggle('hidden', isLoading);
    btnLoader.classList.toggle('hidden', !isLoading);
};

analyticsBtn.addEventListener('click', () => switchView('analytics'));
backToMainBtn.addEventListener('click', () => switchView('main'));
scheduleTypeSelect.addEventListener('change', (e) => {
    fixedScheduleContainer.classList.toggle('hidden', e.target.value !== 'fixed');
});
addItemForm.addEventListener('submit', handleAddItem);
todayRevisionsList.addEventListener('click', e => {
    const smartBtn = e.target.closest('.review-btn-smart');
    const fixedBtn = e.target.closest('.review-btn-fixed');
    if (smartBtn) handleReviewItem(smartBtn.dataset.id, parseInt(smartBtn.dataset.quality, 10));
    if (fixedBtn) handleReviewItem(fixedBtn.dataset.id);
});
allItemsList.addEventListener('click', e => {
    const editBtn = e.target.closest('.edit-item-btn'), deleteBtn = e.target.closest('.delete-item-btn');
    if (editBtn) handleEditItem(editBtn.dataset.id);
    if (deleteBtn) handleDeleteItem(deleteBtn.dataset.id);
});
cramBtn.addEventListener('click', handleCramSession);
topicFilterContainer.addEventListener('change', e => {
    if (e.target.id === 'topic-filter') {
        currentTopicFilter = e.target.value;
        renderAllItemsTracker();
    }
});
prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
modalCancelBtn.addEventListener('click', hideModal);
modalConfirmBtn.addEventListener('click', () => confirmCallback && confirmCallback());
document.addEventListener('DOMContentLoaded', initialize);
