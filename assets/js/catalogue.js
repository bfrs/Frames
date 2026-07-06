// MP4 entries in assets/videos/ — { filename, model } per reel
const CATALOGUE_VIDEOS = [
  {'filename': '0cDxckXcBXm9wR7QV35R.mp4', 'model': 'groq'},
  {'filename': 'aoCpQwvGz9199vP7ZtpP.mp4', 'model': 'groq'},
  {'filename': 'bytedance: seedance-2.0 output_ad_video (1).mp4', 'model': 'seedance 2.0'},
  {'filename': 'M9pi4Mt4eZylkoIjZNsM.mp4', 'model': 'vio 3.1'},
  {'filename': 'NtTtQUxXrtfdV2TMy0Kv.mp4', 'model': ''},
  {'filename': 'OYkXs8XBcL8ECMTBpvEf.mp4', 'model': ''},
  {'filename': 'T8Ui4doauNv1p0lHK88m.mp4', 'model': ''},
  {'filename': 'UxhSWdlCwrTOhyGGUsmb.mp4', 'model': ''},
  {'filename': 'x-ai: grok-imagine-video output_ad_vid 10sec $.706 Multi image prompt.mp4', 'model': ''},
  {'filename': 'x-ai: grok-imagine-video output_ad_video (1).mp4', 'model': ''},
  {'filename': 'x-ai: grok-imagine-video output_ad_video (3).mp4', 'model': ''},
  // 'Meta - Evil Eye Anklet_Preview_1080x1920_(SRAP39).mp4',
  // 'Meta - Face Serum - Problem - Solving 1080x1350 (SRA1105).mp4',
  // 'Meta - Skincare with winter vibes_1080x1350 (SRA1039).mp4',
];

(function initCatalogue() {
  const listEl = document.getElementById('catalogueList');
  if (!listEl) return;

  const videos = CATALOGUE_VIDEOS.slice();
  for (let i = videos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [videos[i], videos[j]] = [videos[j], videos[i]];
  }

  videos.forEach(({ filename, model }, index) => {
    const item = document.createElement('article');
    item.className = 'catalogue-item';

    const video = document.createElement('video');
    video.src = 'assets/videos/' + encodeURIComponent(filename);
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'metadata';
    const label = model
      ? 'Sample reel ' + (index + 1) + ' (' + model + ')'
      : 'Sample reel ' + (index + 1);
    video.setAttribute('aria-label', label);
    video.addEventListener('loadedmetadata', () => {
      if (video.videoWidth && video.videoHeight) {
        item.style.aspectRatio = video.videoWidth + ' / ' + video.videoHeight;
      }
    });

    item.appendChild(video);

    if (model) {
      const badge = document.createElement('span');
      badge.className = 'catalogue-item-model';
      badge.textContent = model;
      item.appendChild(badge);
    }

    listEl.appendChild(item);
  });

  const scrollEl = listEl.closest('.catalogue-scroll');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target.querySelector('video');
        if (!video) return;
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    },
    { root: scrollEl || null, threshold: 0.35 }
  );

  listEl.querySelectorAll('.catalogue-item').forEach((item) => observer.observe(item));
})();
