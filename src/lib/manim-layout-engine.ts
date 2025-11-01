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
  const maxContentWidth = frameWidth - leftMargin - rightMargin;
  const maxContentHeight = frameHeight - topMargin - bottomMargin - titleHeight;

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

# Safe positioning helpers
def get_title_position():
    """Get safe position for title (top of screen with margin)"""
    return UP * (FRAME_HEIGHT/2 - SAFE_MARGIN_TOP - 0.3)

def get_content_center():
    """Get safe center position for main content (below title zone)"""
    return DOWN * (TITLE_ZONE_HEIGHT / 2)

def ensure_fits_width(mobject, max_width=MAX_CONTENT_WIDTH):
    """Scale mobject to fit within safe width"""
    if mobject.width > max_width:
        mobject.scale_to_fit_width(max_width)
    return mobject

def ensure_fits_height(mobject, max_height=MAX_CONTENT_HEIGHT):
    """Scale mobject to fit within safe height"""
    if mobject.height > max_height:
        mobject.scale_to_fit_height(max_height)
    return mobject

def ensure_fits_screen(mobject):
    """Scale mobject to fit within safe content area"""
    mobject = ensure_fits_width(mobject)
    mobject = ensure_fits_height(mobject)
    return mobject
`;
}

/**
 * Font size recommendations based on layout
 */
export function getRecommendedFontSizes(
  config: LayoutConfig
): Record<string, number> {
  const { orientation, contentType } = config;

  if (orientation === "portrait") {
    return {
      title: 46,
      heading: 36,
      body: 32,
      math: 48,
      caption: 28,
      label: 26,
    };
  } else {
    return {
      title: contentType === "text-heavy" ? 36 : 40,
      heading: 32,
      body: 28,
      math: 42,
      caption: 24,
      label: 20,
    };
  }
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

  // Add safe zone constants
  parts.push(generateSafeZoneConstants(config));
  parts.push(
    [
      'config.background_color = "#020712"',
      'BRIGHT_TEXT_COLOR = "#FFFFFF"',
      'DARK_TEXT_COLOR = "#0E172A"',
      'CONTRAST_DARK_PANEL = "#142136"',
      'CONTRAST_LIGHT_PANEL = "#F5F7FF"',
      'MIN_CONTRAST_RATIO = 4.5',
      'MIN_PANEL_FILL_OPACITY = 0.9',
      'BRIGHT_TEXT_ALTERNATIVES = [BRIGHT_TEXT_COLOR, "#F5F7FF", "#E6F1FF"]',
      'Text.set_default(font="Lato", color=BRIGHT_TEXT_COLOR)',
      'Paragraph.set_default(color=BRIGHT_TEXT_COLOR)',
      'MarkupText.set_default(color=BRIGHT_TEXT_COLOR)',
      'MathTex.set_default(color=BRIGHT_TEXT_COLOR)',
      'Tex.set_default(color=BRIGHT_TEXT_COLOR)',
      'BulletedList.set_default(color=BRIGHT_TEXT_COLOR)',
      'Rectangle.set_default(fill_color=CONTRAST_DARK_PANEL, fill_opacity=MIN_PANEL_FILL_OPACITY, stroke_color=BRIGHT_TEXT_COLOR, stroke_width=2)',
      'RoundedRectangle.set_default(fill_color=CONTRAST_DARK_PANEL, fill_opacity=MIN_PANEL_FILL_OPACITY, stroke_color=BRIGHT_TEXT_COLOR, stroke_width=2)',
    ].join("\n")
  );
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
    return text_mobject, panel_mobject
`);

  // Colors
  const colorPalette: Record<string, string> = {
    WHITE: "#FFFFFF",
    BLACK: "#E0E0E0", // Lightened for visibility
    GRAY: "#B8C5D6", // Brighter gray
    DARK_GRAY: "#8B9DB5", // Lighter dark gray
    LIGHT_GRAY: "#F0F4F8", // Very light gray
    YELLOW: "#FFE066", // Brighter yellow
    GOLD: "#FCD34D", // Lighter gold
    ORANGE: "#FFA566", // Lighter orange
    CORAL: "#FFA0B4", // Lighter coral
    RED: "#FF6B6B", // Softer, lighter red
    CRIMSON: "#FF5A5A", // Lighter crimson
    PINK: "#FFB3D9", // Lighter pink
    MAGENTA: "#FF7AC6", // Brighter magenta
    BLUE: "#5B9EFF", // Lighter blue
    INDIGO: "#7B70F0", // Lighter indigo
    CYAN: "#4DD4FF", // Brighter cyan
    TEAL: "#5FFBF1", // Much lighter teal
    PURE_GREEN: "#5EE07B", // Lighter green
    EMERALD: "#5FFFC9", // Brighter emerald
    LIME: "#BBFF4D", // Brighter lime
    PURPLE: "#C77DFF", // Lighter purple
    VIOLET: "#A78BFA", // Lighter violet
    LAVENDER: "#DDB3FF", // Lighter lavender
    NORD: "#81A1C1", // Lighter nord blue
    NORD_FROST: "#A8DCDB", // Lighter frost
    NORD_NIGHT: "#6B7A8F", // Much lighter than night
    SLATE: "#94A9C9", // Lighter slate
    STEEL: "#8B9DB5", // Lighter steel
    SAND: "#FFE8B0", // Lighter sand
    BROWN: "#C9874A", // Much lighter brown
    SKY: "#87CEEB", // Lighter sky
    FUCHSIA: "#F066FF", // Lighter fuchsia
    MINT: "#B8FFE8", // Lighter mint
    NAVY: "#4F7BFF", // Much lighter navy
  };

  parts.push("\n# Script color palette");
  const paletteEntries = Object.entries(colorPalette);
  paletteEntries.forEach(([name, hex]) => {
    parts.push(`${name} = "${hex}" \n`);
  });

  // Add font size recommendations
  const fonts = getRecommendedFontSizes(config);
  parts.push("\n# Recommended font sizes for this layout");
  parts.push(`FONT_TITLE = ${fonts.title}`);
  parts.push(`FONT_HEADING = ${fonts.heading}`);
  parts.push(`FONT_BODY = ${fonts.body}`);
  parts.push(
    `FONT_MATH = ${fonts.math}  # Use for mathematical formulae (MathTex, Tex)`
  );
  parts.push(`FONT_CAPTION = ${fonts.caption}`);
  parts.push(`FONT_LABEL = ${fonts.label}`);

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
