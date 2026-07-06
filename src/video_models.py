from typing import Any

DEFAULT_PROMPT_TEMPLATE_T2V = (
    "Describe the scene shot-by-shot: [subject and primary action] in [setting], "
    "[camera movement], [lighting and atmosphere], [mood and style]. "
    "End with quality boosters (photorealism, stable motion, no distortion)."
)
DEFAULT_PROMPT_TEMPLATE_I2V = (
    "Use the reference image(s) for exact subject appearance. "
    "Describe [primary action and motion], [camera movement], "
    "[lighting/atmosphere changes], [style notes]. "
    "Maintain 100% visual consistency with the reference."
)


def video_model_entry(model_name: str | None = None) -> dict[str, Any]:
    """Return the catalog entry for model_name, or the first model as default."""
    if model_name:
        name = model_name.strip()
        for entry in VIDEO_MODELS:
            if entry.get("model_name") == name:
                return entry
    return VIDEO_MODELS[0]


def resolve_video_model_name(model_name: str | None = None) -> str:
    return str(video_model_entry(model_name).get("model_name", ""))


def ideal_prompt_template(model_name: str | None, *, is_i2v: bool) -> str:
    """Prompt structure guide for the model and task type (t2v vs i2v)."""
    entry = video_model_entry(model_name)
    key = "ideal_prompt_template-i2v" if is_i2v else "ideal_prompt_template-t2v"
    raw = entry.get(key, "")
    template = str(raw).strip() if raw is not None else ""
    if template:
        return template
    return DEFAULT_PROMPT_TEMPLATE_I2V if is_i2v else DEFAULT_PROMPT_TEMPLATE_T2V


VIDEO_MODELS: list[dict[str, Any]] = [
    {
        "model_name": "bytedance/seedance-2.0",
        "price_per_sec": 16,
        "price_per_image": 0,
        "durations": [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        "aspect_ratios": ["1:1", "3:4", "9:16", "4:3", "16:9", "21:9", "9:21"],
        "ideal_prompt_template-t2v": """
            MODEL STRENGTHS: Multi-shot narratives (4–15s), native audio+video in one pass, strong camera choreography. Ideal for full product ad arcs with dialogue and cut transitions.

            STRUCTURE — director's shot brief with explicit shot labels:
            Shot 1 [0-3s]: [Subject + one action]. [Camera: one move, e.g., slow dolly-in]. [Setting]. [Audio/SFX].
            Cut to Shot 2 [3-7s]: [Next beat]. [Camera: e.g., medium shot]. [Environment shift]. [Dialogue in double quotes: "Key message"].
            Cut to Shot 3 [7-12s]: [Lifestyle/hero reveal]. [Camera]. [Mood].

            [Subject anchor: e.g., Premium matte-black wireless headphones with metallic accents and LED ring]

            [Style & Lighting: ARRI Alexa / 35mm commercial look, soft key + rim, rich color grade]

            [Constraints — no negative-prompt API; ban explicitly at end]
            No subtitles, no watermark, no unrequested on-screen text, stable product proportions, realistic physics, no face drift

            AVOID: Multiple camera moves in one shot, long monologues (lip-sync drifts), vague "cinematic" without specifics.
        """,
        "ideal_prompt_template-i2v": """
            MODE: Multimodal reference-to-video. Use @image1 / @image2 syntax — references carry identity; text carries motion, shots, and audio.

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

            AVOID: Paragraphs re-describing @image1 appearance, more than one camera move per shot, forgetting constraint bans.
        """,
    },
    {
        "model_name": "x-ai/grok-imagine-video",
        "price_per_sec": 5,
        "price_per_image": 0.2,
        "durations": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"],
        "ideal_prompt_template-t2v": """
            MODEL STRENGTHS: Fast, cost-efficient clips (1–10s). Excels at motion direction, one clear camera move, and native audio from explicit sound cues. Best for punchy product hooks and lifestyle micro-beats.

            STRUCTURE (front-load the primary action — Grok weights the opening heavily):
            [Subject + single action in first 15 words: e.g., A hand lifts matte-black wireless headphones and rotates them slowly to catch rim light]

            [Camera — one move only: slow orbital dolly, gentle push-in, handheld tracking, or static hold]

            [Setting + atmosphere: e.g., Minimalist marble surface, golden-hour backlight, shallow depth of field]

            [Audio — always explicit: Ambient: quiet room tone. SFX: soft hinge click. Avoid vague "cinematic music".]

            [Style close: Photorealistic product commercial, natural physics, stable motion, no distortion]

            AVOID: Stacked conflicting camera moves, multiple simultaneous actions, dialogue-heavy lip-sync scenes, prompts over ~80 words.
        """,
        "ideal_prompt_template-i2v": """
            MODE: Reference-to-video (up to 7 reference images guide product identity — NOT first-frame animation). The stills already define look, composition, and palette. Prompt only motion, camera, atmosphere, and audio.

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

            AVOID: Redescribing what the reference already shows, contradictory camera moves, expecting reliable scripted dialogue/lip-sync, long prompts (keep 30–60 words).
        """,
    },
    {
        "model_name": "google/veo-3.1",
        "price_per_sec": 20,
        "price_per_image": 0,
        "durations": [8],
        "aspect_ratios": ["16:9", "9:16"],
        "ideal_prompt_template-t2v": """
            MODEL STRENGTHS: Maximum visual fidelity + native synchronized audio (dialogue, SFX, ambient). Leads with professional cinematography language. Natural physics. Fixed 8s — plan one cohesive 8-second arc or 2–3 timestamped beats.

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

            AVOID: Vague audio, unrealistic physics, abstract camera terms ("nice shot"), more than one complex camera move per beat.
        """,
        "ideal_prompt_template-i2v": """
            MODE: Reference-to-video (reference images guide product/object/style consistency). Do not contradict what references establish — direct motion and transformation only.

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

            AVOID: Re-describing reference appearance, contradicting reference composition, omitting audio cues, impossible physics.
        """,
    },
    {
        "model_name": "alibaba/wan-2.7",
        "price_per_sec": 10,
        "price_per_image": 0,
        "durations": [2, 3, 4, 5, 6, 7, 8, 9, 10],
        "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4"],
        "ideal_prompt_template-t2v": """
            MODEL STRENGTHS: Flexible 2–10s clips, native audio, strong commercial/product category output. Multi-shot via natural-language timestamps. Entity + motion clarity.

            STRUCTURE — Alibaba advanced formula:
            [Shot plan (optional): Shot 1 [0-3s] hero reveal | Shot 2 [3-6s] feature demo | Shot 3 [6-10s] lifestyle]

            [Entity: e.g., Premium matte-black over-ear headphones with metallic hinge and LED ring]

            [Scene: e.g., Minimalist product studio with controlled reflections, or aspirational lifestyle setting]

            [Motion — always explicit with speed: e.g., Headphones rotate 360° slowly, LED pulses in rhythm, light sweeps ear cushions]

            [Camera: e.g., Slow push-in to macro, then pull back to medium. Use "fixed camera" if stationary.]

            [Aesthetic: Commercial product lighting, shallow DOF, luxury ad tone, cinematic color grade]

            [Audio (optional): Ambient studio hum, soft electronic tone on activation, subtle whoosh on motion]

            AVOID: Static image descriptions with no motion, vague pacing, overloading 10s with too many beats.
        """,
        "ideal_prompt_template-i2v": """
            MODE: Reference-to-video (Image 1 / Image 2 syntax). References define entity, scene, and style — prompt = Motion + Camera + optional audio only.

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

            AVOID: Re-describing the uploaded image, static scene prose without motion, complex hand-object manipulation.
        """,
    },
]
