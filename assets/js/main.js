  // Generate background stars
  const starsEl = document.getElementById('stars');
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2 + 0.5;
    s.style.cssText = `
      width:${size}px; height:${size}px;
      top:${Math.random()*100}%; left:${Math.random()*100}%;
      --lo:${(Math.random()*0.15+0.05).toFixed(2)};
      --hi:${(Math.random()*0.5+0.3).toFixed(2)};
      --d:${(Math.random()*4+2).toFixed(1)}s;
      --delay:-${(Math.random()*4).toFixed(1)}s;
    `;
    starsEl.appendChild(s);
  }

  let reelDoneTimer;
  let reelResetTimer;
  let reelPollTimer;
  let reelAbortController;

  function setGenerateReelButton(btn, { icon, label }) {
    const iconEl = btn.querySelector('.btn-reel-icon');
    const labelEl = btn.querySelector('.btn-reel-label');

    if (iconEl) iconEl.textContent = icon;
    if (labelEl) labelEl.textContent = label;
  }

  function setCancelReelButtonVisible(visible) {
    const cancelBtn = document.getElementById('cancelReelBtn');
    if (cancelBtn) cancelBtn.hidden = !visible;
  }

  function restoreGenerateReelIdle() {
    const btn = document.getElementById('generateReelBtn');
    if (btn) {
      btn.classList.remove('is-generating', 'is-done');
      btn.disabled = false;
      setGenerateReelButton(btn, { icon: '⚡', label: 'Generate Reel' });
    }
    setCancelReelButtonVisible(false);
    reelAbortController = null;
  }

  function cancelGenerateReel() {
    if (!reelAbortController) return;
    reelAbortController.abort();
  }

  const inrFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function formatInrCost(rupees) {
    if (rupees == null || !Number.isFinite(Number(rupees))) return '—';
    const n = Number(rupees);
    return n < 1 ? '<₹1.00' : inrFormatter.format(n);
  }

  function setReelCost(cost) {
    const costCard = document.getElementById('reelCostCard');
    const costText = document.getElementById('reelCostText');
    if (!costCard || !costText) return;
    if (cost == null) {
      costCard.hidden = true;
      return;
    }
    costText.textContent = formatInrCost(cost);
    costCard.hidden = false;
  }

  const FAILURE_UI = {
    failed: {
      chip: '✕ FAILED',
      caption: 'Generation hit a dead end — try again',
    },
    cancelled: {
      chip: '⊘ CANCELLED',
      caption: 'This run was stopped before completion',
    },
    expired: {
      chip: '⏱ EXPIRED',
      caption: 'The job timed out on the server',
    },
  };

  function failureKindFromStatus(status) {
    const s = String(status || '').toLowerCase().replace(/\s+/g, '_');
    if (s === 'cancelled') return 'cancelled';
    if (s === 'expired') return 'expired';
    return 'failed';
  }

  function setReelPanelState({ loading, loadingText, status, statusVisible, showVideo, waitMode, failureKind }) {
    const loadingEl = document.getElementById('reelLoading');
    const loadingTextEl = document.getElementById('reelLoadingText');
    const previewEl = document.getElementById('reelPreview');
    const pendingEl = document.getElementById('reelPending');
    const failedEl = document.getElementById('reelFailed');
    const videoEl = document.getElementById('reelVideo');
    const statusCard = document.getElementById('reelStatusCard');
    const statusText = document.getElementById('reelStatusText');
    const outputStage = document.getElementById('reelOutputStage');
    const pendingCaption = document.getElementById('pendingCaption');
    const pendingTag = document.getElementById('pendingTagMessage');
    const pendingChip = document.getElementById('pendingChip');
    const failedCaption = document.getElementById('failedCaption');
    const failedTag = document.getElementById('failedTagMessage');
    const failedChip = document.getElementById('failedChip');

    let mode = waitMode;
    if (loading && !showVideo && !mode) {
      if (loadingText && loadingText.includes('Loading preview')) {
        mode = 'buffer';
      } else if (status === 'in progress' || status === 'in_progress') {
        mode = 'render';
      } else {
        mode = 'queue';
      }
    }

    const showFailed = !loading && !showVideo && mode === 'failed';
    const showIdle = !loading && !showVideo && !showFailed;
    const showPending = loading && (mode === 'queue' || mode === 'render');
    const showBuffer = loading && mode === 'buffer';

    if (loadingEl) loadingEl.classList.toggle('is-active', showBuffer);
    if (loadingTextEl && loadingText) loadingTextEl.textContent = loadingText;
    if (statusCard) statusCard.hidden = !statusVisible;
    if (statusText && status) statusText.textContent = status;
    if (outputStage) {
      outputStage.classList.toggle('has-video', Boolean(showVideo));
      outputStage.classList.toggle('has-failed', showFailed);
    }
    if (previewEl) previewEl.classList.toggle('is-hidden', !showIdle);
    if (pendingEl) {
      pendingEl.hidden = !showPending;
      pendingEl.classList.toggle('is-rendering', mode === 'render');
    }
    if (failedEl) failedEl.hidden = !showFailed;
    if (videoEl) videoEl.classList.toggle('is-active', Boolean(showVideo));

    if (showPending) {
      syncPendingArtifact();
      if (pendingTag && loadingText) pendingTag.textContent = loadingText;
      if (pendingCaption) {
        pendingCaption.textContent = mode === 'render'
          ? 'Frames materializing in the cloud'
          : 'Your reel holds its place in line';
      }
      if (pendingChip) {
        pendingChip.textContent = mode === 'render' ? '✦ RENDERING' : '⏳ IN QUEUE';
      }
    }

    if (showFailed) {
      syncFailedArtifact();
      const kind = failureKind || failureKindFromStatus(status);
      const ui = FAILURE_UI[kind] || FAILURE_UI.failed;
      if (failedTag) failedTag.textContent = loadingText || status || 'Video generation failed';
      if (failedCaption) failedCaption.textContent = ui.caption;
      if (failedChip) failedChip.textContent = ui.chip;
    }
  }

  function syncIdleArtifact() {
    const imgEl = document.getElementById('idleArtifactImg');
    const svgEl = document.getElementById('idleArtifactSvg');
    if (!imgEl || !svgEl) return;

    const url = typeof window.getFirstProductImageUrl === 'function'
      ? window.getFirstProductImageUrl()
      : null;

    if (url) {
      imgEl.src = url;
      imgEl.hidden = false;
      svgEl.hidden = true;
    } else {
      imgEl.removeAttribute('src');
      imgEl.hidden = true;
      svgEl.hidden = false;
    }
  }

  function syncPendingArtifact() {
    const imgEl = document.getElementById('pendingArtifactImg');
    const placeholderEl = document.getElementById('pendingArtifactPlaceholder');
    if (!imgEl) return;

    const url = typeof window.getFirstProductImageUrl === 'function'
      ? window.getFirstProductImageUrl()
      : null;

    if (url) {
      imgEl.src = url;
      imgEl.hidden = false;
      if (placeholderEl) placeholderEl.hidden = true;
    } else {
      imgEl.removeAttribute('src');
      imgEl.hidden = true;
      if (placeholderEl) placeholderEl.hidden = false;
    }
  }

  function syncFailedArtifact() {
    const imgEl = document.getElementById('failedArtifactImg');
    const placeholderEl = document.getElementById('failedArtifactPlaceholder');
    if (!imgEl) return;

    const url = typeof window.getFirstProductImageUrl === 'function'
      ? window.getFirstProductImageUrl()
      : null;

    if (url) {
      imgEl.src = url;
      imgEl.hidden = false;
      if (placeholderEl) placeholderEl.hidden = true;
    } else {
      imgEl.removeAttribute('src');
      imgEl.hidden = true;
      if (placeholderEl) placeholderEl.hidden = false;
    }
  }

  function initReelPanel() {
    ReelDownload.clear();
    ReelDownload.setVisible(false);
    setReelPanelState({
      loading: false,
      statusVisible: false,
      showVideo: false,
    });
    syncIdleArtifact();
  }

  function resetReelTimers() {
    window.clearTimeout(reelDoneTimer);
    window.clearTimeout(reelResetTimer);
    window.clearInterval(reelPollTimer);
    reelPollTimer = null;
    if (reelAbortController) {
      reelAbortController.abort();
      reelAbortController = null;
    }
  }

  async function pollReelJob(jobId, signal) {
    const pollIntervalMs = 8000;
    const maxWaitMs = 12 * 60 * 1000;
    const started = Date.now();

    while (Date.now() - started < maxWaitMs) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const res = await fetch(`/api/reel-status/${encodeURIComponent(jobId)}`, { signal });
      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = {};
      }

      if (!res.ok) {
        const retryable = res.status >= 502 && res.status <= 504;
        if (retryable) {
          setReelPanelState({
            loading: true,
            loadingText: 'Reconnecting to OpenRouter…',
            status: 'connection retry',
            statusVisible: true,
            showVideo: false,
            waitMode: 'queue',
          });
          await new Promise((resolve, reject) => {
            const timer = window.setTimeout(resolve, pollIntervalMs);
            signal.addEventListener('abort', () => {
              window.clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          });
          continue;
        }
        throw new Error(data.error || `Status check failed (${res.status})`);
      }

      const state = data.status || 'pending';
      setReelPanelState({
        loading: true,
        loadingText: state === 'in_progress' ? 'Rendering video…' : 'Queued on OpenRouter…',
        status: state.replace('_', ' '),
        statusVisible: true,
        showVideo: false,
        waitMode: state === 'in_progress' ? 'render' : 'queue',
      });

      if (state === 'completed' && data.videoUrl) {
        return { videoUrl: data.videoUrl, cost: data.cost };
      }
      if (state === 'failed' || state === 'cancelled' || state === 'expired') {
        throw new Error(data.error || `Video generation ${state}`);
      }

      await new Promise((resolve, reject) => {
        const timer = window.setTimeout(resolve, pollIntervalMs);
        signal.addEventListener('abort', () => {
          window.clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }

    throw new Error('Video generation timed out — try again in a moment');
  }

  async function playReelVideo(videoUrl, signal) {
    const videoEl = document.getElementById('reelVideo');
    if (!videoEl) return;

    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        videoEl.removeEventListener('loadeddata', onReady);
        videoEl.removeEventListener('error', onError);
        if (signal) signal.removeEventListener('abort', onAbort);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Could not load the generated video'));
      };
      const onAbort = () => {
        cleanup();
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      videoEl.addEventListener('loadeddata', onReady, { once: true });
      videoEl.addEventListener('error', onError, { once: true });
      videoEl.src = `${videoUrl}?t=${Date.now()}`;
      videoEl.load();
    });
  }

  const FALLBACK_MAX_DURATION_SEC = 15;
  const DEFAULT_MAX_PROMPT_CHARS = 4000;
  let maxPromptChars = DEFAULT_MAX_PROMPT_CHARS;
  const FORMAT_OPTIONS = [
    { key: '9-16-reel', label: '9:16 Reel', aspect_ratio: '9:16' },
    { key: '9-16-story', label: '9:16 Story', aspect_ratio: '9:16' },
    { key: '1-1-square', label: '1:1 Square', aspect_ratio: '1:1' },
    { key: '4-5-portrait', label: '4:5 Portrait', aspect_ratio: '3:4' },
    { key: '16-9-landscape', label: '16:9 Landscape', aspect_ratio: '16:9' },
    { key: '16-9-youtube', label: '16:9 YouTube', aspect_ratio: '16:9' },
  ];
  let videoModelsByName = new Map();
  let allowedDurations = [FALLBACK_MAX_DURATION_SEC];

  function indexVideoModels(models) {
    videoModelsByName = new Map();
    if (!Array.isArray(models)) return;
    models.forEach((model) => {
      const name = model && model.model_name;
      if (name) videoModelsByName.set(name, model);
    });
  }

  function maxDurationFromModelEntry(model) {
    const raw = model && model.max_duration;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : FALLBACK_MAX_DURATION_SEC;
  }

  function getAspectRatiosForModel(modelName) {
    const entry = (modelName && videoModelsByName.get(modelName))
      || (videoModelsByName.size ? videoModelsByName.values().next().value : null);
    const raw = entry && entry.aspect_ratios;
    if (Array.isArray(raw) && raw.length) {
      return raw.map((ratio) => String(ratio));
    }
    return [...new Set(FORMAT_OPTIONS.map((opt) => opt.aspect_ratio))];
  }

  function applyFormatOptionsForModel(modelName) {
    const formatSelect = document.getElementById('formatSelect');
    if (!formatSelect) return;

    const allowedRatios = new Set(getAspectRatiosForModel(modelName));
    const options = FORMAT_OPTIONS.filter((opt) => allowedRatios.has(opt.aspect_ratio));
    const visible = options.length ? options : FORMAT_OPTIONS;

    const prior = formatSelect.value;
    formatSelect.innerHTML = '';
    visible.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.key;
      option.textContent = opt.label;
      formatSelect.appendChild(option);
    });

    const keys = visible.map((opt) => opt.key);
    formatSelect.value = keys.includes(prior) ? prior : keys[0];
    if (formatSelect.value !== prior) {
      formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function getDurationsForModel(modelName) {
    const entry = (modelName && videoModelsByName.get(modelName))
      || (videoModelsByName.size ? videoModelsByName.values().next().value : null);
    if (!entry) return [FALLBACK_MAX_DURATION_SEC];

    const raw = entry.durations;
    if (Array.isArray(raw) && raw.length) {
      const out = raw
        .map((x) => parseInt(x, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (out.length) return [...new Set(out)].sort((a, b) => a - b);
    }

    const max = maxDurationFromModelEntry(entry);
    if (max <= 10) {
      return Array.from({ length: max }, (_, i) => i + 1);
    }
    const out = [];
    for (let v = 5; v <= max; v += 5) out.push(v);
    return out.length ? out : [FALLBACK_MAX_DURATION_SEC];
  }

  function nearestDurationIndex(sec, durations) {
    if (!durations.length) return 0;
    let best = 0;
    let bestDist = Math.abs(durations[0] - sec);
    for (let i = 1; i < durations.length; i += 1) {
      const dist = Math.abs(durations[i] - sec);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    return best;
  }

  function durationSecFromSlider() {
    const durationSlider = document.getElementById('durationSlider');
    if (!durationSlider || !allowedDurations.length) return FALLBACK_MAX_DURATION_SEC;
    const idx = parseInt(durationSlider.value, 10);
    return allowedDurations[Number.isFinite(idx) ? idx : allowedDurations.length - 1];
  }

  function estimateReelCost(modelName, durationSec, imageCount) {
    const m = modelName && videoModelsByName.get(modelName);
    if (!m) return null;
    const perSec = Number(m.price_per_sec);
    const perImg = Number(m.price_per_image);
    if (!Number.isFinite(perSec) && !Number.isFinite(perImg)) return null;
    const inr = (Number.isFinite(perSec) ? perSec : 0) * durationSec
              + (Number.isFinite(perImg) ? perImg : 0) * imageCount;
    return inr > 0 ? inr : null;
  }

  function refreshEstimatedCost() {
    const modelSelect = document.getElementById('videoModelSelect');
    const model = modelSelect && modelSelect.value;
    const images = typeof window.getProductImageFiles === 'function'
      ? window.getProductImageFiles() : [];
    setReelCost(estimateReelCost(model, durationSecFromSlider(), images.length));
  }

  function updateDurationScaleLabels(min, max) {
    const scale = document.querySelector('.duration-scale');
    if (!scale) return;
    const spans = scale.querySelectorAll('span');
    const mid = allowedDurations[Math.floor((allowedDurations.length - 1) / 2)] ?? Math.round((min + max) / 2);
    if (spans[0]) spans[0].textContent = `${min}s`;
    if (spans[1]) spans[1].textContent = `${mid}s`;
    if (spans[2]) spans[2].textContent = `${max}s`;
  }

  function applyDurationLimitsForModel(modelName) {
    const durationSlider = document.getElementById('durationSlider');
    const durationValue = document.getElementById('durationValue');
    if (!durationSlider) return;

    const priorSec = durationValue
      ? parseInt(durationValue.textContent, 10)
      : NaN;

    allowedDurations = getDurationsForModel(modelName);
    const lastIdx = Math.max(0, allowedDurations.length - 1);

    durationSlider.min = '0';
    durationSlider.max = String(lastIdx);
    durationSlider.step = '1';
    durationSlider.setAttribute('aria-valuemin', String(allowedDurations[0]));
    durationSlider.setAttribute('aria-valuemax', String(allowedDurations[lastIdx]));

    const idx = nearestDurationIndex(
      Number.isFinite(priorSec) ? priorSec : allowedDurations[lastIdx],
      allowedDurations,
    );
    durationSlider.value = String(idx);
    durationSlider.setAttribute('aria-valuenow', String(allowedDurations[idx]));

    updateDurationScaleLabels(allowedDurations[0], allowedDurations[lastIdx]);

    if (durationValue) durationValue.textContent = `${allowedDurations[idx]} sec`;

    const pct = lastIdx === 0 ? 100 : (idx / lastIdx) * 100;
    durationSlider.style.setProperty('--duration-pct', `${pct}%`);
  }

  async function generateReel() {
    const btn = document.getElementById('generateReelBtn');
    const promptInput = document.getElementById('promptInput');
    const formatSelect = document.getElementById('formatSelect');
    const durationSlider = document.getElementById('durationSlider');
    const modelSelect = document.getElementById('videoModelSelect');

    if (!btn || btn.classList.contains('is-generating')) return;

    let prompt = promptInput ? promptInput.value.trim() : '';
    if (!prompt) {
      if (promptInput) {
        promptInput.focus();
        promptInput.classList.add('is-invalid');
        window.setTimeout(() => promptInput.classList.remove('is-invalid'), 1200);
      }
      setReelPanelState({
        loading: false,
        status: 'Add a prompt first',
        statusVisible: true,
        showVideo: false,
      });
      return;
    }

    resetReelTimers();
    reelAbortController = new AbortController();
    const { signal } = reelAbortController;
    ReelDownload.clear();
    ReelDownload.setVisible(false);

    btn.classList.remove('is-done');
    btn.classList.add('is-generating');
    btn.disabled = true;
    setCancelReelButtonVisible(true);

    if (typeof window.isManualPromptEdit === 'function'
      && window.isManualPromptEdit()
      && typeof window.appendCampaignContextToPrompt === 'function') {
      prompt = window.appendCampaignContextToPrompt(prompt);
    }

    if (prompt.length > maxPromptChars) {
      if (promptInput) {
        promptInput.focus();
        promptInput.classList.add('is-invalid');
        window.setTimeout(() => promptInput.classList.remove('is-invalid'), 1200);
      }
      setReelPanelState({
        loading: false,
        status: `Prompt is too long (${prompt.length}/${maxPromptChars} characters)`,
        statusVisible: true,
        showVideo: false,
      });
      restoreGenerateReelIdle();
      refreshEstimatedCost();
      return;
    }

    setGenerateReelButton(btn, { icon: '⏳', label: 'Submitting…' });

    setReelPanelState({
      loading: true,
      loadingText: 'Sending to OpenRouter…',
      status: 'submitting',
      statusVisible: true,
      showVideo: false,
      waitMode: 'queue',
    });

    const formData = new FormData();
    formData.append('prompt', prompt);
    if (formatSelect) formData.append('format', formatSelect.value);
    if (durationSlider) formData.append('duration', String(durationSecFromSlider()));
    if (modelSelect && modelSelect.value) formData.append('model', modelSelect.value);

    const files = typeof window.getProductImageFiles === 'function'
      ? window.getProductImageFiles()
      : [];
    files.forEach((file) => formData.append('images', file, file.name));

    try {
      const submitRes = await fetch('/api/generate-reel', {
        method: 'POST',
        body: formData,
        signal,
      });

      let submitData = {};
      try {
        submitData = await submitRes.json();
      } catch (_) {
        submitData = {};
      }

      if (!submitRes.ok) {
        throw new Error(submitData.error || `Reel request failed (${submitRes.status})`);
      }

      const jobId = submitData.jobId;
      if (!jobId) throw new Error('Server did not return a job id');
      const renderedDuration = submitData.duration;

      if (submitData.durationClamped) {
        const modelMax = allowedDurations[allowedDurations.length - 1] ?? FALLBACK_MAX_DURATION_SEC;
        setReelPanelState({
          loading: true,
          loadingText: `Rendering ${submitData.duration}s clip (model max ${modelMax}s)…`,
          status: 'queued',
          statusVisible: true,
          showVideo: false,
          waitMode: 'queue',
        });
      } else {
        setReelPanelState({
          loading: true,
          loadingText: 'Queued on OpenRouter…',
          status: 'queued',
          statusVisible: true,
          showVideo: false,
          waitMode: 'queue',
        });
      }

      setGenerateReelButton(btn, { icon: '⏳', label: 'Rendering Magic' });

      const { videoUrl, cost } = await pollReelJob(jobId, signal);
      setGenerateReelButton(btn, { icon: '⏳', label: 'Loading preview…' });
      setReelPanelState({
        loading: true,
        loadingText: 'Loading preview…',
        status: 'completed',
        statusVisible: true,
        showVideo: false,
        waitMode: 'buffer',
      });

      await playReelVideo(videoUrl, signal);
      const resolvedCost = cost ?? estimateReelCost(
        modelSelect && modelSelect.value,
        durationSecFromSlider(),
        files.length,
      );
      setReelCost(resolvedCost);

      ReelDownload.storeGeneration({
        videoUrl,
        prompt,
        jobId,
        cost: resolvedCost,
        duration: renderedDuration,
      });
      ReelDownload.setVisible(true);

      const videoEl = document.getElementById('reelVideo');
      if (videoEl) {
        try {
          await videoEl.play();
        } catch (_) {
          /* autoplay may be blocked until user interacts */
        }
      }

      setReelPanelState({
        loading: false,
        statusVisible: false,
        showVideo: true,
      });

      btn.classList.remove('is-generating');
      btn.classList.add('is-done');
      setCancelReelButtonVisible(false);
      setGenerateReelButton(btn, { icon: '✓', label: 'Reel Generated!' });

      reelResetTimer = window.setTimeout(() => {
        btn.classList.remove('is-done');
        btn.disabled = false;
        setGenerateReelButton(btn, { icon: '⚡', label: 'Generate Reel' });
      }, 4500);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        const videoEl = document.getElementById('reelVideo');
        if (videoEl) {
          videoEl.pause();
          videoEl.removeAttribute('src');
          videoEl.load();
        }
        initReelPanel();
        restoreGenerateReelIdle();
        refreshEstimatedCost();
        return;
      }

      const message = err && err.message ? err.message : 'Video generation failed';
      setReelPanelState({
        loading: false,
        loadingText: message,
        status: message,
        statusVisible: true,
        showVideo: false,
        waitMode: 'failed',
        failureKind: 'failed',
      });

      restoreGenerateReelIdle();
      refreshEstimatedCost();
    }
  }

  initReelPanel();

  // DEV: mock API status buttons — delete this block to remove
  const DEV_MOCK_SAMPLE_VIDEO = `assets/videos/${encodeURIComponent('x-ai: grok-imagine-video output_ad_video.mp4')}`;

  async function mockReelApiStatus(state) {
    resetReelTimers();
    const btn = document.getElementById('generateReelBtn');

    if (btn) btn.classList.remove('is-done');

    if (state === 'idle') {
      const videoEl = document.getElementById('reelVideo');
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
      }
      initReelPanel();
      if (btn) {
        btn.classList.remove('is-generating', 'is-done');
        btn.disabled = false;
        setGenerateReelButton(btn, { icon: '⚡', label: 'Generate Reel' });
      }
      refreshEstimatedCost();
      return;
    }

    if (state === 'pending' || state === 'in_progress') {
      if (btn) {
        btn.classList.add('is-generating');
        btn.disabled = true;
        setGenerateReelButton(btn, { icon: '⏳', label: 'Rendering Magic' });
      }
      setReelPanelState({
        loading: true,
        loadingText: state === 'in_progress' ? 'Rendering video…' : 'Queued on OpenRouter…',
        status: state.replace('_', ' '),
        statusVisible: true,
        showVideo: false,
        waitMode: state === 'in_progress' ? 'render' : 'queue',
      });
      return;
    }

    if (state === 'completed') {
      if (btn) {
        btn.classList.add('is-generating');
        btn.disabled = true;
        setGenerateReelButton(btn, { icon: '⏳', label: 'Loading preview…' });
      }
      setReelPanelState({
        loading: true,
        loadingText: 'Loading preview…',
        status: 'completed',
        statusVisible: true,
        showVideo: false,
        waitMode: 'buffer',
      });
      try {
        await playReelVideo(DEV_MOCK_SAMPLE_VIDEO);
        setReelCost(12.5);
        const promptInput = document.getElementById('promptInput');
        ReelDownload.storeGeneration({
          videoUrl: DEV_MOCK_SAMPLE_VIDEO,
          prompt: promptInput ? promptInput.value.trim() : 'Mock reel prompt',
          jobId: 'mock-dev',
          cost: 12.5,
        });
        ReelDownload.setVisible(true);
        const videoEl = document.getElementById('reelVideo');
        if (videoEl) {
          try {
            await videoEl.play();
          } catch (_) {
            /* autoplay may be blocked until user interacts */
          }
        }
        setReelPanelState({
          loading: false,
          statusVisible: false,
          showVideo: true,
        });
        if (btn) {
          btn.classList.remove('is-generating');
          btn.classList.add('is-done');
          setGenerateReelButton(btn, { icon: '✓', label: 'Reel Generated!' });
          reelResetTimer = window.setTimeout(() => {
            btn.classList.remove('is-done');
            btn.disabled = false;
            setGenerateReelButton(btn, { icon: '⚡', label: 'Generate Reel' });
          }, 4500);
        }
      } catch (err) {
        const message = err && err.message ? err.message : 'Could not load the generated video';
        setReelPanelState({
          loading: false,
          loadingText: message,
          status: message,
          statusVisible: true,
          showVideo: false,
          waitMode: 'failed',
          failureKind: 'failed',
        });
        if (btn) {
          btn.classList.remove('is-generating', 'is-done');
          btn.disabled = false;
          setGenerateReelButton(btn, { icon: '⚡', label: 'Generate Reel' });
        }
      }
      return;
    }

    if (state === 'failed' || state === 'cancelled' || state === 'expired') {
      const message = `Video generation ${state.replace('_', ' ')}`;
      setReelPanelState({
        loading: false,
        loadingText: message,
        status: message,
        statusVisible: true,
        showVideo: false,
        waitMode: 'failed',
        failureKind: state,
      });
      if (btn) {
        btn.classList.remove('is-generating', 'is-done');
        btn.disabled = false;
        setGenerateReelButton(btn, { icon: '⚡', label: 'Generate Reel' });
      }
      refreshEstimatedCost();
    }
  }

  (function initDevMockStatusButtons() {
    const bar = document.getElementById('devMockStatusBar');
    if (!bar) return;
    bar.querySelectorAll('[data-mock-status]').forEach((el) => {
      el.addEventListener('click', () => {
        mockReelApiStatus(el.getAttribute('data-mock-status'));
      });
    });
  })();

  (function initGenerateReelButton() {
    const btn = document.getElementById('generateReelBtn');
    if (!btn) return;

    btn.addEventListener('pointerdown', (event) => {
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');

      ripple.className = 'btn-reel-ripple';
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      window.setTimeout(() => ripple.remove(), 700);
    });
  })();

  ReelDownload.configure({
    formatOptions: FORMAT_OPTIONS,
    getDurationSec: durationSecFromSlider,
    formatInrCost,
  });
  ReelDownload.initButton();

  // Refine chip interactivity
  document.querySelectorAll('.refine-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const orig = chip.textContent;
      chip.textContent = '↻ Applying...';
      chip.style.color = 'var(--neon)';
      chip.style.borderColor = 'rgba(34,211,160,0.4)';
      setTimeout(() => {
        chip.textContent = orig;
        chip.style.color = '';
        chip.style.borderColor = '';
      }, 1800);
    });
  });

  // ── Product image upload ──
  (function initProductUpload() {
    const dropZone      = document.getElementById('productDropZone');
    const fileInput     = document.getElementById('productFileInput');
    const gallery       = document.getElementById('productGallery');
    const placeholder   = document.getElementById('productPlaceholderSvg');
    const hint          = document.getElementById('uploadHint');
    const badge         = document.getElementById('imgReadyBadge');
    const validationMsg = document.getElementById('validationMsg');

    if (!dropZone || !fileInput || !badge || !gallery) return;

    // Each entry: { file, url, w, h, el }
    const items = [];

    function setBadge(state, text) {
      badge.classList.remove('idle', 'ready', 'error');
      badge.classList.add(state);
      badge.textContent = text;
    }

    function setMessage(text, kind) {
      if (!text) {
        validationMsg.hidden = true;
        validationMsg.textContent = '';
        validationMsg.classList.remove('error', 'info');
        return;
      }
      validationMsg.hidden = false;
      validationMsg.textContent = text;
      validationMsg.classList.toggle('error', kind === 'error');
      validationMsg.classList.toggle('info',  kind === 'info');
    }

    function formatBytes(bytes) {
      const mb = bytes / (1024 * 1024);
      return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
    }

    // Show placeholder/hint only while the gallery is empty.
    function syncEmptyState() {
      const hasImages = items.length > 0;
      if (placeholder) placeholder.style.display = hasImages ? 'none' : '';
      gallery.hidden = !hasImages;
    }

    function refreshBadge() {
      const n = items.length;
      if (n === 0) {
        setBadge('idle', 'No image');
      } else {
        setBadge('ready', n === 1 ? 'Image Ready' : `${n} images ready`);
      }
      syncIdleArtifact();
      syncPendingArtifact();
      syncFailedArtifact();
      refreshEstimatedCost();
    }

    function removeItem(item) {
      const i = items.indexOf(item);
      if (i === -1) return;
      items.splice(i, 1);
      if (item.url) URL.revokeObjectURL(item.url);
      if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
      syncEmptyState();
      refreshBadge();
      if (!items.length) setMessage('', null);
    }

    function addItem(file, url, w, h) {
      const item = { file, url, w, h };

      const cell = document.createElement('div');
      cell.className = 'product-thumb';
      cell.title = `${file.name} · ${w}×${h} · ${formatBytes(file.size)}`;

      const img = document.createElement('img');
      img.className = 'product-thumb-img';
      img.src = url;
      img.alt = file.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'product-thumb-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
      removeBtn.addEventListener('click', (e) => {
        // Don't let the click bubble up to the drop zone (which opens the picker).
        e.stopPropagation();
        removeItem(item);
      });

      cell.appendChild(img);
      cell.appendChild(removeBtn);
      gallery.appendChild(cell);

      item.el = cell;
      items.push(item);
      syncEmptyState();
    }

    function validateAndLoad(fileList) {
      const files = Array.from(fileList || []).filter(Boolean);
      if (!files.length) return;

      let pending = files.length;
      let addedCount = 0;
      const errors = [];

      function finalize() {
        pending -= 1;
        if (pending > 0) return;

        refreshBadge();
        if (errors.length && addedCount) {
          setMessage(`Added ${addedCount}. Skipped ${errors.length}: ${errors.join('; ')}`, 'error');
        } else if (errors.length) {
          setMessage(`Skipped ${errors.length}: ${errors.join('; ')}`, 'error');
        } else {
          const n = items.length;
          setMessage(`${n} image${n === 1 ? '' : 's'} ready.`, 'info');
        }
      }

      // While we decode the batch, show a working state.
      setBadge('idle', 'Checking…');

      files.forEach((file) => {
        const label = file.name || 'file';

        if (file.size === 0) {
          errors.push(`${label} (empty file)`);
          finalize();
          return;
        }

        const url = URL.createObjectURL(file);
        const probe = new Image();
        probe.onload = () => {
          addItem(file, url, probe.naturalWidth, probe.naturalHeight);
          addedCount += 1;
          finalize();
        };
        probe.onerror = () => {
          errors.push(`${label} (could not decode)`);
          URL.revokeObjectURL(url);
          finalize();
        };
        probe.src = url;
      });
    }

    // Open picker on click / Enter / Space
    dropZone.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });
    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.value = '';
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', (e) => {
      validateAndLoad(e.target.files);
    });

    // Drag-and-drop highlight
    ['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
      });
    });
    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      validateAndLoad(files);
    });

    // Prevent the browser from navigating away if a file is dropped outside the zone
    ['dragover', 'drop'].forEach(evt => {
      window.addEventListener(evt, (e) => {
        if (!dropZone.contains(e.target)) e.preventDefault();
      });
    });

    window.getProductImageFiles = () => items.map((item) => item.file);
    window.getFirstProductImageUrl = () => (items[0] && items[0].url) || null;
    window.setProductMessage = setMessage;
  })();

  // ── Prompt panel: build, edit, style presets ──
  (function initPromptPanel() {
    const promptInput    = document.getElementById('promptInput');
    const syncBtn        = document.getElementById('syncPromptBtn');
    const generatePromptBtn = document.getElementById('generatePromptBtn');
    const productName    = document.getElementById('productNameInput');
    const formatSelect   = document.getElementById('formatSelect');
    const durationSlider = document.getElementById('durationSlider');
    const durationValue  = document.getElementById('durationValue');
    const keyMessage     = document.getElementById('keyMessageInput');
    const initialPrompt  = document.getElementById('initialPromptInput');
    const phoneTagMsg    = document.getElementById('phoneTagMessage');
    const styleChips     = document.querySelectorAll('.panel-product .chip[data-style]');

    if (!promptInput) return;

    const FORMAT_DURATION_DEFAULTS = {
      '9-16-reel': 15,
      '9-16-story': 15,
      '1-1-square': 15,
      '4-5-portrait': 15,
      '16-9-landscape': 30,
      '16-9-youtube': 30,
    };

    let activeStyle = 'premium';
    let manualEdit = false;

    function getFormatDurationDefault() {
      const key = formatSelect ? formatSelect.value : '9-16-reel';
      return FORMAT_DURATION_DEFAULTS[key] ?? 15;
    }

    function getSelectedDurationSec() {
      if (!durationSlider) return getFormatDurationDefault();
      return durationSecFromSlider();
    }

    function updateDurationDisplay() {
      if (!durationSlider) return;
      const sec = getSelectedDurationSec();
      if (durationValue) durationValue.textContent = `${sec} sec`;
      durationSlider.setAttribute('aria-valuenow', String(sec));
      const lastIdx = Math.max(0, allowedDurations.length - 1);
      const idx = parseInt(durationSlider.value, 10) || 0;
      const pct = lastIdx === 0 ? 100 : (idx / lastIdx) * 100;
      durationSlider.style.setProperty('--duration-pct', `${pct}%`);
      refreshEstimatedCost();
    }

    function setDurationSec(sec) {
      if (!durationSlider) return;
      durationSlider.value = String(nearestDurationIndex(sec, allowedDurations));
      updateDurationDisplay();
    }

    function readProductFields() {
      const activeChip = document.querySelector('.panel-product .chip.active-chip[data-style]');
      return {
        productName: productName ? productName.value.trim() : '',
        keyMessage: keyMessage ? keyMessage.value.trim() : '',
        initialPrompt: initialPrompt ? initialPrompt.value.trim() : '',
        style: activeChip ? activeChip.textContent.trim() : '',
        duration: getSelectedDurationSec(),
      };
    }

    function collectSpecs(specOverrides = {}) {
      const modelSelect = document.getElementById('videoModelSelect');
      return {
        ...readProductFields(),
        videoModel: modelSelect && modelSelect.value ? modelSelect.value : '',
        ...specOverrides,
      };
    }

    function appendCampaignContextToPrompt(basePrompt) {
      const base = String(basePrompt || '').trim();
      if (!base) return base;

      const fields = readProductFields();
      const files = typeof window.getProductImageFiles === 'function'
        ? window.getProductImageFiles()
        : [];
      const lines = [];

      if (fields.productName) lines.push(`Product: ${fields.productName}`);
      if (fields.keyMessage) lines.push(`Key message: ${fields.keyMessage}`);
      if (fields.style) lines.push(`Style: ${fields.style}`);
      if (fields.duration) lines.push(`Duration: ${fields.duration} seconds`);
      if (files.length) {
        lines.push(
          'Reference images attached — match exact product appearance from the attached images.',
        );
      }

      if (!lines.length) return base;
      return `${base}\n\n${lines.join('\n')}`;
    }

    async function requestPromptFromApi(specOverrides = {}) {
      const formData = new FormData();
      formData.append('specs', JSON.stringify(collectSpecs(specOverrides)));

      const files = typeof window.getProductImageFiles === 'function'
        ? window.getProductImageFiles()
        : [];
      files.forEach((file) => formData.append('images', file, file.name));

      const response = await fetch('/api/generate-prompt', {
        method: 'POST',
        body: formData,
      });

      let data = {};
      try {
        data = await response.json();
      } catch (_) {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || `Prompt generation failed (${response.status})`);
      }

      if (!data.prompt || !String(data.prompt).trim()) {
        throw new Error('API returned an empty prompt');
      }

      const prompt = String(data.prompt).trim();
      const steerawayScenes = String(data.steerawayScenes || '').trim();
      ReelDownload.recordPromptGeneration({ prompt, steerawayScenes });

      return { prompt, steerawayScenes };
    }

    function syncPhoneTag() {
      if (!phoneTagMsg || !keyMessage) return;
      const bullets = keyMessage.value.trim().split(/[·•|]/).map(s => s.trim()).filter(Boolean);
      phoneTagMsg.textContent = bullets[0] || keyMessage.value.trim() || 'Your key message';
    }

    function applyPrompt(text) {
      promptInput.value = text;
      manualEdit = false;
      if (syncBtn) syncBtn.hidden = true;
      syncPhoneTag();
    }

    function setManualEditState(isManual) {
      manualEdit = isManual;
      if (syncBtn) syncBtn.hidden = !isManual;
    }

    function selectStyleChip(styleKey) {
      activeStyle = styleKey;
      styleChips.forEach(chip => {
        chip.classList.toggle('active-chip', chip.dataset.style === styleKey);
      });
    }

    let isTypingPrompt = false;
    let isFetchingPrompt = false;

    function formatPromptError(err) {
      const raw = err && err.message ? err.message : 'Prompt generation failed';
      if (raw.includes('does not represent a valid image')) {
        return 'One or more images use an unsupported format. Use JPEG, PNG, or WebP.';
      }
      if (raw.startsWith('OpenRouter error')) {
        return 'Prompt generation failed — the AI service rejected the request. Try different images or retry.';
      }
      return raw.length > 180 ? 'Prompt generation failed. See the product image area for details.' : raw;
    }

    function showPromptError(err) {
      const text = formatPromptError(err);
      if (typeof window.setProductMessage === 'function') {
        window.setProductMessage(text, 'error');
      }
    }

    function revealPromptWithTypewriter(fullText, onDone) {
      promptInput.value = '';
      promptInput.classList.add('is-typing');

      const total = fullText.length;
      const step = Math.max(2, Math.ceil(total / 90));
      let i = 0;

      const timer = setInterval(() => {
        i = Math.min(total, i + step);
        promptInput.value = fullText.slice(0, i);
        promptInput.scrollTop = promptInput.scrollHeight;

        if (i >= total) {
          clearInterval(timer);
          promptInput.classList.remove('is-typing');
          manualEdit = false;
          if (syncBtn) syncBtn.hidden = true;
          syncPhoneTag();
          if (onDone) onDone();
        }
      }, 18);
    }

    async function fetchAndApplyPrompt({ animate = true } = {}) {
      if (isFetchingPrompt || isTypingPrompt) return;

      const btn = generatePromptBtn;
      const label = btn ? btn.querySelector('.btn-gp-label') : null;
      const originalLabel = label ? label.textContent : '';

      isFetchingPrompt = true;

      if (btn) {
        btn.classList.add('is-generating');
        btn.disabled = true;
      }
      if (label) label.textContent = 'Generating…';
      promptInput.classList.add('is-typing');

      try {
        const { prompt: fullText } = await requestPromptFromApi();

        if (animate) {
          isTypingPrompt = true;
          revealPromptWithTypewriter(fullText, () => {
            isTypingPrompt = false;
            if (label) label.textContent = 'Generated ✓';
            if (btn) btn.classList.remove('is-generating');
            setTimeout(() => {
              if (label) label.textContent = originalLabel || 'Generate Prompt';
              if (btn) btn.disabled = false;
            }, 900);
          });
        } else {
          applyPrompt(fullText);
          if (label) label.textContent = originalLabel || 'Generate Prompt';
          if (btn) btn.classList.remove('is-generating');
          if (btn) btn.disabled = false;
        }
      } catch (err) {
        showPromptError(err);
        promptInput.classList.remove('is-typing');
        if (label) label.textContent = originalLabel || 'Generate Prompt';
        if (btn) {
          btn.classList.remove('is-generating');
          btn.disabled = false;
        }
      } finally {
        isFetchingPrompt = false;
      }
    }

    // Reveal the freshly built prompt with a typewriter transition.
    function animateGeneratePrompt() {
      fetchAndApplyPrompt({ animate: true });
    }

    styleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const styleKey = chip.dataset.style;
        if (!styleKey) return;
        selectStyleChip(styleKey);
      });
    });

    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        fetchAndApplyPrompt({ animate: false });
      });
    }

    window.isManualPromptEdit = () => manualEdit;
    window.appendCampaignContextToPrompt = appendCampaignContextToPrompt;

    if (generatePromptBtn) {
      generatePromptBtn.addEventListener('click', animateGeneratePrompt);
    }

    promptInput.addEventListener('input', () => {
      setManualEditState(true);
    });

    function handleProductFieldUpdate(source) {
      if (source === formatSelect) {
        setDurationSec(getFormatDurationDefault());
      }
      syncPhoneTag();
      if (!manualEdit && promptInput.value.trim()) {
        if (syncBtn) syncBtn.hidden = false;
      }
    }

    const productFields = [productName, formatSelect, keyMessage, initialPrompt, durationSlider].filter(Boolean);
    productFields.forEach(el => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (el === durationSlider) updateDurationDisplay();
        handleProductFieldUpdate(el);
      });
    });

    updateDurationDisplay();
    syncPhoneTag();

    const modelSelect = document.getElementById('videoModelSelect');
    const reelProviderEl = document.getElementById('reelProviderLabel');

    function shortModelName(name) {
      return name ? name.replace(/^[^/]+\//, '') : '';
    }

    function syncProviderLabel() {
      if (!reelProviderEl) return;
      const name = modelSelect && modelSelect.value
        ? modelSelect.value
        : '';
      reelProviderEl.textContent = name ? shortModelName(name) : 'OpenRouter';
    }

    function onVideoModelChange() {
      syncProviderLabel();
      applyFormatOptionsForModel(modelSelect ? modelSelect.value : '');
      applyDurationLimitsForModel(modelSelect ? modelSelect.value : '');
      refreshEstimatedCost();
    }

    if (modelSelect) {
      modelSelect.addEventListener('change', onVideoModelChange);
    }

    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (!cfg) return;

        const models = Array.isArray(cfg.videoModels) ? cfg.videoModels : [];
        indexVideoModels(models);

        const parsedMaxPrompt = Number(cfg.maxPromptChars);
        if (Number.isFinite(parsedMaxPrompt) && parsedMaxPrompt > 0) {
          maxPromptChars = parsedMaxPrompt;
        }
        const promptInput = document.getElementById('promptInput');
        if (promptInput) {
          promptInput.maxLength = maxPromptChars;
        }

        if (modelSelect && models.length) {
          modelSelect.innerHTML = '';
          models.forEach((model) => {
            const name = model && model.model_name;
            if (!name) return;
            const option = document.createElement('option');
            option.value = name;
            option.textContent = shortModelName(name);
            option.title = name;
            modelSelect.appendChild(option);
          });
          if (cfg.videoModel) modelSelect.value = cfg.videoModel;
        } else if (modelSelect && !models.length) {
          modelSelect.innerHTML = '';
          const option = document.createElement('option');
          option.value = cfg.videoModel || '';
          option.textContent = shortModelName(cfg.videoModel) || 'Default model';
          modelSelect.appendChild(option);
        }

        onVideoModelChange();
      })
      .catch(() => {});
  })();

  (function initOpenRouterCredits() {
    const pill = document.getElementById('openrouterCredits');
    const valueEl = document.getElementById('openrouterCreditsValue');
    if (!pill || !valueEl) return;

    const POLL_MS = 60_000;
    const LOW_BALANCE_USD = 5;

    function formatUsd(amount) {
      if (!Number.isFinite(amount)) return '—';
      return `$${amount.toFixed(2)}`;
    }

    function applyCredits(data) {
      pill.hidden = false;
      pill.classList.remove('or-credits-pill--low', 'or-credits-pill--empty');

      if (!data || !data.available) {
        valueEl.textContent = '—';
        pill.title = data && data.error
          ? `OpenRouter credits unavailable: ${data.error}`
          : 'OpenRouter credits unavailable';
        return;
      }

      const remaining = Number(data.remaining);
      valueEl.textContent = `${formatUsd(remaining)} left`;
      const inr = Number(data.remainingInr);
      const inrText = Number.isFinite(inr)
        ? ` (≈ ₹${inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })})`
        : '';
      pill.title = `OpenRouter credits remaining: ${formatUsd(remaining)}${inrText}`;

      if (remaining <= 0) {
        pill.classList.add('or-credits-pill--empty');
      } else if (remaining < LOW_BALANCE_USD) {
        pill.classList.add('or-credits-pill--low');
      }
    }

    function refreshCredits() {
      fetch('/api/openrouter-credits')
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            applyCredits(data || { available: false, error: res.statusText });
            return;
          }
          applyCredits(data);
        })
        .catch(() => {
          applyCredits({ available: false, error: 'Network error' });
        });
    }

    refreshCredits();
    window.setInterval(refreshCredits, POLL_MS);
  })();
