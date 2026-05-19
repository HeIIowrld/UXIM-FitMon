(function bootstrapFitMon() {
  const STORAGE_KEY = "fitmonState";
  const PREVIOUS_STORAGE_KEY = "fitmon" + "Pi" + "lotState";

  if (window.top !== window || document.getElementById("fitmon-root")) {
    return;
  }

  const container = document.createElement("div");
  container.id = "fitmon-root";
  document.documentElement.appendChild(container);
  const shadowRoot = container.attachShadow({ mode: "open" });

  const ui = {
    state: null,
    overlayOpen: false,
    routine: null,
    remainingSec: 0,
    totalSec: 0,
    timerId: null,
    countdownDone: false,
    completionInProgress: false,
    isPaused: false,
    successCard: null,
    snoozeTimerId: null
  };

  const activity = {
    lastInputAt: 0,
    lastSentAt: 0,
    heartbeatId: null,
    idleSent: false,
    inputSeenSinceHeartbeat: false
  };

  const ACTIVITY_IDLE_MS = 30000;
  const ACTIVITY_HEARTBEAT_MS = 5000;
  const ACTIVITY_EVENT_THROTTLE_MS = 4000;

  const styles = `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
    }

    .fitmon-layer {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      font-family: "Segoe UI Variable", "Pretendard", "Apple SD Gothic Neo", sans-serif;
      color: #f4f7fb;
    }

    .fitmon-banner {
      pointer-events: auto;
      position: fixed;
      left: 18px;
      right: 18px;
      top: 16px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 14px 16px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 24px 60px rgba(4, 10, 22, 0.28);
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.12), transparent 32%),
        linear-gradient(135deg, rgba(8, 16, 33, 0.96), rgba(10, 36, 42, 0.94));
      backdrop-filter: blur(14px);
    }

    .fitmon-banner[data-mood="good"] {
      background:
        radial-gradient(circle at top left, rgba(126, 240, 187, 0.26), transparent 34%),
        linear-gradient(135deg, rgba(8, 16, 33, 0.96), rgba(16, 55, 45, 0.94));
    }

    .fitmon-banner[data-mood="mid"] {
      background:
        radial-gradient(circle at top left, rgba(124, 198, 255, 0.24), transparent 34%),
        linear-gradient(135deg, rgba(8, 16, 33, 0.96), rgba(15, 47, 72, 0.94));
    }

    .fitmon-banner[data-mood="bad"] {
      background:
        radial-gradient(circle at top left, rgba(255, 190, 104, 0.22), transparent 34%),
        linear-gradient(135deg, rgba(8, 16, 33, 0.96), rgba(71, 43, 17, 0.94));
    }

    .fitmon-banner[data-mood="discharged"] {
      background:
        radial-gradient(circle at top left, rgba(255, 127, 116, 0.22), transparent 34%),
        linear-gradient(135deg, rgba(8, 16, 33, 0.96), rgba(75, 28, 34, 0.94));
    }

    .fitmon-character {
      position: relative;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      overflow: visible;
    }

    .fitmon-character img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 14px 20px rgba(0, 0, 0, 0.28));
      user-select: none;
      pointer-events: none;
    }

    .fitmon-banner-character {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 4px;
    }

    .fitmon-stage-character {
      width: min(88%, 300px);
      height: 220px;
      z-index: 1;
    }

    .fitmon-stage-character.discharged {
      width: min(92%, 330px);
    }

    .fitmon-avatar {
      position: relative;
      width: 56px;
      height: 56px;
      border-radius: 20px 20px 24px 24px;
      background:
        radial-gradient(circle at 30% 22%, rgba(255, 255, 255, 0.68), transparent 24%),
        linear-gradient(135deg, var(--fitmon-left, #7ef0bb), var(--fitmon-right, #86c6ff));
      border: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.34),
        inset 0 -8px 18px rgba(7, 17, 31, 0.18);
    }

    .fitmon-avatar::before,
    .fitmon-avatar::after {
      content: "";
      position: absolute;
      top: -6px;
      width: 14px;
      height: 14px;
      border-radius: 999px 999px 4px 4px;
      background: linear-gradient(135deg, var(--fitmon-left, #7ef0bb), var(--fitmon-right, #86c6ff));
      z-index: -1;
    }

    .fitmon-avatar::before {
      left: 13px;
      transform: rotate(-18deg);
    }

    .fitmon-avatar::after {
      right: 13px;
      transform: rotate(18deg);
    }

    .fitmon-face {
      position: absolute;
      inset: 0;
    }

    .fitmon-face::before,
    .fitmon-face::after {
      content: "";
      position: absolute;
      top: 25px;
      width: 6px;
      height: 9px;
      border-radius: 999px;
      background: #07111f;
    }

    .fitmon-face::before {
      left: 19px;
    }

    .fitmon-face::after {
      right: 19px;
    }

    .fitmon-mouth {
      position: absolute;
      left: 50%;
      top: 38px;
      width: 15px;
      height: 7px;
      transform: translateX(-50%);
      border: 2px solid #07111f;
      border-top: 0;
      border-radius: 0 0 999px 999px;
    }

    .fitmon-banner[data-mood="mid"] .fitmon-face::before,
    .fitmon-banner[data-mood="mid"] .fitmon-face::after {
      height: 3px;
      top: 29px;
    }

    .fitmon-banner[data-mood="bad"] .fitmon-mouth,
    .fitmon-banner[data-mood="discharged"] .fitmon-mouth {
      top: 40px;
      border-top: 2px solid #07111f;
      border-bottom: 0;
      border-radius: 999px 999px 0 0;
    }

    .fitmon-summary {
      min-width: 0;
      display: grid;
      gap: 6px;
    }

    .fitmon-heading {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .fitmon-heading strong {
      font-size: 15px;
      letter-spacing: -0.03em;
    }

    .fitmon-pill {
      padding: 5px 9px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .fitmon-copy {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      color: rgba(230, 239, 248, 0.82);
      font-size: 13px;
    }

    .fitmon-copy span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .fitmon-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }

    .fitmon-button {
      appearance: none;
      border: 0;
      cursor: pointer;
      border-radius: 999px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #eff6ff;
      background: rgba(255, 255, 255, 0.1);
      transition: transform 140ms ease, background 140ms ease;
    }

    .fitmon-button:hover {
      transform: translateY(-1px);
      background: rgba(255, 255, 255, 0.16);
    }

    .fitmon-button.primary {
      background: linear-gradient(135deg, #95ffb6, #7ef0bb);
      color: #0f1822;
    }

    .fitmon-button.ghost {
      background: rgba(255, 255, 255, 0.06);
    }

    .fitmon-overlay {
      pointer-events: auto;
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 28px;
      background: rgba(6, 12, 24, 0.42);
      backdrop-filter: blur(10px);
    }

    .fitmon-modal {
      width: min(720px, calc(100vw - 48px));
      border-radius: 28px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 28px 90px rgba(6, 10, 18, 0.4);
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.18), transparent 32%),
        linear-gradient(135deg, rgba(4, 12, 26, 0.98), rgba(11, 37, 47, 0.96));
    }

    .fitmon-modal-head {
      padding: 26px 28px 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .fitmon-modal-head h2 {
      margin: 0;
      font-size: clamp(28px, 3vw, 40px);
      letter-spacing: -0.05em;
      line-height: 0.96;
    }

    .fitmon-modal-head p {
      margin: 8px 0 0;
      color: rgba(231, 240, 249, 0.7);
      font-size: 14px;
      line-height: 1.5;
      max-width: 38rem;
    }

    .fitmon-modal-grid {
      display: grid;
      grid-template-columns: 1.05fr 0.95fr;
      gap: 0;
    }

    .fitmon-stage,
    .fitmon-sidebar {
      padding: 12px 28px 28px;
    }

    .fitmon-stage {
      border-right: 1px solid rgba(255, 255, 255, 0.08);
    }

    .fitmon-orb {
      position: relative;
      height: 260px;
      border-radius: 26px;
      background:
        radial-gradient(circle at 50% 35%, rgba(160, 255, 201, 0.26), transparent 30%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    .fitmon-orb::before,
    .fitmon-orb::after {
      content: "";
      position: absolute;
      border-radius: 50%;
      opacity: 0.64;
    }

    .fitmon-orb::before {
      width: 220px;
      height: 220px;
      background: radial-gradient(circle, rgba(126, 240, 187, 0.32), transparent 68%);
      animation: fitmonPulse 1800ms ease-in-out infinite;
    }

    .fitmon-orb::after {
      width: 120px;
      height: 120px;
      background: rgba(255, 255, 255, 0.1);
      filter: blur(22px);
    }

    .fitmon-countdown {
      position: absolute;
      right: 18px;
      bottom: 18px;
      display: grid;
      place-items: center;
      width: 126px;
      height: 126px;
      border-radius: 50%;
      background: rgba(9, 16, 28, 0.84);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 20px 40px rgba(0, 0, 0, 0.28);
      text-align: center;
      z-index: 2;
    }

    .fitmon-countdown strong {
      display: block;
      font-size: 34px;
      letter-spacing: -0.06em;
      line-height: 0.96;
    }

    .fitmon-countdown span {
      display: block;
      margin-top: 8px;
      color: rgba(231, 240, 249, 0.66);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.09em;
    }

    .fitmon-guide {
      margin-top: 18px;
      display: grid;
      gap: 10px;
    }

    .fitmon-step {
      padding: 14px 16px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: rgba(236, 243, 250, 0.9);
      font-size: 14px;
      line-height: 1.5;
    }

    .fitmon-sidebar h3,
    .fitmon-success h3 {
      margin: 0 0 12px;
      font-size: 16px;
      letter-spacing: -0.03em;
    }

    .fitmon-metrics {
      display: grid;
      gap: 12px;
    }

    .fitmon-metric {
      padding: 16px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .fitmon-metric small {
      display: block;
      color: rgba(228, 237, 247, 0.62);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .fitmon-metric strong {
      display: block;
      margin-top: 8px;
      font-size: 24px;
      letter-spacing: -0.05em;
    }

    .fitmon-inline-actions {
      margin-top: 18px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .fitmon-success {
      display: grid;
      gap: 14px;
      padding: 24px 28px 28px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(126, 240, 187, 0.08);
    }

    .fitmon-success p {
      margin: 0;
      color: rgba(231, 240, 249, 0.74);
      line-height: 1.5;
      font-size: 14px;
    }

    @keyframes fitmonPulse {
      0%,
      100% {
        transform: scale(0.96);
        opacity: 0.48;
      }

      50% {
        transform: scale(1.06);
        opacity: 0.8;
      }
    }

    @media (max-width: 900px) {
      .fitmon-banner {
        grid-template-columns: 1fr;
      }

      .fitmon-actions {
        justify-content: flex-start;
      }

      .fitmon-modal-grid {
        grid-template-columns: 1fr;
      }

      .fitmon-stage {
        border-right: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
    }
  `;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "fitmon/open-routine") {
      return false;
    }
    startRoutine(message.routine, message.entryMode || "panel");
    sendResponse({ ok: true });
    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || (!changes[STORAGE_KEY] && !changes[PREVIOUS_STORAGE_KEY])) {
      return;
    }
    void refreshState();
  });

  void refreshState();
  bindActivityTracking();

  async function refreshState() {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: "fitmon/get-state" });
    } catch (error) {
      console.debug("FitMon state refresh skipped", error);
      return;
    }
    if (!response || !response.ok) {
      return;
    }
    ui.state = response.state;
    if (!ui.state.user.onboardingCompleted) {
      stopActivityHeartbeat();
      activity.idleSent = false;
    }
    armSnoozeTimer();
    render();
  }

  function armSnoozeTimer() {
    if (ui.snoozeTimerId) {
      window.clearTimeout(ui.snoozeTimerId);
      ui.snoozeTimerId = null;
    }
    const until = ui.state && ui.state.preferences && ui.state.preferences.snoozeUntil;
    if (!until) {
      return;
    }
    const remaining = new Date(until).getTime() - Date.now();
    if (remaining <= 0) {
      return;
    }
    ui.snoozeTimerId = window.setTimeout(() => {
      void sendRuntimeMessageSafe({
        type: "fitmon/save-settings",
        payload: { clearSnooze: true }
      });
    }, remaining + 200);
  }

  async function sendRuntimeMessageSafe(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      console.debug("FitMon message skipped", error);
      return null;
    }
  }

  function render() {
    const state = ui.state;
    const isBannerVisible = Boolean(state) && shouldShowBanner(state);
    const banner = isBannerVisible ? renderBanner(state) : "";
    const overlay = ui.overlayOpen ? renderOverlay(state) : "";

    shadowRoot.innerHTML = `
      <style>${styles}</style>
      <div class="fitmon-layer">
        ${banner}
        ${overlay}
      </div>
    `;

    bindInteractions();
  }

  function renderBanner(state) {
    const { activity: activityState, character, status, home, quickRoutine, user } = state;
    const currentFitmon = character && character.currentFitmon ? character.currentFitmon : null;
    const fitmonName = currentFitmon ? currentFitmon.name : "FitMon";
    const visualState = resolveCharacterVisualState(state);
    const needsOnboarding = !user.onboardingCompleted;
    const activityCopy = needsOnboarding
      ? `${getOnboardingBannerLabel(user.onboardingStep)} 단계가 남아 있어요`
      : activityState.promptDue
        ? `브라우저 활동 ${activityState.activeMinutes}분째예요`
        : `다음 알림까지 ${Math.max(1, Math.ceil(activityState.remainingUntilPromptMs / 60000))}분 남았어요`;
    return `
      <section class="fitmon-banner" data-mood="${escapeAttribute(status.mood)}">
        ${renderFitmonCharacter(currentFitmon, visualState, "fitmon-banner-character")}
        <div class="fitmon-summary">
          <div class="fitmon-heading">
            <strong>${escapeHtml(user.name)}님의 ${escapeHtml(fitmonName)}</strong>
            <span class="fitmon-pill">${escapeHtml(needsOnboarding ? "초기 설정" : status.statusLabel)}</span>
          </div>
          <div class="fitmon-copy">
            <span>${needsOnboarding ? "첫 실행 플로우 진행 중" : `오늘 ${status.todayCompletedCount}회`}</span>
            <span>${needsOnboarding ? `${getOnboardingBannerLabel(user.onboardingStep)} 대기` : `${status.streakDays}일 연속`}</span>
            <span>${needsOnboarding ? "로그인 후 활성화" : `Lv.${home.level}`}</span>
            <span>${activityCopy}</span>
          </div>
        </div>
        <div class="fitmon-actions">
          <button class="fitmon-button primary" data-action="quick-start">${needsOnboarding ? "초기 설정 시작" : "바로 시작"}</button>
          <button class="fitmon-button" data-action="open-hub">${needsOnboarding ? "사이드바 열기" : "전체 열기"}</button>
          ${needsOnboarding ? "" : `<button class="fitmon-button ghost" data-action="snooze">10분 미루기</button>`}
        </div>
      </section>
    `;
  }

  function renderOverlay(state) {
    const routine = ui.routine;
    if (!routine) {
      return "";
    }
    const currentFitmon = state.character && state.character.currentFitmon ? state.character.currentFitmon : null;
    const visualState = resolveCharacterVisualState(state);
    const statusSummary = ui.completionInProgress
      ? "완료를 기록하고 있어요."
      : ui.isPaused
        ? "잠시 멈춘 상태예요. 다시 시작하면 이어서 진행돼요."
        : "천천히 따라 하세요. 시간이 끝나면 자동으로 완료돼요.";
    const characterLine =
      currentFitmon && currentFitmon.statusLine
        ? currentFitmon.statusLine
        : currentFitmon && currentFitmon.catchphrase
          ? currentFitmon.catchphrase
          : "핏몬이 함께 회복 시간을 기다리고 있어요.";
    return `
      <div class="fitmon-overlay">
        <section class="fitmon-modal" role="dialog" aria-modal="true" aria-label="FitMon quick routine">
          <div class="fitmon-modal-head">
            <div>
              <h2>${escapeHtml(routine.title)}</h2>
              <p>${escapeHtml(routine.bodyPartLabel)} 스트레칭이에요. ${escapeHtml(statusSummary)}</p>
              <p>${escapeHtml(characterLine)}</p>
            </div>
            <button class="fitmon-button ghost" data-action="close-overlay">중단</button>
          </div>
          <div class="fitmon-modal-grid">
            <div class="fitmon-stage">
              <div class="fitmon-orb">
                ${renderFitmonCharacter(currentFitmon, visualState, "fitmon-stage-character")}
                <div class="fitmon-countdown">
                  <div>
                    <strong>${formatClock(ui.remainingSec)}</strong>
                    <span>${ui.completionInProgress ? "완료 중" : `${formatClock(ui.totalSec)} 기준`}</span>
                  </div>
                </div>
              </div>
              <div class="fitmon-guide">
                ${routine.guide
                  .map(
                    (step, index) => `
                    <div class="fitmon-step">
                      <strong>${index + 1}</strong> ${escapeHtml(step)}
                    </div>
                  `
                  )
                  .join("")}
              </div>
            </div>
            <aside class="fitmon-sidebar">
              <h3>현재 상태</h3>
              <div class="fitmon-metrics">
                <div class="fitmon-metric">
                  <small>현재 무드</small>
                  <strong>${escapeHtml(state.status.statusLabel)}</strong>
                </div>
                <div class="fitmon-metric">
                  <small>핏몬 한마디</small>
                  <strong>${escapeHtml(currentFitmon && currentFitmon.catchphrase ? currentFitmon.catchphrase : "함께 쉬어가요.")}</strong>
                </div>
                <div class="fitmon-metric">
                  <small>예상 보상</small>
                  <strong>+15 P / +25 XP</strong>
                </div>
                <div class="fitmon-metric">
                  <small>완료 후 상태</small>
                  <strong>건강으로 회복</strong>
                </div>
              </div>
              <div class="fitmon-inline-actions">
                <button class="fitmon-button primary" data-action="complete-session">${ui.completionInProgress ? "완료 중" : "스트레칭 완료"}</button>
                <button class="fitmon-button ghost" data-action="toggle-pause">${ui.isPaused ? "다시 시작" : "일시정지"}</button>
                <button class="fitmon-button" data-action="open-hub">허브 열기</button>
              </div>
            </aside>
          </div>
          ${
            ui.successCard
              ? `
              <div class="fitmon-success">
                <h3>${escapeHtml(ui.successCard.title)}</h3>
                <p>${escapeHtml(ui.successCard.body)}</p>
                <div class="fitmon-inline-actions">
                  <button class="fitmon-button primary" data-action="close-overlay">닫기</button>
                  <button class="fitmon-button" data-action="open-hub">기록 보기</button>
                </div>
              </div>
            `
              : ""
          }
        </section>
      </div>
    `;
  }
  function bindInteractions() {
    const quickButton = shadowRoot.querySelector('[data-action="quick-start"]');
    if (quickButton) {
      quickButton.addEventListener("click", async () => {
        if (!ui.state) {
          return;
        }
        if (!ui.state.user.onboardingCompleted) {
          await sendRuntimeMessageSafe({ type: "fitmon/open-side-panel" });
          return;
        }
        if (!ui.state.quickRoutine) {
          return;
        }
        startRoutine(ui.state.quickRoutine, "banner");
      });
    }

    shadowRoot.querySelectorAll('[data-action="open-hub"]').forEach((button) => {
      button.addEventListener("click", async () => {
        await sendRuntimeMessageSafe({ type: "fitmon/open-side-panel" });
      });
    });

    const snoozeButton = shadowRoot.querySelector('[data-action="snooze"]');
    if (snoozeButton) {
      snoozeButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const response = await sendRuntimeMessageSafe({ type: "fitmon/snooze", minutes: 10 });
        if (response && response.ok && response.state) {
          ui.state = response.state;
          armSnoozeTimer();
          render();
        }
      });
    }

    shadowRoot.querySelectorAll('[data-action="close-overlay"]').forEach((button) => {
      button.addEventListener("click", async () => {
        await closeOverlay(true);
      });
    });

    const completeButton = shadowRoot.querySelector('[data-action="complete-session"]');
    if (completeButton) {
      completeButton.addEventListener("click", async () => {
        await completeCurrentRoutine({ autoClose: false });
      });
    }

    const pauseButton = shadowRoot.querySelector('[data-action="toggle-pause"]');
    if (pauseButton) {
      pauseButton.addEventListener("click", () => {
        togglePause();
      });
    }
  }

  function bindActivityTracking() {
    const markActive = () => {
      if (!ui.state || !ui.state.user.onboardingCompleted) {
        return;
      }
      if (document.visibilityState !== "visible") {
        return;
      }
      const shouldWakeSession = activity.idleSent || !ui.state.activity || !ui.state.activity.isSessionActive;
      activity.lastInputAt = Date.now();
      activity.idleSent = false;
      activity.inputSeenSinceHeartbeat = true;
      ensureActivityHeartbeat();
      void sendActivityPing(true, shouldWakeSession ? "wake-input" : "input");
    };

    const passiveInputEvents = [
      "mousemove",
      "pointermove",
      "pointerdown",
      "mousedown",
      "click",
      "wheel",
      "scroll",
      "touchstart",
      "touchmove"
    ];
    passiveInputEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActive, { passive: true, capture: true });
    });

    ["keydown", "keyup", "input"].forEach((eventName) => {
      window.addEventListener(eventName, markActive, { capture: true });
    });

    window.addEventListener("focus", markActive, true);
    window.addEventListener(
      "blur",
      () => {
        stopActivityHeartbeat();
        if (ui.state && ui.state.user.onboardingCompleted) {
          void sendActivityPing(false, "blur", { force: true });
        }
      },
      true
    );

    document.addEventListener("visibilitychange", () => {
      if (!ui.state || !ui.state.user.onboardingCompleted) {
        return;
      }
      if (document.visibilityState === "visible") {
        markActive();
        return;
      }
      stopActivityHeartbeat();
      void sendActivityPing(false, "hidden", { force: true, visible: false });
    });
  }

  function ensureActivityHeartbeat() {
    if (!ui.state || !ui.state.user.onboardingCompleted) {
      return;
    }
    if (activity.heartbeatId) {
      return;
    }

    activity.heartbeatId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        stopActivityHeartbeat();
        void sendActivityPing(false, "hidden", { force: true, visible: false });
        return;
      }

      const mediaPlaying = hasActiveMediaPlayback();
      if (mediaPlaying) {
        activity.lastInputAt = Date.now();
        activity.idleSent = false;
      }

      if (Date.now() - activity.lastInputAt >= ACTIVITY_IDLE_MS) {
        stopActivityHeartbeat();
        if (!activity.idleSent) {
          activity.idleSent = true;
          activity.inputSeenSinceHeartbeat = false;
          void sendActivityPing(false, "idle-timeout", { force: true });
        }
        return;
      }

      if (activity.inputSeenSinceHeartbeat || mediaPlaying) {
        activity.inputSeenSinceHeartbeat = false;
        void sendActivityPing(true, "heartbeat", { force: true });
      }
    }, ACTIVITY_HEARTBEAT_MS);
  }

  function hasActiveMediaPlayback() {
    return Array.from(document.querySelectorAll("video, audio")).some((media) => {
      return !media.paused && !media.ended && media.readyState > 2;
    });
  }

  function stopActivityHeartbeat() {
    if (activity.heartbeatId) {
      window.clearInterval(activity.heartbeatId);
      activity.heartbeatId = null;
    }
  }

  async function sendActivityPing(isActive, reason, options = {}) {
    if (!ui.state || !ui.state.user.onboardingCompleted) {
      return;
    }
    const now = Date.now();
    const force = Boolean(options.force);
    const visible = options.visible !== undefined ? options.visible : document.visibilityState === "visible";

    if (!force && now - activity.lastSentAt < ACTIVITY_EVENT_THROTTLE_MS) {
      return;
    }

    activity.lastSentAt = now;

    try {
      await sendRuntimeMessageSafe({
        type: "fitmon/activity-ping",
        payload: {
          isActive,
          visible,
          reason
        }
      });
    } catch (error) {
      console.debug("FitMon activity ping skipped", error);
    }
  }

  async function startRoutine(routine, entryMode) {
    ui.overlayOpen = true;
    ui.routine = routine;
    ui.remainingSec = routine.durationSec;
    ui.totalSec = routine.durationSec;
    ui.countdownDone = false;
    ui.completionInProgress = false;
    ui.isPaused = false;
    ui.successCard = null;
    stopTimer();
    await sendRuntimeMessageSafe({
      type: "fitmon/start-session",
      routineId: routine.id,
      entryMode
    });
    startTimerLoop();
    render();
  }

  async function closeOverlay(logAbandon) {
    const routineId = ui.routine && ui.routine.id;
    if (logAbandon && routineId && !ui.successCard) {
      await sendRuntimeMessageSafe({
        type: "fitmon/abandon-session",
        routineId,
        entryMode: "overlay"
      });
    }
    stopTimer();
    ui.overlayOpen = false;
    ui.routine = null;
    ui.remainingSec = 0;
    ui.totalSec = 0;
    ui.countdownDone = false;
    ui.completionInProgress = false;
    ui.isPaused = false;
    ui.successCard = null;
    render();
  }

  function stopTimer() {
    if (ui.timerId) {
      window.clearInterval(ui.timerId);
      ui.timerId = null;
    }
  }

  function startTimerLoop() {
    stopTimer();
    ui.timerId = window.setInterval(() => {
      ui.remainingSec = Math.max(0, ui.remainingSec - 1);
      if (ui.remainingSec === 0) {
        stopTimer();
        ui.countdownDone = true;
        ui.isPaused = false;
        void completeCurrentRoutine({ autoClose: true });
        render();
        return;
      }
      render();
    }, 1000);
  }

  async function completeCurrentRoutine({ autoClose } = {}) {
    if (!ui.routine || ui.completionInProgress || ui.successCard) {
      return;
    }
    ui.completionInProgress = true;
    ui.isPaused = false;
    ui.countdownDone = true;
    ui.remainingSec = 0;
    stopTimer();
    render();

    const response = await sendRuntimeMessageSafe({
      type: "fitmon/complete-session",
      routineId: ui.routine.id,
      entryMode: "overlay"
    });
    if (response && response.ok && response.state) {
      ui.state = response.state;
    }
    const currentFitmon = ui.state && ui.state.character ? ui.state.character.currentFitmon : null;
    const recoveredLine =
      currentFitmon && currentFitmon.stateLines && currentFitmon.stateLines.good
        ? currentFitmon.stateLines.good
        : "핏몬이 다시 건강한 상태로 회복됐어요.";
    ui.successCard = {
      title: "스트레칭 완료!",
      body: `${recoveredLine} 오늘 수행 ${ui.state ? ui.state.status.todayCompletedCount : 1}회와 연속 달성 기록을 반영합니다.`
    };
    ui.completionInProgress = false;

    if (autoClose) {
      await closeOverlay(false);
      await refreshState();
      return;
    }

    await refreshState();
  }

  function togglePause() {
    if (ui.countdownDone || !ui.overlayOpen) {
      return;
    }
    if (ui.isPaused) {
      ui.isPaused = false;
      startTimerLoop();
    } else {
      ui.isPaused = true;
      stopTimer();
    }
    render();
  }

  function shouldShowBanner(state) {
    if (!state.user.onboardingCompleted) {
      return false;
    }
    if (!state.preferences.notificationsEnabled) {
      return false;
    }
    if (!state.activity || !state.activity.promptDue) {
      return false;
    }
    const until = state.preferences.snoozeUntil;
    if (!until) {
      return true;
    }
    return new Date(until).getTime() <= Date.now();
  }

  function formatClock(totalSec) {
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function getOnboardingBannerLabel(stepId) {
    switch (stepId) {
      case "intro":
        return "핏몬 소개";
      case "login":
        return "SNS 로그인";
      case "checklist":
        return "맞춤 체크리스트";
      case "notifications":
        return "알림 주기";
      default:
        return "초기 설정";
    }
  }

  function renderFitmonCharacter(item, state, className) {
    const visualState = ["good", "mid", "bad", "discharged"].includes(state) ? state : "good";
    const fitmon = item || {};
    const src =
      fitmon.assetUrls && fitmon.assetUrls[visualState]
        ? safeAssetSrc(fitmon.assetUrls[visualState])
        : chrome.runtime.getURL(`assets/fitmons/basic/${visualState}.png`);
    const name = fitmon.name || "FitMon";
    const label = `${name} ${resolveCharacterStateLabel(visualState)}`;
    return `
      <div class="fitmon-character ${escapeAttribute(className)} ${escapeAttribute(visualState)}" aria-label="${escapeAttribute(label)}">
        <img src="${escapeAttribute(src)}" alt="${escapeAttribute(label)}">
      </div>
    `;
  }

  function resolveCharacterVisualState(state) {
    const status = state && state.status ? state.status : {};
    return ["good", "mid", "bad", "discharged"].includes(status.mood) ? status.mood : "good";
  }

  function resolveCharacterStateLabel(state) {
    switch (state) {
      case "mid":
        return "보통";
      case "bad":
        return "피곤";
      case "discharged":
        return "방전";
      default:
        return "좋음";
    }
  }
  function safeAssetSrc(src) {
    const value = String(src || "");
    if (value.startsWith("https://fitmon.ycc.club/") || value.startsWith("chrome-extension://")) {
      return value;
    }
    return chrome.runtime.getURL("assets/fitmons/basic/good.png");
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
})();
