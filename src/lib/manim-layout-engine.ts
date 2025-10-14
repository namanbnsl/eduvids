/**
 * Manim Layout Engine
 * 
 * Advanced layout algorithms and viewport management to prevent content cutoff
 * and ensure all animations stay within safe boundaries.
 */

export interface LayoutConfig {
  /** Frame width in manim units */
  frameWidth: number;
  /** Frame height in manim units */
  frameHeight: number;
  /** Safe margin from edges */
  safeMargin: number;
  /** Orientation: landscape or portrait */
  orientation: "landscape" | "portrait";
  /** Content type: affects layout strategy */
  contentType?: "text-heavy" | "diagram" | "math" | "mixed";
}

export interface SafeZoneConfig {
  /** Top margin */
  top: number;
  /** Bottom margin */
  bottom: number;
  /** Left margin */
  left: number;
  /** Right margin */
  right: number;
  /** Title zone height (reserved for titles) */
  titleHeight: number;
  /** Maximum content width */
  maxContentWidth: number;
  /** Maximum content height (excluding title) */
  maxContentHeight: number;
}

/**
 * Calculate optimal safe zones based on layout configuration
 */
export function calculateSafeZones(config: LayoutConfig): SafeZoneConfig {
  const { frameWidth, frameHeight, safeMargin, orientation, contentType } = config;

  // Base margins
  let topMargin = safeMargin;
  let bottomMargin = safeMargin;
  let leftMargin = safeMargin;
  let rightMargin = safeMargin;

  // Adjust for orientation
  if (orientation === "portrait") {
    // Portrait needs more horizontal margins proportionally
    leftMargin *= 1.2;
    rightMargin *= 1.2;
    // And more vertical space reserved for titles
    topMargin *= 1.3;
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
    // Diagrams need more uniform space
    const avgMargin = (leftMargin + rightMargin + topMargin + bottomMargin) / 4;
    leftMargin = rightMargin = topMargin = bottomMargin = avgMargin * 1.15;
  } else if (contentType === "math") {
    // Math formulas often wider, need horizontal space
    leftMargin *= 1.2;
    rightMargin *= 1.2;
  }

  // Title zone - reserve more space for titles with proper separation
  const titleHeight = orientation === "portrait" ? 1.8 : 1.5;

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
    // Portrait needs smaller fonts to fit more
    return {
      title: contentType === "text-heavy" ? 32 : 36,
      heading: 28,
      body: 24,
      caption: 20,
      label: 18,
    };
  } else {
    // Landscape can use slightly larger fonts
    return {
      title: contentType === "text-heavy" ? 36 : 40,
      heading: 32,
      body: 28,
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
  const diagramIndicators =
    (lowerScript.match(/circle|square|rectangle|arrow|line|dot/gi) || []).length;

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

  // Add font size recommendations
  const fonts = getRecommendedFontSizes(config);
  parts.push("\n# Recommended font sizes for this layout");
  parts.push(`FONT_TITLE = ${fonts.title}`);
  parts.push(`FONT_HEADING = ${fonts.heading}`);
  parts.push(`FONT_BODY = ${fonts.body}`);
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
# - Title (${fonts.title}pt): ~${Math.floor(zones.maxContentWidth / (fonts.title * 0.6))} chars
# - Body (${fonts.body}pt): ~${Math.floor(zones.maxContentWidth / (fonts.body * 0.6))} chars
# - Caption (${fonts.caption}pt): ~${Math.floor(zones.maxContentWidth / (fonts.caption * 0.6))} chars

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

  parts.push("\n# ========================================");
  parts.push("# Usage:");
  parts.push("# 1. Use get_title_position() for titles");
  parts.push("# 2. Use get_content_center() for content");
  parts.push("# 3. Use ensure_fits_screen() before adding");
  parts.push("# 4. Use validate_position() to check bounds");
  parts.push("# ========================================\n");

  return parts.join("\n");
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
  safeMargin: 0.4,
  orientation: "portrait",
  contentType: "mixed",
};

/**
 * Get layout config based on render options
 */
export function getLayoutConfig(options: {
  orientation?: "landscape" | "portrait";
  resolution?: { width: number; height: number };
  contentType?: LayoutConfig["contentType"];
}): LayoutConfig {
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
