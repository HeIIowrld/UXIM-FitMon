const STORAGE_KEY = "fitmonState";
const PREVIOUS_STORAGE_KEY = "fitmon" + "Pi" + "lotState";
const BACKEND_BASE_URL = "https://fitmon.ycc.club";
const LOCAL_FITMON_ASSET_BASE = chrome.runtime.getURL("assets/fitmons/basic");
const FITMON_CATALOG_CACHE_MS = 5 * 60 * 1000;
let fitmonCatalogCache = null;
let fitmonCatalogFetchedAt = 0;
let stateMutationQueue = Promise.resolve();
const PANEL_PATH = "sidepanel.html";
const PROVIDER_LABELS = {
  naver: "Naver"
};
const OAUTH_PROVIDER_CONFIGS = {
  naver: {
    clientId: "",
    authUrl: "https://nid.naver.com/oauth2.0/authorize",
    scopes: [],
    extraParams: {
      response_type: "code"
    }
  }
};
const ONBOARDING_STEPS = ["intro", "login", "checklist", "notifications", "done"];

const BODY_PARTS = [
  { id: "neck", label: "목", accent: "#ffb067", emoji: "N" },
  { id: "shoulders", label: "어깨", accent: "#ffd166", emoji: "S" },
  { id: "back", label: "등", accent: "#74d3ae", emoji: "B" },
  { id: "waist", label: "허리", accent: "#80b3ff", emoji: "W" },
  { id: "wrist", label: "손목", accent: "#c89cff", emoji: "R" },
  { id: "hip", label: "고관절", accent: "#ff8fa3", emoji: "H" },
  { id: "leg", label: "다리", accent: "#9be564", emoji: "L" },
  { id: "ankle", label: "발목", accent: "#64dfdf", emoji: "A" },
  { id: "eyes", label: "눈", accent: "#f9c74f", emoji: "E" }
];

const ROUTINES = [
  {
    id: "routine-neck-release",
    title: "목 긴장 풀기",
    bodyPart: "neck",
    durationSec: 25,
    quickEligible: true,
    minutesLabel: "0.5분",
    guide: [
      "턱을 당기고 목을 길게 세워주세요.",
      "오른쪽으로 천천히 기울여 10초 유지합니다.",
      "반대쪽도 같은 리듬으로 이어갑니다."
    ]
  },
  {
    id: "routine-shoulder-reset",
    title: "어깨 리셋 롤",
    bodyPart: "shoulders",
    durationSec: 30,
    quickEligible: true,
    minutesLabel: "0.5분",
    guide: [
      "어깨를 크게 뒤로 5번 돌립니다.",
      "양손을 깍지 끼고 가슴을 부드럽게 엽니다.",
      "숨을 내쉬며 긴장을 내려놓습니다."
    ]
  },
  {
    id: "routine-back-wave",
    title: "등 펴기 웨이브",
    bodyPart: "back",
    durationSec: 30,
    quickEligible: true,
    minutesLabel: "0.5분",
    guide: [
      "의자 끝에 앉아 허리를 세워주세요.",
      "가슴을 열고 등 가운데를 부드럽게 움직입니다.",
      "양팔을 앞으로 뻗어 등을 둥글게 말아줍니다."
    ]
  },
  {
    id: "routine-waist-twist",
    title: "허리 트위스트",
    bodyPart: "waist",
    durationSec: 30,
    quickEligible: true,
    minutesLabel: "0.5분",
    guide: [
      "양발을 바닥에 두고 척추를 길게 세웁니다.",
      "상체를 오른쪽으로 돌려 10초 유지합니다.",
      "반대 방향도 같은 호흡으로 반복합니다."
    ]
  },
  {
    id: "routine-wrist-reset",
    title: "손목 꺾임 복구",
    bodyPart: "wrist",
    durationSec: 20,
    quickEligible: true,
    minutesLabel: "0.3분",
    guide: [
      "손바닥을 앞으로 밀어 손목 앞쪽을 늘립니다.",
      "손등을 반대로 눌러 손목 뒤쪽을 풀어주세요.",
      "손가락 끝을 가볍게 털며 마무리합니다."
    ]
  },
  {
    id: "routine-hip-opener",
    title: "고관절 열기",
    bodyPart: "hip",
    durationSec: 30,
    quickEligible: true,
    minutesLabel: "0.5분",
    guide: [
      "한쪽 발목을 반대쪽 무릎 위에 올립니다.",
      "상체를 앞으로 살짝 기울여 둔근을 늘립니다.",
      "반대쪽도 같은 방식으로 진행합니다."
    ]
  },
  {
    id: "routine-leg-pump",
    title: "다리 순환 펌프",
    bodyPart: "leg",
    durationSec: 25,
    quickEligible: true,
    minutesLabel: "0.5분",
    guide: [
      "발뒤꿈치를 들어 올리며 종아리를 자극합니다.",
      "무릎을 번갈아 가슴 쪽으로 당깁니다.",
      "발끝을 크게 돌려 혈류를 깨웁니다."
    ]
  },
  {
    id: "routine-ankle-circles",
    title: "발목 서클",
    bodyPart: "ankle",
    durationSec: 20,
    quickEligible: true,
    minutesLabel: "0.3분",
    guide: [
      "한쪽 발을 들어 발목을 크게 돌립니다.",
      "시계 방향, 반시계 방향을 번갈아 진행합니다.",
      "반대쪽 발도 같은 횟수로 마무리합니다."
    ]
  },
  {
    id: "routine-eye-break",
    title: "눈 휴식 20초",
    bodyPart: "eyes",
    durationSec: 20,
    quickEligible: true,
    minutesLabel: "0.3분",
    guide: [
      "화면에서 눈을 떼고 먼 곳을 바라보세요.",
      "천천히 몇 번 깜빡이며 초점을 풀어줍니다.",
      "어깨 힘을 빼고 숨을 길게 내쉽니다."
    ]
  }
];

const STORE_ITEMS = [
  {
    id: "fitmon-basic",
    slug: "basic",
    name: "포포(POPO)",
    category: "핏몬",
    cost: 0,
    description: "블루 델피늄 행성에서 온 느긋한 기본 핏몬. 머리의 꽃은 건강할 때만 싱싱하게 살아 있어요.",
    personality: "아주 단순하고 느긋해요. 맛있는 것, 쉬는 것, 기지개 켜는 것을 가장 좋아합니다.",
    favoriteRoutine: "가볍게 기지개 켜고 목과 어깨 풀기",
    catchphrase: "그냥 여기서 살래!",
    lore: [
      {
        title: "출신: 블루 델피늄 행성",
        body: "은하수 가장자리의 푸른 자연 행성에서 태어난 느긋하고 건강한 종족입니다. 머리의 꽃은 포포의 컨디션을 정직하게 보여주는 안테나예요."
      },
      {
        title: "지구 정착기",
        body: "푸른 지구를 고향으로 착각해 내려왔다가 유튜브와 배달 음식을 만나 지구 문명에 완전히 매료됐습니다."
      },
      {
        title: "목걸이의 H",
        body: "Health나 Human처럼 보이지만 포포는 고향을 잊지 않으려고 Home이라고 대충 해석해 소중히 걸고 다닙니다."
      }
    ],
    stateLines: {
      good: "포포의 꽃이 싱싱하게 피어 있어요. 지금은 먹고 쉬고 기지개 켜기 좋은 상태예요.",
      mid: "포포 눈꺼풀이 살짝 내려왔어요. 꽃도 조금 힘이 빠지기 시작했어요.",
      bad: "포포의 꽃이 시들고 있어요. 회색 빌딩 생활에 지친 포포를 스트레칭으로 살려주세요.",
      discharged: "포포가 완전히 축 늘어졌어요. 유튜브도 배달 음식도 잠깐 멈추고 바로 살려줘야 해요."
    },
    badge: "FM-01",
    assetUrls: {
      good: `${LOCAL_FITMON_ASSET_BASE}/good.png`,
      mid: `${LOCAL_FITMON_ASSET_BASE}/mid.png`,
      bad: `${LOCAL_FITMON_ASSET_BASE}/bad.png`,
      discharged: `${LOCAL_FITMON_ASSET_BASE}/discharged.png`
    },
    defaultOwned: true
  }
];

const ACTIVITY_SESSION_IDLE_MS = 30000;

chrome.runtime.onInstalled.addListener(async () => {
  await ensureState();
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureState();
});

if (chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener(async (notificationId) => {
    if (!notificationId.startsWith("fitmon-stretch-")) {
      return;
    }
    await chrome.notifications.clear(notificationId);
    await chrome.tabs.create({ url: chrome.runtime.getURL(PANEL_PATH) });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  (async () => {
    try {
      let response;
      switch (message.type) {
        case "fitmon/get-state":
          response = { ok: true, state: await getUiState() };
          break;
        case "fitmon/open-side-panel":
          response = await openSidePanelForSender(sender);
          break;
        case "fitmon/open-routine":
          response = await openRoutineOnActiveTab(message.routineId, message.entryMode || "panel");
          break;
        case "fitmon/start-session":
          await logEvent("session_started", {
            routineId: message.routineId,
            entryMode: message.entryMode || "banner"
          });
          response = { ok: true, state: await getUiState() };
          break;
        case "fitmon/abandon-session":
          await logEvent("session_abandoned", {
            routineId: message.routineId,
            entryMode: message.entryMode || "overlay"
          });
          response = { ok: true, state: await getUiState() };
          break;
        case "fitmon/complete-session":
          response = { ok: true, state: await completeSession(message.routineId, message.entryMode || "overlay") };
          break;
        case "fitmon/snooze":
          response = { ok: true, state: await snoozeBanner(message.minutes || 10) };
          break;
        case "fitmon/activity-ping":
          response = { ok: true, state: await recordBrowserActivity(message.payload || {}) };
          break;
        case "fitmon/toggle-favorite":
          response = { ok: true, state: await toggleFavorite(message.routineId) };
          break;
        case "fitmon/login-provider":
          response = { ok: true, state: await loginWithOAuthProvider(message.provider || "naver") };
          break;
        case "fitmon/advance-onboarding-intro":
          response = { ok: true, state: await advanceOnboardingIntro() };
          break;
        case "fitmon/save-checklist":
          response = { ok: true, state: await saveChecklist(message.payload || {}) };
          break;
        case "fitmon/complete-onboarding-notifications":
          response = { ok: true, state: await completeOnboardingNotifications(message.payload || {}) };
          break;
        case "fitmon/save-settings":
          response = { ok: true, state: await saveSettings(message.payload || {}) };
          break;
        case "fitmon/submit-feedback":
          response = { ok: true, state: await submitFeedback(message.payload || {}) };
          break;
        case "fitmon/request-withdrawal":
          response = { ok: true, state: await requestWithdrawal(message.payload || {}) };
          break;
        case "fitmon/purchase-or-equip":
          response = { ok: true, state: await purchaseOrEquipItem(message.itemId) };
          break;
        case "fitmon/reset-user-data":
          response = { ok: true, state: await resetUserDataState() };
          break;
        default:
          response = { ok: false, error: "UNKNOWN_MESSAGE" };
      }
      sendResponse(response);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  })();

  return true;
});

async function ensureState() {
  const state = await readState();
  if (state) {
    return state;
  }
  const initialState = buildDefaultState();
  await writeState(initialState);
  return initialState;
}

async function readState() {
  const result = await chrome.storage.local.get([STORAGE_KEY, PREVIOUS_STORAGE_KEY]);
  const storedState = result[STORAGE_KEY]
    ? normalizeAppState(result[STORAGE_KEY])
    : result[PREVIOUS_STORAGE_KEY]
      ? normalizeAppState(result[PREVIOUS_STORAGE_KEY])
      : null;
  if (!result[STORAGE_KEY] && result[PREVIOUS_STORAGE_KEY]) {
    await chrome.storage.local.set({ [STORAGE_KEY]: storedState });
    await chrome.storage.local.remove(PREVIOUS_STORAGE_KEY);
  }
  const backendState = await readBackendState();
  if (backendState) {
    const normalizedState = normalizeAppState(backendState);
    if (!areStatesEqual(storedState, normalizedState)) {
      await chrome.storage.local.set({ [STORAGE_KEY]: normalizedState });
    }
    if (!areStatesEqual(normalizedState, backendState)) {
      await writeBackendState(normalizedState);
    }
    return normalizedState;
  }

  const localState = storedState;
  if (localState) {
    await writeBackendState(localState);
  }
  return localState;
}

async function writeState(state) {
  const result = await chrome.storage.local.get([STORAGE_KEY, PREVIOUS_STORAGE_KEY]);
  const storedState = result[STORAGE_KEY] ? normalizeAppState(result[STORAGE_KEY]) : null;
  if (!areStatesEqual(storedState, state)) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  }
  if (result[PREVIOUS_STORAGE_KEY]) {
    await chrome.storage.local.remove(PREVIOUS_STORAGE_KEY);
  }
  await writeBackendState(state);
}

function areStatesEqual(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

async function readBackendState() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const localState = result[STORAGE_KEY] ? normalizeAppState(result[STORAGE_KEY]) : null;
    const userId = resolveBackendUserId(localState);
    const userToken = resolveBackendUserToken(localState);
    if (!userId || !userToken) {
      return null;
    }
    const response = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/state?userId=${encodeURIComponent(userId)}`, {
      headers: {
        "X-FitMon-User-Id": userId,
        "X-FitMon-User-Token": userToken
      }
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (data && data.ok && data.state) {
      return mergeStateWithBackendPurchases(data.state, data.purchases);
    }
    if (data && data.ok && userId) {
      return mergeStateWithBackendPurchases(buildDefaultState(), data.purchases);
    }
    return null;
  } catch (error) {
    console.debug("FitMon backend read skipped", error);
    return null;
  }
}

async function readBackendStateForUser(userId, userToken) {
  if (!userId || !userToken) {
    return null;
  }
  try {
    const response = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/state?userId=${encodeURIComponent(userId)}`, {
      headers: {
        "X-FitMon-User-Id": userId,
        "X-FitMon-User-Token": userToken
      },
      timeoutMs: 8000
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (data && data.ok && data.state) {
      return mergeStateWithBackendPurchases(data.state, data.purchases);
    }
    if (data && data.ok) {
      return mergeStateWithBackendPurchases(buildDefaultState(), data.purchases);
    }
  } catch (error) {
    console.debug("FitMon backend user state read skipped", error);
  }
  return null;
}

function mergeStateWithBackendPurchases(state, purchases) {
  const normalizedState = normalizeAppState(state || buildDefaultState());
  if (!Array.isArray(purchases) || !purchases.length) {
    return normalizedState;
  }
  const purchasedIds = purchases
    .map((purchase) => purchase && (purchase.fitmon_id || purchase.fitmonId))
    .filter(Boolean);
  if (!purchasedIds.length) {
    return normalizedState;
  }
  normalizedState.character = normalizeCharacterState(normalizedState.character);
  normalizedState.character.ownedItemIds = Array.from(
    new Set([...normalizedState.character.ownedItemIds, ...purchasedIds])
  );
  if (!normalizedState.character.ownedItemIds.includes(normalizedState.character.equippedItemId)) {
    normalizedState.character.equippedItemId = normalizedState.character.ownedItemIds[0];
  }
  return normalizedState;
}

async function writeBackendState(state) {
  try {
    const userId = resolveBackendUserId(state);
    const userToken = resolveBackendUserToken(state);
    if (!userId || !userToken) {
      return;
    }
    const response = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/state`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-FitMon-User-Id": userId,
        "X-FitMon-User-Token": userToken
      },
      body: JSON.stringify({ state, userId, userToken })
    });
    if (!response.ok) {
      console.debug("FitMon backend write failed", response.status);
    }
  } catch (error) {
    console.debug("FitMon backend write skipped", error);
  }
}

async function recordBackendFitmonPurchase(state, item) {
  const userId = resolveBackendUserId(state);
  const userToken = resolveBackendUserToken(state);
  if (!userId) {
    throw new Error("로그인해야 핏몬을 잠금해제할 수 있습니다.");
  }
  if (!userToken) {
    throw new Error("로그인 인증 정보가 없어 다시 로그인해 주세요.");
  }
  const response = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/fitmons/purchase`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FitMon-User-Id": userId,
      "X-FitMon-User-Token": userToken
    },
    body: JSON.stringify({
      userId,
      userToken,
      fitmonId: item.id,
      cost: item.cost
    }),
    timeoutMs: 5000
  });
  if (!response.ok) {
    throw new Error("핏몬 잠금해제 기록을 서버에 저장하지 못했습니다.");
  }
  const data = await response.json();
  if (!data || !data.ok) {
    throw new Error(data && data.error ? data.error : "핏몬 잠금해제 기록을 서버에 저장하지 못했습니다.");
  }
  return data;
}

async function recordBackendSupportRequest(state, type, payload) {
  const userId = resolveBackendUserId(state);
  const userToken = resolveBackendUserToken(state);
  if (!userId || !userToken) {
    throw new Error("로그인해야 요청을 보낼 수 있습니다.");
  }
  const response = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/${type}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FitMon-User-Id": userId,
      "X-FitMon-User-Token": userToken
    },
    body: JSON.stringify({
      ...payload,
      userId,
      userToken
    }),
    timeoutMs: 5000
  });
  if (!response.ok) {
    throw new Error("요청을 서버에 저장하지 못했습니다.");
  }
  const data = await response.json();
  if (!data || !data.ok) {
    throw new Error(data && data.error ? data.error : "요청을 서버에 저장하지 못했습니다.");
  }
  return data.request || null;
}

async function deleteBackendUserState(state) {
  const userId = resolveBackendUserId(state);
  const userToken = resolveBackendUserToken(state);
  if (!userId || !userToken) {
    return;
  }
  try {
    const response = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/state?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: {
        "X-FitMon-User-Id": userId,
        "X-FitMon-User-Token": userToken
      },
      timeoutMs: 5000
    });
    if (!response.ok) {
      console.debug("FitMon backend reset failed", response.status);
    }
  } catch (error) {
    console.debug("FitMon backend reset skipped", error);
  }
}

function resolveBackendUserId(state) {
  return state && state.user ? state.user.id || state.user.userId || null : null;
}

function resolveBackendUserToken(state) {
  return state && state.user ? state.user.apiToken || null : null;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 1200;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveFitmonCatalog() {
  if (fitmonCatalogCache && Date.now() - fitmonCatalogFetchedAt < FITMON_CATALOG_CACHE_MS) {
    return fitmonCatalogCache;
  }
  try {
    const response = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/fitmons`, { timeoutMs: 3000 });
    if (!response.ok) {
      return STORE_ITEMS;
    }
    const data = await response.json();
    if (!data || !data.ok || !Array.isArray(data.fitmons) || !data.fitmons.length) {
      return STORE_ITEMS;
    }
    const remoteItems = data.fitmons
      .filter((item) => item && item.id && item.assetUrls)
      .map((item, index) => ({
        id: item.id,
        slug: item.slug || item.id.replace(/^fitmon-/, ""),
        name: item.name || `핏몬 ${index + 1}`,
        category: item.category || "핏몬",
        cost: Number.isFinite(Number(item.cost)) ? Number(item.cost) : 200,
        description: item.description || "서버에서 내려받는 핏몬입니다.",
        personality: item.personality || "아직 성격 설명이 등록되지 않은 핏몬이에요.",
        favoriteRoutine: item.favoriteRoutine || "짧은 회복 스트레칭",
        catchphrase: item.catchphrase || "함께 쉬어가요.",
        lore: normalizeFitmonLore(item.lore),
        stateLines: normalizeFitmonStateLines(item.stateLines),
        badge: `FM-${String(index + 1).padStart(2, "0")}`,
        assetUrls: item.assetUrls,
        defaultOwned: Boolean(item.defaultOwned)
      }));
    fitmonCatalogCache = remoteItems.length ? remoteItems : STORE_ITEMS;
    fitmonCatalogFetchedAt = Date.now();
    return fitmonCatalogCache;
  } catch (error) {
    console.debug("FitMon catalog fetch skipped", error);
    fitmonCatalogCache = fitmonCatalogCache || STORE_ITEMS;
    fitmonCatalogFetchedAt = Date.now();
    return STORE_ITEMS;
  }
}

async function withState(mutator) {
  const runMutation = async () => {
    const current = (await ensureState()) || buildDefaultState();
    const next = await mutator(structuredClone(current));
    await writeState(next);
    return getUiState(next);
  };
  const result = stateMutationQueue.then(runMutation, runMutation);
  stateMutationQueue = result.catch(() => {});
  return result;
}

function buildDefaultState() {
  const now = new Date();

  return {
    user: {
      isLoggedIn: false,
      name: "방문자",
      provider: null,
      onboardingCompleted: false,
      onboardingStep: "intro"
    },
    checklist: {
      sittingHours: "6-8",
      discomfortAreas: [],
      exerciseFrequency: "rarely"
    },
    preferences: {
      notificationsEnabled: true,
      frequencyMinutes: 45,
      focusAreas: [],
      soundMode: "silent",
      snoozeUntil: null
    },
    favorites: [],
    sessions: [],
    character: {
      points: 0,
      xp: 0,
      ownedItemIds: ["fitmon-basic"],
      equippedItemId: "fitmon-basic"
    },
    support: buildDefaultSupportState(),
    eventLog: [
      {
        id: crypto.randomUUID(),
        type: "app_opened",
        createdAt: now.toISOString(),
        meta: { source: "first_launch" }
      }
    ],
    activity: buildDefaultActivityState()
  };
}

function normalizeAppState(state) {
  if (!state || typeof state !== "object") {
    return buildDefaultState();
  }

  const defaults = buildDefaultState();
  return {
    ...defaults,
    ...state,
    user: normalizeUserState(state.user),
    checklist: normalizeChecklist(state.checklist),
    preferences: normalizePreferences(state.preferences),
    favorites: Array.isArray(state.favorites) ? state.favorites : defaults.favorites,
    sessions: Array.isArray(state.sessions) ? state.sessions : defaults.sessions,
    character: normalizeCharacterState(state.character),
    support: normalizeSupportState(state.support),
    eventLog: normalizeEventLog(state.eventLog, defaults.eventLog),
    activity: normalizeActivityState(state.activity)
  };
}

function normalizeEventLog(eventLog, fallback) {
  const source = Array.isArray(eventLog) ? eventLog : fallback;
  return source.map((event) => {
    if (!event || typeof event !== "object") {
      return event;
    }
    return {
      ...event,
      type: event.type === `surface_${"shown"}` ? "app_opened" : event.type
    };
  });
}

function buildDefaultSupportState() {
  return {
    lastFeedback: null,
    feedbackRequests: [],
    lastWithdrawalRequest: null,
    withdrawalRequests: []
  };
}

function buildDefaultActivityState() {
  return {
    currentSessionStartedAt: null,
    lastActiveAt: null,
    isSessionActive: false,
    promptShownAt: null,
    promptReminderCount: 0
  };
}

function buildSession(routineId, date, entryMode) {
  const routine = getRoutineById(routineId);
  return {
    id: crypto.randomUUID(),
    routineId,
    completedAt: date.toISOString(),
    durationSec: routine.durationSec,
    bodyPart: routine.bodyPart,
    entryMode
  };
}

async function getUiState(preloadedState) {
  const rawState = preloadedState || (await ensureState());
  const fitmonItems = await resolveFitmonCatalog();
  return deriveUiState(rawState, fitmonItems);
}

function deriveUiState(state, fitmonItems = STORE_ITEMS) {
  state = normalizeAppState(state);
  const now = new Date();
  const checklist = normalizeChecklist(state.checklist);
  const preferences = normalizePreferences(state.preferences);
  const characterState = normalizeCharacterState(state.character);
  const userState = normalizeUserState(state.user);
  const supportState = normalizeSupportState(state.support);
  const sessions = [...state.sessions].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const todayKey = dateKey(now);
  const todaySessions = sessions.filter((session) => dateKey(new Date(session.completedAt)) === todayKey);
  const lastSession = sessions[0] || null;
  const minutesSinceLastSession = lastSession
    ? Math.max(0, Math.floor((now.getTime() - new Date(lastSession.completedAt).getTime()) / 60000))
    : null;
  const streakDays = computeStreakDays(sessions);
  const weekSummary = computeWindowSummary(sessions, 7);
  const monthSummary = computeMonthSummary(sessions, now);
  const totalCompleted = sessions.length;
  const activity = deriveActivitySummary(state, now);
  const condition = deriveConditionStage(activity, todaySessions.length);
  const level = 1 + Math.floor(characterState.xp / 120);
  const progressToNextLevel = characterState.xp % 120;
  const growthStage = deriveGrowthStage(totalCompleted);
  const recommendations = rankRoutines(state, false).slice(0, 3);
  const quickRoutine = rankRoutines(state, true)[0] || decorateRoutine(ROUTINES[0], state, 0, "quick");
  const recentRoutines = uniqueBy(
    sessions.map((session) => decorateRoutine(getRoutineById(session.routineId), state, 0, "recent")),
    (routine) => routine.id
  ).slice(0, 3);
  const favorites = ROUTINES.filter((routine) => state.favorites.includes(routine.id)).map((routine) =>
    decorateRoutine(routine, state, 0, "favorite")
  );
  const routines = ROUTINES.map((routine) => decorateRoutine(routine, state, 0, "library"));
  const visualState = resolveFitmonVisualState(condition, activity);
  const storeItems = fitmonItems.map((item) => {
    const stateLines = normalizeFitmonStateLines(item.stateLines);
    return {
      ...item,
      stateLines,
      statusLine: resolveFitmonLine({ ...item, stateLines }, visualState),
      owned: characterState.ownedItemIds.includes(item.id) || item.defaultOwned,
      equipped: characterState.equippedItemId === item.id,
      affordable: characterState.points >= item.cost
    };
  });
  const currentFitmon = storeItems.find((item) => item.equipped) || storeItems[0];
  const bodyPartCounts = BODY_PARTS.map((part) => ({
    ...part,
    count: sessions.filter((session) => session.bodyPart === part.id).length,
    focused:
      checklist.discomfortAreas.includes(part.id) ||
      preferences.focusAreas.includes(part.id)
  }));
  const weeklyTrend = buildWeeklyTrend(sessions, now);
  const topBodyPart = bodyPartCounts.slice().sort((a, b) => b.count - a.count)[0];
  const weekAverage = (weekSummary.count / 7).toFixed(1);
  const monthAverage = (monthSummary.count / Math.max(1, now.getDate())).toFixed(1);
  const bodyBreakdown = bodyPartCounts
    .filter((part) => part.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
  const monthCalendar = buildMonthlyCalendar(sessions, now);
  const catalog = {
    totalItems: storeItems.length,
    ownedItems: storeItems.filter((item) => item.owned).length,
    stageCount: 4,
    unlockedStages: growthStage.index + 1
  };

  return {
    user: {
      ...userState,
      providerLabel: PROVIDER_LABELS[userState.provider] || "로그인 필요"
    },
    onboarding: {
      currentStep: userState.onboardingStep,
      completed: userState.onboardingCompleted,
      canAccessMain: userState.onboardingCompleted,
      stepIndex: ONBOARDING_STEPS.indexOf(userState.onboardingStep)
    },
    checklist,
    preferences,
    bodyParts: bodyPartCounts,
    status: {
      mood: condition.id,
      statusLabel: condition.label,
      statusHint: condition.hint,
      todayCompletedCount: todaySessions.length,
      streakDays,
      minutesSinceLastSession,
      lastCompletedAt: lastSession ? lastSession.completedAt : null,
      todayPrompt: buildTodayPrompt(todaySessions.length, activity, condition)
    },
    activity,
    home: {
      level,
      xp: characterState.xp,
      progressToNextLevel,
      growthStage: growthStage.label,
      points: characterState.points
    },
    quickRoutine,
    recommendations,
    routines,
    recentRoutines,
    favorites,
    records: {
      todayCount: todaySessions.length,
      weekCount: weekSummary.count,
      weekMinutes: Math.round(weekSummary.durationSec / 60),
      monthCount: monthSummary.count,
      weekAverage,
      monthAverage,
      totalCompleted,
      streakDays,
      topBodyPart: topBodyPart && topBodyPart.count > 0 ? topBodyPart.label : "없음",
      weeklyTrend,
      bodyBreakdown,
      monthCalendar
    },
    character: {
      level,
      stage: growthStage.label,
      points: characterState.points,
      xp: characterState.xp,
      progressToNextLevel,
      equippedItemId: characterState.equippedItemId,
      currentFitmon
    },
    storeItems,
    catalog,
    support: supportState,
    eventLog: state.eventLog.slice(0, 12),
    recentSessions: sessions.slice(0, 6).map((session) => ({
      ...session,
      routineTitle: getRoutineById(session.routineId).title
    }))
  };
}

function deriveActivitySummary(state, now) {
  const tracker = normalizeActivityState(state.activity);
  const preferences = normalizePreferences(state.preferences);
  const thresholdMinutes = resolvePromptThresholdMinutes(preferences.frequencyMinutes);
  const thresholdMs = thresholdMinutes * 60000;
  const nowMs = now.getTime();
  const snoozeUntilMs = preferences.snoozeUntil ? new Date(preferences.snoozeUntil).getTime() : null;
  const snoozed = Number.isFinite(snoozeUntilMs) && snoozeUntilMs > nowMs;
  const lastActiveAtMs = tracker.lastActiveAt ? new Date(tracker.lastActiveAt).getTime() : null;
  const sessionStartedAtMs = tracker.currentSessionStartedAt ? new Date(tracker.currentSessionStartedAt).getTime() : null;
  const isSessionActive = Boolean(
    tracker.isSessionActive &&
    lastActiveAtMs !== null &&
    nowMs - lastActiveAtMs < ACTIVITY_SESSION_IDLE_MS
  );
  const anchorMs = isSessionActive ? nowMs : lastActiveAtMs;
  const activeDurationMs =
    sessionStartedAtMs !== null && anchorMs !== null && anchorMs >= sessionStartedAtMs
      ? anchorMs - sessionStartedAtMs
      : 0;
  const rawPromptDue = activeDurationMs >= thresholdMs && sessionStartedAtMs !== null;
  const promptDue = isSessionActive && rawPromptDue && !snoozed;
  const remainingUntilPromptMs = snoozed
    ? Math.max(0, snoozeUntilMs - nowMs)
    : promptDue
      ? 0
      : Math.max(0, thresholdMs - activeDurationMs);

  return {
    currentSessionStartedAt: tracker.currentSessionStartedAt,
    lastActiveAt: tracker.lastActiveAt,
    isSessionActive,
    promptShownAt: tracker.promptShownAt,
    promptReminderCount: Math.max(0, Number(tracker.promptReminderCount) || 0),
    activeDurationMs,
    activeMinutes: Math.floor(activeDurationMs / 60000),
    promptThresholdMinutes: thresholdMinutes,
    activeRatio: thresholdMs > 0 ? activeDurationMs / thresholdMs : 0,
    rawPromptDue,
    snoozed,
    snoozeUntil: preferences.snoozeUntil,
    remainingUntilPromptMs,
    promptDue
  };
}

function buildTodayPrompt(todayCompletedCount, activity, condition) {
  if (activity.promptDue) {
    return `브라우저 활동이 ${activity.activeMinutes}분 이어져서 핏몬이 ${condition.label} 상태예요. 지금 스트레칭이 필요해요.`;
  }
  if (activity.isSessionActive) {
    const remainingMinutes = Math.max(1, Math.ceil(activity.remainingUntilPromptMs / 60000));
    return `연속 브라우저 활동 ${activity.activeMinutes}분째예요. 현재 상태는 ${condition.label}이고 ${remainingMinutes}분 뒤 알림이 떠요.`;
  }
  return todayCompletedCount === 0
    ? "아직 스트레칭하지 않았어요. 첫 스트레칭을 시작해보세요!"
    : "휴식 후 다시 시작하면 건강 상태를 더 오래 유지할 수 있어요.";
}

function resolveFitmonVisualState(condition, activity) {
  return ["good", "mid", "bad", "discharged"].includes(condition.id) ? condition.id : "good";
}

function normalizeFitmonStateLines(stateLines) {
  return {
    good: "컨디션이 좋아 보여요. 지금 흐름을 유지해봐요.",
    mid: "조금씩 피로가 쌓이고 있어요. 가볍게 풀어주면 좋아요.",
    bad: "핏몬이 지쳐 보여요. 스트레칭으로 회복시켜 주세요.",
    discharged: "핏몬이 완전히 방전됐어요. 지금 바로 살려주세요.",
    ...(stateLines && typeof stateLines === "object" ? stateLines : {})
  };
}

function normalizeFitmonLore(lore) {
  if (!Array.isArray(lore)) {
    return [];
  }
  return lore
    .map((section) => ({
      title: String(section && section.title ? section.title : "").trim(),
      body: String(section && section.body ? section.body : "").trim()
    }))
    .filter((section) => section.title && section.body);
}

function resolveFitmonLine(fitmon, visualState) {
  const stateLines = normalizeFitmonStateLines(fitmon && fitmon.stateLines);
  return stateLines[visualState] || stateLines.good;
}

function rankRoutines(state, quickMode) {
  const lastRoutineId = state.sessions[0] ? state.sessions[0].routineId : null;
  return ROUTINES.filter((routine) => !quickMode || routine.quickEligible)
    .map((routine) => {
      let score = 0;
      const reasons = [];
      const checklist = normalizeChecklist(state.checklist);
      if (checklist.discomfortAreas.includes(routine.bodyPart)) {
        score += 34;
        reasons.push("불편 부위 우선");
      }
      if (state.preferences.focusAreas.includes(routine.bodyPart)) {
        score += 24;
        reasons.push("알림 영역 일치");
      }
      if (state.favorites.includes(routine.id)) {
        score += 8;
        reasons.push("즐겨찾기 반영");
      }
      if (["8-10", "10+"].includes(checklist.sittingHours) && ["neck", "shoulders", "back", "waist", "wrist", "eyes"].includes(routine.bodyPart)) {
        score += 10;
        reasons.push("좌식 시간 맞춤");
      }
      if (checklist.exerciseFrequency === "rarely" && routine.durationSec <= 25) {
        score += 8;
        reasons.push("낮은 이동 빈도 고려");
      }
      if (quickMode && routine.durationSec <= 30) {
        score += 20;
        reasons.push("빠른 시작");
      }
      if (routine.id === lastRoutineId) {
        score -= 12;
      }
      return decorateRoutine(routine, state, score, reasons[0] || "짧은 회복 루틴");
    })
    .sort((left, right) => right.score - left.score || left.durationSec - right.durationSec);
}

function decorateRoutine(routine, state, score, recommendationReason) {
  const bodyPart = BODY_PARTS.find((part) => part.id === routine.bodyPart);
  return {
    ...routine,
    score,
    favorite: state.favorites.includes(routine.id),
    bodyPartLabel: bodyPart ? bodyPart.label : routine.bodyPart,
    recommendationReason
  };
}

function deriveConditionStage(activity, todayCompletedCount) {
  const isFatigueDeferred = Boolean(activity.snoozed && activity.rawPromptDue);
  if (!activity.isSessionActive && !isFatigueDeferred) {
    return todayCompletedCount > 0
      ? { id: "good", label: "좋음", hint: "핏몬이 좋은 상태를 유지 중이에요." }
      : { id: "good", label: "좋음", hint: "핏몬이 좋은 상태로 시작했어요." };
  }

  const ratio = Number.isFinite(activity.activeRatio)
    ? activity.activeRatio
    : activity.promptThresholdMinutes > 0
      ? activity.activeMinutes / activity.promptThresholdMinutes
      : 0;
  const reminderCount = Math.max(0, Number(activity.promptReminderCount) || 0);
  const effectiveRatio = Math.max(ratio, reminderCount >= 1 ? 1 : 0);

  if (reminderCount >= 2) {
    return { id: "discharged", label: "방전", hint: "포포가 완전히 방전됐어요. 다시 알림이 울렸으니 바로 쉬어가며 회복해 주세요." };
  }
  if (effectiveRatio < 0.5) {
    return { id: "good", label: "좋음", hint: "포포 상태가 좋아요. 미리 챙겨주면 좋은 상태를 더 오래 유지할 수 있어요." };
  }
  if (effectiveRatio < 1) {
    return { id: "mid", label: "보통", hint: "포포 상태가 보통이에요. 가볍게 움직이면 피로가 쌓이기 전에 회복할 수 있어요." };
  }
  return { id: "bad", label: "피곤", hint: "포포가 피곤해졌어요. 지금 짧은 스트레칭을 시작하는 게 좋아요." };
}
function deriveGrowthStage(totalCompleted) {
  if (totalCompleted >= 12) {
    return { label: "Guardian", index: 3 };
  }
  if (totalCompleted >= 6) {
    return { label: "Bright", index: 2 };
  }
  if (totalCompleted >= 3) {
    return { label: "Steady", index: 1 };
  }
  return { label: "Sprout", index: 0 };
}

function computeStreakDays(sessions) {
  if (!sessions.length) {
    return 0;
  }
  const keys = uniqueBy(
    sessions.map((session) => dateKey(new Date(session.completedAt))),
    (entry) => entry
  );
  let streak = 1;
  let cursor = new Date(`${keys[0]}T00:00:00`);
  for (let index = 1; index < keys.length; index += 1) {
    const previous = new Date(`${keys[index]}T00:00:00`);
    const diff = Math.round((cursor.getTime() - previous.getTime()) / 86400000);
    if (diff === 1) {
      streak += 1;
      cursor = previous;
      continue;
    }
    break;
  }
  return streak;
}

function computeWindowSummary(sessions, days) {
  const start = shiftDate(new Date(), -(days - 1));
  const startKey = dateKey(start);
  const filtered = sessions.filter((session) => dateKey(new Date(session.completedAt)) >= startKey);
  return {
    count: filtered.length,
    durationSec: filtered.reduce((sum, session) => sum + session.durationSec, 0)
  };
}

function computeMonthSummary(sessions, now) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const filtered = sessions.filter((session) => {
    const date = new Date(session.completedAt);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  return {
    count: filtered.length,
    durationSec: filtered.reduce((sum, session) => sum + session.durationSec, 0)
  };
}

function buildWeeklyTrend(sessions, now) {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = shiftDate(now, -(6 - offset));
    const key = dateKey(date);
    const count = sessions.filter((session) => dateKey(new Date(session.completedAt)) === key).length;
    return {
      dayLabel: `${date.getMonth() + 1}/${date.getDate()}`,
      count
    };
  });
}

function buildMonthlyCalendar(sessions, now) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDate = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmpty = firstDate.getDay();
  const byDate = new Map();

  sessions.forEach((session) => {
    const sessionDate = new Date(session.completedAt);
    if (sessionDate.getFullYear() !== year || sessionDate.getMonth() !== month) {
      return;
    }
    const key = dateKey(sessionDate);
    const entry = byDate.get(key) || { count: 0, bodyParts: new Map() };
    entry.count += 1;
    entry.bodyParts.set(session.bodyPart, (entry.bodyParts.get(session.bodyPart) || 0) + 1);
    byDate.set(key, entry);
  });

  const cells = Array.from({ length: leadingEmpty }, () => ({
    kind: "empty",
    label: ""
  }));

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const key = dateKey(date);
    const summary = byDate.get(key);
    const dominantBodyPart = summary ? [...summary.bodyParts.entries()].sort((left, right) => right[1] - left[1])[0][0] : null;
    const dominantBodyPartMeta = dominantBodyPart ? BODY_PARTS.find((part) => part.id === dominantBodyPart) : null;
    cells.push({
      kind: "day",
      day,
      key,
      count: summary ? summary.count : 0,
      bodyPartLabel: dominantBodyPart ? (dominantBodyPartMeta ? dominantBodyPartMeta.label : dominantBodyPart) : null,
      isToday: key === dateKey(now)
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ kind: "empty", label: "" });
  }

  return {
    monthLabel: `${month + 1}월`,
    weekdayLabels: ["일", "월", "화", "수", "목", "금", "토"],
    cells
  };
}

function uniqueBy(list, getKey) {
  const seen = new Set();
  return list.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(baseDate, dayOffset) {
  const shifted = new Date(baseDate);
  shifted.setDate(shifted.getDate() + dayOffset);
  shifted.setHours(Math.max(shifted.getHours(), 9), 0, 0, 0);
  return shifted;
}

function normalizeChecklist(checklist) {
  return {
    sittingHours: "6-8",
    discomfortAreas: [],
    exerciseFrequency: "rarely",
    ...(checklist || {})
  };
}

function normalizeUserState(user) {
  const merged = {
    id: null,
    userId: null,
    isLoggedIn: false,
    name: "방문자",
    provider: null,
    providerUserId: null,
    email: null,
    apiToken: null,
    onboardingCompleted: false,
    onboardingStep: "intro",
    ...(user || {})
  };

  const resolvedUserId = merged.id || merged.userId || null;
  merged.id = resolvedUserId;
  merged.userId = resolvedUserId;

  if (merged.onboardingCompleted) {
    merged.onboardingStep = "done";
  } else if (!ONBOARDING_STEPS.includes(merged.onboardingStep) || merged.onboardingStep === "done") {
    merged.onboardingStep = "intro";
  }

  return merged;
}

function normalizePreferences(preferences) {
  return {
    notificationsEnabled: true,
    frequencyMinutes: 45,
    focusAreas: [],
    soundMode: "silent",
    snoozeUntil: null,
    ...(preferences || {})
  };
}

function normalizeCharacterState(character) {
  const defaultOwnedIds = STORE_ITEMS.filter((item) => item.defaultOwned).map((item) => item.id);
  const defaults = {
    points: 0,
    xp: 0,
    ownedItemIds: defaultOwnedIds.length ? defaultOwnedIds : [STORE_ITEMS[0].id],
    equippedItemId: STORE_ITEMS[0].id
  };
  const merged = {
    ...defaults,
    ...(character || {})
  };
  const mergedOwnedIds = Array.isArray(merged.ownedItemIds) ? merged.ownedItemIds : [];
  const ownedItemIds = Array.from(new Set([...defaults.ownedItemIds, ...mergedOwnedIds].filter(Boolean)));
  const equippedItemId = ownedItemIds.includes(merged.equippedItemId) ? merged.equippedItemId : ownedItemIds[0];
  return {
    ...merged,
    ownedItemIds,
    equippedItemId
  };
}

function normalizeActivityState(activity) {
  return {
    ...buildDefaultActivityState(),
    ...(activity || {})
  };
}

function normalizeSupportState(support) {
  const defaults = buildDefaultSupportState();
  const feedbackRequests = Array.isArray(support && support.feedbackRequests)
    ? support.feedbackRequests
    : support && support.lastFeedback
      ? [support.lastFeedback]
      : defaults.feedbackRequests;
  const withdrawalRequests = Array.isArray(support && support.withdrawalRequests)
    ? support.withdrawalRequests
    : support && support.lastWithdrawalRequest
      ? [support.lastWithdrawalRequest]
      : defaults.withdrawalRequests;
  return {
    ...defaults,
    ...(support || {}),
    feedbackRequests: feedbackRequests.slice(0, 20),
    withdrawalRequests: withdrawalRequests.slice(0, 20)
  };
}

function resolvePromptThresholdMinutes(frequencyMinutes) {
  const value = Number(frequencyMinutes);
  return Number.isFinite(value) && value > 0 ? value : 45;
}

function normalizeFrequencyMinutes(frequencyMinutes, fallback = 45) {
  const value = Number(frequencyMinutes);
  if (!Number.isFinite(value) || value <= 0) {
    return resolvePromptThresholdMinutes(fallback);
  }
  return Math.max(1, Math.min(240, Math.round(value)));
}

function getRoutineById(routineId) {
  return ROUTINES.find((routine) => routine.id === routineId) || ROUTINES[0];
}

async function logEvent(type, meta) {
  await withState((state) => {
    state.eventLog.unshift({
      id: crypto.randomUUID(),
      type,
      createdAt: new Date().toISOString(),
      meta
    });
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

async function completeSession(routineId, entryMode) {
  return withState((state) => {
    state.character = normalizeCharacterState(state.character);
    const routine = getRoutineById(routineId);
    state.sessions.unshift({
      id: crypto.randomUUID(),
      routineId: routine.id,
      completedAt: new Date().toISOString(),
      durationSec: routine.durationSec,
      bodyPart: routine.bodyPart,
      entryMode
    });
    state.character.points += 15;
    state.character.xp += 25;
    state.activity = resetActivitySession(state.activity, new Date());
    state.eventLog.unshift({
      id: crypto.randomUUID(),
      type: "session_completed",
      createdAt: new Date().toISOString(),
      meta: {
        routineId: routine.id,
        entryMode,
        pointsGranted: 15,
        xpGranted: 25
      }
    });
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

function resetActivitySession(activity, now) {
  const tracker = normalizeActivityState(activity);
  tracker.currentSessionStartedAt = now.toISOString();
  tracker.lastActiveAt = now.toISOString();
  tracker.isSessionActive = true;
  tracker.promptShownAt = null;
  tracker.promptReminderCount = 0;
  return tracker;
}

async function snoozeBanner(minutes) {
  return withState((state) => {
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    state.preferences.snoozeUntil = until;
    state.activity = normalizeActivityState(state.activity);
    state.activity.promptShownAt = null;
    state.eventLog.unshift({
      id: crypto.randomUUID(),
      type: "surface_snoozed",
      createdAt: new Date().toISOString(),
      meta: { minutes }
    });
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

async function recordBrowserActivity(payload) {
  return withState(async (state) => {
    const tracker = normalizeActivityState(state.activity);
    const now = new Date();
    const nowMs = now.getTime();
    const lastActiveAtMs = tracker.lastActiveAt ? new Date(tracker.lastActiveAt).getTime() : null;
    const shouldTrackAsActive = payload.isActive !== false && payload.visible !== false;
    const startedNewSession =
      shouldTrackAsActive &&
      (!tracker.currentSessionStartedAt || lastActiveAtMs === null || nowMs - lastActiveAtMs >= ACTIVITY_SESSION_IDLE_MS);

    if (startedNewSession) {
      tracker.currentSessionStartedAt = now.toISOString();
      tracker.promptShownAt = null;
      tracker.promptReminderCount = 0;
    }

    if (shouldTrackAsActive) {
      tracker.lastActiveAt = now.toISOString();
      tracker.isSessionActive = true;

      const sessionStartedAtMs = tracker.currentSessionStartedAt ? new Date(tracker.currentSessionStartedAt).getTime() : nowMs;
      const activeDurationMs = Math.max(0, nowMs - sessionStartedAtMs);
      const thresholdMs = resolvePromptThresholdMinutes(state.preferences.frequencyMinutes) * 60000;

      const snoozeUntilMs = state.preferences.snoozeUntil ? new Date(state.preferences.snoozeUntil).getTime() : null;
      const snoozed = Number.isFinite(snoozeUntilMs) && snoozeUntilMs > nowMs;
      if (activeDurationMs >= thresholdMs && !tracker.promptShownAt && !snoozed) {
        tracker.promptShownAt = now.toISOString();
        tracker.promptReminderCount = Math.min(10, Math.max(0, Number(tracker.promptReminderCount) || 0) + 1);
        const activeMinutes = Math.floor(activeDurationMs / 60000);
        const thresholdMinutes = resolvePromptThresholdMinutes(state.preferences.frequencyMinutes);
        if (Number.isFinite(snoozeUntilMs) && snoozeUntilMs <= nowMs) {
          state.preferences.snoozeUntil = null;
        }
        if (state.preferences.notificationsEnabled) {
          await showStretchNotification(activeMinutes, thresholdMinutes);
        }
        state.eventLog.unshift({
          id: crypto.randomUUID(),
          type: "activity_prompt_due",
          createdAt: now.toISOString(),
          meta: {
            activeMinutes,
            thresholdMinutes,
            reminderCount: tracker.promptReminderCount
          }
        });
        state.eventLog = state.eventLog.slice(0, 40);
      }
    } else {
      const inactiveReason = payload.reason || "inactive";
      const inactiveTimedOut =
        lastActiveAtMs === null || nowMs - lastActiveAtMs >= ACTIVITY_SESSION_IDLE_MS;
      if (inactiveReason === "idle-timeout" || inactiveTimedOut) {
        tracker.isSessionActive = false;
      }
    }

    state.activity = tracker;
    return state;
  });
}

async function showStretchNotification(activeMinutes, thresholdMinutes) {
  if (!chrome.notifications || !chrome.notifications.create) {
    return;
  }
  try {
    await chrome.notifications.create(`fitmon-stretch-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/notification-icon.png"),
      title: "핏몬 스트레칭 알림",
      message: `브라우저 활동이 ${activeMinutes}분 이어졌어요. ${thresholdMinutes}분 기준을 넘었으니 잠깐 쉬어갈 시간이에요.`,
      priority: 1
    });
  } catch (error) {
    console.debug("FitMon notification skipped", error);
  }
}

async function toggleFavorite(routineId) {
  return withState((state) => {
    if (state.favorites.includes(routineId)) {
      state.favorites = state.favorites.filter((entry) => entry !== routineId);
    } else {
      state.favorites.unshift(routineId);
    }
    state.eventLog.unshift({
      id: crypto.randomUUID(),
      type: "favorite_toggled",
      createdAt: new Date().toISOString(),
      meta: { routineId, active: state.favorites.includes(routineId) }
    });
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

async function loginWithOAuthProvider(provider) {
  const oauthResult = await startOAuthFlow(provider);
  const backendUser = await registerBackendUser(provider, oauthResult);
  if (!backendUser || !backendUser.id) {
    throw new Error("로그인 정보를 백엔드에 저장하지 못했습니다. 다시 시도해 주세요.");
  }
  return withState(async (state) => {
    state.user = normalizeUserState(state.user);
    if (!state.user.onboardingCompleted && state.user.onboardingStep === "intro") {
      throw new Error("먼저 핏몬 소개를 확인해 주세요.");
    }
    const restoredBackendState = await readBackendStateForUser(backendUser.id, backendUser.apiToken);
    if (restoredBackendState) {
      state = {
        ...restoredBackendState,
        user: {
          ...normalizeUserState(restoredBackendState.user),
          ...state.user
        }
      };
    }
    state.user = {
      ...state.user,
      id: backendUser ? backendUser.id : state.user.id,
      userId: backendUser ? backendUser.id : state.user.userId,
      isLoggedIn: true,
      provider,
      providerUserId: backendUser ? backendUser.providerUserId : state.user.providerUserId,
      email: backendUser ? backendUser.email : state.user.email,
      apiToken: backendUser ? backendUser.apiToken : state.user.apiToken,
      name: (backendUser && backendUser.displayName) || oauthResult.profileName || resolveFallbackUserName(provider),
      onboardingStep: state.user.onboardingCompleted ? "done" : "checklist"
    };
    state = mergeStateWithBackendPurchases(state, backendUser.purchases);
    state.eventLog.unshift({
      id: crypto.randomUUID(),
      type: oauthResult.mode === "oauth" ? "oauth_login_completed" : "login_provider_selected",
      createdAt: new Date().toISOString(),
      meta: {
        provider,
        mode: oauthResult.mode,
        userId: backendUser ? backendUser.id : null,
        hasAccessToken: Boolean(oauthResult.accessToken),
        hasAuthCode: Boolean(oauthResult.code)
      }
    });
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

async function registerBackendUser(provider, oauthResult) {
  try {
    const response = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        accessToken: oauthResult.accessToken || null,
        idToken: oauthResult.idToken || null,
        profileName: oauthResult.profileName || resolveFallbackUserName(provider)
      }),
      timeoutMs: 10000
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (!data || !data.ok || !data.user) {
      return null;
    }
    const account = Array.isArray(data.user.oauthAccounts) ? data.user.oauthAccounts[0] : null;
    return {
      id: data.user.id,
      displayName: data.user.display_name || data.user.displayName,
      email: data.user.email || (account && account.email) || null,
      providerUserId: account ? account.provider_user_id : null,
      apiToken: data.user.apiToken || null,
      purchases: Array.isArray(data.user.fitmonPurchases) ? data.user.fitmonPurchases : []
    };
  } catch (error) {
    console.debug("FitMon backend user registration skipped", error);
    return null;
  }
}

async function startOAuthFlow(provider) {
  const config = await resolveOAuthConfig(provider);
  if (!config || !isOAuthClientConfigured(config.clientId)) {
    throw new Error(`${PROVIDER_LABELS[provider] || provider} OAuth client id가 설정되지 않았습니다.`);
  }
  if (!chrome.identity) {
    throw new Error("Chrome identity API를 사용할 수 없습니다.");
  }

  const redirectUri = chrome.identity.getRedirectURL(provider);
  const oauthRequest = buildOAuthUrl(provider, config, redirectUri);
  const finalUrl = await chrome.identity.launchWebAuthFlow({
    url: oauthRequest.url,
    interactive: true
  });

  if (!finalUrl) {
    throw new Error("OAuth 로그인이 취소되었습니다.");
  }

  const parsedResult = parseOAuthRedirect(finalUrl, oauthRequest.state);
  if (parsedResult.code) {
    const exchangedResult = await exchangeOAuthCode(provider, parsedResult.code, redirectUri);
    if (!exchangedResult.accessToken && !exchangedResult.idToken) {
      throw new Error("OAuth 토큰 교환에 실패했습니다. 다시 로그인해 주세요.");
    }
    return { ...parsedResult, ...exchangedResult };
  }
  if (!parsedResult.accessToken && !parsedResult.idToken) {
    throw new Error("OAuth 인증 토큰을 받지 못했습니다. 다시 로그인해 주세요.");
  }
  return parsedResult;
}

async function resolveOAuthConfig(provider) {
  const localConfig = OAUTH_PROVIDER_CONFIGS[provider];
  if (!localConfig) {
    return null;
  }
  if (isOAuthClientConfigured(localConfig.clientId)) {
    return localConfig;
  }
  try {
    const response = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/oauth/config`, { timeoutMs: 5000 });
    if (!response.ok) {
      return localConfig;
    }
    const data = await response.json();
    const backendProvider = data && data.providers ? data.providers[provider] : null;
    if (!backendProvider || !backendProvider.clientId) {
      return localConfig;
    }
    return {
      ...localConfig,
      clientId: backendProvider.clientId
    };
  } catch (error) {
    console.debug("FitMon OAuth config fetch skipped", error);
    return localConfig;
  }
}

function isOAuthClientConfigured(clientId) {
  return Boolean(clientId);
}

function buildOAuthUrl(provider, config, redirectUri) {
  const url = new URL(config.authUrl);
  const state = `${provider}-${crypto.randomUUID()}`;
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (config.scopes.length) {
    url.searchParams.set("scope", config.scopes.join(" "));
  }
  Object.entries(config.extraParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return { url: url.toString(), state };
}

function parseOAuthRedirect(finalUrl, expectedState) {
  const url = new URL(finalUrl);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const queryParams = url.searchParams;
  const error = hashParams.get("error") || queryParams.get("error");
  if (error) {
    throw new Error(`OAuth 로그인 실패: ${error}`);
  }
  const returnedState = hashParams.get("state") || queryParams.get("state");
  if (!expectedState || returnedState !== expectedState) {
    throw new Error("OAuth state 검증에 실패했습니다. 다시 로그인해 주세요.");
  }
  return {
    mode: "oauth",
    accessToken: hashParams.get("access_token") || queryParams.get("access_token"),
    idToken: hashParams.get("id_token") || queryParams.get("id_token"),
    code: queryParams.get("code") || hashParams.get("code"),
    profileName: null
  };
}

async function exchangeOAuthCode(provider, code, redirectUri) {
  try {
    const response = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/oauth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, code, redirectUri }),
      timeoutMs: 10000
    });
    if (!response.ok) {
      throw new Error("OAuth 토큰 교환 요청에 실패했습니다.");
    }
    const data = await response.json();
    if (!data || !data.ok || !data.token) {
      throw new Error(data && data.error ? data.error : "OAuth 토큰 응답이 올바르지 않습니다.");
    }
    return {
      accessToken: data.token.access_token || null,
      idToken: data.token.id_token || null
    };
  } catch (error) {
    console.debug("FitMon OAuth code exchange failed", error);
    throw error;
  }
}

function resolveFallbackUserName(provider) {
  if (provider === "naver") {
    return "네이버 사용자";
  }
  return "핏몬 사용자";
}

async function advanceOnboardingIntro() {
  return withState((state) => {
    state.user = normalizeUserState(state.user);
    if (!state.user.onboardingCompleted && state.user.onboardingStep === "intro") {
      state.user.onboardingStep = "login";
      state.eventLog.unshift({
        id: crypto.randomUUID(),
        type: "onboarding_intro_completed",
        createdAt: new Date().toISOString(),
        meta: { nextStep: "login" }
      });
      state.eventLog = state.eventLog.slice(0, 40);
    }
    return state;
  });
}

async function saveChecklist(payload) {
  return withState((state) => {
    state.user = normalizeUserState(state.user);
    if (!state.user.isLoggedIn || state.user.onboardingStep !== "checklist") {
      throw new Error("로그인 후 체크리스트 단계를 진행해 주세요.");
    }
    const checklist = normalizeChecklist(state.checklist);
    state.checklist = {
      sittingHours: payload.sittingHours || checklist.sittingHours,
      discomfortAreas: Array.isArray(payload.discomfortAreas) && payload.discomfortAreas.length
        ? payload.discomfortAreas
        : checklist.discomfortAreas,
      exerciseFrequency: payload.exerciseFrequency || checklist.exerciseFrequency
    };
    state.preferences.focusAreas = state.checklist.discomfortAreas.slice(0, 3);
    state.user.onboardingCompleted = false;
    state.user.onboardingStep = "notifications";
    state.eventLog.unshift({
      id: crypto.randomUUID(),
      type: "checklist_saved",
      createdAt: new Date().toISOString(),
      meta: state.checklist
    });
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

async function completeOnboardingNotifications(payload) {
  return withState((state) => {
    state.user = normalizeUserState(state.user);
    if (state.user.onboardingStep !== "notifications") {
      throw new Error("체크리스트 저장 후 알림 주기를 설정해 주세요.");
    }
    const preferences = normalizePreferences(state.preferences);
    state.preferences = {
      ...preferences,
      notificationsEnabled:
        typeof payload.notificationsEnabled === "boolean"
          ? payload.notificationsEnabled
          : preferences.notificationsEnabled,
      frequencyMinutes: normalizeFrequencyMinutes(payload.frequencyMinutes, preferences.frequencyMinutes),
      soundMode: payload.soundMode || preferences.soundMode,
      focusAreas: preferences.focusAreas,
      snoozeUntil: null
    };
    state.user.onboardingCompleted = true;
    state.user.onboardingStep = "done";
    state.eventLog.unshift({
      id: crypto.randomUUID(),
      type: "onboarding_notification_preferences_saved",
      createdAt: new Date().toISOString(),
      meta: {
        notificationsEnabled: state.preferences.notificationsEnabled,
        frequencyMinutes: state.preferences.frequencyMinutes,
        soundMode: state.preferences.soundMode
      }
    });
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

async function saveSettings(payload) {
  return withState((state) => {
    const preferences = normalizePreferences(state.preferences);
    state.preferences = {
      ...preferences,
      notificationsEnabled:
        typeof payload.notificationsEnabled === "boolean"
          ? payload.notificationsEnabled
          : preferences.notificationsEnabled,
      frequencyMinutes: normalizeFrequencyMinutes(payload.frequencyMinutes, preferences.frequencyMinutes),
      soundMode: payload.soundMode || preferences.soundMode,
      focusAreas: preferences.focusAreas,
      snoozeUntil: payload.clearSnooze ? null : preferences.snoozeUntil
    };
    state.eventLog.unshift({
      id: crypto.randomUUID(),
      type: "settings_saved",
      createdAt: new Date().toISOString(),
      meta: {
        notificationsEnabled: state.preferences.notificationsEnabled,
        frequencyMinutes: state.preferences.frequencyMinutes,
        soundMode: state.preferences.soundMode
      }
    });
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

async function submitFeedback(payload) {
  return withState(async (state) => {
    const support = normalizeSupportState(state.support);
    const message = String(payload.message || "").trim();
    if (!message) {
      throw new Error("문제점을 입력해 주세요.");
    }
    const request = await recordBackendSupportRequest(state, "feedback", {
      category: payload.category || "general",
      message
    });
    const entry = {
      id: request && request.id ? request.id : crypto.randomUUID(),
      category: payload.category || "general",
      message,
      submittedAt: request && request.submitted_at ? request.submitted_at : new Date().toISOString(),
      status: request && request.status ? request.status : "submitted"
    };

    state.support = {
      ...support,
      lastFeedback: entry,
      feedbackRequests: [entry, ...support.feedbackRequests].slice(0, 20)
    };
    state.eventLog.unshift({
      id: crypto.randomUUID(),
      type: "feedback_submitted",
      createdAt: new Date().toISOString(),
      meta: { category: state.support.lastFeedback.category }
    });
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

async function requestWithdrawal(payload) {
  return withState(async (state) => {
    const support = normalizeSupportState(state.support);
    const reason = String(payload.reason || "").trim();
    const request = await recordBackendSupportRequest(state, "withdrawal", { reason });
    const entry = {
      id: request && request.id ? request.id : crypto.randomUUID(),
      reason,
      submittedAt: request && request.submitted_at ? request.submitted_at : new Date().toISOString(),
      status: request && request.status ? request.status : "requested"
    };
    state.support = {
      ...support,
      lastWithdrawalRequest: entry,
      withdrawalRequests: [entry, ...support.withdrawalRequests].slice(0, 20)
    };
    state.eventLog.unshift({
      id: crypto.randomUUID(),
      type: "withdrawal_requested",
      createdAt: new Date().toISOString(),
      meta: { hasReason: Boolean(reason) }
    });
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

async function purchaseOrEquipItem(itemId) {
  const fitmonItems = await resolveFitmonCatalog();
  return withState(async (state) => {
    state.character = normalizeCharacterState(state.character);
    const item = fitmonItems.find((entry) => entry.id === itemId);
    if (!item) {
      return state;
    }

    const wasOwned = state.character.ownedItemIds.includes(itemId) || item.defaultOwned;
    if (!wasOwned) {
      if (state.character.points < item.cost) {
        throw new Error("포인트가 부족합니다.");
      }
      const purchaseResult = await recordBackendFitmonPurchase(state, item);
      const purchase = purchaseResult && purchaseResult.purchase;
      if (purchaseResult && purchaseResult.state && purchaseResult.state.character) {
        state.character = normalizeCharacterState(purchaseResult.state.character);
      } else if (!purchase || !purchase.alreadyPurchased) {
        state.character.points -= item.cost;
      }
    }

    if (!state.character.ownedItemIds.includes(itemId)) {
      state.character.ownedItemIds.push(itemId);
    }

    if (!wasOwned) {
      state.eventLog.unshift({
        id: crypto.randomUUID(),
        type: "fitmon_purchased",
        createdAt: new Date().toISOString(),
        meta: { itemId, cost: item.cost }
      });
    } else {
      state.eventLog.unshift({
        id: crypto.randomUUID(),
        type: "fitmon_selected",
        createdAt: new Date().toISOString(),
        meta: { itemId }
      });
    }

    state.character.equippedItemId = itemId;
    state.eventLog = state.eventLog.slice(0, 40);
    return state;
  });
}

async function resetUserDataState() {
  const currentState = await ensureState();
  await deleteBackendUserState(currentState);
  const resetState = buildDefaultState();
  await writeState(resetState);
  return getUiState(resetState);
}

async function openSidePanelForSender(sender) {
  const tabId = sender.tab && sender.tab.id ? sender.tab.id : null;
  if (!tabId || !chrome.sidePanel) {
    await chrome.tabs.create({ url: chrome.runtime.getURL(PANEL_PATH) });
    return { ok: true, fallback: "tab" };
  }

  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: PANEL_PATH,
      enabled: true
    });
    await chrome.sidePanel.open({ tabId });
    return { ok: true, fallback: null };
  } catch (error) {
    await chrome.tabs.create({ url: chrome.runtime.getURL(PANEL_PATH) });
    return {
      ok: true,
      fallback: "tab",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function openRoutineOnActiveTab(routineId, entryMode) {
  const state = normalizeUserState((await ensureState()).user);
  if (!state.onboardingCompleted) {
    return { ok: false, error: "ONBOARDING_REQUIRED" };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return { ok: false, error: "NO_ACTIVE_TAB" };
  }

  const routine = getRoutineById(routineId);
  try {
    await sendRoutineToTab(tab.id, routine, entryMode);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function sendRoutineToTab(tabId, routine, entryMode) {
  const message = {
    type: "fitmon/open-routine",
    routine,
    entryMode
  };
  await chrome.tabs.sendMessage(tabId, message);
}
