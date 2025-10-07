// Import Firebase services
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURATION & CONSTANTS ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "DEMO", authDomain: "DEMO", projectId: "DEMO" };
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const DEFAULT_SCHEDULE = [0, 3, 7, 15, 30, 60];
const DSA_TOPICS = [
    "Array", "String", "Two Pointers", "Sliding Window", "Linked List", "Stack", "Queue",
    "Binary Search", "Trees", "Tries", "Heaps", "Graphs", "Backtracking", "Dynamic Programming",
    "Bit Manipulation", "Math & Geometry", "Other"
];

// --- GLOBAL STATE & VARIABLES ---
let app, db, auth, userId;
let allQuestions = [];
let allReviews = [];
let userSettings = { customSchedule: DEFAULT_SCHEDULE };
let currentDate = new Date();
let editMode = { active: false, questionId: null };
let activeTagFilter = 'all';

// --- DOM ELEMENT REFERENCES ---
const progressContainer = document.getElementById('progress-container');
const progressHeader = document.getElementById('progress-header');
const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');
const viewTodayBtn = document.getElementById('view-today-btn');
const searchInput = document.getElementById('search-input');
const searchResultsContainer = document.getElementById('search-results-container');
const calendarContainer = document.getElementById('calendar-container');
const tagFilter = document.getElementById('tag-filter');
const monthYearLabel = document.getElementById('month-year-label');
const calendarGrid = document.getElementById('calendar-grid');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const addQuestionBtn = document.getElementById('add-question-btn');
const topicsBtn = document.getElementById('topics-btn');
const settingsBtn = document.getElementById('settings-btn');
const userIdDisplay = document.getElementById('user-id-display');
const statsContent = document.getElementById('stats-content');

// Modal Elements
const questionModal = document.getElementById('question-modal');
const modalTitle = document.getElementById('modal-title');
const modalSubtitle = document.getElementById('modal-subtitle');
const questionInput = document.getElementById('question-input');
const topicSelect = document.getElementById('topic-select');
const tagsInput = document.getElementById('tags-input');
const linkInput = document.getElementById('link-input');
const commentsInput = document.getElementById('comments-input');
const saveQuestionBtn = document.getElementById('save-question-btn');
const cancelBtn = document.getElementById('cancel-btn');

const viewQuestionsModal = document.getElementById('view-questions-modal');
const viewDateLabel = document.getElementById('view-date-label');
const questionsList = document.getElementById('questions-list');
const closeViewBtn = document.getElementById('close-view-btn');

const settingsModal = document.getElementById('settings-modal');
const scheduleInput = document.getElementById('schedule-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');

const topicsModal = document.getElementById('topics-modal');
const topicsList = document.getElementById('topics-list');
const closeTopicsBtn = document.getElementById('close-topics-btn');


// --- UTILITY FUNCTIONS ---
const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
};

const toggleModal = (modalElement, show) => {
    if (show) modalElement.classList.remove('modal-hidden', 'pointer-events-none');
    else modalElement.classList.add('modal-hidden', 'pointer-events-none');
};


// --- CORE LOGIC & DATA HANDLING ---
const getScheduledQuestions = () => {
    const scheduled = {};
    const filteredQuestions = activeTagFilter === 'all'
        ? allQuestions
        : allQuestions.filter(q => q.tags?.includes(activeTagFilter));

    filteredQuestions.forEach(q => {
        q.revisionDates?.forEach(dateStr => {
            if (!scheduled[dateStr]) scheduled[dateStr] = [];
            scheduled[dateStr].push(q);
        });
    });
    return scheduled;
};


// --- RENDER FUNCTIONS ---
function renderProgressBar() {
    const todayStr = formatDateToYYYYMMDD(new Date());
    const remainingToday = allQuestions.filter(q => q.revisionDates?.includes(todayStr)).length;
    const completedToday = allReviews.filter(r => r.dateStr === todayStr).length;
    const totalForToday = remainingToday + completedToday;
    if (totalForToday === 0) {
        progressContainer.classList.add('hidden');
        return;
    }
    progressContainer.classList.remove('hidden');
    const percentage = totalForToday > 0 ? (completedToday / totalForToday) * 100 : 0;
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${completedToday} / ${totalForToday}`;
    progressHeader.textContent = percentage === 100 ? "All Caught Up For Today! 🎉" : "Today's Progress";
}

function renderCalendar() {
    const scheduledQuestions = getScheduledQuestions();
    calendarGrid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    monthYearLabel.textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDayOfMonth; i++) calendarGrid.appendChild(document.createElement('div'));
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell relative p-1 sm:p-2 text-center border-2 border-transparent rounded-lg cursor-pointer aspect-square flex items-center justify-center';
        const dayNumber = document.createElement('span');
        dayNumber.textContent = day;
        cell.appendChild(dayNumber);
        const date = new Date(year, month, day);
        const dateStr = formatDateToYYYYMMDD(date);
        cell.dataset.date = dateStr;
        if (date.toDateString() === new Date().toDateString()) {
            cell.classList.add('today');
            dayNumber.classList.add('font-bold');
        }
        if (scheduledQuestions[dateStr]?.length > 0) {
            const dot = document.createElement('div');
            dot.className = 'absolute bottom-1 right-1 sm:bottom-2 sm:right-2 w-2 h-2 bg-red-500 rounded-full';
            cell.appendChild(dot);
        }
        cell.addEventListener('click', () => handleDayClick(dateStr));
        calendarGrid.appendChild(cell);
    }
}

function renderTagFilter() {
    const allTags = new Set(allQuestions.flatMap(q => q.tags || []));
    const currentFilter = tagFilter.value;
    tagFilter.innerHTML = '<option value="all">Filter by tag: All</option>';
    [...allTags].sort().forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagFilter.appendChild(option);
    });
    if (allTags.has(currentFilter)) {
        tagFilter.value = currentFilter;
    } else {
        tagFilter.value = 'all';
        activeTagFilter = 'all';
    }
}

function renderStatsDashboard() {
    if (!statsContent) return;
    const today = new Date();
    const oneWeekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
    const reviewsThisWeek = allReviews.filter(r => r.reviewedAt && r.reviewedAt.toDate() > oneWeekAgo);
    const reviewDates = [...new Set(allReviews.map(r => r.dateStr))].sort();
    let currentStreak = 0;
    if (reviewDates.length > 0) {
        const todayStr = formatDateToYYYYMMDD(new Date());
        const yesterdayStr = formatDateToYYYYMMDD(new Date(Date.now() - 864e5));
        if (reviewDates.includes(todayStr) || reviewDates.includes(yesterdayStr)) {
            currentStreak = 1;
            for (let i = reviewDates.length - 1; i > 0; i--) {
                const current = new Date(reviewDates[i]);
                const prev = new Date(reviewDates[i-1]);
                const diff = (current - prev) / (1000 * 60 * 60 * 24);
                if (diff === 1) currentStreak++;
                else break;
            }
        }
    }
    const tagCounts = {};
    allReviews.forEach(r => {
        const question = allQuestions.find(q => q.id === r.questionId);
        question?.tags?.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });
    const sortedTags = Object.entries(tagCounts).sort(([,a],[,b]) => b-a);
    statsContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div class="bg-gray-900 border border-gray-800 p-4 rounded-lg"><div class="text-3xl font-bold text-amber-400">${allReviews.length}</div><div class="text-sm text-gray-400">Total Reviews</div></div>
            <div class="bg-gray-900 border border-gray-800 p-4 rounded-lg"><div class="text-3xl font-bold text-amber-400">${reviewsThisWeek.length}</div><div class="text-sm text-gray-400">Reviews This Week</div></div>
            <div class="bg-gray-900 border border-gray-800 p-4 rounded-lg"><div class="text-3xl font-bold text-amber-400">${currentStreak}</div><div class="text-sm text-gray-400">Day Streak 🔥</div></div>
        </div>
        <div>
            <h4 class="font-bold mt-6 mb-2 text-gray-100">Top Topics</h4>
            <div class="space-y-2">
            ${sortedTags.length > 0 ? sortedTags.slice(0, 5).map(([tag, count]) => `<div class="flex justify-between items-center bg-gray-900/50 p-2 rounded-md"><span>${tag}</span><span class="font-medium text-gray-400">${count} reviews</span></div>`).join('') : '<p class="text-gray-400 italic">No tagged questions reviewed yet.</p>'}
            </div>
        </div>
    `;
}

function renderTopicsModal() {
    topicsList.innerHTML = '';
    const topicCounts = allQuestions.reduce((acc, q) => {
        if (q.topic) acc[q.topic] = (acc[q.topic] || 0) + 1;
        return acc;
    }, {});
    DSA_TOPICS.forEach(topic => {
        const count = topicCounts[topic] || 0;
        const topicEl = document.createElement('div');
        topicEl.className = 'bg-gray-900 border border-gray-800 p-4 rounded-lg flex justify-between items-center';
        topicEl.innerHTML = `<span class="font-semibold">${topic}</span><span class="bg-gray-700 text-gray-200 text-xs font-bold px-2 py-1 rounded-full">${count}</span>`;
        topicsList.appendChild(topicEl);
    });
}

function renderSearchResults(results) {
    searchResultsContainer.innerHTML = '';
    if (results.length === 0) {
        searchResultsContainer.innerHTML = `<p class="text-gray-400 italic text-center p-8">No questions found.</p>`;
        return;
    }
    const container = document.createElement('div');
    container.className = 'space-y-3';
    results
        .sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0))
        .forEach(q => container.appendChild(createQuestionCard(q, null)));
    searchResultsContainer.appendChild(container);
}


// --- UI COMPONENT CREATION ---
function createQuestionCard(q, dateStr) {
    const card = document.createElement('div');
    card.className = 'relative p-4 bg-gray-900/50 rounded-lg border border-l-4 border-gray-800 border-l-amber-500 group transition-all hover:border-l-amber-400';
    
    // Main content
    const contentWrapper = document.createElement('div');
    const questionText = document.createElement('p');
    questionText.className = 'font-semibold text-gray-100 pr-20';
    questionText.textContent = q.questionText;
    contentWrapper.appendChild(questionText);

    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'flex flex-wrap gap-2 mt-2';
    if (q.topic) {
        const topicEl = document.createElement('span');
        topicEl.className = 'tag topic-tag';
        topicEl.textContent = q.topic;
        tagsWrapper.appendChild(topicEl);
    }
    if (q.tags && q.tags.length > 0) {
        q.tags.forEach(t => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.textContent = t;
            tagsWrapper.appendChild(tagEl);
        });
    }
    contentWrapper.appendChild(tagsWrapper);

    if (q.comments) {
        const commentsText = document.createElement('p');
        commentsText.className = 'mt-2 text-sm text-gray-400 whitespace-pre-wrap';
        commentsText.textContent = q.comments;
        contentWrapper.appendChild(commentsText);
    }

    if (q.link) {
        const linkWrapper = document.createElement('div');
        linkWrapper.className = 'mt-3';
        const linkEl = document.createElement('a');
        linkEl.href = q.link;
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.className = 'inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 hover:underline';
        linkEl.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg> <span>Reference Link</span>`;
        linkWrapper.appendChild(linkEl);
        contentWrapper.appendChild(linkWrapper);
    }
    card.appendChild(contentWrapper);

    // Action buttons
    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity';
    
    if (dateStr) { 
        const reviewedBtn = document.createElement('button');
        reviewedBtn.title = "Mark as Reviewed";
        reviewedBtn.className = 'p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-900/50 rounded-full';
        reviewedBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
        reviewedBtn.onclick = () => handleMarkAsReviewed(q, dateStr, card);
        actionsWrapper.appendChild(reviewedBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.title = "Edit";
    editBtn.className = 'p-1.5 text-gray-400 hover:text-amber-400 hover:bg-amber-900/50 rounded-full';
    editBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path></svg>`;
    editBtn.onclick = () => handleEditQuestion(q);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.title = "Delete";
    deleteBtn.className = 'p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-900/50 rounded-full';
    deleteBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;
    actionsWrapper.appendChild(editBtn);
    actionsWrapper.appendChild(deleteBtn);
    card.appendChild(actionsWrapper);
    
    // Delete confirmation
    const confirmWrapper = document.createElement('div');
    confirmWrapper.className = 'absolute top-1 right-1 hidden items-center gap-1 bg-gray-800 p-1 rounded-md';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm Delete';
    confirmBtn.className = 'px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700';
    const cancelDeleteBtn = document.createElement('button');
    cancelDeleteBtn.textContent = 'Cancel';
    cancelDeleteBtn.className = 'px-2 py-1 text-xs bg-gray-600 rounded hover:bg-gray-500';
    confirmWrapper.appendChild(cancelDeleteBtn);
    confirmWrapper.appendChild(confirmBtn);
    card.appendChild(confirmWrapper);
    
    deleteBtn.onclick = () => {
        actionsWrapper.classList.add('hidden');
        confirmWrapper.classList.remove('hidden');
        confirmWrapper.classList.add('flex');
    };
    cancelDeleteBtn.onclick = () => {
        confirmWrapper.classList.add('hidden');
        confirmWrapper.classList.remove('flex');
        actionsWrapper.classList.remove('hidden');
    };
    confirmBtn.onclick = () => handleDelete(q.id, card);
    
    return card;
}


// --- EVENT HANDLERS ---
function handleDayClick(dateStr) {
    const questionsForDay = getScheduledQuestions()[dateStr] || [];
    viewDateLabel.textContent = new Date(dateStr + 'T00:00:00').toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });
    questionsList.innerHTML = '';
    if (questionsForDay.length > 0) {
        const container = document.createElement('div');
        container.className = 'space-y-4';
        questionsForDay
            .sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0))
            .forEach(q => container.appendChild(createQuestionCard(q, dateStr)));
        questionsList.appendChild(container);
    } else {
        questionsList.innerHTML = `<p class="text-gray-400 italic text-center py-8">No revisions for this day.</p>`;
    }
    toggleModal(viewQuestionsModal, true);
}

function handleEditQuestion(q) {
    editMode = { active: true, questionId: q.id };
    modalTitle.textContent = "Edit Question";
    saveQuestionBtn.textContent = "Save Changes";
    modalSubtitle.style.display = 'none';
    populateTopicSelect(q.topic);
    questionInput.value = q.questionText;
    tagsInput.value = q.tags?.join(', ') || '';
    linkInput.value = q.link || '';
    commentsInput.value = q.comments || '';
    toggleModal(viewQuestionsModal, false);
    toggleModal(questionModal, true);
}

function handleSearchInput() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    if (searchTerm.length > 0) {
        const results = allQuestions.filter(q => 
            q.questionText.toLowerCase().includes(searchTerm) ||
            q.comments?.toLowerCase().includes(searchTerm) ||
            q.topic?.toLowerCase().includes(searchTerm) ||
            q.tags?.some(t => t.toLowerCase().includes(searchTerm))
        );
        renderSearchResults(results);
        calendarContainer.classList.add('hidden');
        searchResultsContainer.classList.remove('hidden');
    } else {
        calendarContainer.classList.remove('hidden');
        searchResultsContainer.classList.add('hidden');
    }
}


// --- ASYNC FIRESTORE OPERATIONS ---
async function handleSaveQuestion() {
    const questionText = questionInput.value.trim();
    const topic = topicSelect.value;
    const tags = tagsInput.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const link = linkInput.value.trim();
    const comments = commentsInput.value.trim();
    if (!questionText) {
        questionInput.focus();
        questionInput.classList.add('border-red-500', 'ring-red-500');
        return;
    }
    const data = { questionText, topic, tags, link, comments };
    if (editMode.active) {
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/questions`, editMode.questionId);
        try { await updateDoc(docRef, data); } 
        catch(e) { console.error("Error updating document:", e); }
    } else {
        const today = new Date();
        const schedule = userSettings.customSchedule || DEFAULT_SCHEDULE;
        data.revisionDates = schedule.map(days => {
            const futureDate = new Date(today);
            futureDate.setDate(today.getDate() + days);
            return formatDateToYYYYMMDD(futureDate);
        });
        data.createdAt = serverTimestamp();
        try { await addDoc(collection(db, `artifacts/${appId}/users/${userId}/questions`), data); } 
        catch (e) { console.error("Error adding document: ", e); }
    }
    toggleModal(questionModal, false);
}

async function handleMarkAsReviewed(q, dateStr, cardElement) {
    const newRevisionDates = q.revisionDates.filter(d => d !== dateStr);
    const questionDocRef = doc(db, `artifacts/${appId}/users/${userId}/questions`, q.id);
    try {
        await updateDoc(questionDocRef, { revisionDates: newRevisionDates });
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/reviews`), {
            questionId: q.id,
            reviewedAt: serverTimestamp(),
            dateStr: dateStr
        });
        cardElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            cardElement.remove();
             if (questionsList.children[0]?.children.length === 0) {
                 questionsList.innerHTML = `<p class="text-gray-400 italic text-center py-8">No revisions for this day.</p>`;
            }
        }, 300);
    } catch (e) { console.error("Error marking as reviewed:", e); }
}

async function handleDelete(questionId, cardElement) {
    try {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/questions`, questionId));
        cardElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease, margin-bottom 0.3s ease, padding 0.3s ease, height 0.3s ease';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        cardElement.style.marginBottom = '-1rem';
        cardElement.style.paddingTop = '0';
        cardElement.style.paddingBottom = '0';
        cardElement.style.height = '0px';
        setTimeout(() => {
            cardElement.remove();
            if (questionsList.children[0]?.children.length === 0) {
                questionsList.innerHTML = `<p class="text-gray-400 italic text-center py-8">No revisions for this day.</p>`;
            }
        }, 300);
    } catch (error) { console.error("Error removing document: ", error); }
}

async function handleSaveSettings() {
    const scheduleStr = scheduleInput.value.trim();
    const schedule = scheduleStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0);
    if (schedule.length > 0) {
        try {
            await setDoc(doc(db, `artifacts/${appId}/users/${userId}/settings`, 'userSettings'), { customSchedule: schedule });
            userSettings.customSchedule = schedule;
            toggleModal(settingsModal, false);
        } catch (e) { console.error("Error saving settings:", e); }
    } else {
        scheduleInput.classList.add('border-red-500', 'ring-red-500');
    }
}


// --- FIRESTORE LISTENERS & SETUP ---
function populateTopicSelect(selectedValue) {
    topicSelect.innerHTML = '';
    DSA_TOPICS.forEach(topic => {
        const option = document.createElement('option');
        option.value = topic;
        option.textContent = topic;
        topicSelect.appendChild(option);
    });
    if (selectedValue) topicSelect.value = selectedValue;
}

function listenForQuestions() {
    const q = query(collection(db, `artifacts/${appId}/users/${userId}/questions`));
    onSnapshot(q, (snapshot) => {
        allQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTagFilter();
        renderCalendar();
        renderProgressBar();
        renderStatsDashboard();
        renderTopicsModal();
    }, (e) => console.error("Error fetching questions:", e));
}

function listenForReviews() {
    const q = query(collection(db, `artifacts/${appId}/users/${userId}/reviews`));
    onSnapshot(q, (snapshot) => {
        allReviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProgressBar();
        renderStatsDashboard();
    }, (e) => console.error("Error fetching reviews:", e));
}

async function fetchSettings() {
    const docRef = doc(db, `artifacts/${appId}/users/${userId}/settings`, 'userSettings');
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) userSettings = { ...userSettings, ...docSnap.data() };
        else await setDoc(docRef, { customSchedule: DEFAULT_SCHEDULE });
    } catch (e) { console.error("Error fetching settings:", e); }
}


// --- INITIALIZATION ---
function addEventListeners() {
    prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
    nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
    tagFilter.addEventListener('change', (e) => { activeTagFilter = e.target.value; renderCalendar(); });
    searchInput.addEventListener('input', handleSearchInput);
    
    addQuestionBtn.addEventListener('click', () => {
        editMode = { active: false, questionId: null };
        modalTitle.textContent = "Add a New Question";
        saveQuestionBtn.textContent = "Save Question";
        modalSubtitle.style.display = 'block';
        questionInput.value = '';
        tagsInput.value = '';
        linkInput.value = '';
        commentsInput.value = '';
        populateTopicSelect();
        toggleModal(questionModal, true);
    });
    settingsBtn.addEventListener('click', () => {
        scheduleInput.value = (userSettings.customSchedule || DEFAULT_SCHEDULE).join(', ');
        toggleModal(settingsModal, true);
    });
    topicsBtn.addEventListener('click', () => toggleModal(topicsModal, true));
    viewTodayBtn.addEventListener('click', () => {
        const todayStr = formatDateToYYYYMMDD(new Date());
        handleDayClick(todayStr);
    });

    cancelBtn.addEventListener('click', () => toggleModal(questionModal, false));
    saveQuestionBtn.addEventListener('click', handleSaveQuestion);
    closeViewBtn.addEventListener('click', () => toggleModal(viewQuestionsModal, false));
    saveSettingsBtn.addEventListener('click', handleSaveSettings);
    cancelSettingsBtn.addEventListener('click', () => toggleModal(settingsModal, false));
    closeTopicsBtn.addEventListener('click', () => toggleModal(topicsModal, false));
    
    [questionModal, viewQuestionsModal, settingsModal, topicsModal].forEach(modal => {
        modal.querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(modal, false));
    });
}

async function main() {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    
    addEventListeners();
    renderCalendar();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            userIdDisplay.textContent = userId; // Display full user ID
            await fetchSettings();
            listenForQuestions();
            listenForReviews();
        } else {
            // No user signed in, attempt to sign in.
            userIdDisplay.textContent = 'Authenticating...';
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (e) {
                console.error("Sign in failed", e);
                userIdDisplay.textContent = 'Authentication failed.';
            }
        }
    });
}

// Start the application
main();
