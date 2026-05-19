const app = document.getElementById("app");
const STORAGE_KEY = "fitmonState";
const PREVIOUS_STORAGE_KEY = "fitmon" + "Pi" + "lotState";
let fitmonState = null;
let sectionOpenState = null;
let selectedBodyPartId = null;
let lastOnboardingCompleted = null;
let loadStatePromise = null;
let suppressNextStorageLoad = false;
let panelActivityLastSentAt = 0;

const PANEL_ACTIVITY_THROTTLE_MS = 4000;

const ONBOARDING_STEPS = [
  {
    id: "intro",
    label: "핏몬 소개",
    description: "상단바에 상주하는 핏몬이 브라우저 활동에 맞춰 상태와 스트레칭을 안내해요."
  },
  {
    id: "login",
    label: "SNS 로그인",
    description: "네이버 계정을 연결해 기록과 설정을 이어가요."
  },
  {
    id: "checklist",
    label: "맞춤 체크리스트",
    description: "앉아 있는 시간, 이동 빈도, 불편한 부위를 저장해 추천 루틴을 맞춰요."
  },
  {
    id: "notifications",
    label: "알림 주기",
    description: "알림 주기와 소리를 정하면 상단바 루프가 실제로 시작돼요."
  }
];
const CHARACTER_STATES = {
  good: {
    label: "좋음",
    asset: "good"
  },
  mid: {
    label: "보통",
    asset: "mid"
  },
  bad: {
    label: "피곤",
    asset: "bad"
  },
  discharged: {
    label: "방전",
    asset: "discharged"
  }
};

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || (!changes[STORAGE_KEY] && !changes[PREVIOUS_STORAGE_KEY])) {
    return;
  }
  if (suppressNextStorageLoad) {
    suppressNextStorageLoad = false;
    return;
  }
  void loadState();
});

void loadState();
bindPanelActivityTracking();

async function loadState() {
  if (loadStatePromise) {
    return loadStatePromise;
  }
  loadStatePromise = doLoadState();
  try {
    return await loadStatePromise;
  } finally {
    loadStatePromise = null;
  }
}

async function doLoadState() {
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: "fitmon/get-state" });
  } catch (error) {
    console.debug("FitMon state load skipped", error);
    return;
  }
  if (!response || !response.ok) {
    return;
  }
  applyStateFromResponse(response.state);
}

function applyStateFromResponse(nextState) {
  if (!nextState) {
    return;
  }
  suppressNextStorageLoad = true;
  if (lastOnboardingCompleted !== nextState.onboarding.completed) {
    sectionOpenState = {
      fatigue: nextState.onboarding.completed,
      stretching: false,
      records: false,
      customize: false,
      settings: false
    };
  }
  fitmonState = nextState;
  lastOnboardingCompleted = nextState.onboarding.completed;
  selectedBodyPartId = resolveSelectedBodyPartId();
  render();
}

function render({ preserveScroll = true } = {}) {
  if (!fitmonState) {
    app.innerHTML = "";
    return;
  }

  ensureSectionOpenState();
  const scrollSnapshot = preserveScroll ? captureScrollSnapshot() : null;

  const needsOnboarding = !fitmonState.onboarding.completed;
  const status = fitmonState.status;
  const activity = fitmonState.activity;
  const currentFitmon = fitmonState.character.currentFitmon;
  const levelProgress = Math.min(100, Math.round((fitmonState.character.progressToNextLevel / 120) * 100));
  const largestTrend = Math.max(1, ...fitmonState.records.weeklyTrend.map((entry) => entry.count));
  const selectedBodyPart = getBodyPartById(selectedBodyPartId);
  const fatigueSummary = `${status.statusLabel} · ${
    activity.promptDue ? "지금 스트레칭 필요" : activity.isSessionActive ? `${Math.max(1, Math.ceil(activity.remainingUntilPromptMs / 60000))}분 뒤 알림` : "휴식 중"
  }`;
  const stretchingSummary = `${selectedBodyPart ? selectedBodyPart.label : fitmonState.quickRoutine.bodyPartLabel} 중심 · 추천 ${fitmonState.recommendations.length}개`;
  const recordsSummary = `오늘 ${fitmonState.records.todayCount}회 · 연속 ${fitmonState.records.streakDays}일 · 이번 달 ${fitmonState.records.monthCount}회`;
  const customizeSummary = `Lv.${fitmonState.character.level} · ${currentFitmon ? currentFitmon.name : "기본"} · ${fitmonState.character.points}P`;
  const settingsSummary = `${fitmonState.preferences.notificationsEnabled ? "알림 ON" : "알림 OFF"} · ${fitmonState.preferences.frequencyMinutes}분 · ${fitmonState.preferences.soundMode === "silent" ? "무음" : "시스템 알림음"}`;
  const setupSection = needsOnboarding
    ? `
      <section class="card setup-card" id="setup">
        ${renderOnboardingContent()}
      </section>
    `
    : "";

  const fatigueSection = renderAccordionSection({
    id: "fatigue",
    title: "피로",
    badge: status.statusLabel,
    summary: fatigueSummary,
    open: isSectionOpen("fatigue"),
    content: needsOnboarding
      ? renderLockedContent("피로 상태는 초기 설정 완료 후 상단바 활동 기준과 함께 열려요.")
      : renderFatigueContent()
  });

  const stretchingSection = renderAccordionSection({
    id: "stretching",
    title: "스트레칭",
    badge: selectedBodyPart ? selectedBodyPart.label : fitmonState.quickRoutine.bodyPartLabel,
    summary: stretchingSummary,
    open: isSectionOpen("stretching"),
    content: needsOnboarding
      ? renderLockedContent("부위를 고르고 관련 루틴 목록에서 선택하는 단계는 초기 설정이 끝난 뒤 활성화돼요.")
      : renderStretchingContent()
  });

  const recordsSection = renderAccordionSection({
    id: "records",
    title: "기록",
    badge: fitmonState.records.monthCalendar.monthLabel,
    summary: recordsSummary,
    open: isSectionOpen("records"),
    content: needsOnboarding
      ? renderLockedContent("첫 스트레칭을 완료하면 하루, 주간, 월간 기록이 쌓여요.")
      : renderRecordsContent(largestTrend)
  });

  const customizeSection = renderAccordionSection({
    id: "customize",
    title: "커스터마이즈",
    badge: fitmonState.character.stage,
    summary: customizeSummary,
    open: isSectionOpen("customize"),
    content: needsOnboarding
      ? renderLockedContent("핏몬 도감과 잠금해제는 첫 루프를 마친 뒤 열려요.")
      : renderCustomizeContent(currentFitmon, levelProgress)
  });

  const settingsSection = renderAccordionSection({
    id: "settings",
    title: "설정",
    badge: fitmonState.preferences.notificationsEnabled ? "알림 ON" : "알림 OFF",
    summary: settingsSummary,
    open: isSectionOpen("settings"),
    content: needsOnboarding
      ? renderLockedContent("알림 주기 단계까지 끝내면 상세 설정과 고객 지원을 사용할 수 있어요.")
      : renderSettingsContent()
  });

  const orderedSections = needsOnboarding
    ? [setupSection, fatigueSection, stretchingSection, recordsSection, customizeSection, settingsSection]
    : [fatigueSection, stretchingSection, recordsSection, customizeSection, settingsSection];

  app.innerHTML = `
    <main class="shell">
      ${renderHeroSection()}
      ${orderedSections.join("")}
    </main>
  `;

  bindEvents();
  bindFrequencyControls();
  restoreScrollSnapshot(scrollSnapshot);
}

function captureScrollSnapshot() {
  const scrollingElement = document.scrollingElement || document.documentElement;
  return {
    windowX: window.scrollX,
    windowY: window.scrollY,
    documentTop: scrollingElement ? scrollingElement.scrollTop : 0,
    documentLeft: scrollingElement ? scrollingElement.scrollLeft : 0,
    keyedElements: Array.from(app.querySelectorAll("[data-scroll-key]")).map((element) => ({
      key: element.dataset.scrollKey,
      top: element.scrollTop,
      left: element.scrollLeft
    }))
  };
}

function restoreScrollSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }
  const apply = () => {
    const scrollingElement = document.scrollingElement || document.documentElement;
    if (scrollingElement) {
      scrollingElement.scrollTop = snapshot.documentTop;
      scrollingElement.scrollLeft = snapshot.documentLeft;
    }
    window.scrollTo(snapshot.windowX, snapshot.windowY);
    snapshot.keyedElements.forEach((entry) => {
      const element = app.querySelector(`[data-scroll-key="${entry.key}"]`);
      if (element) {
        element.scrollTop = entry.top;
        element.scrollLeft = entry.left;
      }
    });
  };
  window.requestAnimationFrame(() => {
    apply();
    window.setTimeout(apply, 50);
  });
}

function renderHeroSection() {
  const needsOnboarding = !fitmonState.onboarding.completed;
  const status = fitmonState.status;
  const activity = fitmonState.activity;
  const currentFitmon = fitmonState.character.currentFitmon;

  return `
    <section class="hero home-wireframe" id="home">
      <div class="home-stage">
        <div class="fitmon-stage">
          ${renderFitmonCharacter(currentFitmon, resolveCharacterVisualState(status, activity), "hero")}
          <div class="stage-metrics">
            <div>
              <small>상태</small>
              <strong>${escapeHtml(status.statusLabel)}</strong>
            </div>
            <div>
              <small>추천 부위</small>
              <strong>${escapeHtml(fitmonState.quickRoutine.bodyPartLabel)}</strong>
            </div>
          </div>
        </div>
        <button class="save-fitmon-button" data-section-target="${needsOnboarding ? "setup" : "stretching"}">핏몬 살리기</button>
      </div>
      <nav class="home-side-nav" aria-label="FitMon navigation">
        <button data-section-target="customize">커스터마이즈</button>
        <button data-section-target="stretching">스트레칭</button>
        <button data-section-target="records">기록</button>
        <button data-section-target="settings">설정</button>
      </nav>
      <div class="home-summary">
        <strong>${escapeHtml(fitmonState.user.name)}님의 ${escapeHtml(currentFitmon ? currentFitmon.name : "핏몬")}</strong>
        <span>${needsOnboarding ? `${getOnboardingStepLabel(fitmonState.onboarding.currentStep)} 단계 진행 중` : `오늘 ${status.todayCompletedCount}회 · 연속 ${status.streakDays}일 · Lv.${fitmonState.character.level}`}</span>
      </div>
    </section>
  `;
}

function renderFitmonStagePanel(title, description, state = resolveCharacterVisualState(fitmonState.status, fitmonState.activity)) {
  const currentFitmon = fitmonState.character.currentFitmon;
  return `
    <div class="fitmon-preview-panel">
      ${renderFitmonCharacter(currentFitmon, state, "large")}
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(description)}</p>
      </div>
    </div>
  `;
}

function renderSectionFrame(title, subtitle, content, actionHtml = "") {
  return `
    <div class="wire-screen">
      <div class="wire-header">
        <h2>${escapeHtml(title)}</h2>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${content}
      ${actionHtml}
    </div>
  `;
}

function renderEmptyRecordPrompt() {
  return `
    <div class="wire-screen compact">
      <div class="wire-header">
        <h2>아직 스트레칭하지 않았어요.</h2>
        <p>첫 스트레칭을 시작해보세요!</p>
      </div>
      <button class="wire-wide-button" data-section-target="stretching">핏몬 살리기</button>
    </div>
  `;
}

function renderFatigueStatsContent() {
  const status = fitmonState.status;
  const activity = fitmonState.activity;
  return renderSectionFrame(
    "핏몬 살리기",
    "불편한 부위를 선택하세요.",
    `
      ${renderFitmonStagePanel(status.statusLabel, status.statusHint)}
      <div class="body-part-row">
        ${fitmonState.bodyParts
          .map(
            (part) => `
              <button class="${selectedBodyPartId === part.id ? "active" : ""}" data-action="select-body-part" data-body-part="${part.id}">
                ${part.label}
              </button>
            `
          )
          .join("")}
        </div>
      <div class="records-grid" style="margin-top: 18px;">
        <div class="stat"><small>상태</small><strong>${status.statusLabel}</strong></div>
        <div class="stat"><small>활동</small><strong>${activity.isSessionActive ? `${activity.activeMinutes}분` : "휴식 중"}</strong></div>
      </div>
    `
  );
}

function renderStretchSessionWireframe() {
  const routine = fitmonState.quickRoutine;
  return renderSectionFrame(
    `${routine.bodyPartLabel} 스트레칭`,
    "천천히 따라하세요.",
    `
      ${renderFitmonStagePanel(routine.title, routine.guide && routine.guide[0] ? routine.guide[0] : "호흡을 천천히 유지하며 따라하세요.", "mid")}
      <div class="timer-row">
        <strong>00:24</strong>
        <span></span>
        <strong>00:30</strong>
      </div>
      <p class="routine-instruction">${escapeHtml(routine.guide && routine.guide[0] ? routine.guide[0] : "천천히 자세를 유지합니다.")}</p>
    `,
    `
      <div class="wire-action-row">
        <button class="wire-wide-button" data-section-target="home">以묐떒</button>
        <button class="wire-wide-button" data-action="run-routine" data-routine-id="${routine.id}">일시정지</button>
      </div>
    `
  );
}

function renderPurchaseList() {
  return renderSectionFrame(
    "핏몬 잠금해제",
    "활동으로 모은 핏 포인트로 다양한 핏몬을 잠금해제할 수 있어요.",
    `
      <div class="purchase-list">
        ${fitmonState.storeItems.map((item) => renderStoreCard(item)).join("")}
      </div>
    `
  );
}

function renderHealthCharacterCard(currentFitmon, status, activity) {
  const mood = CHARACTER_STATES[status.mood] ? status.mood : "good";
  const charge = resolveHealthCharge(status, activity);
  const characterState = resolveCharacterVisualState(status, activity);
  const characterMeta = CHARACTER_STATES[characterState];
  const bodyPartLabel = fitmonState.quickRoutine.bodyPartLabel;

  return `
    <article class="card character-status-card ${escapeAttribute(mood)} ${escapeAttribute(characterState)}">
      <div class="section-heading">
        <h2>핏몬 건강 상태</h2>
        <span class="pill active">${escapeHtml(characterMeta.label)}</span>
      </div>
      <div class="character-stage">
        ${renderFitmonCharacter(currentFitmon, characterState, "large")}
        <div class="character-copy">
          <span class="tag">${escapeHtml(currentFitmon ? currentFitmon.name : "FitMon")}</span>
          <strong>${escapeHtml(currentFitmon && currentFitmon.statusLine ? currentFitmon.statusLine : status.statusHint)}</strong>
          <p class="helper">${escapeHtml(currentFitmon && currentFitmon.personality ? currentFitmon.personality : "오늘도 핏몬이 컨디션을 지켜보고 있어요.")}</p>
          <p class="helper">추천 관리 부위: ${escapeHtml(bodyPartLabel)} · 좋아하는 루틴: ${escapeHtml(currentFitmon && currentFitmon.favoriteRoutine ? currentFitmon.favoriteRoutine : "짧은 회복 스트레칭")}</p>
        </div>
      </div>
      <div class="health-meter" aria-label="FitMon health charge">
        <span style="width: ${charge}%;"></span>
      </div>
      <div class="mini-row">
        <span>건강 에너지</span>
        <span>${charge}%</span>
      </div>
      <div class="mini-row">
        <span>성장 단계</span>
        <span>${escapeHtml(fitmonState.character.stage)} · Lv.${fitmonState.character.level}</span>
      </div>
    </article>
  `;
}

function resolveCharacterVisualState(status, activity) {
  return CHARACTER_STATES[status.mood] ? status.mood : "good";
}

function resolveHealthCharge(status, activity) {
  if (status.mood === "discharged") {
    return 12;
  }
  if (status.mood === "bad") {
    return 28;
  }
  if (status.mood === "mid") {
    return 58;
  }
  if (!activity.isSessionActive) {
    return status.todayCompletedCount > 0 ? 100 : 86;
  }
  const ratio = activity.promptThresholdMinutes > 0 ? activity.activeMinutes / activity.promptThresholdMinutes : 0;
  return Math.max(68, Math.min(100, Math.round(100 - ratio * 32)));
}

function renderOnboardingContent() {
  const timeline = renderOnboardingTimeline();
  const currentStep = fitmonState.onboarding.currentStep;

  if (fitmonState.onboarding.completed) {
    return `
      ${timeline}
      <div class="panel-block">
        <div class="section-heading">
          <h2>초기 설정 완료</h2>
          <span class="pill active">상단바 시작</span>
        </div>
        <div class="metrics-grid">
          <div class="stat">
            <small>로그인</small>
            <strong>${escapeHtml(fitmonState.user.providerLabel)}</strong>
          </div>
          <div class="stat">
            <small>불편 부위</small>
            <strong>${formatBodyPartList(fitmonState.checklist.discomfortAreas)}</strong>
          </div>
          <div class="stat">
            <small>알림 주기</small>
            <strong>${fitmonState.preferences.frequencyMinutes}분</strong>
          </div>
          <div class="stat">
            <small>소리</small>
            <strong>${fitmonState.preferences.soundMode === "silent" ? "무음" : "시스템 알림음"}</strong>
          </div>
        </div>
        <p class="helper">이제 핏몬이 브라우저 활동을 기준으로 상태를 바꾸고, 추천 루틴과 기록을 이어서 보여줘요.</p>
      </div>
    `;
  }

  let activeStepContent = "";
  if (currentStep === "intro") {
    activeStepContent = `
      <div class="panel-block">
        <div class="section-heading">
          <h2>핏몬 소개</h2>
          <span class="tag">1단계</span>
        </div>
        <p class="helper">핏몬은 브라우저 활동을 기준으로 건강 상태를 확인하고, 카드형 스트레칭을 제안하며, 완료 기록과 캐릭터 성장을 이어주는 브라우저 헬스 케어 앱이에요.</p>
        <div class="record-list">
          <div class="mini-row">
            <span>상단바 상주</span>
            <span>브라우저 활동 추적</span>
          </div>
          <div class="mini-row">
            <span>빠른 루틴</span>
            <span>카드형 오버레이 실행</span>
          </div>
          <div class="mini-row">
            <span>완료 보상</span>
            <span>포인트, XP, 상태 회복</span>
          </div>
        </div>
        <div class="inline-actions">
          <button class="button" data-action="advance-onboarding-intro">소개 확인하고 로그인</button>
        </div>
      </div>
    `;
  } else if (currentStep === "login") {
    activeStepContent = `
      <div class="panel-block">
        <div class="section-heading">
          <h2>SNS 로그인</h2>
          <span class="tag">2단계</span>
        </div>
        <p class="helper">네이버 OAuth로 로그인해야 다음 단계로 넘어갑니다. 로그인한 기록과 설정은 서버에 안전하게 동기화됩니다.</p>
        <div class="provider-row">
          <button class="ghost-button" data-action="login-provider" data-provider="naver">Naver 로그인</button>
        </div>
      </div>
    `;
  } else if (currentStep === "checklist") {
    activeStepContent = `
      <div class="panel-block">
        <div class="section-heading">
          <h2>맞춤 체크리스트</h2>
          <span class="tag">3단계</span>
        </div>
        <p class="helper">불편한 부위와 활동 습관을 먼저 저장한 뒤에만 추천과 부위별 루틴이 열리게 돼요.</p>
        ${renderChecklistForm("checklist-form", "체크리스트 저장")}
      </div>
    `;
  } else if (currentStep === "notifications") {
    activeStepContent = `
      <div class="panel-block">
        <div class="section-heading">
          <h2>알림 주기 설정</h2>
          <span class="tag">4단계</span>
        </div>
        <p class="helper">알림 주기와 소리 설정을 정하면 초기 설정이 끝나고 상단바 기준 루프가 시작됩니다.</p>
        ${renderOnboardingNotificationForm()}
      </div>
    `;
  }

  return `
    ${timeline}
    ${activeStepContent}
  `;
}

function renderOnboardingTimeline() {
  const progressIndex = fitmonState.onboarding.completed
    ? ONBOARDING_STEPS.length
    : Math.max(0, fitmonState.onboarding.stepIndex);

  return `
    <div class="step-grid">
      ${ONBOARDING_STEPS.map((step, index) => {
        const isComplete = fitmonState.onboarding.completed || index < progressIndex;
        const isActive = !fitmonState.onboarding.completed && index === progressIndex;
        const className = isComplete ? "step-card complete" : isActive ? "step-card active" : "step-card";
        return `
          <div class="${className}">
            <span class="step-index">${index + 1}</span>
            <div class="step-copy">
              <strong>${step.label}</strong>
              <span>${step.description}</span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderChecklistForm(formId, submitLabel) {
  return `
    <form id="${formId}">
      <div class="checklist-grid">
        <div class="field">
          <label for="${formId}-sittingHours">앉아 있는 시간</label>
          <select id="${formId}-sittingHours" name="sittingHours">
            ${renderOption("4-6", "4~6시간", fitmonState.checklist.sittingHours)}
            ${renderOption("6-8", "6~8시간", fitmonState.checklist.sittingHours)}
            ${renderOption("8-10", "8~10시간", fitmonState.checklist.sittingHours)}
            ${renderOption("10+", "10시간 이상", fitmonState.checklist.sittingHours)}
          </select>
        </div>
        <div class="field">
          <label for="${formId}-exerciseFrequency">운동 빈도</label>
          <select id="${formId}-exerciseFrequency" name="exerciseFrequency">
            ${renderOption("rarely", "거의 없음", fitmonState.checklist.exerciseFrequency)}
            ${renderOption("light", "주 1~2회", fitmonState.checklist.exerciseFrequency)}
            ${renderOption("steady", "주 3회 이상", fitmonState.checklist.exerciseFrequency)}
          </select>
        </div>
      </div>
      <div class="field">
        <label>불편한 부위</label>
        <div class="check-grid">
          ${fitmonState.bodyParts
            .map(
              (part) => `
                <label class="check-item">
                  <input type="checkbox" name="discomfortAreas" value="${part.id}" ${fitmonState.checklist.discomfortAreas.includes(part.id) ? "checked" : ""}>
                  <span>${part.label}</span>
                </label>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="inline-actions">
        <button class="button" type="submit">${submitLabel}</button>
      </div>
    </form>
  `;
}

function renderOnboardingNotificationForm() {
  return `
    <form id="onboarding-notification-form">
      <div class="setting-grid">
        <div class="field">
          <label for="onboarding-notificationsEnabled">알림 사용 여부</label>
          <select id="onboarding-notificationsEnabled" name="notificationsEnabled">
            ${renderOption("true", "사용", String(fitmonState.preferences.notificationsEnabled))}
            ${renderOption("false", "미사용", String(fitmonState.preferences.notificationsEnabled))}
          </select>
        </div>
        ${renderFrequencyField("onboarding")}
        <div class="field">
          <label for="onboarding-soundMode">소리 모드</label>
          <select id="onboarding-soundMode" name="soundMode">
            ${renderOption("silent", "무음", fitmonState.preferences.soundMode)}
            ${renderOption("gentle", "시스템 알림음", fitmonState.preferences.soundMode)}
          </select>
        </div>
      </div>
      <div class="inline-actions">
        <button class="button" type="submit">알림 주기 저장하고 시작</button>
      </div>
    </form>
  `;
}

function renderFrequencyField(prefix) {
  const current = Number(fitmonState.preferences.frequencyMinutes) || 45;
  const presets = [30, 45, 60, 90, 120];
  const isPreset = presets.includes(current);
  return `
    <div class="field">
      <label for="${prefix}-frequencyPreset">알림 주기</label>
      <div class="frequency-control">
        <select id="${prefix}-frequencyPreset" name="frequencyPreset">
          ${presets.map((minutes) => renderOption(String(minutes), `${minutes}분`, isPreset ? String(current) : "")).join("")}
          ${renderOption("custom", "직접 입력", isPreset ? "" : "custom")}
        </select>
        <input id="${prefix}-frequencyMinutes" name="frequencyMinutes" type="number" min="1" max="240" step="1" value="${current}" aria-label="직접 입력 알림 주기">
        <span>분</span>
      </div>
    </div>
  `;
}

function renderFatigueContent() {
  const status = fitmonState.status;
  const activity = fitmonState.activity;

  return `
    <div class="metrics-grid">
      <div class="stat">
        <small>현재 상태</small>
        <strong>${status.statusLabel}</strong>
      </div>
      <div class="stat">
        <small>연속 브라우저 활동</small>
        <strong>${activity.isSessionActive ? `${activity.activeMinutes}분` : "휴식 중"}</strong>
      </div>
      <div class="stat">
        <small>다음 알림 기준</small>
        <strong>${activity.promptDue ? "지금 스트레칭" : `${Math.max(1, Math.ceil(activity.remainingUntilPromptMs / 60000))}분 남음`}</strong>
      </div>
      <div class="stat">
        <small>최근 완료</small>
        <strong>${status.lastCompletedAt ? formatDate(status.lastCompletedAt) : "아직 없음"}</strong>
      </div>
    </div>
    <p class="helper">${escapeHtml(status.todayPrompt)}</p>
    <p class="helper">${escapeHtml(status.statusHint)}</p>
    <div class="record-list">
      <div class="mini-row">
        <span>집중 부위</span>
        <span>${formatBodyPartList(fitmonState.preferences.focusAreas)}</span>
      </div>
      <div class="mini-row">
        <span>체크리스트 부위</span>
        <span>${formatBodyPartList(fitmonState.checklist.discomfortAreas)}</span>
      </div>
      <div class="mini-row">
        <span>알림 기준</span>
        <span>${activity.promptThresholdMinutes}분</span>
      </div>
    </div>
  `;
}

function renderStretchingContent() {
  const bodyPart = getBodyPartById(selectedBodyPartId) || fitmonState.bodyParts[0];
  const bodyPartRoutines = fitmonState.routines.filter((routine) => routine.bodyPart === bodyPart.id);

  return renderSectionFrame(
    "핏몬 살리기",
    "불편한 부위를 선택하세요.",
    `
      ${renderFitmonStagePanel(`${bodyPart.label} 집중 관리`, bodyPartRoutines[0] && bodyPartRoutines[0].guide ? bodyPartRoutines[0].guide[0] : "선택한 부위에 맞는 스트레칭을 준비했어요.", "mid")}
      <div class="body-part-row">
        ${fitmonState.bodyParts
          .map(
            (part) => `
              <button class="${part.id === bodyPart.id ? "active" : ""}" data-action="select-body-part" data-body-part="${part.id}">
                ${part.label}
              </button>
            `
          )
          .join("")}
      </div>
      <div class="stretch-list">
        ${bodyPartRoutines.map((routine) => renderRoutineCard(routine, `${bodyPart.label} 스트레칭`)).join("")}
      </div>
    `
  );
}

function renderRecordsContent(largestTrend) {
  const activity = fitmonState.activity;
  if (!fitmonState.records.totalCompleted) {
    return renderEmptyRecordPrompt();
  }
  return `
    ${renderPanelActions("records")}
    <div class="section-heading">
      <h2>이번 달 기록</h2>
      <span class="tag">이번 달 ${fitmonState.records.monthCount}회</span>
    </div>
    <div class="records-grid" style="margin-bottom: 14px;">
      <div class="stat">
        <small>오늘 수행</small>
        <strong>${fitmonState.records.todayCount}회</strong>
      </div>
      <div class="stat">
        <small>하루 평균</small>
        <strong>${fitmonState.records.monthAverage}회</strong>
      </div>
      <div class="stat">
        <small>연속 달성</small>
        <strong>${fitmonState.records.streakDays}일</strong>
      </div>
      <div class="stat">
        <small>최근 7일</small>
        <strong>${fitmonState.records.weekCount}회</strong>
      </div>
    </div>
    <div class="records-grid" style="margin-bottom: 14px;">
      <div class="stat">
        <small>연속 브라우저 활동</small>
        <strong>${activity.isSessionActive ? `${activity.activeMinutes}분` : "휴식 중"}</strong>
      </div>
      <div class="stat">
        <small>다음 알림 기준</small>
        <strong>${activity.promptDue ? "지금 스트레칭" : `${Math.max(1, Math.ceil(activity.remainingUntilPromptMs / 60000))}분 남음`}</strong>
      </div>
    </div>
    <div class="section-heading" style="margin-top: 14px;">
      <h2>부위별 스트레칭</h2>
      <span class="tag">${escapeHtml(fitmonState.records.topBodyPart)}</span>
    </div>
    <div class="record-list" style="margin-top: 14px;">
      ${fitmonState.records.bodyBreakdown.length
        ? fitmonState.records.bodyBreakdown
            .map(
              (part) => `
                <div class="mini-row">
                  <span>${escapeHtml(part.label)}</span>
                  <span>${part.count}회</span>
                </div>
              `
            )
            .join("")
        : `<div class="mini-row"><span>부위별 스트레칭</span><span>아직 미수행</span></div>`}
    </div>
    <div class="section-heading" style="margin-top: 14px;">
      <h2>이번 달 기록</h2>
      <span class="tag">${fitmonState.records.monthCalendar.monthLabel}</span>
    </div>
    ${renderCalendar(fitmonState.records.monthCalendar)}
    <div class="trend">
      ${fitmonState.records.weeklyTrend
        .map(
          (entry) => `
            <div class="trend-bar">
              <div class="trend-fill" style="height: ${Math.max(14, Math.round((entry.count / largestTrend) * 96))}px;"></div>
              <div class="trend-label">${entry.dayLabel}</div>
            </div>
          `
        )
        .join("")}
    </div>
    <div class="session-list" style="margin-top: 14px;">
      ${fitmonState.recentSessions
        .map(
          (session) => `
            <div class="mini-row">
              <span>${escapeHtml(session.routineTitle)}</span>
              <span>${formatDate(session.completedAt)} · ${session.durationSec}초</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCustomizeContent(currentFitmon, levelProgress) {
  return `
    ${renderPanelActions("customize")}
    <div class="metrics-grid">
      <div class="stat">
        <small>현재 핏몬</small>
        <strong>${escapeHtml(currentFitmon ? currentFitmon.name : "기본")}</strong>
      </div>
      <div class="stat">
        <small>핏 포인트</small>
        <strong>${fitmonState.character.points}P</strong>
      </div>
      <div class="stat">
        <small>보유 핏몬</small>
        <strong>${fitmonState.catalog.ownedItems}마리</strong>
      </div>
    </div>
    ${
      currentFitmon
        ? `
          <article class="fitmon-feature">
            <div class="fitmon-feature-character-slot">
              ${renderFitmonCharacter(currentFitmon, "good", "medium")}
            </div>
            <div class="fitmon-feature-copy">
              <span class="pill active">선택 중</span>
              <h3 style="margin: 10px 0 0;">${escapeHtml(currentFitmon.name)}</h3>
              <p class="helper">${escapeHtml(currentFitmon.description)}</p>
              <p class="helper">${escapeHtml(currentFitmon.personality || "")}</p>
              <p class="helper"><strong>한마디</strong> ${escapeHtml(currentFitmon.catchphrase || "")}</p>
              ${renderFitmonLore(currentFitmon)}
            </div>
          </article>
        `
        : ""
    }
    <section class="catalog-shop-panel">
      <div class="section-heading">
        <h2>핏몬 도감 & 잠금해제</h2>
        <span class="tag">${fitmonState.catalog.ownedItems}/${fitmonState.catalog.totalItems} 보유</span>
      </div>
      <div class="catalog-shop-layout">
        <article class="panel-block">
          <div class="section-heading compact-heading">
            <h3>도감</h3>
            <span class="tag">${fitmonState.catalog.ownedItems}마리</span>
          </div>
          <div class="fitmon-roster" data-scroll-key="fitmon-roster">
            ${fitmonState.storeItems.map((item) => renderFitmonChip(item)).join("")}
          </div>
        </article>
        <article class="panel-block">
          <div class="section-heading compact-heading">
            <h3>포인트 잠금해제</h3>
            <span class="tag">${fitmonState.character.points} 핏 포인트</span>
          </div>
          <div class="store-grid compact-store-grid" data-scroll-key="fitmon-store-grid">
            ${fitmonState.storeItems.map((item) => renderStoreCard(item)).join("")}
          </div>
        </article>
      </div>
    </section>
    <div class="catalog-grid" style="margin-top: 14px;">
      <div class="stat">
        <small>핏몬 도감</small>
        <strong>${fitmonState.catalog.ownedItems}/${fitmonState.catalog.totalItems}</strong>
      </div>
      <div class="stat">
        <small>성장 총 완료</small>
        <strong>${fitmonState.records.totalCompleted}회</strong>
      </div>
    </div>
  `;
}

function renderSettingsContent() {
  return `
    ${renderPanelActions("settings")}
    <div class="section-heading">
      <h2>핏몬 살리기 설정</h2>
      <span class="tag">알림 주기와 소리</span>
    </div>
    <form id="settings-form">
      <div class="setting-grid">
        <div class="field">
          <label for="notificationsEnabled">알림 사용 여부</label>
          <select id="notificationsEnabled" name="notificationsEnabled">
            ${renderOption("true", "사용", String(fitmonState.preferences.notificationsEnabled))}
            ${renderOption("false", "미사용", String(fitmonState.preferences.notificationsEnabled))}
          </select>
        </div>
        ${renderFrequencyField("settings")}
        <div class="field">
          <label for="soundMode">소리 모드</label>
          <select id="soundMode" name="soundMode">
            ${renderOption("silent", "무음", fitmonState.preferences.soundMode)}
            ${renderOption("gentle", "시스템 알림음", fitmonState.preferences.soundMode)}
          </select>
        </div>
      </div>
      <div class="inline-actions">
        <button class="button" type="submit">설정 저장</button>
        <button class="ghost-button" type="button" data-action="clear-snooze">미루기 해제</button>
        <button class="ghost-button" type="button" data-action="reset-user-data">사용자 데이터 초기화</button>
      </div>
    </form>
    <p class="helper">핏몬은 컴퓨터 전체 사용이 아니라 브라우저 안에서 발생한 마우스, 키보드, 스크롤 입력을 기준으로 활동을 계산합니다. 30초 이상 입력이 없으면 휴식 중으로 전환돼요.</p>
    <div class="support-grid">
      <article class="support-card">
        <div class="section-heading">
          <h2>문제점 알리기</h2>
          <span class="tag">지원</span>
        </div>
        <form id="feedback-form">
          <div class="field">
            <label for="feedbackCategory">분류</label>
            <select id="feedbackCategory" name="category">
              ${renderOption("general", "일반 피드백", "general")}
              ${renderOption("bug", "버그", "general")}
              ${renderOption("ux", "UX 제안", "general")}
            </select>
          </div>
          <div class="field">
            <label for="feedbackMessage">내용</label>
            <textarea id="feedbackMessage" name="message" rows="4"></textarea>
          </div>
          <div class="inline-actions">
            <button class="button" type="submit">피드백 제출</button>
          </div>
        </form>
      </article>
      <article class="support-card">
        <div class="section-heading">
          <h2>탈퇴</h2>
          <span class="tag">계정</span>
        </div>
        <form id="withdrawal-form">
          <div class="field">
            <label for="withdrawalReason">사유</label>
            <textarea id="withdrawalReason" name="reason" rows="3"></textarea>
          </div>
          <div class="inline-actions">
            <button class="ghost-button" type="submit">탈퇴 요청 보내기</button>
          </div>
        </form>
      </article>
    </div>
    <div class="footer-links" style="margin-top: 16px;">
      <span>핏몬에 관하여</span>
      <span>핏몬 종료는 브라우저에서 확장 프로그램을 끄는 방식으로 처리합니다.</span>
      <span>앱 버전 0.1.0</span>
    </div>
  `;
}

function renderPanelActions(sectionId) {
  return `
    <div class="panel-actions">
      <button class="ghost-button" type="button" data-action="scroll-home">위로</button>
      <button class="ghost-button" type="button" data-action="close-section" data-section-id="${sectionId}">닫기</button>
    </div>
  `;
}

function renderLockedContent(message) {
  return `
    <div class="locked-panel">
      <strong>초기 설정 완료 후 열려요.</strong>
      <p class="helper">${message}</p>
      <div class="inline-actions">
        <button class="button" data-section-target="setup">초기 설정 계속</button>
      </div>
    </div>
  `;
}

function bindEvents() {
  app.querySelectorAll("[data-section-target]").forEach((button) => {
    button.addEventListener("click", () => {
      openSection(button.dataset.sectionTarget);
    });
  });

  app.querySelectorAll('[data-action="scroll-home"]').forEach((button) => {
    button.addEventListener("click", () => {
      const home = document.getElementById("home");
      if (home) {
        home.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  app.querySelectorAll('[data-action="close-section"]').forEach((button) => {
    button.addEventListener("click", () => {
      const sectionId = button.dataset.sectionId;
      rememberSectionState(sectionId, false);
      const section = document.getElementById(sectionId);
      if (section) {
        section.open = false;
        section.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  });

  app.querySelectorAll(".accordion").forEach((section) => {
    section.addEventListener("toggle", () => {
      rememberSectionState(section.id, section.open);
    });
  });

  const introButton = app.querySelector('[data-action="advance-onboarding-intro"]');
  if (introButton) {
    introButton.addEventListener("click", async () => {
      const response = await sendPanelMessage({ type: "fitmon/advance-onboarding-intro" });
      if (response) {
        await loadState();
      }
    });
  }

  app.querySelectorAll('[data-action="login-provider"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await sendPanelMessage({
        type: "fitmon/login-provider",
        provider: button.dataset.provider
      });
      if (response) {
        applyStateFromResponse(response.state);
      }
    });
  });

  app.querySelectorAll('[data-action="select-body-part"]').forEach((button) => {
    button.addEventListener("click", () => {
      selectedBodyPartId = button.dataset.bodyPart;
      rememberSectionState("stretching", true);
      render({ preserveScroll: false });
      openSection("stretching");
    });
  });

  app.querySelectorAll('[data-action="run-routine"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await sendPanelMessage({
        type: "fitmon/open-routine",
        routineId: button.dataset.routineId,
        entryMode: "panel"
      }, { allowErrorResponse: true });
      handleRoutineLaunchResult(response);
    });
  });

  app.querySelectorAll('[data-action="toggle-favorite"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await sendPanelMessage({
        type: "fitmon/toggle-favorite",
        routineId: button.dataset.routineId
      });
      if (response) {
        applyStateFromResponse(response.state);
      }
    });
  });

  app.querySelectorAll('[data-action="purchase-item"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await sendPanelMessage({
        type: "fitmon/purchase-or-equip",
        itemId: button.dataset.itemId
      });
      if (response) {
        applyStateFromResponse(response.state);
      }
    });
  });

  const checklistForm = document.getElementById("checklist-form");
  if (checklistForm) {
    checklistForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(checklistForm);
      const response = await sendPanelMessage({
        type: "fitmon/save-checklist",
        payload: {
          sittingHours: formData.get("sittingHours"),
          exerciseFrequency: formData.get("exerciseFrequency"),
          discomfortAreas: formData.getAll("discomfortAreas")
        }
      });
      if (response) {
        applyStateFromResponse(response.state);
      }
    });
  }

  const onboardingNotificationForm = document.getElementById("onboarding-notification-form");
  if (onboardingNotificationForm) {
    onboardingNotificationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(onboardingNotificationForm);
      const response = await sendPanelMessage({
        type: "fitmon/complete-onboarding-notifications",
        payload: {
          notificationsEnabled: formData.get("notificationsEnabled") === "true",
          frequencyMinutes: resolveFrequencyMinutes(formData),
          soundMode: formData.get("soundMode")
        }
      });
      if (response) {
        applyStateFromResponse(response.state);
      }
    });
  }

  const settingsForm = document.getElementById("settings-form");
  if (settingsForm) {
    settingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(settingsForm);
      const response = await sendPanelMessage({
        type: "fitmon/save-settings",
        payload: {
          notificationsEnabled: formData.get("notificationsEnabled") === "true",
          frequencyMinutes: resolveFrequencyMinutes(formData),
          soundMode: formData.get("soundMode")
        }
      });
      if (response) {
        applyStateFromResponse(response.state);
      }
    });
  }

  const feedbackForm = document.getElementById("feedback-form");
  if (feedbackForm) {
    feedbackForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(feedbackForm);
      const response = await sendPanelMessage({
        type: "fitmon/submit-feedback",
        payload: {
          category: formData.get("category"),
          message: formData.get("message")
        }
      });
      if (response) {
        window.alert("문제점 알리기 요청을 접수했어요.");
        await loadState();
      }
    });
  }

  const withdrawalForm = document.getElementById("withdrawal-form");
  if (withdrawalForm) {
    withdrawalForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!window.confirm("탈퇴 요청을 보낼까요? 계정 삭제는 관리자 확인 후 처리됩니다.")) {
        return;
      }
      const formData = new FormData(withdrawalForm);
      const response = await sendPanelMessage({
        type: "fitmon/request-withdrawal",
        payload: {
          reason: formData.get("reason")
        }
      });
      if (response) {
        window.alert("탈퇴 요청을 접수했어요.");
        await loadState();
      }
    });
  }

  const snoozeButton = app.querySelector('[data-action="snooze"]');
  if (snoozeButton) {
    snoozeButton.addEventListener("click", async () => {
      const response = await sendPanelMessage({ type: "fitmon/snooze", minutes: 10 });
      if (response) {
        await loadState();
      }
    });
  }

  const clearSnoozeButton = app.querySelector('[data-action="clear-snooze"]');
  if (clearSnoozeButton) {
    clearSnoozeButton.addEventListener("click", async () => {
      const response = await sendPanelMessage({
        type: "fitmon/save-settings",
        payload: { clearSnooze: true }
      });
      if (response) {
        await loadState();
      }
    });
  }

  const resetButton = app.querySelector('[data-action="reset-user-data"]');
  if (resetButton) {
    resetButton.addEventListener("click", async () => {
      const response = await sendPanelMessage({ type: "fitmon/reset-user-data" });
      if (response) {
        await loadState();
      }
    });
  }
}

function resolveFrequencyMinutes(formData) {
  const preset = formData.get("frequencyPreset");
  const typed = Number(formData.get("frequencyMinutes"));
  const value = preset === "custom" ? typed : Number(preset || typed);
  if (!Number.isFinite(value)) {
    return fitmonState.preferences.frequencyMinutes;
  }
  return Math.max(1, Math.min(240, Math.round(value)));
}

function bindFrequencyControls() {
  app.querySelectorAll(".frequency-control").forEach((control) => {
    const select = control.querySelector('select[name="frequencyPreset"]');
    const input = control.querySelector('input[name="frequencyMinutes"]');
    if (!select || !input) {
      return;
    }
    select.addEventListener("change", () => {
      if (select.value !== "custom") {
        input.value = select.value;
      }
    });
    input.addEventListener("input", () => {
      select.value = "custom";
    });
  });
}

async function sendPanelMessage(message, options = {}) {
  let response;
  try {
    response = await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (options.allowErrorResponse) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    window.alert(error instanceof Error ? error.message : "처리 중 문제가 생겼어요.");
    return null;
  }
  if (options.allowErrorResponse) {
    return response || { ok: false, error: "처리 중 문제가 생겼어요." };
  }
  if (!response || !response.ok) {
    window.alert(response && response.error ? response.error : "처리 중 문제가 생겼어요.");
    return null;
  }
  return response;
}

function bindPanelActivityTracking() {
  const markActive = () => {
    if (!fitmonState || !fitmonState.onboarding || !fitmonState.onboarding.completed) {
      return;
    }
    const now = Date.now();
    if (now - panelActivityLastSentAt < PANEL_ACTIVITY_THROTTLE_MS) {
      return;
    }
    panelActivityLastSentAt = now;
    void chrome.runtime.sendMessage({
      type: "fitmon/activity-ping",
      payload: {
        isActive: true,
        visible: true,
        reason: "sidepanel-activity"
      }
    }).catch((error) => {
      console.debug("FitMon sidepanel activity ping skipped", error);
    });
  };

  const passiveEvents = ["mousemove", "pointermove", "pointerdown", "click", "wheel", "scroll", "touchstart", "touchmove"];
  passiveEvents.forEach((eventName) => {
    window.addEventListener(eventName, markActive, { passive: true, capture: true });
  });
  ["keydown", "keyup", "input"].forEach((eventName) => {
    window.addEventListener(eventName, markActive, { capture: true });
  });
  window.addEventListener("focus", markActive, true);
}

function handleRoutineLaunchResult(response) {
  if (response && response.ok) {
    return;
  }
  if (response && response.error === "ONBOARDING_REQUIRED") {
    window.alert("초기 설정을 먼저 완료해 주세요.");
    openSection("setup");
    return;
  }
  window.alert("현재 탭에서는 오버레이를 띄우지 못했어요. 일반 웹페이지에서 다시 시도해 주세요.");
}

function ensureSectionOpenState() {
  if (!sectionOpenState) {
    sectionOpenState = {
      fatigue: false,
      stretching: false,
      records: false,
      customize: false,
      settings: false
    };
  }
}

function isSectionOpen(sectionId) {
  ensureSectionOpenState();
  return Boolean(sectionOpenState[sectionId]);
}

function rememberSectionState(sectionId, isOpen) {
  ensureSectionOpenState();
  sectionOpenState[sectionId] = isOpen;
}

function openSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (!target) {
    return;
  }

  if (target.matches("details")) {
    target.open = true;
    rememberSectionState(sectionId, true);
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderAccordionSection({ id, title, badge, summary, content, open, className = "" }) {
  const classes = `accordion card${className ? ` ${className}` : ""}`;
  return `
    <details class="${escapeAttribute(classes)}" id="${escapeAttribute(id)}" ${open ? "open" : ""}>
      <summary class="accordion-summary">
        <div class="accordion-heading">
          <div class="accordion-copy">
            <div class="accordion-title-row">
              <h2>${escapeHtml(title)}</h2>
              <span class="tag">${escapeHtml(badge)}</span>
            </div>
            <p class="accordion-summary-text">${escapeHtml(summary)}</p>
          </div>
          <span class="accordion-caret" aria-hidden="true"></span>
        </div>
      </summary>
      <div class="accordion-body">
        ${content}
      </div>
    </details>
  `;
}

function renderRoutineCard(routine, label) {
  return `
    <article class="routine-card">
      <div class="routine-top">
        <div>
          <span class="pill">${escapeHtml(label)}</span>
          <h3 style="margin-top: 10px;">${escapeHtml(routine.title)}</h3>
          <p class="helper">${escapeHtml(routine.bodyPartLabel)} · ${escapeHtml(routine.minutesLabel)} · ${escapeHtml(routine.recommendationReason)}</p>
        </div>
        <button class="ghost-button" data-action="toggle-favorite" data-routine-id="${escapeAttribute(routine.id)}">
          ${routine.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
        </button>
      </div>
      <div class="routine-meta">
        ${routine.guide
          .map(
            (step, index) => `
              <div class="mini-row">
                <span>${index + 1}. ${escapeHtml(step)}</span>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="inline-actions" style="margin-top: 12px;">
        <button class="button" data-action="run-routine" data-routine-id="${escapeAttribute(routine.id)}">페이지에서 시작</button>
      </div>
    </article>
  `;
}

function renderStoreCard(item) {
  const label = item.owned ? (item.equipped ? "선택 중" : "선택하기") : `${item.cost} 핏 포인트`;
  return `
    <article class="store-card">
      <div class="store-top">
        <div class="store-character-slot">
          ${renderFitmonCharacter(item, item.equipped ? "good" : "mid", "small")}
        </div>
        <div class="store-title-copy">
          <span class="pill">${escapeHtml(item.category)}</span>
          <h3 style="margin-top: 10px;">${escapeHtml(item.name)}</h3>
        </div>
        <span class="tag ${item.equipped ? "active" : ""}">${item.owned ? "보유" : "미보유"}</span>
      </div>
      <p class="helper">${escapeHtml(item.description)}</p>
      <p class="helper">${escapeHtml(item.personality || "")}</p>
      <p class="helper">좋아하는 루틴: ${escapeHtml(item.favoriteRoutine || "짧은 회복 스트레칭")}</p>
      <p class="helper">"${escapeHtml(item.catchphrase || "함께 쉬어가요.")}"</p>
      ${renderFitmonLore(item)}
      <div class="inline-actions">
        <button class="${item.affordable || item.owned ? "button" : "ghost-button"}" data-action="purchase-item" data-item-id="${escapeAttribute(item.id)}">
          ${escapeHtml(item.owned ? label : `${label}로 잠금해제`)}
        </button>
      </div>
    </article>
  `;
}

function renderFitmonLore(item) {
  if (!item || !Array.isArray(item.lore) || !item.lore.length) {
    return "";
  }
  return `
    <details class="fitmon-lore">
      <summary>${escapeHtml(item.name || "핏몬")} 소개 보기</summary>
      <div class="fitmon-lore-list">
        ${item.lore
          .map(
            (section) => `
              <section>
                <strong>${escapeHtml(section.title || "")}</strong>
                <p>${escapeHtml(section.body || "")}</p>
              </section>
            `
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderOption(value, label, selected) {
  return `<option value="${escapeAttribute(value)}" ${String(selected) === String(value) ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function formatDate(isoString) {
  if (!isoString) {
    return "-";
  }
  const date = new Date(isoString);
  return `${date.getMonth() + 1}/${date.getDate()} ${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
}

function formatBodyPartList(bodyPartIds) {
  if (!Array.isArray(bodyPartIds) || !bodyPartIds.length) {
    return "미선택";
  }

  return bodyPartIds
    .map((bodyPartId) => {
      const bodyPart = getBodyPartById(bodyPartId);
      return bodyPart ? bodyPart.label : bodyPartId;
    })
    .join(", ");
}
function formatActivitySummary(activity) {
  if (!activity) {
    return "";
  }
  if (activity.promptDue) {
    return `브라우저 활동 ${activity.activeMinutes}분째라서 지금 스트레칭을 권장하고 있어요.`;
  }
  if (activity.isSessionActive) {
    const remainingMinutes = Math.max(1, Math.ceil(activity.remainingUntilPromptMs / 60000));
    return `연속 브라우저 활동 ${activity.activeMinutes}분째예요. ${remainingMinutes}분 뒤 알림이 떠요.`;
  }
  return `브라우저 활동이 누적되면 ${activity.promptThresholdMinutes}분 기준으로 스트레칭 알림이 떠요.`;
}
function renderCalendar(calendar) {
  return `
    <div class="calendar">
      <div class="calendar-weekdays">
        ${calendar.weekdayLabels.map((label) => `<span>${label}</span>`).join("")}
      </div>
      <div class="calendar-grid">
        ${calendar.cells
          .map((cell) => {
            if (cell.kind === "empty") {
              return `<div class="calendar-cell empty"></div>`;
            }
            return `
              <div class="calendar-cell ${cell.count ? "active" : ""} ${cell.isToday ? "today" : ""}">
                <strong>${cell.day}</strong>
                <span>${cell.count ? `${cell.count}회` : ""}</span>
                <small>${cell.bodyPartLabel || ""}</small>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderFitmonChip(item) {
  return `
    <button class="fitmon-chip ${item.equipped ? "active" : ""} ${item.owned ? "" : "locked"}" data-action="purchase-item" data-item-id="${escapeAttribute(item.id)}">
      ${renderFitmonCharacter(item, item.equipped ? "good" : "mid", "tiny")}
      <span>${escapeHtml(item.name)}</span>
      <small>${escapeHtml(item.owned ? "보유" : `${item.cost}P`)}</small>
    </button>
  `;
}

function renderFitmonCharacter(item, state = "good", size = "medium") {
  const fitmon = item || { badge: "FM", palette: ["#7ef0bb", "#86c6ff"] };
  const visualState = CHARACTER_STATES[state] ? state : "good";
  const assetState = CHARACTER_STATES[visualState].asset;
  const assetSrc =
    fitmon.assetUrls && fitmon.assetUrls[assetState]
      ? safeAssetSrc(fitmon.assetUrls[assetState])
      : `assets/fitmons/basic/${assetState}.png`;
  const label = `${fitmon.name || "FitMon"} ${CHARACTER_STATES[visualState].label}`;
  return `
    <div class="fitmon-character ${escapeAttribute(size)} ${escapeAttribute(visualState)} ${escapeAttribute(assetState)}" aria-label="${escapeAttribute(label)}">
      <img src="${escapeAttribute(assetSrc)}" alt="${escapeAttribute(label)}">
    </div>
  `;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function safeAssetSrc(src) {
  const value = String(src || "");
  if (value.startsWith("https://fitmon.ycc.club/") || value.startsWith("assets/")) {
    return value;
  }
  return "assets/fitmons/basic/good.png";
}

function fitmonCharacterStyle(item) {
  const [left, right] = item.palette || ["#86c6ff", "#7ef0bb"];
  return `--fm-left: ${left}; --fm-right: ${right};`;
}

function fitmonSwatchStyle(item) {
  const [left, right] = item.palette || ["#86c6ff", "#7ef0bb"];
  return `background: linear-gradient(135deg, ${left}, ${right});`;
}

function resolveSelectedBodyPartId() {
  if (selectedBodyPartId && fitmonState.bodyParts.some((part) => part.id === selectedBodyPartId)) {
    return selectedBodyPartId;
  }
  return (
    fitmonState.checklist.discomfortAreas[0] ||
    fitmonState.preferences.focusAreas[0] ||
    fitmonState.quickRoutine.bodyPart ||
    (fitmonState.bodyParts[0] && fitmonState.bodyParts[0].id) ||
    null
  );
}

function getBodyPartById(bodyPartId) {
  return fitmonState.bodyParts.find((part) => part.id === bodyPartId);
}

function getOnboardingStepLabel(stepId) {
  return getOnboardingStepMeta(stepId).label;
}

function getOnboardingStepMeta(stepId) {
  return ONBOARDING_STEPS.find((step) => step.id === stepId) || ONBOARDING_STEPS[0];
}






