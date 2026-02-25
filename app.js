
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🔐 SECURE: Load Firebase config from global window object
const firebaseConfig = window.FIREBASE_CONFIG || {
    apiKey: "YOUR_LOCAL_API_KEY",
    authDomain: "highgradedli.firebaseapp.com",
    databaseURL: "https://highgradedli-default-rtdb.firebaseio.com",
    projectId: "highgradedli",
    storageBucket: "highgradedli.firebasestorage.app",
    messagingSenderId: "646678404662",
    appId: "1:646678404662:web:64994e29c1f8901e7d8297"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Global variables
let currentUser = null;
let currentSubject = '';
let currentMode = '';
let currentQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let timerInterval;
let timeLeft = 0;
let totalTime = 0;
let timePerQuestion = 0; // Made global so all functions can access it
let examStartTime = 0;
let isSoundEnabled = true;
let userAnswers = {};
let bookmarks = [];
let nextQuestionTimeout; // To manage auto-advance delay
const speechSynthesis = window.speechSynthesis;
const positiveMessages = ["Wow!", "Amazing!", "Nice one!", "Good job!", "Excellent!", "Perfect!", "Correct!", "Fantastic!"];
const negativeMessages = ["Oh sorry!", "Try again!", "Not quite!", "Incorrect!", "Wrong answer!", "Keep trying!"];

// Theme and Sound toggles
const themeToggle = document.getElementById('theme-toggle');
const soundToggle = document.getElementById('sound-toggle');

if (localStorage.getItem('hgdl_theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
}

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');    
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('hgdl_theme', newTheme);
});

soundToggle.addEventListener('click', function() {
    isSoundEnabled = !isSoundEnabled;
    this.classList.toggle('muted', !isSoundEnabled);
    if (isSoundEnabled) speak("Sound enabled"); 
    else speechSynthesis?.cancel();
});
soundToggle.classList.toggle('muted', !isSoundEnabled);

// Navigation
window.showSection = function(id) {
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id !== 'exam-section') {
        clearInterval(timerInterval);
        if(nextQuestionTimeout) clearTimeout(nextQuestionTimeout);
    }
    if (id === 'subject-section') loadProgressDashboard();
    if (id === 'admin-section') { 
        loadStudents(); 
        loadAdminQuestions(); 
    }
};

window.logout = function() {
    currentUser = null;
    document.getElementById('adm-input').value = '';
    showSection('login-section');
};

// Student Management
async function loadStudents() {
    const container = document.getElementById('student-list-container');    container.innerHTML = '<p>Loading...</p>';
    
    try {
        console.log("🔍 Loading students from Firebase...");
        const querySnapshot = await getDocs(collection(db, "students"));
        let students = [];
        querySnapshot.forEach((doc) => {
            students.push({ id: doc.id, ...doc.data() });
        });

        console.log("✅ Found students:", students);
        document.getElementById('student-count').textContent = students.length;
        
        if (students.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">No students registered yet</p>';
            return;
        }        
        container.innerHTML = '';
        students.forEach((student) => {
            const studentCard = document.createElement('div');
            studentCard.className = 'student-card';
            studentCard.innerHTML = `
                <div class="student-info">
                    <div class="student-label">Admission Number</div>
                    <div class="student-number">${student.adm}</div>
                </div>
                <div class="item-actions">
                    <button class="edit-btn" onclick="editStudent('${student.id}', '${student.adm}')">✏️ Edit</button>
                    <button class="delete-btn" onclick="deleteStudent('${student.id}')">🗑️ Delete</button>
                </div>
            `;
            container.appendChild(studentCard);
        });
    } catch (error) {
        console.error("❌ Error loading students:", error);
        container.innerHTML = '<p style="color:red;">Error loading students. Check console.</p>';
    }
}

window.saveStudent = async function() {
    const input = document.getElementById('new-adm');
    const editId = document.getElementById('edit-adm-index').value;
    const adm = input.value.trim().toUpperCase();
    
    if (!adm) { alert("⚠️ Please enter an admission number"); return; }
    if (!/^[A-Z0-9\/\-_]+$/.test(adm)) { alert("⚠️ Use only letters, numbers, /, -, or _"); return; }
    
    try {
        if (editId === "-1") {
            console.log("➕ Adding new student:", adm);            const q = query(collection(db, "students"), where("adm", "==", adm));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) { alert("⚠️ This admission number already exists"); return; }
            
            await addDoc(collection(db, "students"), { adm: adm });
            console.log("✅ Student added successfully!");
        } else {
            console.log("✏️ Updating student:", adm);
            await updateDoc(doc(db, "students", editId), { adm: adm });
            console.log("✅ Student updated successfully!");
        }
        
        input.value = '';
        document.getElementById('edit-adm-index').value = '-1';
        document.getElementById('save-student-btn').textContent = "✅ Register Number";
        alert("✅ Student saved successfully!");        
        loadStudents();
    } catch (error) {
        console.error("❌ Error saving student:", error);
        alert("❌ Error: " + error.message);
    }
};

window.editStudent = function(id, currentAdm) {
    document.getElementById('new-adm').value = currentAdm;
    document.getElementById('edit-adm-index').value = id;
    document.getElementById('save-student-btn').textContent = "💾 Update Number";
    document.getElementById('new-adm').focus();
};

window.deleteStudent = async function(id) {
    if (!confirm("⚠️ Are you sure you want to remove this student's access?")) return;
    try {
        await deleteDoc(doc(db, "students", id));
        console.log("✅ Student deleted");
        loadStudents();
    } catch (error) {
        console.error("❌ Error deleting student:", error);
        alert("Error deleting student.");
    }
};

// Login Function
window.handleLogin = async function() {
    const adm = document.getElementById('adm-input').value.trim().toUpperCase();
    if(!adm) return alert("Please enter admission number");

    try {
        console.log("🔐 Attempting login for:", adm);
        const q = query(collection(db, "students"), where("adm", "==", adm));        const querySnapshot = await getDocs(q);
        
        console.log("📊 Query results:", querySnapshot.size);
        
        if (!querySnapshot.empty) {
            currentUser = adm;
            document.getElementById('user-display').textContent = adm;
            alert("✅ Login successful! Welcome " + adm);
            showSection('subject-section');
        } else {
            console.log("❌ No student found with admission:", adm);
            alert("❌ Access Denied\n\nAdmission number not registered.\nPlease contact administrator.");
        }
    } catch (error) {
        console.error("❌ Login error:", error);
        alert("❌ Connection error: " + error.message);    
    }
};

// Progress Tracking
async function loadProgressDashboard() {
    const dashboard = document.getElementById('progress-dashboard');
    dashboard.innerHTML = '<p>Loading stats...</p>';
    
    try {
        const q = query(collection(db, "progress"), where("user", "==", currentUser));
        const querySnapshot = await getDocs(q);
        
        let userData = {};
        querySnapshot.forEach((doc) => { userData[doc.data().subject] = doc.data(); });

        let html = '';
        const subjects = ['ecn131', 'bus120', 'bus112', 'acc121', 'irp120', 'ecn141', 'ns31'];
        
        subjects.forEach(sub => {
            const subData = userData[sub];
            const attempts = subData ? subData.attempts : 0;
            const avg = subData ? Math.round(subData.totalScore / attempts) : 0;
            const last = subData ? new Date(subData.lastDate?.seconds * 1000 || Date.now()).toLocaleDateString() : 'Never';
                            
            html += `
            <div class="stat-card">
                <div class="stat-label">${sub.toUpperCase()}</div>
                <div class="stat-value">${attempts}</div>
                <div class="stat-label">Attempts</div>
                <div style="margin-top:5px; font-size:0.8rem; color:#666;">Avg: ${avg}% | Last: ${last}</div>
            </div>`;
        });
        dashboard.innerHTML = html;
    } catch (error) {        console.error("Error loading progress:", error);
        dashboard.innerHTML = 'Error loading stats.';
    }
}

async function saveProgress(subject, scorePercent) {
    const q = query(collection(db, "progress"), where("user", "==", currentUser), where("subject", "==", subject));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        await addDoc(collection(db, "progress"), {
            user: currentUser, subject: subject, attempts: 1,
            totalScore: scorePercent, lastDate: new Date()
        });
    } else {
        const docId = querySnapshot.docs[0].id;        
        const oldData = querySnapshot.docs[0].data();
        await updateDoc(doc(db, "progress", docId), {
            attempts: oldData.attempts + 1,
            totalScore: oldData.totalScore + scorePercent,
            lastDate: new Date()
        });
    }
}

// Admin Question Management
let currentAdminSubject = 'ecn131';

document.querySelectorAll('.subject-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentAdminSubject = this.dataset.subject;
        loadAdminQuestions();
    });
});

async function loadAdminQuestions() {
    const container = document.getElementById('questions-list');
    container.innerHTML = '<p>Loading questions...</p>';
    
    try {
        const q = query(collection(db, "questions"), where("subject", "==", currentAdminSubject));
        const querySnapshot = await getDocs(q);
        
        let questions = [];
        querySnapshot.forEach((doc) => questions.push({ id: doc.id, ...doc.data() }));

        document.getElementById('q-count').textContent = questions.length;
        container.innerHTML = '';        
        if (questions.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">No questions added yet</div>';
            return;
        }
        
        questions.forEach((q, index) => {
            const correctLetter = String.fromCharCode(65 + q.answer);
            container.innerHTML += `                
            <div class="question-item">
                <div style="flex:1; margin-right:10px;">
                    <strong>Q${index + 1}:</strong> ${q.q.substring(0, 50)}...<br>
                    <small style="color:#666;">✅ ${correctLetter}</small>
                </div>
                <div class="item-actions">
                    <button class="edit-btn" onclick="editQuestion('${q.id}')">✏️ Edit</button>                    
                    <button class="delete-btn" onclick="deleteQuestion('${q.id}')">🗑️</button>
                </div>
            </div>`;
        });
    } catch (error) {
        console.error("Error loading questions:", error);
        container.innerHTML = 'Error loading questions.';
    }
}

window.saveQuestion = async function() {
    const editId = document.getElementById('edit-q-id').value;
    const qText = document.getElementById('admin-q-text').value.trim();
    const qExp = document.getElementById('admin-q-exp').value.trim();
    const optA = document.getElementById('opt-a').value.trim();
    const optB = document.getElementById('opt-b').value.trim();
    const optC = document.getElementById('opt-c').value.trim();
    const optD = document.getElementById('opt-d').value.trim();
    const correctAnswer = parseInt(document.querySelector('input[name="correct-answer"]:checked').value);
    
    if (!qText || !optA || !optB || !optC || !optD) return alert("⚠️ Please fill in all fields");
    
    const questionData = { 
        subject: currentAdminSubject, q: qText, 
        options: [optA, optB, optC, optD], 
        answer: correctAnswer, exp: qExp || "No explanation provided."
    };

    try {
        if (editId) {
            await updateDoc(doc(db, "questions", editId), questionData);
            clearAdminForm(); alert("✅ Question Updated!");
        } else {
            await addDoc(collection(db, "questions"), questionData);            clearAdminForm(); alert("✅ Question Added!");
        }
        loadAdminQuestions();
    } catch (error) {
        console.error("Error saving question:", error);
        alert("Error saving question.");
    }
};

window.editQuestion = async function(id) {
    const qSnap = await getDocs(query(collection(db, "questions"), where("subject", "==", currentAdminSubject)));
    let targetQ = null;
    qSnap.forEach(d => { if(d.id === id) targetQ = d.data(); });
    if(!targetQ) return;

    document.getElementById('edit-q-id').value = id;    
    document.getElementById('admin-q-text').value = targetQ.q;
    document.getElementById('admin-q-exp').value = targetQ.exp;
    document.getElementById('opt-a').value = targetQ.options[0];
    document.getElementById('opt-b').value = targetQ.options[1];
    document.getElementById('opt-c').value = targetQ.options[2];
    document.getElementById('opt-d').value = targetQ.options[3];
    
    const radios = document.getElementsByName('correct-answer');
    radios[targetQ.answer].checked = true;
    
    document.getElementById('save-question-btn').textContent = "💾 Update Question";
    document.getElementById('cancel-edit-btn').style.display = "inline-block";
};

window.clearAdminForm = function() {
    document.getElementById('edit-q-id').value = "";
    document.getElementById('save-question-btn').textContent = "💾 Save Question";
    document.getElementById('cancel-edit-btn').style.display = "none";
    document.getElementById('admin-q-text').value = '';
    document.getElementById('admin-q-exp').value = '';
    document.getElementById('opt-a').value = '';
    document.getElementById('opt-b').value = '';
    document.getElementById('opt-c').value = '';
    document.getElementById('opt-d').value = '';
    document.querySelector('input[name="correct-answer"][value="0"]').checked = true;
};

window.deleteQuestion = async function(id) {
    if (!confirm("⚠️ Delete this question?")) return;
    try {
        await deleteDoc(doc(db, "questions", id));
        loadAdminQuestions();
    } catch (error) {
        console.error("Error deleting question:", error);        alert("Error deleting question.");
    }
};

// Mode Selection
window.goToModeSelection = function() {
    const sub = document.getElementById('subject-select').value;
    if (!sub) return alert("⚠️ Please select a subject first");
    currentSubject = sub;
    const subjectNames = { ecn131: 'ECN 131', bus120: 'BUS 120', bus112: 'BUS 112', acc121: 'ACC 121', irp120: 'IRP 120', ecn141: 'ECN 141', ns31: 'NS 31' };
    document.getElementById('selected-subject-display').textContent = subjectNames[sub];
    showSection('mode-section');
};

// Start Exam
window.startExam = async function() {    
    currentMode = document.getElementById('mode-select').value;
    try {
        const q = query(collection(db, "questions"), where("subject", "==", currentSubject));
        const querySnapshot = await getDocs(q);
        
        let fetchedQuestions = [];
        querySnapshot.forEach((doc) => fetchedQuestions.push(doc.data()));

        currentQuestions = fetchedQuestions.sort(() => Math.random() - 0.5);

        if(currentQuestions.length === 0) { alert("No questions available for this subject yet!"); return; }

        currentQuestionIndex = 0; 
        score = 0; 
        userAnswers = {}; 
        bookmarks = [];
        examStartTime = Date.now();
        
        // Set time per question based on mode
        if (currentMode === 'beginner') {
            timePerQuestion = 0;  
            totalTime = 7200;  
        } else if (currentMode === 'advance') {
            timePerQuestion = 45;  
            totalTime = currentQuestions.length * timePerQuestion;
        } else if (currentMode === 'professional') {
            timePerQuestion = 30;  
            totalTime = currentQuestions.length * timePerQuestion;
        }

        // Initialize timer state
        timeLeft = timePerQuestion > 0 ? timePerQuestion : totalTime;

        document.getElementById('subject-badge').textContent = currentSubject.toUpperCase();        document.getElementById('mode-badge').textContent = currentMode.charAt(0).toUpperCase() + currentMode.slice(1) + ' Mode';
        
        startTimer();
        showSection('exam-section');
        
        runCountdown(() => { 
            loadQuestion(0); 
            if (isSoundEnabled) speakQuestion(currentQuestions[0]);
        });
    } catch (error) {
        console.error("Error starting exam:", error);
        alert("Failed to load questions. Check connection.");
    }
};

function runCountdown(callback) {
    const overlay = document.getElementById('countdown-overlay');
    overlay.style.display = 'flex';
    let count = 3;
    overlay.textContent = count;
    const interval = setInterval(() => {
        count--;
        if (count > 0) overlay.textContent = count;
        else { 
            clearInterval(interval); 
            overlay.style.display = 'none'; 
            callback(); 
        }
    }, 1000);
}

function startTimer() {
    // Clear any existing timer first to prevent duplicates
    if (timerInterval) clearInterval(timerInterval);
    
    updateTimerDisplay(); 
    updateTimerBar();
    
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        updateTimerBar();
        
        if (timeLeft <= 0) {
            handleTimeUp();
        }
    }, 1000);
}

function updateTimerDisplay() {    const m = Math.floor(timeLeft / 60), s = timeLeft % 60;
    document.getElementById('timer-display').textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateTimerBar() {
    const progress = document.getElementById('timer-progress');
    // Calculate percentage based on current question time or total time
    let percentage;
    if (timePerQuestion > 0) {
        percentage = (timeLeft / timePerQuestion) * 100;
    } else {
        percentage = (timeLeft / totalTime) * 100;
    }
    
    progress.style.width = `${percentage}%`;
    if (percentage > 60) progress.className = 'timer-progress';
    else if (percentage > 30) progress.className = 'timer-progress blue';
    else progress.className = 'timer-progress red';
}

// Bookmarking
window.toggleBookmark = function() {
    const btn = document.getElementById('bookmark-btn');
    const icon = document.getElementById('bookmark-icon');
    
    if (bookmarks.includes(currentQuestionIndex)) {
        bookmarks = bookmarks.filter(i => i !== currentQuestionIndex);
        btn.classList.remove('bookmarked'); icon.textContent = '☆';
    } else {
        bookmarks.push(currentQuestionIndex);
        btn.classList.add('bookmarked'); icon.textContent = '★';
    }
};

function updateBookmarkIcon() {
    const btn = document.getElementById('bookmark-btn');
    const icon = document.getElementById('bookmark-icon');
    if (bookmarks.includes(currentQuestionIndex)) {
        btn.classList.add('bookmarked'); icon.textContent = '★';
    } else {
        btn.classList.remove('bookmarked'); icon.textContent = '☆';
    }
}

// Text-to-Speech
function speak(text) {
    if (!isSoundEnabled || !speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;        speechSynthesis.speak(u);
}

window.speakQuestion = function(qData) {
    if (!isSoundEnabled || !speechSynthesis) return;
    speechSynthesis.cancel();
    
    const questionUtterance = new SpeechSynthesisUtterance(qData.q);
    questionUtterance.rate = 0.85;
    
    questionUtterance.onend = function() {
        let optionIndex = 0;
        function speakNextOption() {
            if (optionIndex >= qData.options.length) return;
            const letter = String.fromCharCode(65 + optionIndex);
            const optionText = `Option ${letter}. ${qData.options[optionIndex]}`;
            const optionUtterance = new SpeechSynthesisUtterance(optionText);
            optionUtterance.rate = 0.85;
            optionUtterance.onend = function() {
                optionIndex++;
                setTimeout(speakNextOption, 400);
            };
            speechSynthesis.speak(optionUtterance);
        }
        speakNextOption();
    };
    speechSynthesis.speak(questionUtterance);
};

function playTone(frequency, duration) {
    if (!isSoundEnabled) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode); gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = frequency; oscillator.type = 'sine'; gainNode.gain.value = 0.1;
        oscillator.start();
        setTimeout(() => { oscillator.stop(); audioCtx.close(); }, duration * 1000);
    } catch (e) {}
}

// Feedback Animation
function showFeedbackOverlay(isCorrect) {
    const overlay = document.getElementById('feedback-overlay');
    let msg = "", color = "";
    
    if (isCorrect) {
        msg = positiveMessages[Math.floor(Math.random() * positiveMessages.length)];
        color = "#2e7d32";                overlay.style.animation = "popIn 0.3s forwards";
    } else {
        msg = negativeMessages[Math.floor(Math.random() * negativeMessages.length)];
        color = "#c62828";
        overlay.style.animation = "shake 0.3s forwards";
    }
    
    overlay.textContent = msg;
    overlay.style.color = color;
    overlay.style.opacity = "1";
    overlay.style.transform = "translate( -25%,  -25%) scale(1.1)";
    speak(msg);
  
    setTimeout(() => {
        overlay.style.opacity = "0";
        overlay.style.transform = "translate( -25%,  -25%) scale(1)";
    }, 1500);
}

// Question Rendering
function loadQuestion(index) {
    const qData = currentQuestions[index];
    
    // Reset UI State
    document.getElementById('q-text').textContent = qData.q;
    document.getElementById('question-counter').textContent = `Q: ${index + 1}/${currentQuestions.length}`;
    document.getElementById('live-score').textContent = score;
    
    // Hide explanation initially unless already answered
    const expBox = document.getElementById('explanation-box');
    const expText = document.getElementById('explanation-text');
    
    if (userAnswers[index] !== undefined) {
        expBox.style.display = 'block';
        expText.textContent = currentQuestions[index].exp || "No explanation available.";
    } else {
        expBox.style.display = 'none';
    }

    updateBookmarkIcon();

    const container = document.getElementById('options-container');
    container.innerHTML = '';
                
    qData.options.forEach((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<span class="option-label">${letter}</span> ${opt}`;
                if (userAnswers[index] !== undefined) {
            // If already answered, show state but don't allow click
            if (i === qData.answer) btn.classList.add('correct');
            else if (i === userAnswers[index]) btn.classList.add('wrong');
            btn.disabled = true;
        } else {
            // If not answered, allow click
            btn.onclick = () => handleAnswer(index, i, btn);
        }
        container.appendChild(btn);
    });

    document.getElementById('prev-btn').disabled = (index === 0);
    const isLastQuestion = (index === currentQuestions.length - 1);
    document.getElementById('next-btn').style.display = isLastQuestion ? 'none' : 'block';    
    document.getElementById('submit-btn').style.display = isLastQuestion ? 'block' : 'none';
    
    // Auto-speak logic: Speak if sound is on AND question hasn't been answered yet
    // We check userAnswers to avoid re-reading if user navigates back to an answered question
    if (isSoundEnabled && userAnswers[index] === undefined) {
        setTimeout(() => speakQuestion(qData), 500);
    }
}

// Handle Answer Submission
window.handleAnswer = function(qIndex, optionIndex, btnElement) {
    if (!currentQuestions || !currentQuestions[qIndex]) return;
    
    const qData = currentQuestions[qIndex];
    const correctIndex = qData.answer;
    
    // Save user answer
    userAnswers[qIndex] = optionIndex;

    // Disable all option buttons for THIS question only
    const currentContainer = btnElement.closest('.question-container') || document.body;
    const buttons = currentContainer.querySelectorAll('.option-btn');
    
    buttons.forEach(b => {
        b.disabled = true;
        b.classList.remove('anim-pop', 'anim-shake'); 
    });

    // Handle Correct/Wrong Logic
    if (optionIndex === correctIndex) {
        btnElement.classList.add('correct', 'anim-pop');
        score++;
        document.getElementById('live-score').textContent = score;
        
        if (isSoundEnabled) {            playTone(880, 0.1); 
            setTimeout(() => playTone(1100, 0.1), 100);
        }
    } else {
        btnElement.classList.add('wrong', 'anim-shake');
        
        if (buttons[correctIndex]) {
            buttons[correctIndex].classList.add('correct');
        }

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        
        if (isSoundEnabled) {
            playTone(200, 0.2);
        }
    }

    showFeedbackOverlay(optionIndex === correctIndex);

    // Display Explanation
    const expBox = document.getElementById('explanation-box');
    const expText = document.getElementById('explanation-text');
    
    if (expBox && expText) {
        expText.textContent = qData.exp || "No explanation available.";
        expBox.style.display = 'block';
    }

    // Prepare Next Question Transition
    if (nextQuestionTimeout) clearTimeout(nextQuestionTimeout);

    nextQuestionTimeout = setTimeout(() => {
        if (qIndex < currentQuestions.length - 1) {
            currentQuestionIndex++;
            loadQuestion(currentQuestionIndex);
            
            // Reset Timer for next question if in timed mode
            if (timePerQuestion > 0) {
                timeLeft = timePerQuestion;
                startTimer();
            }
        } else {
            finishExam(false);
        }
    }, 15000); 
};

// Manual Navigation
window.nextQuestion = function() { 
    if (currentQuestionIndex < currentQuestions.length - 1) {         clearInterval(timerInterval);
        currentQuestionIndex++; 
        loadQuestion(currentQuestionIndex);
        
        // Reset timer for next question
        if (timePerQuestion > 0 && userAnswers[currentQuestionIndex] === undefined) {
            timeLeft = timePerQuestion;
            startTimer();
        }
        // Note: loadQuestion handles auto-speech
    } 
};

window.prevQuestion = function() { 
    if (currentQuestionIndex > 0) {
        clearInterval(timerInterval);
        currentQuestionIndex--; 
        loadQuestion(currentQuestionIndex);
        
        // Don't restart timer for already answered questions
        if (userAnswers[currentQuestionIndex] === undefined && timePerQuestion > 0) {
            timeLeft = timePerQuestion;
            startTimer();
        }
        // Note: loadQuestion handles auto-speech
    } 
};

// Finish Exam
window.finishExam = function(manualSubmit) {
    clearInterval(timerInterval);
    if(nextQuestionTimeout) clearTimeout(nextQuestionTimeout);
    
    const timeUsed = Math.floor((Date.now() - examStartTime) / 1000);
    const mins = Math.floor(timeUsed / 60), secs = timeUsed % 60;
    document.getElementById('time-used').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    const total = currentQuestions.length, percentage = Math.round((score / total) * 100);
    saveProgress(currentSubject, percentage);
    
    document.getElementById('final-score').textContent = `${score}/${total}`;
    document.getElementById('percentage').textContent = `${percentage}%`;
    document.getElementById('correct-count').textContent = score;
    document.getElementById('wrong-count').textContent = total - score;
    
    let grade = "", msg = "", gradeClass = "";
    if (currentMode === 'professional') {
        if (percentage >= 80) { grade = "Excellence"; msg = "🌟 Outstanding! Ready for real exam!"; gradeClass = "grade-excellence"; }
        else if (percentage >= 70) { grade = "Better"; msg = "👍 Great job! More practice to excel."; gradeClass = "grade-better"; }
        else if (percentage >= 50) { grade = "Good"; msg = "✅ Passed! Review weak areas."; gradeClass = "grade-good"; }        else { grade = "Fair"; msg = "📚 Keep studying! You'll improve."; gradeClass = "grade-fair"; }
    } else {
        if (percentage >= 70) { grade = "Excellent"; msg = "🎉 Fantastic work!"; gradeClass = "grade-excellence"; }
        else if (percentage >= 50) { grade = "Good"; msg = "👍 Well done!"; gradeClass = "grade-good"; }
        else { grade = "Needs Practice"; msg = "💪 Don't give up! Try again."; gradeClass = "grade-fair"; }
    }
    
    const gradeEl = document.getElementById('grade-display');
    gradeEl.textContent = grade;
    gradeEl.className = `grade-badge ${gradeClass}`;
    document.getElementById('feedback-msg').textContent = msg;
    
    showSection('result-section');
    
    if (isSoundEnabled) {
        speak(`Exam completed. Your score is ${score} out of ${total}, which is ${percentage} percent. Your grade is ${grade}.`);
    }
};

// Initialize speech on first click
document.addEventListener('click', function initSpeech() {
    if (speechSynthesis && !speechSynthesis.pending) {
        const t = new SpeechSynthesisUtterance('');
        speechSynthesis.speak(t);        
        speechSynthesis.cancel();
    }
    document.removeEventListener('click', initSpeech);
}, { once: true });

console.log("🚀 HighGrade DLI App Loaded");
console.log("🔥 Firestore DB:", db);

// Replay current question audio
window.replayCurrentQuestion = function() {
    if (currentQuestions.length === 0) return;
    
    const currentQ = currentQuestions[currentQuestionIndex];
    if (currentQ && isSoundEnabled) {
        speakQuestion(currentQ);
    }
};

// Handle when time runs out for a question
function handleTimeUp() {
    clearInterval(timerInterval);
    
    const qData = currentQuestions[currentQuestionIndex];
    const correctIndex = qData.answer;
    
    // Mark as answered (wrong)    userAnswers[currentQuestionIndex] = -1;  
    
    // Show correct answer visually
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach((btn, i) => {
        btn.disabled = true;
        if (i === correctIndex) {
            btn.classList.add('correct');
        }
    });
    
    // Show explanation
    const expBox = document.getElementById('explanation-box');
    const expText = document.getElementById('explanation-text');
    expText.textContent = qData.exp || "No explanation available.";
    expBox.style.display = 'block';
    
    // Play timeout sound
    if (isSoundEnabled) {
        playTone(150, 0.3);  
        speak("Time's up!");
    }
    
    // Move to next question after delay
    setTimeout(() => {
        if (currentQuestionIndex < currentQuestions.length - 1) {
            currentQuestionIndex++;
            loadQuestion(currentQuestionIndex);
            
            // Reset timer for next question
            if (timePerQuestion > 0) {
                timeLeft = timePerQuestion;
                startTimer();
            }
            // loadQuestion handles auto-speech
        } else {
            finishExam(false);
        }
    }, 10000);  
}








// Add this to your JavaScript file
window.openCalculator = function() {
    // Open calculator in same tab
    window.location.href = 'cac.html';
    
    // OR open in new tab (uncomment if you prefer)
    // window.open('cac.html', '_blank');
}