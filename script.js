document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM ELEMENT SELECTION ---
    const form = document.getElementById('add-question-form');
    const questionText = document.getElementById('question-text');
    const questionLink = document.getElementById('question-link');
    const questionNotes = document.getElementById('question-notes');
    const questionTopic = document.getElementById('question-topic');
    const questionDifficulty = document.getElementById('question-difficulty');
    const revisionIntervals = document.getElementById('revision-intervals');
    const revisionList = document.getElementById('revision-list');
    const todayRevisionList = document.getElementById('today-revision-list');
    const allQuestionsList = document.getElementById('all-questions-list');
    const searchFilter = document.getElementById('search-filter');
    const topicFilter = document.getElementById('topic-filter');
    const difficultyFilter = document.getElementById('difficulty-filter');
    const allQuestionsDifficultyFilter = document.getElementById('all-questions-difficulty-filter');
    const difficultyCountsEl = document.getElementById('difficulty-counts');
    const addQuestionTitleText = document.getElementById('add-question-title-text');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');

    const calendarHeader = document.getElementById('calendar-month-year');
    const calendarGrid = document.getElementById('calendar-grid');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    const editForm = document.getElementById('edit-question-form');
    const confirmActionBtn = document.getElementById('confirm-action-btn');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const notesContent = document.getElementById('notes-content');
    
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const importFileInput = document.getElementById('import-file-input');

    const streakCounterEl = document.getElementById('streak-counter');
    const streakTextEl = document.getElementById('streak-text');

    // --- APP STATE & CONFIG ---
    let questions = [];
    let stats = { streak: 0, lastCompletedDate: null, unlockedRewards: [] };
    let currentUser = null;
    let userDataObjectId = null; // To store the objectId of the user's data record

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
    const getQuestions = () => questions;
    const getStats = () => stats;

    const saveData = async (newQuestions, newStats) => {
        if (!currentUser) {
            console.error("Save failed: No user logged in.");
            return;
        }

        // Store the old state in case we need to revert
        const oldQuestions = [...questions];
        const oldStats = { ...stats };

        // Optimistically update the UI
        questions = newQuestions;
        stats = newStats;
        updateUI();

        const dataToSave = { questions, stats };
        if (userDataObjectId) {
            dataToSave.objectId = userDataObjectId;
        }

        try {
            const savedObject = await Backendless.Data.of('user_data').save(dataToSave);
            console.log("Data saved successfully:", savedObject);
            // If this was a new record, store its objectId for future updates
            if (!userDataObjectId) {
                userDataObjectId = savedObject.objectId;
            }
        } catch (error) {
            console.error("Error saving data to Backendless:", error);
            showAlert(`Could not save changes: ${error.message}`, "Save Error");

            // *** FIX: Revert to the old state on failure ***
            questions = oldQuestions;
            stats = oldStats;
            updateUI(); // Update the UI to show the reverted state
        }
    };
    
    // --- DATE UTILS ---
    const getCorrectedDate = () => new Date(Date.now() + timeOffset);
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
        } catch (error) {
            console.warn('Could not sync time. Using local system time.', error);
            timeOffset = 0; 
        }
    };

    // --- INITIALIZATION ---
    const init = async () => {
        // --- Paste your Backendless details here ---
        const BACKENDLESS_APP_ID = 'DFE02D6C-1668-4FEA-9DE5-C312B7E5888A'; 
        const BACKENDLESS_API_KEY = 'EBFE225A-3D16-4347-A1F6-B99A702A7B91';
        // -----------------------------------------

        if (BACKENDLESS_APP_ID === 'YOUR_APP_ID' || BACKENDLESS_API_KEY === 'YOUR_JS_API_KEY') {
            showAlert('Please update script.js with your Backendless App ID and JS API Key.', 'Configuration Needed');
            return; // Stop execution if not configured
        }

        Backendless.initApp(BACKENDLESS_APP_ID, BACKENDLESS_API_KEY);
        
        await syncTime();
        calendarDate = getCorrectedDate();

        try {
            console.log("Attempting to validate existing login...");
            const isValidLogin = await Backendless.UserService.isValidLogin();
            if (isValidLogin) {
                currentUser = await Backendless.UserService.getCurrentUser();
                console.log("User session restored. User objectId:", currentUser.objectId);
            } else {
                console.log("No valid session found. Logging in as guest...");
                currentUser = await Backendless.UserService.loginAsGuest();
                console.log("Logged in as guest. User objectId:", currentUser.objectId);
            }
        } catch (error) {
            console.error("Authentication error during init:", error);
            showAlert(`Could not start a session: ${error.message}`, "Authentication Error");
            return; // Stop if we can't get a user
        }


        if (currentUser) {
            await fetchInitialData();
        }
        
        setupEventListeners();
        applyTheme();
    };
    
    const fetchInitialData = async () => {
        if (!currentUser) {
            console.log("Fetch skipped: No current user.");
            return;
        }

        console.log(`Fetching data for ownerId: '${currentUser.objectId}'`);

        try {
            const queryBuilder = Backendless.DataQueryBuilder.create();
            queryBuilder.setWhereClause(`ownerId = '${currentUser.objectId}'`);
            const result = await Backendless.Data.of('user_data').find(queryBuilder);

            console.log("Backendless fetch result:", result);

            if (result.length > 0) {
                const userData = result[0];
                console.log("Data fetched successfully:", userData);
                questions = userData.questions || [];
                stats = userData.stats || { streak: 0, lastCompletedDate: null, unlockedRewards: [] };
                userDataObjectId = userData.objectId; 
                console.log(`Found existing data. Loaded ${questions.length} questions.`);
            } else {
                console.log("No existing data found for this user. A new record will be created on the first save.");
            }
        } catch (error) {
            console.error("Error fetching initial data from Backendless:", error);
            showAlert(`Could not load your data: ${error.message}`, "Data Load Error");
        }
        
        updateUI();
    };

    const setupEventListeners = () => {
        form.addEventListener('submit', handleFormSubmit);
        revisionList.addEventListener('click', handleRevisionListClick);
        todayRevisionList.addEventListener('click', handleRevisionListClick);
        allQuestionsList.addEventListener('click', handleRevisionListClick);
        searchFilter.addEventListener('input', updateUI);
        topicFilter.addEventListener('change', updateUI);
        difficultyFilter.addEventListener('change', updateUI);
        allQuestionsDifficultyFilter.addEventListener('change', updateUI);
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
    
    const updateUI = () => {
        const currentQuestions = getQuestions();
        console.log(`Updating UI with ${currentQuestions.length} questions.`);
        populateTopicFilter(currentQuestions);
        renderFormHeader();
        renderTodaysRevisions(currentQuestions);
        renderRevisions(currentQuestions);
        renderCalendar(currentQuestions);
        renderStreak();
        renderProgress(currentQuestions);
        renderAllQuestionsList(currentQuestions);
        renderDifficultyCounts(currentQuestions);
    };

    const openModal = (modalId, onOpenCallback) => {
        if (onOpenCallback) onOpenCallback();
        document.getElementById(modalId).classList.remove('hidden');
    };
    const closeModal = (modalId) => {
        document.getElementById(modalId).classList.add('hidden');
    };
    
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

    const renderProgress = (q) => {
        const todayStr = getTodayStr();
        const todaysItems = q.filter(item => item.revisionDates.includes(todayStr));
        const completedItems = todaysItems.filter(item => item.completedDates.includes(todayStr));
        const total = todaysItems.length;
        const completed = completedItems.length;
        progressText.textContent = `${completed}/${total} Completed`;
        progressBar.style.width = total > 0 ? `${(completed / total) * 100}%` : '0%';
    };

    const updateStreak = async () => {
        let currentStats = { ...getStats() };
        const todayStr = getTodayStr();
        const yesterdayStr = getYesterdayStr();
        if (currentStats.lastCompletedDate === todayStr) return;
        if (currentStats.lastCompletedDate === yesterdayStr) {
            currentStats.streak += 1;
            await checkRewards(currentStats);
        } else {
            currentStats.streak = 1;
        }
        currentStats.lastCompletedDate = todayStr;
        await saveData(getQuestions(), currentStats);
    };

    const checkRewards = async (s) => {
        const { streak, unlockedRewards } = s;
        if (rewardMilestones[streak] && !unlockedRewards.includes(streak)) {
            document.getElementById('reward-title').textContent = rewardMilestones[streak].title;
            document.getElementById('reward-text').textContent = rewardMilestones[streak].text;
            openModal('reward-modal');
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            s.unlockedRewards.push(streak);
            await saveData(getQuestions(), s);
        }
    };

    const renderStreak = async () => {
        let currentStats = { ...getStats() };
        if (currentStats.lastCompletedDate && currentStats.lastCompletedDate < getYesterdayStr()) {
            currentStats.streak = 0;
            await saveData(getQuestions(), currentStats);
        }
        streakCounterEl.textContent = currentStats.streak || 0;
        streakTextEl.textContent = currentStats.streak > 0 ? `You're on a ${currentStats.streak}-day streak!` : 'Complete one to start!';
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

    const handleCalendarDayClick = (e) => {
        const dayEl = e.target.closest('.calendar-day');
        if (!dayEl || !dayEl.dataset.date) return;
        const clickedDate = dayEl.dataset.date;
        selectedStartDate = selectedStartDate === clickedDate ? null : clickedDate;
        renderFormHeader();
        renderCalendar(getQuestions());
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const intervalsInput = revisionIntervals.value.trim();
        const intervals = intervalsInput ? intervalsInput.split(',').map(num => parseInt(num.trim(), 10)).filter(num => !isNaN(num) && num > 0) : defaultIntervals;
    
        if (intervalsInput && intervals.length === 0) {
            showAlert("Invalid revision intervals.");
            return;
        }
        
        const startDate = selectedStartDate ? new Date(selectedStartDate + 'T00:00:00') : getCorrectedDate();
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
            notes: questionNotes.value,
            addedDate: getTodayStr(),
            revisionDates: revisionDates,
            completedDates: []
        };
    
        const currentQuestions = [...getQuestions(), newQuestion];
        await saveData(currentQuestions, getStats());
        form.reset();
        questionDifficulty.value = 'Medium';
        selectedStartDate = null;
        questionText.focus();
    };

    const handleEditFormSubmit = async (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('edit-question-id').value);
        let currentQuestions = [...getQuestions()];
        const questionIndex = currentQuestions.findIndex(q => q.id === id);
        if (questionIndex > -1) {
            currentQuestions[questionIndex] = {
                ...currentQuestions[questionIndex],
                text: document.getElementById('edit-question-text').value,
                link: document.getElementById('edit-question-link').value,
                topic: document.getElementById('edit-question-topic').value,
                difficulty: document.getElementById('edit-question-difficulty').value,
                notes: document.getElementById('edit-question-notes').value
            };
            await saveData(currentQuestions, getStats());
            closeModal('edit-modal');
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
        openConfirmModal('Delete Question?', 'This will permanently delete the question.', 'Delete', async () => {
            const updatedQuestions = getQuestions().filter(q => q.id !== id);
            await saveData(updatedQuestions, getStats());
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
            notesContent.textContent = question.notes || 'No notes added yet.';
            openModal('notes-modal');
        }
    };
    const toggleRevisionDone = async (id, date) => {
        let currentQuestions = [...getQuestions()];
        const question = currentQuestions.find(q => q.id === id);
        if (!question) return;
        
        const dateIndex = question.completedDates.indexOf(date);
        if (dateIndex === -1) {
            question.completedDates.push(date);
            if (date === getTodayStr()) {
                const allTodaysItems = currentQuestions.filter(q => q.revisionDates.includes(date));
                const completedTodaysItems = allTodaysItems.filter(q => q.completedDates.includes(date));
                if (allTodaysItems.length > 0 && completedTodaysItems.length === 1) { 
                     await updateStreak();
                     return; // updateStreak already saves, so we can exit to avoid double save
                }
            }
        } else {
            question.completedDates.splice(dateIndex, 1);
        }
        await saveData(currentQuestions, getStats());
    };

    const exportData = () => {
        const data = { questions: getQuestions(), stats: getStats() };
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dsa_revision_data_${getTodayStr()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const importData = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.questions || !Array.isArray(data.questions)) throw new Error('Invalid file format.');
                
                openConfirmModal('Import Data?', 'This will replace all your current data in the cloud.', 'Import & Replace',
                    async () => {
                        await saveData(data.questions || [], data.stats || { streak: 0, lastCompletedDate: null, unlockedRewards: [] });
                    }
                );
            } catch (error) {
                 showAlert('Failed to import file.');
            } finally {
                 importFileInput.value = '';
            }
        };
        reader.readAsText(file);
    };
    
    // --- RENDER FUNCTIONS (These remain mostly the same, as they operate on local state) ---
    const populateTopicFilter = (q) => {
        const topics = [...new Set(q.map(item => item.topic))];
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

    const renderCalendar = (q) => {
        calendarGrid.innerHTML = '';
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        calendarHeader.textContent = `${calendarDate.toLocaleString('default', { month: 'long' })} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const revisionDatesSet = new Set(q.flatMap(item => item.revisionDates));

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

    const renderTodaysRevisions = (q) => {
        todayRevisionList.innerHTML = '';
        const todayStr = getTodayStr();
        let todaysItems = q
            .filter(item => item.revisionDates.includes(todayStr))
            .map(item => ({ ...item, revisionDate: todayStr }));

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

    const renderRevisions = (q) => {
        revisionList.innerHTML = '';
        const scheduledRevisions = {};
        q.forEach(item => item.revisionDates.forEach(date => {
            if (!scheduledRevisions[date]) scheduledRevisions[date] = [];
            scheduledRevisions[date].push({ ...item, revisionDate: date });
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
            if (date === todayStr) dateHeaderClass = "text-lg font-bold text-indigo-600 dark:text-indigo-400";
            else if (date < todayStr) dateHeaderClass = "text-lg font-semibold text-gray-500 dark:text-gray-400";
            
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

    const renderDifficultyCounts = (q) => {
        const counts = { Easy: 0, Medium: 0, Hard: 0 };
        q.forEach(item => {
            if (counts.hasOwnProperty(item.difficulty)) {
                counts[item.difficulty]++;
            }
        });

        difficultyCountsEl.innerHTML = `
            <span class="font-semibold text-green-600 dark:text-green-400">Easy: ${counts.Easy}</span>
            <span class="font-semibold text-yellow-600 dark:text-yellow-400">Medium: ${counts.Medium}</span>
            <span class="font-semibold text-red-600 dark:text-red-400">Hard: ${counts.Hard}</span>
        `;
    };
    
    const renderAllQuestionsList = (q) => {
        allQuestionsList.innerHTML = '';
        
        const searchTerm = searchFilter.value.toLowerCase();
        const selectedTopic = topicFilter.value;
        const selectedDifficulty = allQuestionsDifficultyFilter.value;

        const filteredQuestions = q.filter(item => {
            const textMatch = !searchTerm || item.text.toLowerCase().includes(searchTerm);
            const topicMatch = !selectedTopic || item.topic === selectedTopic;
            const difficultyMatch = !selectedDifficulty || item.difficulty === selectedDifficulty;
            return textMatch && topicMatch && difficultyMatch;
        });

        if (filteredQuestions.length === 0) {
            allQuestionsList.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center py-8">No questions added yet, or none match the current filters.</p>`;
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'space-y-3';
        filteredQuestions.sort((a, b) => b.id - a.id);
        filteredQuestions.forEach(item => ul.appendChild(createBaseQuestionListItem(item)));
        allQuestionsList.appendChild(ul);
    };
    
    const createBaseQuestionListItem = (item) => {
        const difficultyColors = {
            Easy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
            Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
            Hard: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
        };
        const li = document.createElement('li');
        li.className = `flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700`;
        const addedDateFormatted = new Date(item.addedDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        li.innerHTML = `
            <div class="flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="inline-block bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">${item.topic}</span>
                    <span class="inline-block ${difficultyColors[item.difficulty] || difficultyColors.Medium} text-xs font-semibold px-2.5 py-0.5 rounded-full">${item.difficulty}</span>
                </div>
                <p class="text-gray-700 dark:text-gray-300 mt-1.5">${item.text}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Added on: ${addedDateFormatted}</p>
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


    // Start the application
    init();
});

