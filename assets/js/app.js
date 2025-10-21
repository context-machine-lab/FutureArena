const STATE = {
  meta: {},
  calendarDays: [],
  dailyChallenges: [],
  participants: [],
  submissions: {
    challenge: [],
    llm: [],
    agent: []
  }
};

const STATUS_LABELS = {
  agi: "AGI Day",
  evaluating: "Evaluating",
  pending: "Pending",
  missed: "Missed"
};

const FALLBACK_DATA = {
  meta: {
    campaignStart: "2024-07-01",
    currentDay: 1,
    nextDeadlineUTC: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  },
  calendarDays: [
    { day: 1, date: new Date().toISOString().split("T")[0], status: "pending", correct: 0, topPerformer: "N/A", note: "Kick-off day" }
  ],
  dailyChallenges: [],
  participants: []
};

const outputCache = new Map();
const charts = {
  llm: null,
  agent: null
};

let deadlineTimer;

async function init() {
  initThemeToggle();
  initMobileMenu();
  await loadData();
  renderMetrics();
  renderCalendar();
  renderDeadline();
  initNavigation();
  initTabs();
  initForms();
  renderDailyList();
  renderLeaderboard();
  renderCharts();
  initChartTabs();
  initModal();
  initToolbar();
}

async function loadData() {
  try {
    const response = await fetch("assets/data/sample-data.json", { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.status}`);
    }
    const payload = await response.json();
    applyData(payload);
  } catch (error) {
    console.error("Error loading data, using fallback data.", error);
    applyData(FALLBACK_DATA);
  }
}

function applyData(data) {
  STATE.meta = data.meta || {};
  STATE.calendarDays = Array.isArray(data.calendarDays) ? data.calendarDays : [];
  STATE.dailyChallenges = Array.isArray(data.dailyChallenges) ? data.dailyChallenges : [];
  STATE.participants = Array.isArray(data.participants) ? data.participants : [];
}

function renderMetrics() {
  const calendarRecords = getCalendarRecords();
  const agiDays = calendarRecords.filter((entry) => entry.status === "agi").length;
  const daysTracked = calendarRecords.length;
  const streaks = computeStreaks(calendarRecords);

  setMetric("days-tracked", daysTracked);
  setMetric("agi-days", agiDays);
  setMetric("current-streak", streaks.current);

  updateGoalProgress(streaks.longest);
  updateAgiStatus(streaks);
}

function setMetric(slug, value) {
  const el = document.querySelector(`[data-metric="${slug}"]`);
  if (el) {
    el.textContent = Number.isFinite(value) ? value.toString() : "0";
  }
}

function updateGoalProgress(longestStreak) {
  const label = document.querySelector("[data-progress-label]");
  const progressBar = document.querySelector("[data-progress-bar]");
  if (!label || !progressBar) return;

  if (longestStreak >= 100) {
    label.textContent = "AGI Achieved! 100 consecutive AGI Days recorded.";
  } else {
    label.textContent = `Longest streak so far: ${longestStreak} day${longestStreak === 1 ? "" : "s"} • ${100 - Math.min(longestStreak, 100)} to go.`;
  }

  const width = Math.min((longestStreak / 100) * 100, 100);
  progressBar.style.width = `${width}%`;
}

function updateAgiStatus(streaks) {
  const statusEl = document.querySelector("[data-agi-status]");
  if (!statusEl) return;
  const hintEl = document.querySelector("[data-agi-hint]");

  statusEl.dataset.state = "pending";
  if (hintEl) {
    hintEl.textContent = "";
  }

  if (streaks.current >= 100) {
    statusEl.textContent = "Yes — sustained AGI performance";
    statusEl.dataset.state = "yes";
    if (hintEl) {
      hintEl.textContent = "Current streak has surpassed 100 consecutive AGI days.";
    }
    return;
  }

  const longest = streaks.longest ?? 0;
  const current = streaks.current ?? 0;
  const remaining = Math.max(100 - Math.max(longest, current), 0);

  statusEl.textContent = "Not yet";
  statusEl.dataset.state = "no";
  if (hintEl) {
    hintEl.textContent = `Longest streak: ${longest} day${longest === 1 ? "" : "s"} • ${remaining} more needed.`;
  }
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const calendarRecords = dedupeCalendarMap();
  const fragment = document.createDocumentFragment();
  const currentDay = STATE.meta?.currentDay ?? 0;
  const paletteByStatus = {
    agi: { color: "34, 197, 94", baseAlpha: 0.35 },
    evaluating: { color: "37, 99, 235", baseAlpha: 0.32 },
    pending: { color: "245, 158, 11", baseAlpha: 0.24 },
    missed: { color: "220, 38, 38", baseAlpha: 0.32 }
  };

  for (let day = 1; day <= 100; day += 1) {
    const entry = calendarRecords.get(day);
    const status = entry?.status || (day <= currentDay ? "pending" : "pending");
    const dayCard = document.createElement("article");
    dayCard.className = "calendar-day";
    dayCard.dataset.status = status;
    dayCard.dataset.day = day.toString();
    dayCard.setAttribute("tabindex", "0");
    dayCard.setAttribute("role", "button");

    const statusLabel = STATUS_LABELS[status] || "Unknown";
    const tooltip = buildCalendarTooltip(day, entry, statusLabel);

    dayCard.setAttribute("aria-label", `Day ${day}: ${statusLabel}`);
    dayCard.title = `Day ${day}: ${statusLabel}`;
    if (day === currentDay) {
      dayCard.dataset.today = "true";
    }
    const palette = paletteByStatus[status] || { color: "226, 232, 240", baseAlpha: 0.4 };
    let alpha = palette.baseAlpha;
    if (entry?.correct != null) {
      const accuracyRatio = Math.min(Math.max(entry.correct / 10, 0), 1);
      if (status === "agi") {
        alpha = 0.25 + accuracyRatio * 0.7;
      } else if (status === "missed") {
        alpha = 0.25 + (1 - accuracyRatio) * 0.5;
      } else if (status === "evaluating") {
        alpha = 0.25 + accuracyRatio * 0.4;
      } else if (status === "pending") {
        alpha = 0.18 + accuracyRatio * 0.3;
      }
    }
    const clampedAlpha = Math.min(Math.max(alpha, 0.12), 0.95);
    dayCard.style.setProperty("--day-color", `rgba(${palette.color}, ${clampedAlpha.toFixed(2)})`);
    dayCard.innerHTML = `
      <span class="sr-only">Day ${day}: ${statusLabel}</span>
      ${tooltip}
    `;

    fragment.appendChild(dayCard);
  }

  grid.appendChild(fragment);
}

function buildCalendarTooltip(day, entry, statusLabel) {
  if (!entry) {
    return `
      <div class="calendar-day__tooltip">
        <strong>Day ${day} · ${statusLabel}</strong>
        <p>Challenges will be scheduled when the campaign reaches this day.</p>
      </div>
    `;
  }

  const solved = entry.correct ?? "–";
  const note = entry.note ? `<p>${entry.note}</p>` : "";
  const performer = entry.topPerformer ? `<p><strong>Top Performer:</strong> ${entry.topPerformer}</p>` : "";
  return `
    <div class="calendar-day__tooltip">
      <strong>Day ${day} · ${statusLabel}</strong>
      <p><strong>Accuracy:</strong> ${solved}/10</p>
      ${performer}
      ${note}
    </div>
  `;
}

function renderDeadline() {
  const deadlineElement = document.querySelector("[data-deadline]");
  if (!deadlineElement) return;

  const deadlineUTC = STATE.meta?.nextDeadlineUTC;
  if (!deadlineUTC) {
    deadlineElement.textContent = "Awaiting schedule";
    if (deadlineTimer) window.clearInterval(deadlineTimer);
    return;
  }

  const update = () => {
    const date = new Date(deadlineUTC);
    const formatted = formatDateTime(date);
    const relative = formatRelative(date);
    deadlineElement.textContent = `${formatted} (in ${relative})`;
  };

  update();

  if (deadlineTimer) window.clearInterval(deadlineTimer);
  deadlineTimer = window.setInterval(update, 60_000);
}

function initNavigation() {
  const tabs = Array.from(document.querySelectorAll(".nav-tab"));
  if (!tabs.length) return;

  const hasTargets = tabs.some((tab) => Boolean(tab.dataset.navTarget));
  if (!hasTargets) {
    return;
  }

  const sections = tabs
    .map((tab) => {
      const id = tab.dataset.navTarget;
      const element = id ? document.getElementById(id) : null;
      return element ? { id, element } : null;
    })
    .filter(Boolean);

  const setActive = (targetId) => {
    if (!targetId) return;
    tabs.forEach((tab) => {
      const isMatch = tab.dataset.navTarget === targetId;
      tab.classList.toggle("is-active", isMatch);
      if (isMatch) {
        tab.setAttribute("aria-current", "page");
      } else {
        tab.removeAttribute("aria-current");
      }
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      const targetId = tab.dataset.navTarget;
      const targetSection = sections.find((section) => section.id === targetId)?.element;
      setActive(targetId);
      if (targetSection) {
        targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
        if (window.history?.replaceState) {
          window.history.replaceState(null, "", `#${targetId}`);
        }
      }
    });
  });

  if (sections.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        const candidates = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (candidates.length) {
          setActive(candidates[0].target.id);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0.25, 0.6, 0.9] }
    );

    sections.forEach(({ element }) => observer.observe(element));
  }

  const current = tabs.find((tab) => tab.classList.contains("is-active"));
  if (!current && tabs[0]) {
    setActive(tabs[0].dataset.navTarget);
  }
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const forms = document.querySelectorAll(".submission-form");
  if (!tabs.length || !forms.length) return;

  const setActive = (target) => {
    if (!target) return;
    tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === target));
    forms.forEach((form) => form.classList.toggle("is-active", form.dataset.form === target));
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActive(tab.dataset.tab));
  });

  document.querySelectorAll("[data-open-tab]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const targetTab = trigger.dataset.openTab;
      setActive(targetTab);
    });
  });

  const hash = window.location.hash.replace("#", "");
  const defaultTab = Array.from(tabs).find((tab) => tab.classList.contains("is-active"))?.dataset.tab || tabs[0]?.dataset.tab;
  if (hash && Array.from(tabs).some((tab) => tab.dataset.tab === hash)) {
    setActive(hash);
  } else {
    setActive(defaultTab);
  }
}

function initForms() {
  document.querySelectorAll(".submission-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formType = form.dataset.form;
      const formData = Object.fromEntries(new FormData(form).entries());
      const validation = validateSubmission(formType, formData);

      if (!validation.isValid) {
        showFormMessage(form, validation.message, "error");
        return;
      }

      if (!STATE.submissions[formType]) {
        STATE.submissions[formType] = [];
      }

      STATE.submissions[formType].push({
        ...formData,
        submittedAt: new Date().toISOString()
      });

      form.reset();
      showFormMessage(form, validation.message || "Submission received! We'll review before the daily run.");
    });
  });
}

function validateSubmission(formType, payload) {
  if (formType === "challenge") {
    const options = (payload.answers || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!options.length) {
      return { isValid: false, message: "Please provide at least one answer option." };
    }

    if (!options.includes(payload.correct?.trim())) {
      return { isValid: false, message: "Correct answer must be one of the provided options." };
    }

    return { isValid: true, message: "Challenge submitted. We'll curate for the next rotation." };
  }

  if (formType === "llm") {
    if (!payload.endpoint?.trim()) {
      return { isValid: false, message: "API endpoint is required." };
    }
    return { isValid: true, message: "LLM API received. Our ops team will verify connectivity soon." };
  }

  if (formType === "agent") {
    if (!payload.repo?.trim()) {
      return { isValid: false, message: "Repository URL is required for agent submissions." };
    }
    return { isValid: true, message: "Agent system queued. We'll run sandbox validation ahead of evaluation." };
  }

  return { isValid: true, message: "Submission received! We'll review it shortly." };
}

function showFormMessage(form, message, variant = "success") {
  let messageEl = form.querySelector(".form-message");
  if (!messageEl) {
    messageEl = document.createElement("div");
    messageEl.className = "form-message";
    messageEl.setAttribute("role", "status");
    form.appendChild(messageEl);
  }

  messageEl.textContent = message;
  messageEl.classList.toggle("form-message--error", variant === "error");
}

function renderDailyList() {
  const list = document.getElementById("daily-list");
  if (!list) return;

  list.innerHTML = "";
  outputCache.clear();

  const todaysDay = STATE.meta?.currentDay;
  let challenges = STATE.dailyChallenges;
  if (todaysDay) {
    const todaysChallenges = STATE.dailyChallenges.filter((challenge) => challenge.day === todaysDay);
    if (todaysChallenges.length) {
      challenges = todaysChallenges;
    }
  }

  if (!challenges.length) {
    const empty = document.createElement("p");
    empty.textContent = "Daily challenges will appear once submissions are selected for the current day.";
    empty.className = "chart-empty";
    list.appendChild(empty);
    return;
  }

  const participantLookup = new Map(STATE.participants.map((entry) => [entry.id, entry]));

  challenges.forEach((challenge) => {
    const card = document.createElement("article");
    card.className = "daily-card";

    const correctCount = (challenge.predictions || []).filter((pred) => pred.isCorrect).length;
    const total = (challenge.predictions || []).length;
    const timestamp = challenge.timestamp ? formatDateTime(new Date(challenge.timestamp)) : "—";

    card.innerHTML = `
      <div class="daily-card__header">
        <div>
          <h3>${challenge.title}</h3>
          <div class="daily-card__meta">
            <span class="chip">${challenge.category}</span>
            <span>Ground truth: <strong>${challenge.correctAnswer}</strong></span>
            <span>${correctCount}/${total} correct</span>
            <span>Posted ${timestamp}</span>
          </div>
        </div>
        <div class="chip">Day ${challenge.day}</div>
      </div>
      <p>${challenge.question}</p>
    `;

    if (challenge.answerOptions?.length) {
      const options = document.createElement("p");
      options.className = "daily-card__options";
      options.innerHTML = `<strong>Options:</strong> ${challenge.answerOptions.join(" • ")}`;
      card.appendChild(options);
    }

    const predictionsContainer = document.createElement("div");
    predictionsContainer.className = "prediction-list";

    (challenge.predictions || []).forEach((prediction) => {
      const participant = participantLookup.get(prediction.participantId) || { name: "Unknown", type: "LLM" };
      const key = `${challenge.id}-${prediction.participantId}`;
      outputCache.set(key, prediction.output || "No output captured.");

      const item = document.createElement("div");
      item.className = "prediction-item";
      item.innerHTML = `
        <div>
          <div class="prediction-item__label">${participant.name}</div>
          <div class="prediction-item__meta">
            ${participant.type === "Agent" ? "Agent System" : "LLM API"} • Confidence ${formatPercent(prediction.confidence)} • ${formatLatency(prediction.latencyMs)}
          </div>
        </div>
        <div class="prediction-item__score ${prediction.isCorrect ? "is-correct" : "is-incorrect"}">
          ${prediction.isCorrect ? "Correct" : "Missed"}
        </div>
        <div class="prediction-item__actions">
          <button type="button" class="btn btn--outline" data-output-key="${key}">View Output</button>
        </div>
      `;

      predictionsContainer.appendChild(item);
    });

    card.appendChild(predictionsContainer);
    list.appendChild(card);
  });
}

function renderLeaderboard() {
  const body = document.getElementById("leaderboard-body");
  if (!body) return;

  body.innerHTML = "";

  const sorted = [...STATE.participants].sort((a, b) => (b.agiDays || 0) - (a.agiDays || 0));

  if (!sorted.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "No submissions ranked yet. Submit your LLM or agent to join the leaderboard.";
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  sorted.forEach((participant) => {
    const row = document.createElement("tr");
    const typeLabel = participant.type === "Agent" ? "Agent System" : "LLM API";
    const agiBadge = participant.longestStreak >= 100 ? '<span class="badge">AGI Achieved</span>' : "";
    const lastSubmission = participant.lastSubmission ? `${formatDateTime(new Date(participant.lastSubmission))}` : "—";

    row.innerHTML = `
      <td>
        <strong>${participant.name}</strong>
        ${agiBadge}
      </td>
      <td>${typeLabel}</td>
      <td>${participant.agiDays ?? 0}</td>
      <td>${participant.longestStreak ?? 0}</td>
      <td>${lastSubmission}</td>
    `;

    body.appendChild(row);
  });
}

function renderCharts() {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js not available; skipping charts.");
    return;
  }

  renderChartForType("LLM", "chart-llm");
  renderChartForType("Agent", "chart-agent");
}

function initChartTabs() {
  const tabs = document.querySelectorAll(".chart-tab");
  const panels = document.querySelectorAll(".chart-panel");
  if (!tabs.length || !panels.length) return;

  const setActive = (target) => {
    if (!target) return;
    tabs.forEach((tab) => {
      const isActive = tab.dataset.chartTab === target;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    panels.forEach((panel) => {
      const isActive = panel.dataset.chartPanel === target;
      panel.classList.toggle("is-active", isActive);
      panel.toggleAttribute("hidden", !isActive);
    });
    const chartKey = target === "agent" ? "agent" : "llm";
    const chart = charts[chartKey];
    if (chart) {
      chart.resize();
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActive(tab.dataset.chartTab));
  });

  const defaultTab = Array.from(tabs).find((tab) => tab.classList.contains("is-active"))?.dataset.chartTab || tabs[0]?.dataset.chartTab;
  setActive(defaultTab);
}

function renderChartForType(type, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const container = canvas.closest(".chart-card");
  const key = type === "LLM" ? "llm" : "agent";
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }

  const participants = STATE.participants.filter((entry) => entry.type === type);
  const participantsById = new Map(STATE.participants.map((p) => [p.id, p]));

  const existingEmpty = container?.querySelector(".chart-empty");
  if (existingEmpty) {
    existingEmpty.remove();
  }

  const aggregateData = buildAggregateSeries(type, participantsById);
  const colors = ["#2563eb", "#f97316", "#059669", "#7c3aed", "#dc2626", "#0f766e"];

  const datasets = [];

  // Create gradient for aggregate line
  const createGradient = (ctx, color1, color2) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    return gradient;
  };

  if (aggregateData.length) {
    const ctx = canvas.getContext('2d');
    const gradient = createGradient(
      ctx,
      type === "LLM" ? "rgba(37, 99, 235, 0.4)" : "rgba(5, 150, 105, 0.4)",
      type === "LLM" ? "rgba(37, 99, 235, 0.05)" : "rgba(5, 150, 105, 0.05)"
    );

    datasets.push({
      label: type === "LLM" ? "LLM APIs · Avg solved" : "Agent Systems · Avg solved",
      data: aggregateData,
      borderColor: type === "LLM" ? "#2563eb" : "#059669",
      backgroundColor: gradient,
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: type === "LLM" ? "#2563eb" : "#059669",
      pointBorderColor: "#fff",
      pointBorderWidth: 2,
      pointHoverBackgroundColor: type === "LLM" ? "#1d4ed8" : "#047857",
      pointHoverBorderWidth: 3,
      fill: true,
      spanGaps: true,
      tension: 0.35
    });
  }

  const rankedParticipants = participants
    .slice()
    .sort((a, b) => (b.agiDays || 0) - (a.agiDays || 0))
    .slice(0, 4);

  rankedParticipants.forEach((participant, index) => {
    const sortedPerf = [...(participant.performance || [])].sort((a, b) => a.day - b.day);
    if (!sortedPerf.length) return;
    const color = colors[index % colors.length];
    datasets.push({
      label: participant.name,
      data: sortedPerf.map((point) => ({ x: point.day, y: point.solved })),
      borderColor: color,
      backgroundColor: `${color}20`,
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: color,
      pointBorderColor: "#fff",
      pointBorderWidth: 2,
      pointHoverBackgroundColor: color,
      pointHoverBorderWidth: 3,
      fill: false,
      spanGaps: true,
      tension: 0.32
    });
  });

  if (!datasets.some((dataset) => dataset.data.length)) {
    if (container) {
      container.classList.add("is-empty");
      const empty = document.createElement("p");
      empty.className = "chart-empty";
      empty.textContent = `No ${type === "LLM" ? "LLM API" : "Agent System"} data available yet.`;
      container.appendChild(empty);
    }
    return;
  }

  if (container) {
    container.classList.remove("is-empty");
  }

  charts[key] = new Chart(canvas, {
    type: "line",
    data: {
      datasets
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      animation: {
        duration: 1200,
        easing: 'easeInOutQuart',
        animateScale: true,
        animateRotate: true
      },
      interaction: {
        mode: "nearest",
        intersect: false
      },
      elements: {
        line: {
          tension: 0.35
        },
        point: {
          radius: 4,
          hoverRadius: 6
        }
      },
      layout: {
        padding: 8
      },
      scales: {
        x: {
          type: "linear",
          min: 1,
          max: 100,
          title: { display: true, text: "Day" },
          ticks: { color: "rgba(71,85,105,0.9)", stepSize: 5 },
          grid: { color: "rgba(209,213,219,0.3)", drawBorder: false }
        },
        y: {
          min: 0,
          max: 10,
          title: { display: true, text: "Problems Solved" },
          ticks: { stepSize: 1, color: "rgba(71,85,105,0.9)" },
          grid: { color: "rgba(209,213,219,0.3)", drawBorder: false }
        }
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "rgba(55,65,81,0.85)"
          }
        },
        tooltip: {
          displayColors: false,
          callbacks: {
            label(context) {
              const { dataset, parsed } = context;
              return `${dataset.label}: Day ${parsed.x}, Solved ${parsed.y}`;
            }
          }
        }
      }
    }
  });

  requestAnimationFrame(() => {
    charts[key].resize();
  });
}

function buildAggregateSeries(type, participantsById) {
  const dayTotals = new Map();

  const addValue = (day, solved, possible = 10) => {
    if (!dayTotals.has(day)) {
      dayTotals.set(day, { solved: 0, count: 0, max: 0 });
    }
    const bucket = dayTotals.get(day);
    bucket.solved += solved;
    bucket.count += 1;
    bucket.max = Math.max(bucket.max, possible);
  };

  // Participant performance data (already normalized to 0-10 solved problems)
  STATE.participants.forEach((participant) => {
    if (participant.type !== type) return;
    (participant.performance || []).forEach((point) => {
      if (typeof point.day !== "number" || typeof point.solved !== "number") return;
      addValue(point.day, Math.min(Math.max(point.solved, 0), 10));
    });
  });

  // Daily challenge predictions (convert accuracy ratio to out-of-10 scale)
  STATE.dailyChallenges.forEach((challenge) => {
    const day = challenge.day;
    (challenge.predictions || []).forEach((prediction) => {
      const participant = participantsById.get(prediction.participantId);
      if (!participant || participant.type !== type) return;
      const solved = prediction.isCorrect ? 10 : 0;
      addValue(day, solved, 10);
    });
  });

  return Array.from(dayTotals.entries())
    .map(([day, totals]) => {
      if (!totals.count) return { x: Number(day), y: 0 };
      const averageSolved = totals.solved / totals.count;
      return { x: Number(day), y: Number(averageSolved.toFixed(2)) };
    })
    .sort((a, b) => a.x - b.x);
}

function initModal() {
  const modal = document.getElementById("modal-output");
  if (!modal) return;

  const closeButton = modal.querySelector("[data-close-modal]");
  const closeModal = () => {
    if (modal.open) modal.close();
  };

  closeButton?.addEventListener("click", closeModal);
  modal.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModal();
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const trigger = target.closest("[data-output-key]");
    if (!trigger) return;

    const key = trigger.dataset.outputKey;
    const output = outputCache.get(key) || "No output recorded.";
    const content = modal.querySelector(".modal-content");
    if (content) {
      content.textContent = output;
    }
    if (!modal.open) modal.showModal();
  });
}

function initToolbar() {
  const viewButton = document.querySelector('[data-view="recent"]');
  const downloadButton = document.querySelector('[data-action="download-data"]');

  viewButton?.addEventListener("click", () => {
    document.getElementById("daily-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  downloadButton?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "measure-agi-data.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

/* Theme & UI ------------------------------------------------------------- */

function initThemeToggle() {
  const themeToggle = document.querySelector('.theme-toggle');
  const themeIcon = document.querySelector('.theme-icon');
  if (!themeToggle || !themeIcon) return;

  // Load saved theme or default to light
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeIcon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeIcon.textContent = newTheme === 'dark' ? '🌙' : '☀️';

    // Update chart colors if charts exist
    if (charts.llm) {
      charts.llm.update();
    }
    if (charts.agent) {
      charts.agent.update();
    }
  });
}

function initMobileMenu() {
  const hamburger = document.querySelector('.hamburger-menu');
  const navWrapper = document.querySelector('.nav-tabs-wrapper');
  if (!hamburger || !navWrapper) return;

  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('is-open');
    navWrapper.classList.toggle('is-open');
    hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // Close menu when clicking a nav link
  navWrapper.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      hamburger.classList.remove('is-open');
      navWrapper.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', (event) => {
    if (!hamburger.contains(event.target) && !navWrapper.contains(event.target)) {
      hamburger.classList.remove('is-open');
      navWrapper.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
}

/* Helpers ---------------------------------------------------------------- */

function getCalendarRecords() {
  return Array.from(dedupeCalendarMap().values()).sort((a, b) => a.day - b.day);
}

function dedupeCalendarMap() {
  const map = new Map();
  STATE.calendarDays.forEach((record) => {
    if (typeof record.day !== "number") return;
    map.set(record.day, { ...record });
  });
  return map;
}

function computeStreaks(records) {
  if (!records.length) return { current: 0, longest: 0 };

  const sorted = [...records].sort((a, b) => a.day - b.day);
  let longest = 0;
  let running = 0;

  sorted.forEach((entry) => {
    if (entry.status === "agi") {
      running += 1;
      if (running > longest) longest = running;
    } else {
      running = 0;
    }
  });

  let current = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].status === "agi") {
      current += 1;
    } else {
      break;
    }
  }

  return { current, longest };
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(date);
}

function formatRelative(date) {
  const now = Date.now();
  const diff = date.getTime() - now;
  const minutes = Math.round(diff / 60000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `${Math.round(value * 100)}%`;
}

function formatLatency(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Latency N/A";
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} s`;
  }
  return `${value} ms`;
}

init().catch((error) => {
  console.error("Failed to initialize MeasureAGI experience.", error);
});
