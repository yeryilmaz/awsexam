(function () {
  const STORAGE_KEY = "aws_clf_c02_exam_state_v1";
  const allTests = window.EXAM_DATA || [];

  // Flatten all 719 questions for quick lookup
  const questionById = {};
  allTests.forEach((t) => {
    t.questions.forEach((q) => {
      questionById[q.id] = q;
    });
  });

  // Persistent state:
  // answers: { [questionId]: string[] }  (user's clicked option keys)
  // revealed: { [questionId]: boolean }
  // flagged: { [questionId]: boolean }
  // lastIndex: { [testKey]: number }
  let state = loadState();

  // Active exam session state
  let activeSession = null; // { key, title, subtitle, questions, currentIndex, filter, timerSeconds, timerRunning }
  let timerInterval = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          answers: parsed.answers || {},
          revealed: parsed.revealed || {},
          flagged: parsed.flagged || {},
          lastIndex: parsed.lastIndex || {},
        };
      }
    } catch (e) {
      console.warn("Could not load state:", e);
    }
    return { answers: {}, revealed: {}, flagged: {}, lastIndex: {} };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save state:", e);
    }
  }

  // Evaluate whether a question is answered & whether it is completely correct
  function getQuestionStatus(q) {
    const sel = state.answers[q.id] || [];
    const rev = !!state.revealed[q.id];
    if (sel.length === 0 && !rev) {
      return "unanswered";
    }
    const reqCount = q.answer.length;
    const hasWrong = sel.some((k) => !q.answer.includes(k));
    if (hasWrong) {
      return "wrong";
    }
    const allCorrectSelected = q.answer.every((k) => sel.includes(k));
    if (allCorrectSelected && sel.length === reqCount) {
      return "correct";
    }
    if (rev) {
      return "wrong";
    }
    return "partial";
  }

  // DOM Elements
  const dashboardView = document.getElementById("dashboardView");
  const examView = document.getElementById("examView");
  const headerSubText = document.getElementById("headerSubText");
  const headerExamControls = document.getElementById("headerExamControls");
  const timerBox = document.getElementById("timerBox");
  const timerValue = document.getElementById("timerValue");
  const liveCorrect = document.getElementById("liveCorrect");
  const liveWrong = document.getElementById("liveWrong");
  const livePct = document.getElementById("livePct");
  const btnBackDashboard = document.getElementById("btnBackDashboard");

  const testsGrid = document.getElementById("testsGrid");
  const heroTotalAnswered = document.getElementById("heroTotalAnswered");
  const heroTotalCorrect = document.getElementById("heroTotalCorrect");
  const heroTotalScore = document.getElementById("heroTotalScore");
  const wrongCountLabel = document.getElementById("wrongCountLabel");
  const flaggedCountLabel = document.getElementById("flaggedCountLabel");

  // Exam view elements
  const qCounterBadge = document.getElementById("qCounterBadge");
  const qGlobalId = document.getElementById("qGlobalId");
  const multiBadge = document.getElementById("multiBadge");
  const btnFlag = document.getElementById("btnFlag");
  const questionStem = document.getElementById("questionStem");
  const instructionNote = document.getElementById("instructionNote");
  const optionsList = document.getElementById("optionsList");
  const feedbackBox = document.getElementById("feedbackBox");
  const navGrid = document.getElementById("navGrid");
  const navProgressText = document.getElementById("navProgressText");

  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const btnRetryQuestion = document.getElementById("btnRetryQuestion");
  const btnRevealAnswer = document.getElementById("btnRevealAnswer");
  const btnFinishExam = document.getElementById("btnFinishExam");

  const resultsModal = document.getElementById("resultsModal");

  // Render Dashboard
  function renderDashboard() {
    stopTimer();
    activeSession = null;
    dashboardView.classList.remove("hidden");
    examView.classList.add("hidden");
    headerExamControls.classList.add("hidden");
    headerSubText.textContent = "CLF-C02 Practice Exam Platform • 15 PDF Test (719 Soru)";

    // Calculate global stats
    let totalAnswered = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalFlagged = 0;

    Object.values(questionById).forEach((q) => {
      const st = getQuestionStatus(q);
      if (st === "correct") {
        totalAnswered++;
        totalCorrect++;
      } else if (st === "wrong") {
        totalAnswered++;
        totalWrong++;
      }
      if (state.flagged[q.id]) {
        totalFlagged++;
      }
    });

    heroTotalAnswered.textContent = `${totalAnswered} / 719`;
    heroTotalCorrect.textContent = totalCorrect;
    const globalPct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
    heroTotalScore.textContent = `%${globalPct}`;
    wrongCountLabel.textContent = `${totalWrong} yanlış soru birikti`;
    flaggedCountLabel.textContent = `${totalFlagged} işaretli (flagged) soru`;

    // Render 15 test cards
    testsGrid.innerHTML = "";
    allTests.forEach((test) => {
      let cCount = 0;
      let wCount = 0;
      test.questions.forEach((q) => {
        const st = getQuestionStatus(q);
        if (st === "correct") cCount++;
        else if (st === "wrong") wCount++;
      });
      const doneCount = cCount + wCount;
      const total = test.questionCount;
      const pct = doneCount > 0 ? Math.round((cCount / doneCount) * 100) : 0;
      const cWidth = (cCount / total) * 100;
      const wWidth = (wCount / total) * 100;

      const card = document.createElement("div");
      card.className = "test-card";
      card.innerHTML = `
        <div>
          <div class="test-card-top">
            <div>
              <div class="test-card-title">${test.title}</div>
              <div class="test-card-sub">Sorular ${test.range} (${total} Soru)</div>
            </div>
            <span class="pdf-pill">${test.pdfName}</span>
          </div>
          <div class="test-progress-wrap">
            <div class="test-progress-bar">
              <div class="bar-correct" style="width: ${cWidth}%"></div>
              <div class="bar-wrong" style="width: ${wWidth}%"></div>
            </div>
            <div class="test-metrics">
              <span>Çözülen: ${doneCount}/${total}</span>
              <span style="color: var(--correct-green)">✓ ${cCount}</span>
              <span style="color: var(--wrong-red)">✗ ${wCount}</span>
              <span>Başarı: %${pct}</span>
            </div>
          </div>
        </div>
        <div class="test-card-actions">
          <button class="btn-primary" data-start-test="${test.testId}">
            ${doneCount > 0 && doneCount < total ? "Devam Et" : doneCount === total ? "Tekrar İncele" : "Teste Başla"}
          </button>
          ${
            doneCount > 0
              ? `<button class="btn-secondary" data-reset-test="${test.testId}" title="Bu testi sıfırla">↺ Sıfırla</button>`
              : ""
          }
        </div>
      `;
      testsGrid.appendChild(card);
    });
  }

  // Start a specific test or custom session
  function startSession({ key, title, subtitle, questions, resetPosition = false }) {
    if (!questions || questions.length === 0) {
      alert("Bu kategoride henüz soru bulunmuyor.");
      return;
    }
    let startIdx = 0;
    if (!resetPosition && typeof state.lastIndex[key] === "number") {
      startIdx = Math.min(Math.max(0, state.lastIndex[key]), questions.length - 1);
    } else {
      // Find first unanswered question if any
      const firstUnanswered = questions.findIndex((q) => getQuestionStatus(q) === "unanswered");
      if (firstUnanswered !== -1) startIdx = firstUnanswered;
    }

    activeSession = {
      key,
      title,
      subtitle,
      questions,
      currentIndex: startIdx,
      filter: "all",
      timerSeconds: 90 * 60, // 90 mins standard AWS CLF-C02 duration
      timerRunning: true,
    };

    dashboardView.classList.add("hidden");
    examView.classList.remove("hidden");
    headerExamControls.classList.remove("hidden");
    headerSubText.textContent = `${title} • ${subtitle}`;

    // Reset filter chips UI
    document.querySelectorAll(".filter-chip").forEach((ch) => {
      ch.classList.toggle("active", ch.dataset.filter === "all");
    });

    startTimer();
    renderCurrentQuestion();
  }

  function startTimer() {
    stopTimer();
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      if (!activeSession || !activeSession.timerRunning) return;
      if (activeSession.timerSeconds > 0) {
        activeSession.timerSeconds--;
        updateTimerDisplay();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    if (!activeSession) return;
    const s = activeSession.timerSeconds;
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    const prefix = activeSession.timerRunning ? "" : "⏸ ";
    timerValue.textContent = `${prefix}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  // Render active question, options, feedback banner, and right-side question grid
  function renderCurrentQuestion() {
    if (!activeSession) return;
    const { questions, currentIndex, key } = activeSession;
    const q = questions[currentIndex];
    state.lastIndex[key] = currentIndex;
    saveState();

    // Update top live stats for this session
    let cCount = 0;
    let wCount = 0;
    questions.forEach((item) => {
      const st = getQuestionStatus(item);
      if (st === "correct") cCount++;
      else if (st === "wrong") wCount++;
    });
    const done = cCount + wCount;
    const pct = done > 0 ? Math.round((cCount / done) * 100) : 0;
    liveCorrect.textContent = `✓ ${cCount}`;
    liveWrong.textContent = `✗ ${wCount}`;
    livePct.textContent = `%${pct}`;

    // Subheader info
    qCounterBadge.textContent = `Question ${currentIndex + 1} of ${questions.length}`;
    qGlobalId.textContent = `Soru #${q.id} (PDF ${q.pdf} • Topic: Exam A)`;

    const reqCount = q.answer.length;
    if (reqCount > 1) {
      multiBadge.classList.remove("hidden");
      multiBadge.textContent = `⚠️ Choose ${reqCount} Options (${reqCount} Seçenek İşaretleyin)`;
      instructionNote.classList.remove("hidden");
      instructionNote.textContent = `Bu soruda ${reqCount} doğru cevap bulunmaktadır. Seçeneklere tıkladığınızda doğruysa yeşil, yanlışsa kırmızı olarak anında gösterilir.`;
    } else {
      multiBadge.classList.add("hidden");
      instructionNote.classList.add("hidden");
    }

    const isFlagged = !!state.flagged[q.id];
    btnFlag.classList.toggle("active", isFlagged);
    btnFlag.innerHTML = isFlagged ? "🚩 İşaretlendi (Flagged)" : "🏴 İnceleme İçin İşaretle (Flag)";

    // Question stem
    questionStem.textContent = q.question;

    // Selected options for this question
    const selected = state.answers[q.id] || [];
    const isRevealed = !!state.revealed[q.id];
    const finishedSelecting = selected.length >= reqCount || isRevealed || (reqCount === 1 && selected.length > 0);

    // Render options
    optionsList.innerHTML = "";
    q.options.forEach((opt) => {
      const isSelected = selected.includes(opt.key);
      const isCorrectOption = q.answer.includes(opt.key);

      const item = document.createElement("div");
      item.className = "option-item";

      let indicatorSymbol = "";
      let badgeHtml = "";

      if (isSelected) {
        if (isCorrectOption) {
          // Clicked a correct answer -> GREEN!
          item.classList.add("is-correct");
          indicatorSymbol = "✓";
          badgeHtml = `<span class="option-status-badge">✓ Doğru Cevap</span>`;
        } else {
          // Clicked a wrong answer -> RED!
          item.classList.add("is-wrong");
          indicatorSymbol = "✗";
          badgeHtml = `<span class="option-status-badge">✗ Yanlış Seçim</span>`;
        }
      } else if (finishedSelecting && isCorrectOption) {
        // Reveal the right answer in GREEN when user picked a wrong option or finished selecting
        item.classList.add("is-correct");
        indicatorSymbol = "✓";
        badgeHtml = `<span class="option-status-badge">✓ Doğru Cevap</span>`;
      }

      item.innerHTML = `
        <div class="option-indicator ${reqCount > 1 ? "checkbox" : ""}">${indicatorSymbol}</div>
        <div class="option-key">${opt.key}.</div>
        <div class="option-text">${escapeHtml(opt.text)}</div>
        ${badgeHtml}
      `;

      item.addEventListener("click", () => handleOptionClick(q, opt.key));
      optionsList.appendChild(item);
    });

    // Render feedback banner below options
    const status = getQuestionStatus(q);
    if (status === "unanswered") {
      feedbackBox.className = "feedback-box hidden";
      feedbackBox.innerHTML = "";
    } else if (status === "correct") {
      feedbackBox.className = "feedback-box correct";
      feedbackBox.innerHTML = `
        <span>✓ Tebrikler! Doğru cevapladınız.</span>
        <span>Correct Answer: <strong>${q.answer.join(", ")}</strong></span>
      `;
    } else if (status === "partial") {
      const remaining = reqCount - selected.length;
      feedbackBox.className = "feedback-box partial";
      feedbackBox.innerHTML = `
        <span>✓ İlk seçiminiz doğru! Lütfen <strong>${remaining} seçenek daha</strong> işaretleyin.</span>
        <span>Seçilen: ${selected.join(", ")} (${selected.length}/${reqCount})</span>
      `;
    } else {
      feedbackBox.className = "feedback-box wrong";
      feedbackBox.innerHTML = `
        <span>✗ Yanlış cevap. Doğru seçenek yeşil ile işaretlenmiştir.</span>
        <span>Correct Answer: <strong>${q.answer.join(", ")}</strong></span>
      `;
    }

    // Footer buttons
    btnPrev.disabled = currentIndex === 0;
    btnNext.disabled = currentIndex === questions.length - 1;

    renderNavigator();
  }

  function handleOptionClick(q, key) {
    const reqCount = q.answer.length;
    let current = state.answers[q.id] ? [...state.answers[q.id]] : [];

    if (reqCount === 1) {
      // Single choice: clicking any option selects it immediately and shows green/red
      current = [key];
    } else {
      // Multi-choice (Choose 2):
      if (current.includes(key)) {
        // Deselect if clicked again
        current = current.filter((k) => k !== key);
      } else {
        if (current.length >= reqCount) {
          // If already picked 2, start fresh with the newly clicked option
          current = [key];
          delete state.revealed[q.id];
        } else {
          current.push(key);
        }
      }
    }

    state.answers[q.id] = current;
    saveState();
    renderCurrentQuestion();
  }

  function renderNavigator() {
    if (!activeSession) return;
    const { questions, currentIndex, filter } = activeSession;

    let answeredCount = 0;
    questions.forEach((q) => {
      const st = getQuestionStatus(q);
      if (st === "correct" || st === "wrong") answeredCount++;
    });
    navProgressText.textContent = `${answeredCount} / ${questions.length} Tamamlandı`;

    navGrid.innerHTML = "";
    questions.forEach((q, idx) => {
      const st = getQuestionStatus(q);
      const isFlagged = !!state.flagged[q.id];

      if (filter === "wrong" && st !== "wrong") return;
      if (filter === "flagged" && !isFlagged) return;
      if (filter === "unanswered" && st !== "unanswered") return;

      const cell = document.createElement("button");
      cell.className = "nav-cell";
      if (idx === currentIndex) cell.classList.add("current");
      if (st === "correct") cell.classList.add("answered-correct");
      else if (st === "wrong") cell.classList.add("answered-wrong");

      cell.innerHTML = `
        ${idx + 1}
        ${isFlagged ? '<span class="flag-dot"></span>' : ""}
      `;
      cell.addEventListener("click", () => {
        activeSession.currentIndex = idx;
        renderCurrentQuestion();
      });
      navGrid.appendChild(cell);
    });
  }

  function showResultsModal() {
    if (!activeSession) return;
    const { questions, title } = activeSession;
    let cCount = 0;
    let wCount = 0;
    let uCount = 0;

    questions.forEach((q) => {
      const st = getQuestionStatus(q);
      if (st === "correct") cCount++;
      else if (st === "wrong") wCount++;
      else uCount++;
    });

    const total = questions.length;
    const rawPct = total > 0 ? Math.round((cCount / total) * 100) : 0;
    // AWS CLF-C02 uses a 100-1000 scale with 700 passing
    const scaled = Math.max(100, Math.round(100 + (cCount / total) * 900));
    const passed = rawPct >= 70;

    document.getElementById("modalTitle").textContent = `${title} - Sınav Sonucu`;
    const passBadge = document.getElementById("modalPassBadge");
    passBadge.className = `pass-badge ${passed ? "pass" : "fail"}`;
    passBadge.textContent = passed ? "✓ PASS (BAŞARILI - %70+)" : "✗ FAIL (GEÇME NOTU: %70)";

    document.getElementById("modalScaledScore").textContent = `${scaled} / 1000`;
    document.getElementById("modalPctText").textContent = `Başarı Oranı: %${rawPct} (${cCount} / ${total} Doğru)`;
    document.getElementById("modalCorrectVal").textContent = cCount;
    document.getElementById("modalWrongVal").textContent = wCount;
    document.getElementById("modalEmptyVal").textContent = uCount;

    const btnPracticeWrongInModal = document.getElementById("btnModalPracticeWrong");
    btnPracticeWrongInModal.style.display = wCount > 0 ? "inline-flex" : "none";

    resultsModal.classList.remove("hidden");
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Event Listeners
  document.getElementById("brandHome").addEventListener("click", renderDashboard);
  btnBackDashboard.addEventListener("click", renderDashboard);

  timerBox.addEventListener("click", () => {
    if (!activeSession) return;
    activeSession.timerRunning = !activeSession.timerRunning;
    updateTimerDisplay();
  });

  testsGrid.addEventListener("click", (e) => {
    const startBtn = e.target.closest("[data-start-test]");
    if (startBtn) {
      const testId = parseInt(startBtn.dataset.startTest, 10);
      const test = allTests.find((t) => t.testId === testId);
      if (test) {
        startSession({
          key: `test_${test.testId}`,
          title: test.title,
          subtitle: `Sorular ${test.range} (${test.pdfName})`,
          questions: test.questions,
        });
      }
      return;
    }

    const resetBtn = e.target.closest("[data-reset-test]");
    if (resetBtn) {
      const testId = parseInt(resetBtn.dataset.resetTest, 10);
      const test = allTests.find((t) => t.testId === testId);
      if (test && confirm(`${test.title} içindeki tüm cevaplarınızı sıfırlamak istediğinize emin misiniz?`)) {
        test.questions.forEach((q) => {
          delete state.answers[q.id];
          delete state.revealed[q.id];
        });
        delete state.lastIndex[`test_${test.testId}`];
        saveState();
        renderDashboard();
      }
    }
  });

  // Special mode buttons on dashboard
  document.getElementById("btnRandomExam").addEventListener("click", () => {
    const allQs = Object.values(questionById);
    const shuffled = [...allQs].sort(() => Math.random() - 0.5).slice(0, 50);
    // Clear previous answers on those or keep? Let's keep or let user reset
    startSession({
      key: "random_50",
      title: "Karışık Deneme Sınavı",
      subtitle: "719 Soru İçinden Rastgele 50 Soru",
      questions: shuffled,
      resetPosition: true,
    });
  });

  document.getElementById("btnWrongReview").addEventListener("click", () => {
    const wrongQs = Object.values(questionById).filter((q) => getQuestionStatus(q) === "wrong");
    startSession({
      key: "wrong_review",
      title: "Yanlış Yaptığım Sorular",
      subtitle: `${wrongQs.length} Soru`,
      questions: wrongQs,
      resetPosition: true,
    });
  });

  document.getElementById("btnFlaggedReview").addEventListener("click", () => {
    const flaggedQs = Object.values(questionById).filter((q) => !!state.flagged[q.id]);
    startSession({
      key: "flagged_review",
      title: "İşaretlediğim (Flagged) Sorular",
      subtitle: `${flaggedQs.length} Soru`,
      questions: flaggedQs,
      resetPosition: true,
    });
  });

  document.getElementById("btnResetAll").addEventListener("click", () => {
    if (confirm("Tüm 15 testteki ilerlemenizi sıfırlamak istediğinize emin misiniz?")) {
      state = { answers: {}, revealed: {}, flagged: {}, lastIndex: {} };
      saveState();
      renderDashboard();
    }
  });

  // Exam controls
  btnFlag.addEventListener("click", () => {
    if (!activeSession) return;
    const q = activeSession.questions[activeSession.currentIndex];
    state.flagged[q.id] = !state.flagged[q.id];
    if (!state.flagged[q.id]) delete state.flagged[q.id];
    saveState();
    renderCurrentQuestion();
  });

  btnPrev.addEventListener("click", () => {
    if (activeSession && activeSession.currentIndex > 0) {
      activeSession.currentIndex--;
      renderCurrentQuestion();
    }
  });

  btnNext.addEventListener("click", () => {
    if (activeSession && activeSession.currentIndex < activeSession.questions.length - 1) {
      activeSession.currentIndex++;
      renderCurrentQuestion();
    }
  });

  btnRetryQuestion.addEventListener("click", () => {
    if (!activeSession) return;
    const q = activeSession.questions[activeSession.currentIndex];
    delete state.answers[q.id];
    delete state.revealed[q.id];
    saveState();
    renderCurrentQuestion();
  });

  btnRevealAnswer.addEventListener("click", () => {
    if (!activeSession) return;
    const q = activeSession.questions[activeSession.currentIndex];
    state.revealed[q.id] = true;
    saveState();
    renderCurrentQuestion();
  });

  btnFinishExam.addEventListener("click", showResultsModal);

  // Filter chips in navigator
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (!activeSession) return;
      activeSession.filter = chip.dataset.filter;
      document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderNavigator();
    });
  });

  // Modal actions
  document.getElementById("btnCloseModal").addEventListener("click", () => {
    resultsModal.classList.add("hidden");
  });

  document.getElementById("btnModalBackDashboard").addEventListener("click", () => {
    resultsModal.classList.add("hidden");
    renderDashboard();
  });

  document.getElementById("btnModalPracticeWrong").addEventListener("click", () => {
    resultsModal.classList.add("hidden");
    if (!activeSession) return;
    const wrongInSession = activeSession.questions.filter((q) => getQuestionStatus(q) === "wrong");
    wrongInSession.forEach((q) => {
      delete state.answers[q.id];
      delete state.revealed[q.id];
    });
    saveState();
    startSession({
      key: `${activeSession.key}_wrong`,
      title: `${activeSession.title} (Yanlışlar)`,
      subtitle: `${wrongInSession.length} Soru Tekrarı`,
      questions: wrongInSession,
      resetPosition: true,
    });
  });

  // Keyboard navigation
  window.addEventListener("keydown", (e) => {
    if (!activeSession || !resultsModal.classList.contains("hidden")) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const q = activeSession.questions[activeSession.currentIndex];
    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (activeSession.currentIndex < activeSession.questions.length - 1) {
        activeSession.currentIndex++;
        renderCurrentQuestion();
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (activeSession.currentIndex > 0) {
        activeSession.currentIndex--;
        renderCurrentQuestion();
      }
    } else if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      btnFlag.click();
    } else if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      btnRetryQuestion.click();
    } else {
      const keyMap = {
        1: "A",
        a: "A",
        2: "B",
        b: "B",
        3: "C",
        c: "C",
        4: "D",
        d: "D",
        5: "E",
        e: "E",
        6: "F",
        f: "F",
      };
      const mapped = keyMap[e.key.toLowerCase()];
      if (mapped && e.key.toLowerCase() !== "f") {
        const exists = q.options.some((o) => o.key === mapped);
        if (exists) {
          e.preventDefault();
          handleOptionClick(q, mapped);
        }
      }
    }
  });

  // Initialize
  renderDashboard();
})();

