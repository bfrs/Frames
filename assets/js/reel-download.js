/**
 * MP4 + generation-details (.txt) download bundle for completed reels.
 */
(function (global) {
  let lastBundle = null;
  let lastSteerawayScenes = '';
  let lastGeneratedPrompt = null;

  let formatOptions = [];
  let getDurationSec = () => 15;
  let formatInrCost = (value) => String(value ?? '—');

  function configure(options) {
    if (options && Array.isArray(options.formatOptions)) {
      formatOptions = options.formatOptions;
    }
    if (options && typeof options.getDurationSec === 'function') {
      getDurationSec = options.getDurationSec;
    }
    if (options && typeof options.formatInrCost === 'function') {
      formatInrCost = options.formatInrCost;
    }
  }

  function sanitizeDownloadBaseName(name) {
    const raw = String(name || '').trim();
    if (!raw) {
      return `reel-draft-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
    }
    const cleaned = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return cleaned || `reel-draft-${Date.now()}`;
  }

  function collectCampaignSpecs() {
    const productNameInput = document.getElementById('productNameInput');
    const keyMessageInput = document.getElementById('keyMessageInput');
    const initialPromptInput = document.getElementById('initialPromptInput');
    const formatSelect = document.getElementById('formatSelect');
    const modelSelect = document.getElementById('videoModelSelect');
    const activeChip = document.querySelector('.panel-product .chip.active-chip[data-style]');
    const formatKey = formatSelect ? formatSelect.value : '';
    const formatOpt = formatOptions.find((opt) => opt.key === formatKey);
    const files = typeof global.getProductImageFiles === 'function'
      ? global.getProductImageFiles()
      : [];

    return {
      productName: productNameInput ? productNameInput.value.trim() : '',
      keyMessage: keyMessageInput ? keyMessageInput.value.trim() : '',
      initialPrompt: initialPromptInput ? initialPromptInput.value.trim() : '',
      style: activeChip ? activeChip.textContent.trim() : '',
      duration: getDurationSec(),
      videoModel: modelSelect && modelSelect.value ? modelSelect.value : '',
      format: formatOpt ? formatOpt.label : formatKey,
      aspectRatio: formatOpt ? formatOpt.aspect_ratio : '',
      referenceImages: files.map((file) => file.name),
      imageCount: files.length,
    };
  }

  function buildBundlePayload({ videoUrl, prompt, jobId, cost, duration }) {
    const specs = collectCampaignSpecs();
    if (duration != null) {
      specs.duration = duration;
    }
    return {
      videoUrl,
      prompt,
      baseName: specs.productName,
      steerawayScenes: lastSteerawayScenes,
      specs,
      generatedAt: new Date().toISOString(),
      videoModel: specs.videoModel,
      format: specs.format,
      aspectRatio: specs.aspectRatio,
      duration: specs.duration,
      cost: cost ?? null,
      jobId: jobId || '',
      promptManuallyEdited: (
        lastGeneratedPrompt != null
        && String(prompt || '').trim() !== String(lastGeneratedPrompt).trim()
      ),
    };
  }

  function storeBundle(bundle) {
    lastBundle = {
      videoUrl: bundle.videoUrl,
      prompt: String(bundle.prompt || '').trim(),
      baseName: sanitizeDownloadBaseName(bundle.baseName),
      steerawayScenes: String(bundle.steerawayScenes || '').trim(),
      specs: bundle.specs || {},
      generatedAt: bundle.generatedAt || new Date().toISOString(),
      videoModel: bundle.videoModel || '',
      format: bundle.format || '',
      aspectRatio: bundle.aspectRatio || '',
      duration: bundle.duration ?? null,
      cost: bundle.cost ?? null,
      jobId: bundle.jobId || '',
      promptManuallyEdited: Boolean(bundle.promptManuallyEdited),
    };
  }

  function buildBundleDocument(bundle) {
    const lines = [];
    const rule = '='.repeat(72);

    const section = (title) => {
      lines.push('');
      lines.push(rule);
      lines.push(title);
      lines.push(rule);
    };

    section('PROMPT-TO-REEL LAB — GENERATION RECORD');
    lines.push(`Generated at: ${bundle.generatedAt || ''}`);
    if (bundle.videoModel) lines.push(`Video model: ${bundle.videoModel}`);
    if (bundle.format) lines.push(`Format: ${bundle.format}`);
    if (bundle.aspectRatio) lines.push(`Aspect ratio: ${bundle.aspectRatio}`);
    if (bundle.duration != null) lines.push(`Duration: ${bundle.duration} seconds`);
    if (bundle.cost != null) lines.push(`API cost (INR): ${formatInrCost(bundle.cost)}`);
    if (bundle.jobId) lines.push(`Job ID: ${bundle.jobId}`);
    if (bundle.videoUrl) lines.push(`Video source: ${bundle.videoUrl}`);

    section('CAMPAIGN SPECIFICATIONS (USER-SELECTED)');
    const specs = bundle.specs || {};
    const specEntries = [
      ['Product name', specs.productName],
      ['Style / aesthetic', specs.style],
      ['Key message', specs.keyMessage],
      ['Initial prompt', specs.initialPrompt],
      ['Call to action', specs.cta],
      ['Duration (seconds)', specs.duration != null ? String(specs.duration) : ''],
      ['Video model', specs.videoModel],
      ['Format', specs.format],
      ['Aspect ratio', specs.aspectRatio],
      ['Reference image count', specs.imageCount != null ? String(specs.imageCount) : ''],
    ];
    specEntries.forEach(([label, value]) => {
      if (value != null && String(value).trim()) {
        lines.push(`${label}: ${String(value).trim()}`);
      }
    });
    if (Array.isArray(specs.referenceImages) && specs.referenceImages.length) {
      lines.push(`Reference images: ${specs.referenceImages.join(', ')}`);
    }

    section('STEERAWAY SCENES (FAILURE RISKS TO AVOID)');
    if (bundle.steerawayScenes) {
      lines.push(bundle.steerawayScenes);
    } else {
      lines.push(
        '(Not available — prompt was typed manually or steeraway analysis was not run.)'
      );
    }

    section('VIDEO GENERATION PROMPT');
    lines.push(bundle.prompt || '');
    if (bundle.promptManuallyEdited) {
      lines.push('');
      lines.push(
        'Note: This prompt was edited manually after the last API-generated version.'
      );
    }

    lines.push('');
    return lines.join('\n');
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setVisible(visible) {
    const action = document.getElementById('reelDownloadAction');
    if (action) action.hidden = !visible;
  }

  function clear() {
    lastBundle = null;
  }

  function recordPromptGeneration({ prompt, steerawayScenes }) {
    lastGeneratedPrompt = String(prompt || '').trim();
    lastSteerawayScenes = String(steerawayScenes || '').trim();
  }

  function storeGeneration({ videoUrl, prompt, jobId, cost, duration }) {
    storeBundle(buildBundlePayload({ videoUrl, prompt, jobId, cost, duration }));
  }

  async function download() {
    if (!lastBundle?.videoUrl || !lastBundle.prompt) return;

    const btn = document.getElementById('downloadReelBtn');
    const label = btn ? btn.querySelector('.btn-dl-label') : null;
    const originalLabel = label ? label.textContent : '';

    if (btn) btn.disabled = true;
    if (label) label.textContent = 'Downloading…';

    try {
      const { videoUrl, baseName } = lastBundle;
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error('Could not fetch the generated video');
      }

      const videoBlob = await response.blob();
      triggerBlobDownload(videoBlob, `${baseName}.mp4`);

      await new Promise((resolve) => global.setTimeout(resolve, 300));

      const detailsText = buildBundleDocument(lastBundle);
      const detailsBlob = new Blob([detailsText], { type: 'text/plain;charset=utf-8' });
      triggerBlobDownload(detailsBlob, `${baseName}.txt`);
    } catch (err) {
      const message = err && err.message ? err.message : 'Download failed';
      global.alert(message);
    } finally {
      if (label) label.textContent = originalLabel || 'Download MP4 + Details';
      if (btn) btn.disabled = false;
    }
  }

  function initButton() {
    const btn = document.getElementById('downloadReelBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      download();
    });
  }

  global.ReelDownload = {
    configure,
    clear,
    setVisible,
    recordPromptGeneration,
    storeGeneration,
    download,
    initButton,
  };
})(window);
