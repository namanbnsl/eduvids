export interface LayoutConfig {
  frameWidth: number;
  frameHeight: number;
  safeMargin: number;
  orientation: "landscape" | "portrait";
  contentType?: "text-heavy" | "diagram" | "math" | "mixed";
}

export interface LayoutConfig3D extends LayoutConfig {
  cameraDistance: number;
  cameraFov: number;
}

export interface SafeZoneConfig {
  top: number;
  bottom: number;
  left: number;
  right: number;
  titleHeight: number;
  maxContentWidth: number;
  maxContentHeight: number;
}

function clampFont(value: number, min: number, max: number): number {
  let lower = min;
  let upper = max;
  if (lower > upper) {
    [lower, upper] = [upper, lower];
  }
  return Math.max(lower, Math.min(upper, value));
}

export function calculateSafeZones(config: LayoutConfig): SafeZoneConfig {
  const { frameWidth, frameHeight, safeMargin, orientation, contentType } =
    config;

  // Base margins
  let topMargin = safeMargin;
  let bottomMargin = safeMargin;
  let leftMargin = safeMargin;
  let rightMargin = safeMargin;

  if (orientation === "portrait") {
    // Portrait needs more horizontal margins proportionally
    leftMargin *= 1.4;
    rightMargin *= 1.4;
    // And more vertical space reserved for titles and bottom safety
    topMargin *= 1.5;
    bottomMargin *= 1.3;
  } else {
    // Landscape can be slightly more generous
    topMargin *= 1.1;
    bottomMargin *= 1.1;
  }

  // Adjust for content type
  if (contentType === "text-heavy") {
    // Text needs more breathing room
    leftMargin *= 1.3;
    rightMargin *= 1.3;
    topMargin *= 1.2;
  } else if (contentType === "diagram") {
    // Diagrams need more uniform space and extra safety margins
    const avgMargin = (leftMargin + rightMargin + topMargin + bottomMargin) / 4;
    leftMargin = rightMargin = topMargin = bottomMargin = avgMargin * 1.35;
  } else if (contentType === "math") {
    // Math formulas often wider, need horizontal space
    leftMargin *= 1.2;
    rightMargin *= 1.2;
  }

  // Extra breathing room to avoid cramped layouts, especially on mobile portrait
  const extraTopMargin = safeMargin * (orientation === "portrait" ? 0.4 : 0.2);
  const extraBottomMargin =
    safeMargin * (orientation === "portrait" ? 0.25 : 0.1);

  topMargin += extraTopMargin;
  bottomMargin += extraBottomMargin;

  // Title zone - reserve more space for titles with proper separation
  const titleHeight = orientation === "portrait" ? 2.0 : 1.5;

  // Calculate usable content area
  const maxContentWidth = Math.max(
    frameWidth - leftMargin - rightMargin,
    Number.EPSILON
  );
  const maxContentHeight = Math.max(
    frameHeight - topMargin - bottomMargin - titleHeight,
    Number.EPSILON
  );

  return {
    top: topMargin,
    bottom: bottomMargin,
    left: leftMargin,
    right: rightMargin,
    titleHeight,
    maxContentWidth,
    maxContentHeight,
  };
}

/**
 * Generate Python code for safe zone constants
 */
export function generateSafeZoneConstants(config: LayoutConfig): string {
  const zones = calculateSafeZones(config);

  return `# Auto-generated safe zone configuration
FRAME_WIDTH = ${config.frameWidth}
FRAME_HEIGHT = ${config.frameHeight}
SAFE_MARGIN_TOP = ${zones.top.toFixed(2)}
SAFE_MARGIN_BOTTOM = ${zones.bottom.toFixed(2)}
SAFE_MARGIN_LEFT = ${zones.left.toFixed(2)}
SAFE_MARGIN_RIGHT = ${zones.right.toFixed(2)}
TITLE_ZONE_HEIGHT = ${zones.titleHeight.toFixed(2)}
MAX_CONTENT_WIDTH = ${zones.maxContentWidth.toFixed(2)}
MAX_CONTENT_HEIGHT = ${zones.maxContentHeight.toFixed(2)}
CONTENT_SCALE_BUFFER = 0.94

# Safe positioning helpers
def get_title_position():
    """Get safe position for title (top of screen with margin)"""
    return UP * (FRAME_HEIGHT/2 - SAFE_MARGIN_TOP - 0.3)

def get_content_center():
    """Get safe center position for main content (below title zone)"""
    return DOWN * (TITLE_ZONE_HEIGHT / 2)

def ensure_fits_width(mobject, max_width=MAX_CONTENT_WIDTH, shrink=True):
    """Scale mobject to fit within safe width with breathing room"""
    target_width = max_width
    if shrink:
        target_width = max_width * CONTENT_SCALE_BUFFER
    if target_width <= 0:
        target_width = max_width
    if mobject.width > target_width:
        mobject.scale_to_fit_width(target_width)
    return mobject

def ensure_fits_height(mobject, max_height=MAX_CONTENT_HEIGHT, shrink=True):
    """Scale mobject to fit within safe height with breathing room"""
    target_height = max_height
    if shrink:
        target_height = max_height * CONTENT_SCALE_BUFFER
    if target_height <= 0:
        target_height = max_height
    if mobject.height > target_height:
        mobject.scale_to_fit_height(target_height)
    return mobject

def ensure_fits_screen(mobject, shrink=True):
    """Scale mobject to fit within safe content area"""
    mobject = ensure_fits_width(mobject, shrink=shrink)
    mobject = ensure_fits_height(mobject, shrink=shrink)
    return mobject


def fade_out_scene(scene, *mobjects, run_time=0.6):
    """Fade out provided mobjects or everything currently on screen."""
    targets = list(mobjects)
    if not targets:
        targets = [m for m in scene.mobjects]
    if not targets:
        return
    scene.play(*[FadeOut(mob) for mob in targets], run_time=run_time)


def clear_scene(scene, run_time=0.6):
    """Fade out every mobject currently in the scene safely."""
    fade_out_scene(scene, run_time=run_time)
`;
}

/**
 * Font size recommendations based on layout
 */
export function getRecommendedFontSizes(
  config: LayoutConfig
): Record<string, number> {
  const { orientation, contentType } = config;
  const zones = calculateSafeZones(config);

  const contentArea = Math.sqrt(
    Math.max(zones.maxContentWidth * zones.maxContentHeight, 1)
  );
  const orientationScale = orientation === "portrait" ? 1.08 : 1;
  const contentScale =
    contentType === "text-heavy"
      ? 0.85
      : contentType === "diagram"
        ? 0.92
        : contentType === "math"
          ? 0.98
          : 0.9;

  const baseBody = clampFont(
    Math.round(contentArea * orientationScale * contentScale * 1.6),
    orientation === "portrait" ? 22 : 18,
    orientation === "portrait" ? 34 : 28
  );

  const title = clampFont(
    Math.round(baseBody * (orientation === "portrait" ? 1.32 : 1.25)),
    baseBody + 3,
    orientation === "portrait" ? 48 : 42
  );

  const heading = clampFont(
    Math.round(baseBody * 1.12),
    baseBody + 1,
    title - 2
  );

  const mathMultiplier =
    contentType === "math"
      ? orientation === "portrait"
        ? 1.02
        : 0.98
      : contentType === "diagram"
        ? 0.85
        : 0.9;
  const mathMin = Math.max(orientation === "portrait" ? 20 : 18, baseBody - 8);
  const mathMaxBase = Math.max(heading - 1, mathMin);
  const mathMax =
    contentType === "math"
      ? mathMaxBase
      : Math.max(Math.min(baseBody - 3, mathMaxBase), mathMin);
  const math = clampFont(
    Math.round(baseBody * mathMultiplier),
    mathMin,
    mathMax
  );

  const caption = clampFont(
    Math.round(baseBody * 0.75),
    orientation === "portrait" ? 18 : 16,
    Math.max(baseBody - 5, orientation === "portrait" ? 18 : 16)
  );

  const label = clampFont(
    Math.round(baseBody * 0.65),
    orientation === "portrait" ? 16 : 14,
    caption
  );

  return {
    title,
    heading,
    body: baseBody,
    math,
    caption,
    label,
  };
}

/**
 * Generate layout validation checks (Python code)
 */
export function generateLayoutValidation(): string {
  return `# Layout validation helpers
def validate_position(mobject, label="object"):
    """Check if mobject is within safe bounds"""
    center = mobject.get_center()
    half_width = mobject.width / 2
    half_height = mobject.height / 2
    
    left = center[0] - half_width
    right = center[0] + half_width
    top = center[1] + half_height
    bottom = center[1] - half_height
    
    frame_left = -FRAME_WIDTH / 2 + SAFE_MARGIN_LEFT
    frame_right = FRAME_WIDTH / 2 - SAFE_MARGIN_RIGHT
    frame_top = FRAME_HEIGHT / 2 - SAFE_MARGIN_TOP
    frame_bottom = -FRAME_HEIGHT / 2 + SAFE_MARGIN_BOTTOM
    
    issues = []
    if left < frame_left:
        issues.append(f"{label} extends too far left")
    if right > frame_right:
        issues.append(f"{label} extends too far right")
    if top > frame_top:
        issues.append(f"{label} extends too far up")
    if bottom < frame_bottom:
        issues.append(f"{label} extends too far down")
    
    if issues:
        print(f"WARNING: {', '.join(issues)}")
        return False
    return True

def safe_add(scene, mobject, auto_fit=True, label="object"):
    """Add mobject to scene with automatic fitting and validation"""
    if auto_fit:
        ensure_fits_screen(mobject)
    if not validate_position(mobject, label):
        print(f"WARNING: {label} may be cut off!")
    scene.add(mobject)
    return mobject
`;
}

/**
 * Content type detection heuristics
 */
export function detectContentType(script: string): LayoutConfig["contentType"] {
  const lowerScript = script.toLowerCase();

  // Count indicators
  const textIndicators = (lowerScript.match(/text\(/gi) || []).length;
  const mathIndicators = (lowerScript.match(/mathtex|tex\(/gi) || []).length;
  const diagramIndicators = (
    lowerScript.match(/circle|square|rectangle|arrow|line|dot/gi) || []
  ).length;

  // Determine dominant type
  const total = textIndicators + mathIndicators + diagramIndicators;
  if (total === 0) return "mixed";

  const textRatio = textIndicators / total;
  const mathRatio = mathIndicators / total;
  const diagramRatio = diagramIndicators / total;

  if (textRatio > 0.5) return "text-heavy";
  if (mathRatio > 0.4) return "math";
  if (diagramRatio > 0.5) return "diagram";

  return "mixed";
}

/**
 * Generate comprehensive layout setup code
 */
export function generateLayoutSetup(
  config: LayoutConfig,
  includeHelpers: boolean = true
): string {
  const parts: string[] = [];
  const fonts = getRecommendedFontSizes(config);

  parts.push(["import math", "import numpy as np", ""].join("\n"));

  // Add safe zone constants
  parts.push(generateSafeZoneConstants(config));
  parts.push(
    [
      'config.background_color = "#2D2D2D"',
      'BRIGHT_TEXT_COLOR = "#FFFFFF"',
      'DARK_TEXT_COLOR = "#1A1A1A"',
      'CONTRAST_DARK_PANEL = "#1A1F2E"',
      'CONTRAST_LIGHT_PANEL = "#F8F9FA"',
      'MIN_CONTRAST_RATIO = 4.5',
      'MIN_PANEL_FILL_OPACITY = 0.7',
      'DEFAULT_PANEL_PADDING = 0.35',
      'BRIGHT_TEXT_ALTERNATIVES = [BRIGHT_TEXT_COLOR, "#F8F9FA", "#E8EAED"]',
      'Paragraph.set_default(color=BRIGHT_TEXT_COLOR)',
      'MarkupText.set_default(color=BRIGHT_TEXT_COLOR)',
      'MathTex.set_default(color=BRIGHT_TEXT_COLOR)',
      'Tex.set_default(color=BRIGHT_TEXT_COLOR)',
      'BulletedList.set_default(color=BRIGHT_TEXT_COLOR)',
      'Rectangle.set_default(fill_color=CONTRAST_DARK_PANEL, fill_opacity=MIN_PANEL_FILL_OPACITY, stroke_color=BRIGHT_TEXT_COLOR, stroke_width=2)',
      'RoundedRectangle.set_default(fill_color=CONTRAST_DARK_PANEL, fill_opacity=MIN_PANEL_FILL_OPACITY, stroke_color=BRIGHT_TEXT_COLOR, stroke_width=2)',
      'SurroundingRectangle.set_default(fill_color=CONTRAST_DARK_PANEL, fill_opacity=MIN_PANEL_FILL_OPACITY, stroke_color=BRIGHT_TEXT_COLOR, stroke_width=2)',
    ].join("\n")
  );
  parts.push(
    [
      "",
      "# Recommended font sizes for this layout",
      `FONT_TITLE = ${fonts.title}`,
      `FONT_HEADING = ${fonts.heading}`,
      `FONT_BODY = ${fonts.body}`,
      `FONT_MATH = ${fonts.math}  # Use for mathematical formulae (MathTex, Tex)`,
      `FONT_CAPTION = ${fonts.caption}`,
      `FONT_LABEL = ${fonts.label}`,
      "",
    ].join("\n")
  );
  parts.push(`

# Additional layout utilities
def get_safe_frame_dimensions():
    return (
        FRAME_WIDTH - SAFE_MARGIN_LEFT - SAFE_MARGIN_RIGHT,
        FRAME_HEIGHT - SAFE_MARGIN_TOP - SAFE_MARGIN_BOTTOM,
    )


def normalize_math_mobject(math_mobject, max_width_ratio=0.65, max_height_ratio=0.5):
    safe_width, safe_height = get_safe_frame_dimensions()
    ensure_fits_width(math_mobject, max_width=safe_width * max_width_ratio)
    ensure_fits_height(math_mobject, max_height=safe_height * max_height_ratio)
    return math_mobject


def enforce_min_gap(mobjects, min_gap=0.8):
    items = [m for m in (mobjects or []) if m is not None]
    if len(items) <= 1:
        return VGroup(*items)

    for _ in range(6):
        adjusted = False
        for i, a in enumerate(items):
            for b in items[i + 1:]:
                delta = b.get_center() - a.get_center()
                overlap_x = (a.width + b.width) / 2 + min_gap - abs(delta[0])
                overlap_y = (a.height + b.height) / 2 + min_gap - abs(delta[1])
                if overlap_x > 0 and overlap_y > 0:
                    if overlap_x >= overlap_y:
                        shift = overlap_x / 2
                        a.shift(-shift * RIGHT)
                        b.shift(shift * RIGHT)
                    else:
                        shift = overlap_y / 2
                        a.shift(-shift * UP)
                        b.shift(shift * UP)
                    adjusted = True
                    if hasattr(a, "set_z_index"):
                        a.set_z_index(2)
                    if hasattr(b, "set_z_index"):
                        b.set_z_index(2)
        if adjusted:
            VGroup(*items).scale(0.97)
        else:
            break

    group = VGroup(*items)
    ensure_fits_screen(group)
    return group


def layout_horizontal(mobjects, center=None, buff=1.0):
    items = [m for m in (mobjects or []) if m is not None]
    group = VGroup(*items)
    if not items:
        return group

    group.arrange(RIGHT, buff=buff)
    enforce_min_gap(group.submobjects, min_gap=max(buff, 0.95))
    ensure_fits_screen(group)
    group.move_to(center or get_content_center())
    validate_position(group, "horizontal layout")
    return group


def layout_vertical(mobjects, center=None, buff=1.0):
    items = [m for m in (mobjects or []) if m is not None]
    group = VGroup(*items)
    if not items:
        return group

    group.arrange(DOWN, buff=buff)
    enforce_min_gap(group.submobjects, min_gap=max(buff, 0.95))
    ensure_fits_screen(group)
    group.move_to(center or get_content_center())
    validate_position(group, "vertical layout")
    return group


def ensure_axes_visible(axes, padding=0.4):
    """Scale axes to remain inside the safe frame with optional padding."""
    ensure_fits_screen(axes)
    safe_width, safe_height = get_safe_frame_dimensions()
    max_width = safe_width - padding
    max_height = safe_height - padding
    ensure_fits_width(axes, max_width=max_width)
    ensure_fits_height(axes, max_height=max_height)
    validate_position(axes, "axes")
    return axes


def plot_function(ax, func, *, color=BLUE, x_range=None, samples=600):
    """Create a graph on provided axes with adequate sampling."""
    if x_range is None:
        x_range = ax.x_range
    graph = ax.plot(func, x_range=x_range, color=color, use_smoothing=False, samples=samples)
    ensure_fits_screen(graph)
    return graph


def highlight_graph_intersections(scene, ax, graphs, *, tolerance=1e-3, samples=600, radius=0.05):
    """Detect pairwise intersections and add markers to guarantee accurate visuals."""
    if len(graphs) <= 1:
        return []

    intersections = []
    all_graphs = list(graphs)
    x_min, x_max = ax.x_range[0], ax.x_range[1]
    xs = np.linspace(x_min, x_max, samples)

    for i, g_a in enumerate(all_graphs):
        for g_b in all_graphs[i + 1:]:
            f_a = ax.p2c(g_a.point_from_proportion)
            f_b = ax.p2c(g_b.point_from_proportion)
            for x in xs:
                y_a = g_a.underlying_function(x)
                y_b = g_b.underlying_function(x)
                if abs(y_a - y_b) <= tolerance:
                    point = ax.c2p(x, (y_a + y_b) / 2)
                    dot = Dot(point, radius=radius, color=YELLOW)
                    intersections.append(dot)

    if intersections:
        markers = VGroup(*intersections)
        ensure_fits_screen(markers)
        validate_position(markers, "graph intersections")
        scene.add(markers)
        return markers

    return []
`);
  parts.push(`
# Accessibility and readability helpers
def _relative_luminance(color_value):
    color = Color(color_value)
    r, g, b = color.get_rgb()

    def _channel(component):
        return component / 12.92 if component <= 0.03928 else ((component + 0.055) / 1.055) ** 2.4

    r_lin = _channel(r)
    g_lin = _channel(g)
    b_lin = _channel(b)
    return 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin


def _contrast_ratio(color_a, color_b):
    lum_a = _relative_luminance(color_a)
    lum_b = _relative_luminance(color_b)
    lighter = max(lum_a, lum_b)
    darker = min(lum_a, lum_b)
    return (lighter + 0.05) / (darker + 0.05)


def pick_accessible_text_color(background_color, min_contrast=MIN_CONTRAST_RATIO):
    background_hex = Color(background_color).to_hex()
    candidates = BRIGHT_TEXT_ALTERNATIVES
    scored = [
        (candidate, _contrast_ratio(candidate, background_hex))
        for candidate in candidates
    ]
    for candidate, ratio in scored:
        if ratio >= min_contrast:
            return candidate
    if scored:
        scored.sort(key=lambda item: item[1], reverse=True)
        print(
            "[Layout Engine] Background contrast is low even with bright text. "
            "Consider darkening the background or wrapping text with a panel for readability."
        )
        return scored[0][0]
    return BRIGHT_TEXT_COLOR


def ensure_text_readability(text_mobject, background_mobject=None, min_contrast=MIN_CONTRAST_RATIO):
    background_color = config.background_color
    if background_mobject and hasattr(background_mobject, "get_fill_color"):
        try:
            fill_color = background_mobject.get_fill_color()
            if fill_color is not None:
                background_color = Color(fill_color).to_hex()
        except Exception:
            pass

    chosen_color = pick_accessible_text_color(background_color, min_contrast=min_contrast)
    text_mobject.set_color(chosen_color)
    contrast = _contrast_ratio(chosen_color, background_color)
    if contrast < min_contrast:
        print(
            "[Layout Engine] Applying stroke to bright text to compensate for low contrast background. "
            "Prefer using a darker panel behind text for clarity."
        )
        stroke_width = (
            text_mobject.get_stroke_width() if hasattr(text_mobject, "get_stroke_width") else 0
        ) or 0
        text_mobject.set_stroke(color="#000000", width=max(stroke_width, 1.2), opacity=0.65)
    return text_mobject


def ensure_panel_readability(panel_mobject, text_color=BRIGHT_TEXT_COLOR, min_contrast=MIN_CONTRAST_RATIO):
    try:
        fill_color = Color(panel_mobject.get_fill_color()).to_hex()
    except Exception:
        fill_color = CONTRAST_DARK_PANEL

    fill_opacity = getattr(panel_mobject, "fill_opacity", 0) or 0
    if 0 < fill_opacity < MIN_PANEL_FILL_OPACITY:
        print(
            f"[Layout Engine] {panel_mobject.__class__.__name__} has fill_opacity={fill_opacity:.2f}. "
            f"Increasing to {MIN_PANEL_FILL_OPACITY:.2f} for readability. "
            "Set fill_opacity=0 before calling ensure_panel_readability if you only need a border."
        )
        panel_mobject.set_fill(opacity=MIN_PANEL_FILL_OPACITY)
        fill_opacity = MIN_PANEL_FILL_OPACITY
        try:
            fill_color = Color(panel_mobject.get_fill_color()).to_hex()
        except Exception:
            fill_color = CONTRAST_DARK_PANEL

    desired_dark = _contrast_ratio(CONTRAST_DARK_PANEL, text_color) >= min_contrast

    if fill_opacity <= 0:
        target_color = CONTRAST_DARK_PANEL if desired_dark else CONTRAST_LIGHT_PANEL
        panel_mobject.set_fill(
            color=target_color,
            opacity=MIN_PANEL_FILL_OPACITY if target_color == CONTRAST_DARK_PANEL else 0.95,
        )
        fill_color = target_color
        fill_opacity = panel_mobject.get_fill_opacity() or MIN_PANEL_FILL_OPACITY
    else:
        current_ratio = _contrast_ratio(fill_color, text_color)
        if current_ratio < min_contrast:
            if _relative_luminance(text_color) < 0.5:
                panel_mobject.set_fill(
                    color=CONTRAST_LIGHT_PANEL,
                    opacity=max(fill_opacity, 0.95),
                )
                fill_color = CONTRAST_LIGHT_PANEL
            else:
                panel_mobject.set_fill(
                    color=CONTRAST_DARK_PANEL,
                    opacity=max(fill_opacity, MIN_PANEL_FILL_OPACITY),
                )
                fill_color = CONTRAST_DARK_PANEL

    fill_opacity = getattr(panel_mobject, "fill_opacity", 0) or MIN_PANEL_FILL_OPACITY

    stroke_width = panel_mobject.get_stroke_width() or 0
    if stroke_width < 2:
        panel_mobject.set_stroke(
            color=Color(text_color).to_hex(),
            width=2,
            opacity=0.8,
        )

    if _contrast_ratio(fill_color, text_color) < min_contrast:
        alternative = CONTRAST_LIGHT_PANEL if _relative_luminance(fill_color) < 0.5 else CONTRAST_DARK_PANEL
        panel_mobject.set_fill(
            color=alternative,
            opacity=max(panel_mobject.get_fill_opacity() or MIN_PANEL_FILL_OPACITY, MIN_PANEL_FILL_OPACITY),
        )

    return panel_mobject


def apply_text_panel(text_mobject, panel_mobject, min_contrast=MIN_CONTRAST_RATIO):
    ensure_text_readability(text_mobject, panel_mobject, min_contrast=min_contrast)
    ensure_panel_readability(panel_mobject, text_mobject.get_color(), min_contrast=min_contrast)
    if hasattr(panel_mobject, "set_z_index"):
        base_z = getattr(panel_mobject, "z_index", 0) or 0
        panel_mobject.set_z_index(base_z)
        if hasattr(text_mobject, "set_z_index"):
            text_mobject.set_z_index(panel_mobject.z_index + 1)
    if hasattr(text_mobject, "move_to") and hasattr(panel_mobject, "get_center"):
        text_mobject.move_to(panel_mobject.get_center())
    return text_mobject, panel_mobject


def create_text_panel(
    text,
    *,
    font_size=FONT_BODY,
    panel_class=RoundedRectangle,
    panel_padding=DEFAULT_PANEL_PADDING,
    text_kwargs=None,
    panel_kwargs=None,
    min_contrast=MIN_CONTRAST_RATIO,
):
    """Create a text label with a readable panel behind it."""

    text_kwargs = dict(text_kwargs or {})
    panel_kwargs = dict(panel_kwargs or {})

    label = Text(text, font_size=font_size, **text_kwargs)

    if panel_padding is None:
        panel_padding = DEFAULT_PANEL_PADDING

    h_padding = panel_padding * 2
    if "width" not in panel_kwargs:
        panel_kwargs["width"] = label.width + h_padding
    if "height" not in panel_kwargs:
        panel_kwargs["height"] = label.height + h_padding

    panel = panel_class(**panel_kwargs)

    apply_text_panel(label, panel, min_contrast=min_contrast)

    label.move_to(panel.get_center())
    panel.set_z_index(1)
    label.set_z_index(panel.z_index + 1)

    group = VGroup(panel, label)
    ensure_fits_width(group)
    ensure_fits_height(group)
    return group
`);

  // Updated color palette - all colors optimized for #2D2D2D background
  const colorPalette: Record<string, string> = {
    WHITE: "#FFFFFF",
    LIGHT_GRAY: "#E8EAED",
    GRAY: "#B0B8C4",
    DARK_GRAY: "#6B7280",
    BLACK: "#1A1A1A",

    // Primary colors - bright and vibrant
    BLUE: "#60A5FA",
    CYAN: "#22D3EE",
    TEAL: "#2DD4BF",
    GREEN: "#4ADE80",
    LIME: "#A3E635",
    YELLOW: "#FDE047",
    ORANGE: "#FB923C",
    RED: "#F87171",
    PINK: "#F472B6",
    MAGENTA: "#E879F9",
    PURPLE: "#C084FC",
    INDIGO: "#818CF8",

    // Extended palette
    SKY: "#7DD3FC",
    EMERALD: "#34D399",
    AMBER: "#FCD34D",
    ROSE: "#FB7185",
    FUCHSIA: "#E879F9",
    VIOLET: "#A78BFA",

    // Specialty colors
    GOLD: "#FBBF24",
    CORAL: "#FCA5A5",
    MINT: "#6EE7B7",
    LAVENDER: "#C4B5FD",
    PEACH: "#FDBA74",

    // Muted variants (still visible)
    SLATE: "#94A3B8",
    STEEL: "#94A9C9",
    SAND: "#E8D4A2",
    NAVY: "#5B7FC7",
    FOREST: "#6EE7B7",
    CRIMSON: "#FCA5A5",

    // Accent colors
    NEON_BLUE: "#38BDF8",
    NEON_GREEN: "#84CC16",
    NEON_PINK: "#F472B6",
    ELECTRIC_PURPLE: "#A855F7",

    // Soft pastels (adjusted for dark bg)
    SOFT_BLUE: "#93C5FD",
    SOFT_GREEN: "#86EFAC",
    SOFT_YELLOW: "#FDE68A",
    SOFT_PINK: "#FBCFE8",
  };

  parts.push("\n# Script color palette - Optimized for #2D2D2D background");
  const paletteEntries = Object.entries(colorPalette);
  paletteEntries.forEach(([name, hex]) => {
    parts.push(`${name} = "${hex}"`);
  });
  parts.push("");

  // Add helpers if requested
  if (includeHelpers) {
    parts.push("\n");
    parts.push(generateLayoutValidation());
  }

  return parts.join("\n");
}

/**
 * Advanced text wrapping recommendations
 */
export function getTextWrappingGuidelines(config: LayoutConfig): string {
  const zones = calculateSafeZones(config);
  const fonts = getRecommendedFontSizes(config);

  return `# Text Wrapping Guidelines
# Maximum recommended characters per line (approximate):
# - Title (${fonts.title}pt): ~${Math.floor(
    zones.maxContentWidth / (fonts.title * 0.6)
  )} chars
# - Body (${fonts.body}pt): ~${Math.floor(
    zones.maxContentWidth / (fonts.body * 0.6)
  )} chars
# - Caption (${fonts.caption}pt): ~${Math.floor(
    zones.maxContentWidth / (fonts.caption * 0.6)
  )} chars

def wrap_text(text, font_size=FONT_BODY, max_width=MAX_CONTENT_WIDTH):
    """Automatically wrap text to fit within max_width"""
    # Approximate character width as font_size * 0.6
    char_width = font_size * 0.6
    max_chars_per_line = int(max_width / char_width)
    
    words = text.split()
    lines = []
    current_line = []
    current_length = 0
    
    for word in words:
        word_length = len(word) + 1  # +1 for space
        if current_length + word_length > max_chars_per_line and current_line:
            lines.append(' '.join(current_line))
            current_line = [word]
            current_length = len(word)
        else:
            current_line.append(word)
            current_length += word_length
    
    if current_line:
        lines.append(' '.join(current_line))
    
    return '\\\\n'.join(lines)

def create_wrapped_text(text, font_size=FONT_BODY, **kwargs):
    """Create Text mobject with automatic wrapping"""
    wrapped = wrap_text(text, font_size)
    return Text(wrapped, font_size=font_size, **kwargs)
`;
}

/**
 * Generate helpers for rendering code blocks safely
 */
export function getCodeRenderingHelpers(): string {
  return `# Code Rendering Helpers
def create_code_block(
    code_str,
    *,
    language="python",
    tab_width=4,
    max_width=MAX_CONTENT_WIDTH,
    max_height=MAX_CONTENT_HEIGHT,
):
    """Create a Manim Code mobject that already fits within the safe zone.

    This wrapper intentionally exposes only the Code parameters that are
    compatible with the sandbox runtime. Avoid passing unsupported keyword
    arguments like 'font', which will raise TypeError in this environment.
    """

    from manim import Code

    safe_kwargs = {
        "code_string": code_str,
        "language": language,
        "tab_width": tab_width,
    }

    code_mobject = Code(**safe_kwargs, background="window", paragraph_config={"line_spacing": 1.5})

    ensure_fits_width(code_mobject, max_width)
    ensure_fits_height(code_mobject, max_height)
    validate_position(code_mobject, label="code block")

    return code_mobject


def add_code_block(scene, code_str, **kwargs):
    """Create a code block via create_code_block and add it to the scene."""

    code_block = create_code_block(code_str, **kwargs)
    scene.add(code_block)
    return code_block
`;
}

/**
 * Get all layout code for a configuration
 */
export function getCompleteLayoutCode(config: LayoutConfig): string {
  const parts: string[] = [];

  parts.push("# ========================================");
  parts.push("# ADVANCED LAYOUT SYSTEM");
  parts.push("# Auto-generated safe zone and helpers");
  parts.push("# ========================================\n");

  parts.push(generateLayoutSetup(config, true));
  parts.push("\n");
  parts.push(getTextWrappingGuidelines(config));
  parts.push("\n");
  parts.push(getCodeRenderingHelpers());
  parts.push("\n");
  parts.push(generate3DLayoutCode());

  parts.push("\n# ========================================");
  parts.push("# Usage:");
  parts.push("# 1. Use get_title_position() for titles");
  parts.push("# 2. Use get_content_center() for content");
  parts.push("# 3. Use ensure_fits_screen() before adding");
  parts.push("# 4. Use validate_position() to check bounds");
  parts.push(
    "# 5. For 3D scenes, use set_camera_for_3d_scene() to frame content"
  );
  parts.push("# ========================================\n");

  return parts.join("\n");
}

/**
 * Generate helpers for 3D scene layout
 */
export function generate3DLayoutCode(): string {
  return `# 3D Scene Layout Helpers
def get_3d_mobjects_bounding_box(mobjects):
    """Calculate the bounding box containing all 3D mobjects"""
    if not mobjects:
        return (ORIGIN, ORIGIN)
    
    all_points = np.vstack([m.get_all_points() for m in mobjects])
    min_coords = np.min(all_points, axis=0)
    max_coords = np.max(all_points, axis=0)
    
    return (min_coords, max_coords)

def set_camera_for_3d_scene(scene, mobjects, distance_factor=1.5, fov=None):
    """
    Automatically adjust the camera to frame all 3D mobjects.
    
    :param scene: The ThreeDScene instance.
    :param mobjects: A list of 3D mobjects to be framed.
    :param distance_factor: Multiplier for camera distance to provide padding.
    :param fov: Field of view in degrees. If None, uses scene's default.
    """
    if not mobjects:
        return

    min_coords, max_coords = get_3d_mobjects_bounding_box(mobjects)
    center = (min_coords + max_coords) / 2
    dimensions = max_coords - min_coords
    
    # Determine the largest dimension to frame
    max_dim = max(dimensions)
    
    # Calculate camera distance
    if fov is None:
        fov = scene.camera.fov
    
    # tan(fov/2) = (max_dim/2) / distance
    distance = (max_dim / 2) / np.tan(np.deg2rad(fov / 2))
    
    # Set camera position
    scene.move_camera(
        phi=75 * DEGREES,
        theta=30 * DEGREES,
        focal_distance=distance * distance_factor,
        frame_center=center,
        zoom=0.8,  # Apply a slight zoom out for safety
    )
    print(f"Set 3D camera focus to center: {center}, distance: {distance * distance_factor}")
`;
}

/**
 * Default layout configurations
 */
export const DEFAULT_LANDSCAPE_CONFIG: LayoutConfig = {
  frameWidth: 14.2,
  frameHeight: 8.0,
  safeMargin: 0.5,
  orientation: "landscape",
  contentType: "mixed",
};

export const DEFAULT_PORTRAIT_CONFIG: LayoutConfig = {
  frameWidth: 7.2,
  frameHeight: 12.8,
  safeMargin: 0.6,
  orientation: "portrait",
  contentType: "mixed",
};

export const DEFAULT_3D_CONFIG: LayoutConfig3D = {
  ...DEFAULT_LANDSCAPE_CONFIG,
  cameraDistance: 50,
  cameraFov: 50,
};

export function getLayoutConfig(options: {
  orientation?: "landscape" | "portrait";
  resolution?: { width: number; height: number };
  contentType?: LayoutConfig["contentType"];
  is3D?: boolean;
}): LayoutConfig {
  if (options.is3D) {
    return { ...DEFAULT_3D_CONFIG };
  }
  const base =
    options.orientation === "portrait"
      ? { ...DEFAULT_PORTRAIT_CONFIG }
      : { ...DEFAULT_LANDSCAPE_CONFIG };

  // Adjust frame dimensions based on resolution if provided
  if (options.resolution) {
    const aspectRatio = options.resolution.width / options.resolution.height;
    base.frameWidth = 14.2; // Keep manim's default
    base.frameHeight = base.frameWidth / aspectRatio;
  }

  if (options.contentType) {
    base.contentType = options.contentType;
  }

  return base;
}
