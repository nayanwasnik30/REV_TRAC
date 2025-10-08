document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENT SELECTION ---
    const form = document.getElementById('add-question-form');
    const questionText = document.getElementById('question-text');
    const questionLink = document.getElementById('question-link');
    const questionTopic = document.getElementById('question-topic');
    const questionDifficulty = document.getElementById('question-difficulty');
    const revisionIntervals = document.getElementById('revision-intervals');
    const revisionList = document.getElementById('revision-list');
    const todayRevisionList = document.getElementById('today-revision-list');
    const searchFilter = document.getElementById('search-filter');
    const topicFilter = document.getElementById('topic-filter');
    const difficultyFilter = document.getElementById('difficulty-filter');
    const addQuestionTitleText = document.getElementById('add-question-title-text');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');

    const calendarHeader = document.getElementById('calendar-month-year');
    const calendarGrid = document.getElementById('calendar-grid');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    
    // Progress Bar
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    // Modals
    const editForm = document.getElementById('edit-question-form');
    const confirmActionBtn = document.getElementById('confirm-action-btn');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const notesContent = document.getElementById('notes-content');
    
    // Data Management
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const importFileInput = document.getElementById('import-file-input');

    // Stats
    const streakCounterEl = document.getElementById('streak-counter');
    const streakTextEl = document.getElementById('streak-text');

    // --- APP STATE & CONFIG ---
    const defaultIntervals = [3, 7, 15, 30, 60];
    let calendarDate; 
    let selectedStartDate = null;
    const rewardMilestones = {
        3: { title: "On a Roll!", text: "You've maintained a 3-day streak. Great start!" },
        7: { title: "Week-long Warrior!", text: "A full week of revisions! This is how habits are built." },
        15: { title: "Serious Dedication!", text: "15 days straight! Your mind is getting sharper." },
        30: { title: "One Month Milestone!", text: "Incredible consistency! You're building a powerful knowledge base." }
    };
    let confirmCallback = null;
    let timeOffset = 0; 

    // --- DATA HANDLING ---
    const getQuestions = () => JSON.parse(localStorage.getItem('dsaQuestionsV5')) || [];
    const saveQuestions = (questions) => localStorage.setItem('dsaQuestionsV5', JSON.stringify(questions));
    const getStats = () => JSON.parse(localStorage.getItem('dsaStatsV5')) || { streak: 0, lastCompletedDate: null, unlockedRewards: [] };
    const saveStats = (stats) => localStorage.setItem('dsaStatsV5', JSON.stringify(stats));
    
    // --- DATE UTILS ---
    const getCorrectedDate = () => new Date(Date.now() + timeOffset);

    // MODIFIED: Manually format date to YYYY-MM-DD to avoid timezone conversion errors.
    const dateToYYYYMMDD = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const getTodayStr = () => dateToYYYYMMDD(getCorrectedDate());
    
    const getYesterdayStr = () => {
        const yesterday = getCorrectedDate();
        yesterday.setDate(yesterday.getDate() - 1);
        return dateToYYYYMMDD(yesterday);
    };
    
    const syncTime = async () => {
        try {
            const response = await fetch('https://worldtimeapi.org/api/timezone/Asia/Kolkata');
            if (!response.ok) throw new Error('Network response was not ok.');
            const data = await response.json();
            const serverTime = data.unixtime * 1000;
            timeOffset = serverTime - Date.now();
            console.log('Time synchronized with internet (Asia/Kolkata). Offset:', timeOffset, 'ms');
        } catch (error) {
            console.warn('Could not sync time with an internet source. Using local system time.', error);
            timeOffset = 0; 
        }
    };


    // --- INITIALIZATION ---
    const init = async () => {
        await syncTime();
        calendarDate = getCorrectedDate();
        updateUI();
        setupEventListeners();
        updateStreak();
        applyTheme();
    };

    const setupEventListeners = () => {
        form.addEventListener('submit', handleFormSubmit);
        revisionList.addEventListener('click', handleRevisionListClick);
        todayRevisionList.addEventListener('click', handleRevisionListClick);
        searchFilter.addEventListener('input', updateUI);
        topicFilter.addEventListener('change', updateUI);
        difficultyFilter.addEventListener('change', updateUI);
        darkModeToggle.addEventListener('click', toggleTheme);
        
        prevMonthBtn.addEventListener('click', () => {
            calendarDate.setMonth(calendarDate.getMonth() - 1);
            renderCalendar(getQuestions());
        });
        nextMonthBtn.addEventListener('click', () => {
            calendarDate.setMonth(calendarDate.getMonth() + 1);
            renderCalendar(getQuestions());
        });

        calendarGrid.addEventListener('click', handleCalendarDayClick);

        editForm.addEventListener('submit', handleEditFormSubmit);
        confirmActionBtn.addEventListener('click', () => {
            if (confirmCallback) confirmCallback();
            closeModal('confirm-modal');
        });
        exportBtn.addEventListener('click', exportData);
        importBtn.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', importData);
        
        document.querySelectorAll('.close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.modalId));
        });
    };
    
    // --- UI UPDATE & RENDERING ---
    const updateUI = () => {
        const questions = getQuestions();
        populateTopicFilter(questions);
        renderFormHeader();
        renderTodaysRevisions(questions);
        renderRevisions(questions);
        renderCalendar(questions);
        renderStreak();
        renderProgress(questions);
    };

    const openModal = (modalId, onOpenCallback) => {
        if (onOpenCallback) onOpenCallback();
        document.getElementById(modalId).classList.remove('hidden');
    };
    const closeModal = (modalId) => {
        document.getElementById(modalId).classList.add('hidden');
    };
    
    // --- THEME ---
    const applyTheme = () => {
        if (localStorage.theme === 'dark') {
            document.documentElement.classList.add('dark');
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        } else {
            document.documentElement.classList.remove('dark');
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        }
    };

    const toggleTheme = () => {
        localStorage.theme = localStorage.theme === 'dark' ? 'light' : 'dark';
        applyTheme();
    };

    // --- STREAK, REWARDS, PROGRESS LOGIC ---
    const renderProgress = (questions) => {
        const todayStr = getTodayStr();
        const todaysItems = questions.filter(q => q.revisionDates.includes(todayStr));
        const completedItems = todaysItems.filter(q => q.completedDates.includes(todayStr));
        const total = todaysItems.length;
        const completed = completedItems.length;
        progressText.textContent = `${completed}/${total} Completed`;
        progressBar.style.width = total > 0 ? `${(completed / total) * 100}%` : '0%';
    };
    const updateStreak = () => {
        const stats = getStats();
        const todayStr = getTodayStr();
        const yesterdayStr = getYesterdayStr();
        if (stats.lastCompletedDate === todayStr) return;
        if (stats.lastCompletedDate === yesterdayStr) {
            stats.streak += 1;
            checkRewards(stats);
        } else {
            stats.streak = 1;
        }
        stats.lastCompletedDate = todayStr;
        saveStats(stats);
        renderStreak();
    };
    const checkRewards = (stats) => {
        const { streak, unlockedRewards } = stats;
        if (rewardMilestones[streak] && !unlockedRewards.includes(streak)) {
            document.getElementById('reward-title').textContent = rewardMilestones[streak].title;
            document.getElementById('reward-text').textContent = rewardMilestones[streak].text;
            openModal('reward-modal');
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            stats.unlockedRewards.push(streak);
            saveStats(stats);
        }
    };
    const renderStreak = () => {
        const stats = getStats();
        if (stats.lastCompletedDate && stats.lastCompletedDate < getYesterdayStr()) {
            stats.streak = 0;
            saveStats(stats);
        }
        streakCounterEl.textContent = stats.streak || 0;
        streakTextEl.textContent = stats.streak > 0 ? `You're on a ${stats.streak}-day streak!` : 'Complete one to start!';
    };
    
    const renderFormHeader = () => {
        if (selectedStartDate) {
            const dateObj = new Date(selectedStartDate + 'T00:00:00');
            const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            addQuestionTitleText.textContent = `Add Question for ${formattedDate}`;
        } else {
            addQuestionTitleText.textContent = 'Add New Question';
        }
    };

    // --- FORM & EVENT HANDLING ---
    const handleCalendarDayClick = (e) => {
        const dayEl = e.target.closest('.calendar-day');
        if (!dayEl || !dayEl.dataset.date) return;
        const clickedDate = dayEl.dataset.date;
        selectedStartDate = selectedStartDate === clickedDate ? null : clickedDate;
        renderFormHeader();
        renderCalendar(getQuestions());
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        const intervalsInput = revisionIntervals.value.trim();
        const intervals = intervalsInput
            ? intervalsInput.split(',').map(num => parseInt(num.trim(), 10)).filter(num => !isNaN(num) && num > 0)
            : defaultIntervals;
    
        if (intervalsInput && intervals.length === 0) {
            showAlert("The revision intervals you entered are invalid. Please use comma-separated numbers like '5, 10, 25'.");
            return;
        }
        
        const startDate = selectedStartDate ? new Date(selectedStartDate + 'T00:00:00') : getCorrectedDate();
        
        // MODIFIED: Use the new date formatter to prevent timezone errors.
        const revisionDates = intervals.map(days => {
            const result = new Date(startDate);
            result.setDate(result.getDate() + days);
            return dateToYYYYMMDD(result);
        });
    
        const newQuestion = {
            id: Date.now(),
            text: questionText.value,
            link: questionLink.value,
            topic: questionTopic.value,
            difficulty: questionDifficulty.value,
            notes: '',
            addedDate: getTodayStr(),
            revisionDates: revisionDates,
            completedDates: []
        };
    
        const questions = getQuestions();
        questions.push(newQuestion);
        saveQuestions(questions);
        form.reset();
        questionDifficulty.value = 'Medium';
        selectedStartDate = null;
        updateUI();
    };

    const handleEditFormSubmit = (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('edit-question-id').value);
        let questions = getQuestions();
        const questionIndex = questions.findIndex(q => q.id === id);
        if (questionIndex > -1) {
            questions[questionIndex].text = document.getElementById('edit-question-text').value;
            questions[questionIndex].link = document.getElementById('edit-question-link').value;
            questions[questionIndex].topic = document.getElementById('edit-question-topic').value;
            questions[questionIndex].difficulty = document.getElementById('edit-question-difficulty').value;
            questions[questionIndex].notes = document.getElementById('edit-question-notes').value;
            saveQuestions(questions);
            closeModal('edit-modal');
            updateUI();
        }
    };
    const handleRevisionListClick = (e) => {
        const button = e.target.closest('button');
        const checkbox = e.target.closest('input[type="checkbox"]');
        if (checkbox) {
            toggleRevisionDone(parseInt(checkbox.dataset.id, 10), checkbox.dataset.date);
        } else if (button) {
            const action = button.dataset.action;
            const questionId = parseInt(button.dataset.id, 10);
            if (action === 'delete') deleteQuestion(questionId);
            else if (action === 'edit') openEditModal(questionId);
            else if (action === 'view-notes') openNotesModal(questionId);
        }
    };
    
    // --- ACTIONS ---
    const openConfirmModal = (title, text, actionText, onConfirm) => {
        confirmTitle.textContent = title;
        confirmText.textContent = text;
        confirmActionBtn.textContent = actionText;
        confirmCallback = onConfirm;
        openModal('confirm-modal');
    };
     const showAlert = (text, title = 'Invalid Input') => {
        document.getElementById('alert-title').textContent = title;
        document.getElementById('alert-text').textContent = text;
        openModal('alert-modal');
    };
    const deleteQuestion = (id) => {
        openConfirmModal('Delete Question?', 'This will permanently delete the question and all its revision dates. This action cannot be undone.', 'Delete', () => {
            saveQuestions(getQuestions().filter(q => q.id !== id));
            updateUI();
        });
    };
    const openEditModal = (id) => {
        const question = getQuestions().find(q => q.id === id);
        if (question) {
            document.getElementById('edit-question-id').value = question.id;
            document.getElementById('edit-question-text').value = question.text;
            document.getElementById('edit-question-link').value = question.link;
            document.getElementById('edit-question-topic').value = question.topic;
            document.getElementById('edit-question-difficulty').value = question.difficulty;
            document.getElementById('edit-question-notes').value = question.notes || '';
            openModal('edit-modal');
        }
    };
     const openNotesModal = (id) => {
        const question = getQuestions().find(q => q.id === id);
        if (question) {
            notesContent.textContent = question.notes || 'No notes added for this question yet.';
            openModal('notes-modal');
        }
    };
    const toggleRevisionDone = (id, date) => {
        let questions = getQuestions();
        const question = questions.find(q => q.id === id);
        if (!question) return;
        const dateIndex = question.completedDates.indexOf(date);
        const isCompleting = dateIndex === -1;
        if (isCompleting) {
            question.completedDates.push(date);
            if (date === getTodayStr()) {
                const allTodaysItems = questions.filter(q => q.revisionDates.includes(date));
                const completedTodaysItems = allTodaysItems.filter(q => q.completedDates.includes(date));
                if (allTodaysItems.length > 0 && completedTodaysItems.length === 1) { 
                     updateStreak();
                }
            }
        } else {
            question.completedDates.splice(dateIndex, 1);
        }
        saveQuestions(questions);
        updateUI();
    };

    // --- DATA MANAGEMENT ---
    const exportData = () => {
        const data = { questions: getQuestions(), stats: getStats() };
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dsa_revision_data_${getTodayStr()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const importData = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.questions || !Array.isArray(data.questions)) {
                   throw new Error('Invalid file format.');
                }
                openConfirmModal('Import Data?', 'This will replace all your current questions and stats. Make sure you have a backup if you need it.', 'Import & Replace',
                    () => {
                        saveQuestions(data.questions || []);
                        saveStats(data.stats || { streak: 0, lastCompletedDate: null, unlockedRewards: [] });
                        updateUI();
                    }
                );
            } catch (error) {
                 showAlert('Failed to import file. It may be corrupted or in the wrong format.');
            } finally {
                importFileInput.value = '';
            }
        };
        reader.readAsText(file);
    };
    
    // --- RENDER FUNCTIONS ---
    const populateTopicFilter = (questions) => {
        const topics = [...new Set(questions.map(q => q.topic))];
        const currentVal = topicFilter.value;
        topicFilter.innerHTML = '<option value="">All Topics</option>';
        topics.sort().forEach(topic => {
            const option = document.createElement('option');
            option.value = topic;
            option.textContent = topic;
            topicFilter.appendChild(option);
        });
        topicFilter.value = currentVal;
    };

    const renderCalendar = (questions) => {
        calendarGrid.innerHTML = '';
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        calendarHeader.textContent = `${calendarDate.toLocaleString('default', { month: 'long' })} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const revisionDatesSet = new Set(questions.flatMap(q => q.revisionDates));

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(day => {
            const dayEl = document.createElement('div');
            dayEl.className = 'text-center font-semibold text-sm text-gray-500 dark:text-gray-400';
            dayEl.textContent = day;
            calendarGrid.appendChild(dayEl);
        });

        for (let i = 0; i < firstDayOfMonth; i++) calendarGrid.appendChild(document.createElement('div'));
        for (let i = 1; i <= daysInMonth; i++) {
            const dayEl = document.createElement('div');
            // MODIFIED: Manually build the date string to prevent timezone errors.
            const monthString = String(month + 1).padStart(2, '0');
            const dayString = String(i).padStart(2, '0');
            const currentDateStr = `${year}-${monthString}-${dayString}`;
            
            dayEl.textContent = i;
            dayEl.className = 'calendar-day';
            dayEl.dataset.date = currentDateStr;

            if (revisionDatesSet.has(currentDateStr)) dayEl.classList.add('has-revision');
            if (currentDateStr === getTodayStr()) dayEl.classList.add('is-today');
            if (currentDateStr === selectedStartDate) dayEl.classList.add('is-selected');

            calendarGrid.appendChild(dayEl);
        }
    };
    
    const createRevisionListItem = (item) => {
       const isDone = item.completedDates.includes(item.revisionDate);
       const difficultyColors = {
            Easy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
            Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
            Hard: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
       };
       const li = document.createElement('li');
       li.className = `flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 transition-opacity ${isDone ? 'opacity-50' : ''}`;
       li.innerHTML = `
            <input type="checkbox" data-id="${item.id}" data-date="${item.revisionDate}" ${isDone ? 'checked' : ''} class="custom-checkbox mt-1 h-5 w-5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer">
            <div class="flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                     <span class="inline-block bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">${item.topic}</span>
                     <span class="inline-block ${difficultyColors[item.difficulty] || difficultyColors.Medium} text-xs font-semibold px-2.5 py-0.5 rounded-full">${item.difficulty}</span>
                </div>
                <p class="text-gray-700 dark:text-gray-300 mt-1.5 ${isDone ? 'line-through' : ''}">${item.text}</p>
            </div>
            <div class="flex items-center space-x-1">
                ${item.link ? `<a href="${item.link}" target="_blank" class="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1" title="Open question link"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg></a>` : ''}
                <button data-id="${item.id}" data-action="view-notes" class="text-gray-400 hover:text-green-600 dark:hover:text-green-400 p-1" title="View notes"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 16c1.255 0 2.443-.29 3.5-.804V4.804zM14.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 0114.5 16c1.255 0 2.443-.29 3.5-.804v-10A7.968 7.968 0 0014.5 4z" /></svg></button>
                <button data-id="${item.id}" data-action="edit" class="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 p-1" title="Edit question"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                <button data-id="${item.id}" data-action="delete" class="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1" title="Delete this question entirely">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
                </button>
            </div>
           `;
       return li;
    };
    
    const applyFilters = (items) => {
        const searchTerm = searchFilter.value.toLowerCase();
        const selectedTopic = topicFilter.value;
        const selectedDifficulty = difficultyFilter.value;
        return items.filter(item => {
            const textMatch = !searchTerm || item.text.toLowerCase().includes(searchTerm);
            const topicMatch = !selectedTopic || item.topic === selectedTopic;
            const difficultyMatch = !selectedDifficulty || item.difficulty === selectedDifficulty;
            return textMatch && topicMatch && difficultyMatch;
        });
    };

    const renderTodaysRevisions = (questions) => {
        todayRevisionList.innerHTML = '';
        const todayStr = getTodayStr();
        let todaysItems = questions
            .filter(q => q.revisionDates.includes(todayStr))
            .map(q => ({ ...q, revisionDate: todayStr }));

        todaysItems = applyFilters(todaysItems);

        if (todaysItems.length === 0) {
            todayRevisionList.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center py-4">All caught up for today! 🎉</p>`;
            return;
        }
        const ul = document.createElement('ul');
        ul.className = 'space-y-3';
        todaysItems.forEach(item => ul.appendChild(createRevisionListItem(item)));
        todayRevisionList.appendChild(ul);
    };

    const renderRevisions = (questions) => {
        revisionList.innerHTML = '';
        const scheduledRevisions = {};
        questions.forEach(q => q.revisionDates.forEach(date => {
            if (!scheduledRevisions[date]) scheduledRevisions[date] = [];
            scheduledRevisions[date].push({ ...q, revisionDate: date });
        }));
        
        const sortedDates = Object.keys(scheduledRevisions).sort((a, b) => new Date(a) - new Date(b));
        const todayStr = getTodayStr();
        
        let hasVisibleRevisions = false;
        sortedDates.forEach(date => {
            let itemsForDate = applyFilters(scheduledRevisions[date]);
            if (itemsForDate.length === 0) return;
            hasVisibleRevisions = true;
            const dateObj = new Date(date + 'T00:00:00');
            const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            let dateHeaderClass = "text-lg font-semibold text-gray-800 dark:text-gray-200";
            if (date === todayStr) {
                dateHeaderClass = "text-lg font-bold text-indigo-600 dark:text-indigo-400";
            } else if (date < todayStr) {
                dateHeaderClass = "text-lg font-semibold text-gray-500 dark:text-gray-400";
            }
            const dateGroupEl = document.createElement('div');
            dateGroupEl.className = 'fade-in';
            dateGroupEl.innerHTML = `<h3 class="${dateHeaderClass}">${formattedDate} ${date === todayStr ? '(Today)' : ''}</h3>`;
            const ul = document.createElement('ul');
            ul.className = 'mt-2 space-y-3';
            itemsForDate.forEach(item => ul.appendChild(createRevisionListItem(item)));
            dateGroupEl.appendChild(ul);
            revisionList.appendChild(dateGroupEl);
        });

         if (!hasVisibleRevisions) {
            revisionList.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center py-8">No scheduled revisions found for the selected filters.</p>`;
        }
    };

    // Start the application
    init();
});

