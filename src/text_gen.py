"""Call OpenRouter chat completions to build a video ad prompt."""

from __future__ import annotations

import base64
import os
from typing import Any

from src.http_client import request as http_request
from src.video_models import ideal_prompt_template, resolve_video_model_name

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_TEXT_GEN_MODEL = "openai/gpt-5.1"
MAX_PROMPT_CHARS = 4000

_STEERAWAY_SYSTEM_PROMPT = """\
You are a specialist in failure modes of AI text-to-video and image-to-video models.

Your job is NOT to write a video prompt. Analyze the campaign specifications and any reference images, then list scenes, plots, actions, and shot types that the target video model would likely fail to render convincingly.

**Target video model:** {model_name}
**Task type:** {task_type}

Video models learn visual patterns, not physics engines. They commonly fail when prompts require:
- Hidden prerequisite steps (e.g. removing a cap before drinking, unwrapping before eating, opening before using)
- Fine hand-object manipulation (unscrewing, pouring, spraying, pumping, spreading, buttoning, threading)
- Correct procedural order across multiple beats within one clip
- Liquid or fluid physics (pouring, splashing, foam, viscosity, drinking through a container)
- Object state persistence (caps, lids, wrappers must not vanish, teleport, or merge with the product)
- Legible on-screen text, exact logos, or kinetic typography with precise spelling
- More than two or three simultaneous interacting entities
- Fast-motion close-ups of faces or hands
- Complex tool use or non-obvious affordances
- Material transformations (cutting, tearing, melting, crushing)
- Weight/mass mismatch (light objects moving like they are heavy, or vice versa)
- Rigid-body collision response (objects passing through each other, no impact reaction)
- Shadow or lighting inconsistency as objects move
- Scale drift over the clip (product or props growing, shrinking, or changing proportion)
- Missing secondary or follow-through motion (cloth, hair, cables not reacting after the primary action stops)

Consider the product category, initial prompt, key message, and reference images. Infer what a naive director might script that would read well on paper but fail in generation.

Part 1 — failure avoidance. For each item output one line:
AVOID: <specific scene or action> | REASON: <brief why> | INSTEAD: <safer creative substitute>

Output 5–12 AVOID items, most relevant to this brief first.

Part 2 — physics grounding for motion you expect the final prompt to keep. Video models pattern-match concrete motion captions, not vague claims like "realistic physics." For each retained beat, describe observable physical behavior: weight and momentum, contact response, how surfaces settle or drape, and secondary motion lag (fabric, hair, cables continuing briefly after the main action stops).

For each item output one line:
GROUND: <beat or subject in motion> | <specific physical descriptors to weave into the prompt>

Output 3–8 GROUND items tied to motion in this brief (product moves, character gestures, camera-stable hero rotations, etc.). Skip beats already eliminated by your AVOID list.

Plain text only — no markdown, no preamble, no summary. AVOID lines first, then GROUND lines.
"""

_SYSTEM_PROMPT_TEMPLATE = """\
You are an expert AI video prompt engineer and cinematic director. Your task is to create the single best possible prompt for a specific video generation model, given its unique optimal prompting style.

    **Model Information:**
    - Model name: [{model_name}]
    - Task type: {task_type}
    - Known optimal prompt structure / best practices: [{prompt_template}]
{steeraway_section}
1. **Key message** — This is the main hook text that must appear on the video. Weave it into the ad creatively (e.g., kinetic typography, end-card, scene-integrated overlay, or a deliberate reveal beat) so it lands clearly without feeling like a cheap banner. Do not omit or paraphrase it away.

2. **Initial prompt** — Use the user's draft as the narrative north star. Refine, expand, and shape the story arc, product demonstration, and shot progression around this direction.

3. **Style** — Reflect this aesthetic throughout: color grading, lighting mood, camera language, environment, and overall production feel must match.

4. **Duration** — The ad must adhere to this time constraint. Structure the prompt as a timed beat sheet or shot sequence that fits within the specified seconds (e.g., hook → product hero → lifestyle moment → on-screen message). Do not describe an ad longer than allowed.

5. **Length limit (hard cap)** — The final prompt must be **at most {max_prompt_chars} characters** total, including spaces and punctuation. The downstream video API rejects longer prompts. Plan for this limit from the start: use tight shot beats, avoid redundant adjectives, and never exceed {max_prompt_chars} characters.

**Additional rules:**
- Keep the product as the hero — describe it faithfully from reference images (exact colors, shape, materials, logos, branding).
- Prioritize visual excellence: camera movement, lighting, textures, depth of field, material details, and atmosphere. Weave in the pre-analyzed physical grounding cues (weight, contact, settle, follow-through) — not vague "realistic physics" tags.
- Use beat-by-beat or shot-by-shot descriptions for motion coherence when appropriate.
- Include explicit reference handling when images are attached (e.g., "@Image1 provides exact product appearance — maintain 100% consistency in shape, color, logo, and details").
- Favor implied use, cutaways, hero product shots, wide/medium framing, and atmospheric lifestyle beats over literal procedural demonstration when steeraway risks apply.
- End with strong quality/consistency boosters (e.g., photorealism, stability, no distortion).
- Output **only** the final, clean video generation prompt — no explanations, labels, markdown, or extra text.
- Before finishing, mentally verify the prompt fits within {max_prompt_chars} characters; if it would run long, compress beats rather than omit the key message or product hero details.
"""

_CONDENSE_PROMPT_SYSTEM = """\
You compress video generation prompts to meet a strict character limit without losing essential creative intent.

Rules:
- Output ONLY the shortened prompt — no labels, markdown, or commentary.
- Preserve: product hero details, key on-screen message, beat structure, camera/lighting cues, concrete physical motion descriptors, reference image handling, and quality boosters.
- Cut filler, redundant adjectives, and repeated ideas first.
- The result must be at most {max_chars} characters.
"""

_STEERAWAY_SECTION_TEMPLATE = """
**Scenes/plots to AVOID (pre-analyzed failure risks for this model and brief):**
{steeraway_scenes}

You MUST NOT describe any AVOID scenario above. Use the INSTEAD directions as inspiration where they preserve campaign intent.
"""

_GROUNDING_SECTION_TEMPLATE = """
**Physical grounding cues (weave into motion beats in the final prompt):**
{physics_grounding}
"""


def _split_preanalysis_response(text: str) -> tuple[str, str]:
    avoid_lines: list[str] = []
    ground_lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("AVOID:"):
            avoid_lines.append(stripped)
        elif stripped.startswith("GROUND:"):
            ground_lines.append(stripped)
    return "\n".join(avoid_lines), "\n".join(ground_lines)


def _build_steeraway_system_prompt(*, video_model: str | None, is_i2v: bool) -> str:
    model_name = resolve_video_model_name(video_model)
    task_type = "image-to-video (i2v)" if is_i2v else "text-to-video (t2v)"
    return _STEERAWAY_SYSTEM_PROMPT.format(model_name=model_name, task_type=task_type)


def _build_system_prompt(
    *,
    video_model: str | None,
    is_i2v: bool,
    steeraway_scenes: str | None = None,
    physics_grounding: str | None = None,
) -> str:
    model_name = resolve_video_model_name(video_model)
    prompt_template = ideal_prompt_template(video_model, is_i2v=is_i2v)
    task_type = "image-to-video (i2v)" if is_i2v else "text-to-video (t2v)"
    indented_template = "\n".join(f"  {line}" for line in prompt_template.splitlines())
    steeraway_section = ""
    if steeraway_scenes and steeraway_scenes.strip():
        steeraway_section += _STEERAWAY_SECTION_TEMPLATE.format(
            steeraway_scenes=steeraway_scenes.strip()
        )
    if physics_grounding and physics_grounding.strip():
        steeraway_section += _GROUNDING_SECTION_TEMPLATE.format(
            physics_grounding=physics_grounding.strip()
        )
    return _SYSTEM_PROMPT_TEMPLATE.format(
        model_name=model_name,
        task_type=task_type,
        prompt_template=indented_template,
        steeraway_section=steeraway_section,
        max_prompt_chars=MAX_PROMPT_CHARS,
    )


def _mime_type(filename: str, fallback: str = "image/jpeg") -> str:
    lower = filename.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    return fallback


def _build_spec_lines(specs: dict[str, Any]) -> list[str]:
    lines = ["Campaign specifications:"]

    product_name = specs.get("productName", "").strip()
    if product_name:
        lines.append(
            f"- Product name (mention subtly only — e.g. a brief label or end-card, not the focus): {product_name}"
        )

    style = specs.get("style", "").strip()
    if style:
        lines.append(f"- Style / aesthetic (reflect throughout the ad): {style}")

    key_message = specs.get("keyMessage", "").strip()
    if key_message:
        lines.append(
            f"- Key message (main on-screen hook — weave into the ad creatively): {key_message}"
        )

    initial_prompt = specs.get("initialPrompt", "").strip()
    if initial_prompt:
        lines.append(
            f"- Initial prompt (user's draft — refine and expand into the full video prompt): {initial_prompt}"
        )

    cta = specs.get("cta", "").strip()
    if cta:
        lines.append(f"- Call to action: {cta}")

    duration = specs.get("duration")
    if duration is not None and str(duration).strip():
        lines.append(f"- Duration (strict time constraint — structure beats to fit): {int(duration)} seconds")

    image_count = specs.get("imageCount", 0)
    if image_count:
        lines.append(f"- Reference images attached: {image_count}")

    return lines


def _build_spec_text(specs: dict[str, Any], *, for_prompt_generation: bool = False) -> str:
    lines = _build_spec_lines(specs)
    if for_prompt_generation:
        lines.append("")
        lines.append(
            f"Write a clear, highly specific video generation prompt now. "
            f"The final prompt must be at most {MAX_PROMPT_CHARS} characters total (hard limit — the video API rejects longer prompts). "
            f"Honor the initial prompt, style, duration, and on-screen key message above. "
            f"Prioritize cinematic quality and visual detail while avoiding all steeraway scenarios "
            f"and weaving in the physical grounding cues."
        )
    else:
        lines.append("")
        lines.append(
            "Identify failure-prone scenes and concrete physical grounding for retained motion. "
            "Output AVOID lines then GROUND lines now."
        )
    return "\n".join(lines)


def _build_user_content(
    specs: dict[str, Any],
    images: list[tuple[str, bytes, str]],
    *,
    for_prompt_generation: bool = False,
) -> list[dict[str, Any]]:
    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": _build_spec_text(specs, for_prompt_generation=for_prompt_generation)},
    ]
    for _filename, raw, mime in images:
        b64 = base64.b64encode(raw).decode("ascii")
        user_content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"},
            }
        )
    return user_content


def _extract_message_text(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("API returned no choices")

    message = choices[0].get("message") or {}
    content = message.get("content", "")

    if isinstance(content, str):
        text = content.strip()
    elif isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
        text = "\n".join(parts).strip()
    else:
        text = str(content).strip()

    if not text:
        raise ValueError("API returned an empty prompt")
    return text


def _api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY must be set in .env")
    return key


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_HTTP_REFERER", "http://localhost:8888"),
        "X-Title": os.environ.get("OPENROUTER_APP_TITLE", "Prompt-to-Reel Lab"),
    }


def _text_gen_model() -> str:
    return os.environ.get("TEXT_GEN_MODEL", DEFAULT_TEXT_GEN_MODEL).strip() or DEFAULT_TEXT_GEN_MODEL


def _chat_completion(
    *,
    system_prompt: str,
    user_content: list[dict[str, Any]],
    max_tokens: int = 1024,
    temperature: float = 0.4,
) -> str:
    payload = {
        "model": _text_gen_model(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    try:
        response = http_request(
            "POST",
            OPENROUTER_CHAT_URL,
            headers=_headers(),
            json=payload,
            timeout=120,
        )
    except Exception as exc:
        raise RuntimeError(f"OpenRouter request failed: {exc}") from exc

    if not response.ok:
        detail = response.text.strip()[:500] or response.reason
        raise RuntimeError(f"OpenRouter error ({response.status_code}): {detail}")

    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError("OpenRouter returned invalid JSON") from exc

    return _extract_message_text(data)


def _truncate_at_boundary(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    cut = text[:max_len]
    for sep in (". ", ".\n", "! ", "? ", "; "):
        idx = cut.rfind(sep)
        if idx >= int(max_len * 0.65):
            return cut[: idx + 1].strip()
    space = cut.rfind(" ")
    if space >= int(max_len * 0.75):
        return cut[:space].strip()
    return cut.strip()


def _condense_prompt(prompt: str, *, max_chars: int = MAX_PROMPT_CHARS) -> str:
    """Shorten an over-limit prompt via a follow-up LLM pass, then boundary-truncate if needed."""
    if len(prompt) <= max_chars:
        return prompt

    user_content = [
        {
            "type": "text",
            "text": (
                f"The prompt below is {len(prompt)} characters. "
                f"Shorten it to at most {max_chars} characters while keeping all critical content.\n\n"
                f"---\n{prompt}\n---"
            ),
        }
    ]
    condensed = _chat_completion(
        system_prompt=_CONDENSE_PROMPT_SYSTEM.format(max_chars=max_chars),
        user_content=user_content,
        max_tokens=1024,
        temperature=0.4,
    )
    if len(condensed) > max_chars:
        condensed = _truncate_at_boundary(condensed, max_chars)
    return condensed


def identify_steeraway_scenes(
    specs: dict[str, Any],
    images: list[tuple[str, bytes, str]] | None = None,
) -> str:
    """Return scenes/plots the video model would likely fail to render for this brief."""
    refs = images or []
    is_i2v = bool(refs)
    video_model = (specs.get("videoModel") or "").strip() or None
    system_prompt = _build_steeraway_system_prompt(video_model=video_model, is_i2v=is_i2v)
    user_content = _build_user_content(specs, refs, for_prompt_generation=False)
    return _chat_completion(
        system_prompt=system_prompt,
        user_content=user_content,
        max_tokens=1024,
        temperature=0.4,
    )


def generate_product_prompt(
    specs: dict[str, Any],
    images: list[tuple[str, bytes, str]] | None = None,
) -> dict[str, str]:
    """
    Run steeraway analysis, then build a video prompt that avoids failure-prone scenes.

    images: list of (filename, raw_bytes, mime_type)

    Returns {"prompt": ..., "steerawayScenes": ...}
    """
    refs = images or []
    is_i2v = bool(refs)
    video_model = (specs.get("videoModel") or "").strip() or None

    preanalysis = identify_steeraway_scenes(specs, refs)
    steeraway_scenes, physics_grounding = _split_preanalysis_response(preanalysis)
    system_prompt = _build_system_prompt(
        video_model=video_model,
        is_i2v=is_i2v,
        steeraway_scenes=steeraway_scenes,
        physics_grounding=physics_grounding,
    )
    user_content = _build_user_content(specs, refs, for_prompt_generation=True)
    prompt = _chat_completion(
        system_prompt=system_prompt,
        user_content=user_content,
        max_tokens=1024,
        temperature=0.4,
    )
    prompt = _condense_prompt(prompt)
    return {"prompt": prompt, "steerawayScenes": preanalysis}
