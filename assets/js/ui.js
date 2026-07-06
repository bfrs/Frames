(() => {
  // Stars
  const starsEl = document.getElementById('stars');
  if (starsEl) {
    for (let i = 0; i < 80; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      s.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;--lo:${0.1+Math.random()*0.3};--hi:${0.6+Math.random()*0.4};--d:${1.5+Math.random()*3}s;--delay:${Math.random()*4}s;width:${1+Math.random()*2}px;height:${1+Math.random()*2}px`;
      starsEl.appendChild(s);
    }
  }

  // CTA Toggle
  const toggleBtn = document.getElementById('ctaToggleBtn');
  const formWrap = document.getElementById('creatorFormWrap');
  const chevron = document.getElementById('bounceChevron');
  if (toggleBtn && formWrap) {
    toggleBtn.addEventListener('click', () => {
      const open = formWrap.classList.toggle('is-open');
      toggleBtn.classList.toggle('is-open', open);
      toggleBtn.textContent = open ? '✕ Close Creator' : '✨ Create Your Reel';
      if (chevron) chevron.style.display = open ? 'none' : '';
      if (open) formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Gallery ──────────────────────────────────────────────────────────────
  const MODEL_META = {
    'x-ai/grok-imagine-video':   { display: 'Grok Video',   accent: '#818cf8', bg: 'linear-gradient(155deg,#0c1445 0%,#060a14 100%)' },
    'google/veo-3.1':            { display: 'Veo 3.1',      accent: '#22d3a0', bg: 'linear-gradient(155deg,#064e3b 0%,#0a1628 100%)' },
    'bytedance/seedance-2.0':    { display: 'Seedance 2.0', accent: '#a855f7', bg: 'linear-gradient(155deg,#3b0764 0%,#1a0a2e 100%)' },
    'alibaba/wan-2.7':           { display: 'Wan 2.7',      accent: '#f59e0b', bg: 'linear-gradient(155deg,#78350f 0%,#1c1107 100%)' },
  };

  const STORAGE_KEY = 'vgi_gallery_v1';
  let libraryItems = [];

  function loadSavedItems() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }
  function persistSavedItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function modelMeta(modelId) {
    return MODEL_META[modelId] || {
      display: modelId || 'Unknown',
      accent: '#22d3a0',
      bg: 'linear-gradient(155deg,#0c1445 0%,#060a14 100%)',
    };
  }

  function galleryAssetUrl(src) {
    if (!src) return '';
    if (src.startsWith('http')) return src;
    return src.replace(/^\//, '').split('/').map(encodeURIComponent).join('/');
  }

  function normalizeGalleryItem(item) {
    const meta = modelMeta(item.modelId);
    return {
      ...item,
      model: item.model || meta.display,
      bg: item.bg || meta.bg,
      accent: item.accent || meta.accent,
      videoSrc: galleryAssetUrl(item.src),
    };
  }

  async function refreshLibraryItems() {
    try {
      const response = await fetch('/api/gallery');
      if (!response.ok) return;
      const data = await response.json();
      libraryItems = (Array.isArray(data.items) ? data.items : []).map(normalizeGalleryItem);
    } catch {
      libraryItems = [];
    }
  }

  const pillsEl = document.getElementById('galleryFilterPills');
  const gridEl  = document.getElementById('galleryGrid');

  const MODEL_ORDER = ['All', 'Grok Video', 'Veo 3.1', 'Seedance 2.0', 'Wan 2.7'];
  let activeFilter = 'All';

  if (pillsEl) {
    MODEL_ORDER.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'filter-pill' + (m === 'All' ? ' active' : '');
      btn.textContent = m;
      btn.addEventListener('click', () => {
        activeFilter = m;
        pillsEl.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.textContent === m));
        renderGallery();
      });
      pillsEl.appendChild(btn);
    });
  }

  function allItems() {
    const saved = loadSavedItems().map(normalizeGalleryItem);
    return [...saved, ...libraryItems];
  }

  function renderGallery() {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    const items = allItems();
    const filtered = activeFilter === 'All' ? items : items.filter(v => v.model === activeFilter);

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'reel-card';
      card.style.background = item.bg;

      const hasLongPrompt = item.prompt && item.prompt.length > 160;
      const promptHtml = item.prompt
        ? `<div class="reel-overlay-prompt-wrap">
             <p class="reel-overlay-prompt" data-full="${item.prompt.replace(/"/g, '&quot;')}" data-expanded="false">${item.prompt.slice(0, 160)}${hasLongPrompt ? '…' : ''}</p>
             <div class="reel-overlay-prompt-actions">
               ${hasLongPrompt ? `<button class="reel-prompt-toggle" type="button">See more</button>` : ''}
               <button class="reel-prompt-copy" type="button" data-prompt="${item.prompt.replace(/"/g, '&quot;')}" title="Copy prompt">
                 <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                   <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
                   <path d="M3 11H2.5A1.5 1.5 0 0 1 1 9.5v-7A1.5 1.5 0 0 1 2.5 1h7A1.5 1.5 0 0 1 11 2.5V3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                 </svg>
                 <span>Copy</span>
               </button>
             </div>
           </div>`
        : '';

      const generatedBadge = item.saved
        ? `<span class="reel-saved-tag">Your Reel</span>`
        : '';

      card.innerHTML = `
        <video src="${item.videoSrc}" loop muted playsinline preload="none"></video>
        <div class="reel-overlay">
          <div class="reel-overlay-top">
            <span class="reel-model-badge" style="border-color:${item.accent};color:${item.accent}">${item.model}</span>
            ${generatedBadge}
            <button class="reel-fullscreen-btn" type="button" title="View fullscreen">
              <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12">
                <path d="M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          ${promptHtml}
        </div>`;

      gridEl.appendChild(card);
    });

    // Autoplay via IntersectionObserver
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const vid = e.target.querySelector('video');
        if (!vid) return;
        if (e.isIntersecting) vid.play().catch(() => {});
        else { vid.pause(); vid.currentTime = 0; }
      });
    }, { threshold: 0.4 });
    gridEl.querySelectorAll('.reel-card').forEach(c => obs.observe(c));
  }

  function requestCardFullscreen(video) {
    if (!video) return;
    const request = video.requestFullscreen
      || video.webkitRequestFullscreen
      || video.webkitEnterFullscreen; // iOS Safari — has its own native controls
    if (request) request.call(video);
  }

  function syncFullscreenControls() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    document.querySelectorAll('.reel-card video').forEach(v => {
      const isFullscreen = v === fsEl;
      v.controls = isFullscreen;
      if (!isFullscreen) v.muted = true; // re-mute preview clips on exit / when another card goes fullscreen
    });
  }
  document.addEventListener('fullscreenchange', syncFullscreenControls);
  document.addEventListener('webkitfullscreenchange', syncFullscreenControls);

  if (gridEl) {
    gridEl.addEventListener('click', e => {
      const fsBtn = e.target.closest('.reel-fullscreen-btn');
      if (fsBtn) {
        e.stopPropagation();
        requestCardFullscreen(fsBtn.closest('.reel-card').querySelector('video'));
        return;
      }
      const toggleBtn = e.target.closest('.reel-prompt-toggle');
      if (toggleBtn) {
        e.stopPropagation();
        const p = toggleBtn.closest('.reel-overlay-prompt-wrap').querySelector('.reel-overlay-prompt');
        const expanded = p.dataset.expanded === 'true';
        if (expanded) {
          const full = p.dataset.full;
          p.textContent = full.slice(0, 160) + (full.length > 160 ? '…' : '');
          p.dataset.expanded = 'false';
          toggleBtn.textContent = 'See more';
        } else {
          p.textContent = p.dataset.full;
          p.dataset.expanded = 'true';
          toggleBtn.textContent = 'See less';
        }
        return;
      }
      const copyBtn = e.target.closest('.reel-prompt-copy');
      if (copyBtn) {
        e.stopPropagation();
        navigator.clipboard.writeText(copyBtn.dataset.prompt).then(() => {
          const label = copyBtn.querySelector('span');
          const orig = label.textContent;
          label.textContent = 'Copied!';
          setTimeout(() => { label.textContent = orig; }, 1800);
        }).catch(() => {});
      }
    });
  }

  async function initGallery() {
    await refreshLibraryItems();
    renderGallery();
  }

  initGallery();

  const MODEL_TEMPLATES = [
    {
      model: 'x-ai/grok-imagine-video',
      icon: '⚡',
      color: '#818cf8',
      cardBg: 'linear-gradient(135deg,#0c1445 0%,#1e1b4b 100%)',
      tagline: 'Fast & Punchy · 1–10s',
      desc: 'Fast, cost-efficient clips. Excels at motion direction, one clear camera move, and native audio from explicit sound cues.',
      prompts: [
        { label: 'Text-to-Video', text: `MODEL STRENGTHS: Fast, cost-efficient clips (1–10s). Excels at motion direction, one clear camera move, and native audio from explicit sound cues. Best for punchy product hooks and lifestyle micro-beats.

STRUCTURE (front-load the primary action — Grok weights the opening heavily):
[Subject + single action in first 15 words: e.g., A hand lifts matte-black wireless headphones and rotates them slowly to catch rim light]

[Camera — one move only: slow orbital dolly, gentle push-in, handheld tracking, or static hold]

[Setting + atmosphere: e.g., Minimalist marble surface, golden-hour backlight, shallow depth of field]

[Audio — always explicit: Ambient: quiet room tone. SFX: soft hinge click. Avoid vague "cinematic music".]

[Style close: Photorealistic product commercial, natural physics, stable motion, no distortion]

AVOID: Stacked conflicting camera moves, multiple simultaneous actions, dialogue-heavy lip-sync scenes, prompts over ~80 words.` },
        { label: 'Image-to-Video', text: `MODE: Reference-to-video (up to 7 reference images guide product identity — NOT first-frame animation). The stills already define look, composition, and palette. Prompt only motion, camera, atmosphere, and audio.

MODEL STRENGTHS: Best-in-class motion adherence from strong product stills. Multi-reference support — assign roles when several images are attached.

REFERENCE ROLES (use in prompt):
Image 1 = hero product (exact shape, color, logo, materials — lock identity here)
Image 2+ = alternate angle, packaging detail, or lifestyle context reference

STRUCTURE:
[Open with motion verb: e.g., Product surges upward in slow motion as LED indicators pulse rhythmically]

[Camera — one coherent path: slow orbit, push-in to macro, or "camera not moving" for static hero holds]

[Atmosphere shift only: e.g., Rim light intensifies, soft haze in backlight, reflection sweep across metal]

[Audio: Restrained metallic click, quiet studio ambience]

[Preservation close: Keep product label, logo, proportions, and materials exactly as in Image 1 — no alteration]

AVOID: Redescribing what the reference already shows, contradictory camera moves, expecting reliable scripted dialogue/lip-sync, long prompts (keep 30–60 words).` },
      ],
    },
    {
      model: 'google/veo-3.1',
      icon: '🎬',
      color: '#4ade80',
      cardBg: 'linear-gradient(135deg,#052e16 0%,#0a1a10 100%)',
      tagline: 'Cinematic Fidelity · Fixed 8s',
      desc: 'Maximum visual fidelity + native synchronized audio (dialogue, SFX, ambient). Leads with professional cinematography language.',
      prompts: [
        { label: 'Text-to-Video', text: `MODEL STRENGTHS: Maximum visual fidelity + native synchronized audio (dialogue, SFX, ambient). Leads with professional cinematography language. Natural physics. Fixed 8s — plan one cohesive 8-second arc or 2–3 timestamped beats.

STRUCTURE — Google's formula, cinematography FIRST:
[Cinematography: e.g., Slow tracking shot, medium close-up, shallow depth of field, 35mm lens, gentle push-in]

[Subject: e.g., A woman in a cream blazer presenting matte-black wireless headphones]

[Action — physically plausible, single arc: e.g., She walks through a sunlit boutique, opens the case, lifts headphones with a gentle turn to show ear cups]

[Context/Setting: e.g., Upscale retail interior, warm wood shelving, morning light through floor-to-ceiling windows]

[Style & Ambiance: Premium lifestyle commercial, golden-hour warmth, soft key from camera left, subtle film grain]

[Audio — Veo's standout feature; be deliberate]
Dialogue: A woman says, "These sound incredible."
SFX: SFX: case latch clicks softly.
Ambient: Ambient noise: quiet boutique murmur, soft footsteps on marble.

[Quality: Photorealistic, stable motion, cinematic color grading, no distortion]

AVOID: Vague audio, unrealistic physics, abstract camera terms ("nice shot"), more than one complex camera move per beat.` },
        { label: 'Image-to-Video', text: `MODE: Reference-to-video (reference images guide product/object/style consistency). Do not contradict what references establish — direct motion and transformation only.

MODEL STRENGTHS: Strong prompt adherence with references, native synced audio, cinematic camera control, natural material physics. 8s fixed — one continuous hero arc works best.

REFERENCE ROLES:
Image 1 = hero product identity (shape, color, logo, textures — maintain 100%)
Image 2+ = style, environment, or secondary angle guidance

STRUCTURE:
[Cinematography: e.g., Slow orbital dolly around hero product, then gentle push-in to macro on textures. One camera path per beat.]

[Motion — realistic only: e.g., Product rotates on pedestal, LED ring pulses; hand enters to lift naturally]

[Lighting evolution: e.g., Volumetric light sweeps surface, reflections shift on metallic accents, bokeh deepens]

[Audio]
SFX: soft feature-activation click. Ambient: quiet studio room tone. Dialogue in quotes only if essential.

[Consistency close: Exact product shape, color, logo, materials from reference — no distortion]

AVOID: Re-describing reference appearance, contradicting reference composition, omitting audio cues, impossible physics.` },
      ],
    },
    {
      model: 'bytedance/seedance-2.0',
      icon: '🎞️',
      color: '#a855f7',
      cardBg: 'linear-gradient(135deg,#2e1065 0%,#1a0a2e 100%)',
      tagline: 'Multi-Shot Narratives · 4–15s',
      desc: 'Multi-shot narratives with native audio+video in one pass, strong camera choreography. Ideal for full product ad arcs with dialogue.',
      prompts: [
        { label: 'Text-to-Video', text: `MODEL STRENGTHS: Multi-shot narratives (4–15s), native audio+video in one pass, strong camera choreography. Ideal for full product ad arcs with dialogue and cut transitions.

STRUCTURE — director's shot brief with explicit shot labels:
Shot 1 [0-3s]: [Subject + one action]. [Camera: one move, e.g., slow dolly-in]. [Setting]. [Audio/SFX].
Cut to Shot 2 [3-7s]: [Next beat]. [Camera: e.g., medium shot]. [Environment shift]. [Dialogue in double quotes: "Key message"].
Cut to Shot 3 [7-12s]: [Lifestyle/hero reveal]. [Camera]. [Mood].

[Subject anchor: e.g., Premium matte-black wireless headphones with metallic accents and LED ring]

[Style & Lighting: ARRI Alexa / 35mm commercial look, soft key + rim, rich color grade]

[Constraints — no negative-prompt API; ban explicitly at end]
No subtitles, no watermark, no unrequested on-screen text, stable product proportions, realistic physics, no face drift

AVOID: Multiple camera moves in one shot, long monologues (lip-sync drifts), vague "cinematic" without specifics.` },
        { label: 'Image-to-Video', text: `MODE: Multimodal reference-to-video. Use @image1 / @image2 syntax — references carry identity; text carries motion, shots, and audio.

MODEL STRENGTHS: Best for preserving character/product/style from references across multi-shot ads. Native lip-synced dialogue, SFX, and music. Excels at 8–15s cinematic product commercials.

REFERENCE BINDING (critical):
@image1 = hero product — exact shape, color, logo, materials (do NOT re-describe appearance in prose)
@image2+ = alternate angle, packaging, lifestyle mood, or environment reference

STRUCTURE:
@image1 is the hero product. Maintain 100% visual consistency — no distortion, no deformation.

Shot 1 [0-4s]: @image1 floats and rotates slowly in minimalist studio. Camera: slow orbit. SFX: <soft electronic hum>.
Cut to Shot 2 [4-8s]: Hand enters to lift @image1, LED features activate. Camera: push-in to macro. Ambient studio tone.
Cut to Shot 3 [8-12s]: Lifestyle context — person enjoying product in golden-hour city street. Camera: medium tracking. Dialogue: "Key message here".

[Lighting/Mood: Premium commercial, volumetric highlights, aspirational high-end feel]

[Style: Photorealistic, ARRI Alexa look, ultra-sharp textures, stable motion, professional ad quality]

[Constraints: No subtitles, no watermark, no text artifacts unless specified, no face drift]

AVOID: Paragraphs re-describing @image1 appearance, more than one camera move per shot, forgetting constraint bans.` },
      ],
    },
    {
      model: 'alibaba/wan-2.7',
      icon: '🌊',
      color: '#22d3a0',
      cardBg: 'linear-gradient(135deg,#022c22 0%,#0a1628 100%)',
      tagline: 'Flexible & Fluid · 2–10s',
      desc: 'Flexible 2–10s clips, native audio, strong commercial/product output. Multi-shot via natural-language timestamps.',
      prompts: [
        { label: 'Text-to-Video', text: `MODEL STRENGTHS: Flexible 2–10s clips, native audio, strong commercial/product category output. Multi-shot via natural-language timestamps. Entity + motion clarity.

STRUCTURE — Alibaba advanced formula:
[Shot plan (optional): Shot 1 [0-3s] hero reveal | Shot 2 [3-6s] feature demo | Shot 3 [6-10s] lifestyle]

[Entity: e.g., Premium matte-black over-ear headphones with metallic hinge and LED ring]

[Scene: e.g., Minimalist product studio with controlled reflections, or aspirational lifestyle setting]

[Motion — always explicit with speed: e.g., Headphones rotate 360° slowly, LED pulses in rhythm, light sweeps ear cushions]

[Camera: e.g., Slow push-in to macro, then pull back to medium. Use "fixed camera" if stationary.]

[Aesthetic: Commercial product lighting, shallow DOF, luxury ad tone, cinematic color grade]

[Audio (optional): Ambient studio hum, soft electronic tone on activation, subtle whoosh on motion]

AVOID: Static image descriptions with no motion, vague pacing, overloading 10s with too many beats.` },
        { label: 'Image-to-Video', text: `MODE: Reference-to-video (Image 1 / Image 2 syntax). References define entity, scene, and style — prompt = Motion + Camera + optional audio only.

MODEL STRENGTHS: Excellent at animating product references with controlled motion and camera. Native audio. Timestamped multi-shot in natural language.

REFERENCE BINDING:
Image 1 = hero product identity (lock shape, color, logo, materials)
Image 2+ = secondary angle, environment, or style reference

STRUCTURE (official i2v formula — motion-first):
Image 1 provides exact product appearance. Do not re-describe it.

[Motion: e.g., Product tilts forward revealing logo; light glides across surface; hand enters to lift with natural movement — use "slowly", "gradually", "smoothly"]

[Camera: Fixed camera OR slow push-in OR gentle orbit — one instruction per beat]

[Shot timing (optional): Shot 1 [0-4s] slow rotation | Shot 2 [4-8s] lifestyle pull-back]

[Atmosphere shift: e.g., Rim light intensifies, reflections move across metal, bokeh shifts]

[Audio: Ambient studio hum, soft activation tone]

[Consistency: Preserve exact product identity from Image 1 — no distortion]

AVOID: Re-describing the uploaded image, static scene prose without motion, complex hand-object manipulation.` },
      ],
    },
  ];

  const templatesGrid = document.getElementById('templatesGrid');
  if (templatesGrid) {
    const tabRow = document.createElement('div');
    tabRow.className = 'recipe-tabs';

    const panels = [];

    MODEL_TEMPLATES.forEach((t, i) => {
      // Tab button
      const tab = document.createElement('button');
      tab.className = 'recipe-tab' + (i === 0 ? ' active' : '');
      tab.style.setProperty('--tab-color', t.color);
      tab.innerHTML = `<span class="recipe-tab-icon">${t.icon}</span><span class="recipe-tab-name">${t.model.split('/')[1] || t.model}</span>`;
      tabRow.appendChild(tab);

      // Panel
      const panel = document.createElement('div');
      panel.className = 'recipe-panel' + (i === 0 ? ' active' : '');

      const cardsHtml = t.prompts.map(p => `
        <div class="recipe-card">
          <div class="recipe-card-header">
            <span class="recipe-card-label" style="color:${t.color}">${p.label}</span>
            <button class="recipe-copy-btn" data-text="${p.text.replace(/"/g, '&quot;')}">Copy</button>
          </div>
          <div class="recipe-card-body">
            <pre class="recipe-text">${p.text.trim()}</pre>
          </div>
        </div>`).join('');

      panel.innerHTML = `
        <div class="recipe-model-header" style="border-color:${t.color}22">
          <div class="recipe-model-icon" style="border-color:${t.color}55;background:${t.color}11">${t.icon}</div>
          <div>
            <div class="recipe-model-name" style="color:${t.color}">${t.model}</div>
            <div class="recipe-model-tagline">${t.tagline}</div>
            <div class="recipe-model-desc">${t.desc}</div>
          </div>
        </div>
        <div class="recipe-cards">${cardsHtml}</div>`;

      panels.push({ tab, panel });
      templatesGrid.appendChild(panel);

      tab.addEventListener('click', () => {
        panels.forEach(({ tab: tb, panel: pn }) => {
          tb.classList.remove('active');
          pn.classList.remove('active');
        });
        tab.classList.add('active');
        panel.classList.add('active');
      });
    });

    templatesGrid.insertBefore(tabRow, templatesGrid.firstChild);

    // Wire copy buttons
    templatesGrid.addEventListener('click', e => {
      const btn = e.target.closest('.recipe-copy-btn');
      if (!btn) return;
      navigator.clipboard.writeText(btn.dataset.text).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1800);
      }).catch(() => {});
    });
  }
})();
