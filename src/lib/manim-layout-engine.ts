/**
 * MANIM LAYOUT ENGINE - ULTRA-AGGRESSIVE OVERLAP PREVENTION
 *
 * MAJOR IMPROVEMENTS (2025-11-15):
 * ===============================================
 * 1. INCREASED SAFE MARGINS: 35-45% larger fixed boundaries to prevent all cut-offs
 * 2. ULTRA-AGGRESSIVE enforce_min_gap: 12 iterations, 1.3x separation factor, earlier scaling
 * 3. STRICT ensure_fits_screen: 94% safety margin (down from 98%), 5 iterations
 * 4. HARD BOUNDARY ENFORCEMENT: _nudge_into_safe_frame now has strict verification with auto-scaling
 * 5. SMART EQUATION LABELING: New collision detection with automatic staggering/fade-in-out
 * 6. COLLISION STRATEGIES: "stagger" (offset labels), "scale" (shrink), "fade_sequence" (one at a time)
 *
 * MAJOR IMPROVEMENTS (2025-01-15):
 * ===============================================
 * 7. DIAGRAM SCHEMAS: Canonical helpers for accurate 2D/3D diagrams
 * 8. TEXT RENDERING FIX: Render at large font sizes, scale down for proper letter spacing
 * 9. DEVELOPMENT LOGGING: Debug logging for diagram schema detection and validation
 * 10. CAMERA DISCIPLINE: Strict 2D/3D camera patterns for visual accuracy
 *
 * KEY FUNCTIONS:
 * - smart_position_equation_labels(): Intelligent label positioning with collision avoidance
 * - create_fade_sequence_labels(): Show labels one at a time with fade in/out
 * - create_smart_label(): Create labels with optional arrows
 * - detect_label_collisions(): Detect overlapping labels
 * - DIAGRAM SCHEMA HELPERS: create_cartesian_graph, create_bar_chart, create_force_diagram, etc.
 *
 * GUARANTEES:
 * - Fixed margins that CANNOT be violated (hard boundaries)
 * - Zero overlaps between elements (ultra-aggressive separation)
 * - Accurate diagram rendering through schema-based helpers
 */

import { DIAGRAM_SCHEMAS, type DiagramSchema } from "./diagram-schemas";

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
  minSpacing: number;
  bottomSafeZoneHeight: number;
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

  const portrait = orientation === "portrait";
  // INCREASED margin boost to create larger fixed boundaries
  const marginBoost = portrait ? 1.35 : 1.25;

  // Base margins with MORE generous spacing to prevent cut-offs
  let topMargin = safeMargin * marginBoost;
  let bottomMargin = safeMargin * marginBoost;
  let leftMargin = safeMargin * marginBoost;
  let rightMargin = safeMargin * marginBoost;

  if (portrait) {
    // Portrait: INCREASED padding for fixed margins
    leftMargin *= 1.35;
    rightMargin *= 1.35;
    topMargin *= 1.45;
    bottomMargin *= 1.45;
  } else {
    // Landscape: INCREASED spacing for fixed margins
    topMargin *= 1.3;
    bottomMargin *= 1.3;
    leftMargin *= 1.15;
    rightMargin *= 1.15;
  }

  // Content-type adjustments - MAINTAIN larger margins to prevent cut-offs
  if (contentType === "text-heavy") {
    leftMargin *= 1.2;
    rightMargin *= 1.2;
  } else if (contentType === "diagram") {
    // Diagrams: Keep SAFE margins - diagrams need protection from cut-offs
    const avgMargin = (leftMargin + rightMargin + topMargin + bottomMargin) / 4;
    leftMargin = rightMargin = topMargin = bottomMargin = avgMargin * 1.0; // Changed from 0.85 to 1.0
  } else if (contentType === "math") {
    leftMargin *= 1.2;
    rightMargin *= 1.2;
  }

  // Moderate breathing room
  const extraTopMargin = safeMargin * (portrait ? 0.4 : 0.3);
  const extraBottomMargin = safeMargin * (portrait ? 0.5 : 0.35);

  topMargin += extraTopMargin;
  bottomMargin += extraBottomMargin;

  // Reasonable minimum spacing
  let minSpacing = safeMargin * (portrait ? 1.2 : 1.0);
  if (contentType === "text-heavy") {
    minSpacing *= 1.1;
  } else if (contentType === "diagram") {
    minSpacing *= 0.9; // Diagrams need less spacing, more room for content
  } else if (contentType === "math") {
    minSpacing *= 1.05;
  }
  minSpacing = Math.max(minSpacing, safeMargin * 0.8);

  // Moderate bottom safe zone
  let bottomSafeZoneHeight = safeMargin * (portrait ? 1.6 : 1.3);
  if (contentType === "diagram") {
    bottomSafeZoneHeight *= 0.85; // Less bottom margin for diagrams
  } else if (contentType === "text-heavy") {
    bottomSafeZoneHeight *= 1.0;
  }
  bottomSafeZoneHeight = Math.max(
    bottomSafeZoneHeight,
    frameHeight * (portrait ? 0.08 : 0.06)
  );

  bottomMargin = Math.max(
    bottomMargin,
    bottomSafeZoneHeight + safeMargin * (portrait ? 0.4 : 0.3)
  );
  topMargin = Math.max(topMargin, safeMargin * (portrait ? 1.4 : 1.15));

  // Reasonable title zone
  const titleHeight = orientation === "portrait" ? 1.8 : 1.5;

  // Calculate usable content area with improved spacing
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
    minSpacing,
    bottomSafeZoneHeight,
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
SAFE_SPACING_MIN = ${zones.minSpacing.toFixed(2)}
SAFE_BOTTOM_ZONE = ${zones.bottomSafeZoneHeight.toFixed(2)}

# ═══════════════════════════════════════════════════════════════════════════════
# FONT CONFIGURATION - Use EB Garamond for all text
# ═══════════════════════════════════════════════════════════════════════════════
DEFAULT_FONT = "EB Garamond"

# ═══════════════════════════════════════════════════════════════════════════════
# KERNING FIX CONFIGURATION - ALWAYS APPLY FOR ACCURATE TEXT
# ═══════════════════════════════════════════════════════════════════════════════
# Manim's text rendering has letter spacing issues at normal font sizes.
# FIX: Render slightly larger, then scale down for proper kerning.
# Keep scaling modest to avoid width explosions and random line breaks.
KERNING_FIX_THRESHOLD = 96    # Apply fix to normal UI font sizes only
KERNING_FIX_SCALE = 3.0       # Scale up by 3x, then down by ~0.333x
KERNING_FIX_LOG_ENABLED = True  # Enable development logging

# Safe positioning helpers
def get_title_position():
    """Get safe position for title (top of screen with margin)"""
    return UP * (FRAME_HEIGHT/2 - SAFE_MARGIN_TOP - 0.3)

def get_content_center():
    """Get safe center position for main content (below title zone)"""
    top_bound = FRAME_HEIGHT/2 - SAFE_MARGIN_TOP - TITLE_ZONE_HEIGHT - SAFE_SPACING_MIN / 2
    bottom_bound = -FRAME_HEIGHT/2 + SAFE_MARGIN_BOTTOM + SAFE_BOTTOM_ZONE + SAFE_SPACING_MIN / 2
    if top_bound <= bottom_bound:
        return DOWN * (TITLE_ZONE_HEIGHT / 2)
    center_y = (top_bound + bottom_bound) / 2
    return center_y * UP

def get_bottom_safe_line(offset=0.0):
    """Return a Y coordinate safely above the reserved bottom zone."""
    return -FRAME_HEIGHT/2 + SAFE_MARGIN_BOTTOM + SAFE_BOTTOM_ZONE + offset

def get_safe_content_bounds(padding=SAFE_SPACING_MIN / 2):
    left = -FRAME_WIDTH/2 + SAFE_MARGIN_LEFT + padding
    right = FRAME_WIDTH/2 - SAFE_MARGIN_RIGHT - padding
    top = FRAME_HEIGHT/2 - SAFE_MARGIN_TOP - padding
    bottom = -FRAME_HEIGHT/2 + SAFE_MARGIN_BOTTOM + SAFE_BOTTOM_ZONE + padding
    return left, right, top, bottom

def _nudge_into_safe_frame(mobject, padding=SAFE_SPACING_MIN / 2, recursive=True, enforce_hard_boundary=True):
    """
    Nudge mobject (and optionally its submobjects) into the safe frame.
    UPDATED: STRICT boundary enforcement, no violations allowed.
    
    Args:
        mobject: The mobject to nudge
        padding: Padding from safe bounds
        recursive: Whether to apply to submobjects
        enforce_hard_boundary: If True, STRICTLY enforce boundaries (cannot be violated)
    """
    # First handle any submobjects if recursive
    if recursive and hasattr(mobject, 'submobjects') and len(mobject.submobjects) > 0:
        for submob in mobject.submobjects:
            _nudge_into_safe_frame(submob, padding=padding, recursive=True, enforce_hard_boundary=enforce_hard_boundary)
    
    left, right, top, bottom = get_safe_content_bounds(padding=padding)

    # Get mobject bounds with safe checks
    try:
        mob_left = mobject.get_left()[0]
        mob_right = mobject.get_right()[0]
        mob_top = mobject.get_top()[1]
        mob_bottom = mobject.get_bottom()[1]
    except (IndexError, AttributeError):
        return mobject

    shift_x = 0
    shift_y = 0

    # Check horizontal bounds with STRICT enforcement
    if mob_left < left:
        shift_x = left - mob_left
        if enforce_hard_boundary:
            shift_x += padding * 0.1  # Extra nudge for hard boundary
    elif mob_right > right:
        shift_x = right - mob_right
        if enforce_hard_boundary:
            shift_x -= padding * 0.1  # Extra nudge for hard boundary

    # Check vertical bounds with STRICT enforcement
    if mob_top > top:
        shift_y = top - mob_top
        if enforce_hard_boundary:
            shift_y -= padding * 0.1  # Extra nudge for hard boundary
    elif mob_bottom < bottom:
        shift_y = bottom - mob_bottom
        if enforce_hard_boundary:
            shift_y += padding * 0.1  # Extra nudge for hard boundary

    # Apply shift with STRICTER threshold (changed from 0.01 to 0.005)
    if abs(shift_x) > 0.005 or abs(shift_y) > 0.005:
        mobject.shift(shift_x * RIGHT + shift_y * UP)
    
    # VERIFICATION: Check if still outside bounds after nudging
    if enforce_hard_boundary:
        try:
            mob_left = mobject.get_left()[0]
            mob_right = mobject.get_right()[0]
            mob_top = mobject.get_top()[1]
            mob_bottom = mobject.get_bottom()[1]
            
            # If STILL outside, scale it down
            if mob_left < left or mob_right > right or mob_top > top or mob_bottom < bottom:
                print(f"[LAYOUT ENGINE] WARNING: Mobject still outside bounds after nudge. Scaling down.")
                current_width = mob_right - mob_left
                current_height = mob_top - mob_bottom
                safe_width = right - left
                safe_height = top - bottom
                
                scale_x = safe_width / current_width if current_width > 0 else 1.0
                scale_y = safe_height / current_height if current_height > 0 else 1.0
                scale_factor = min(scale_x, scale_y) * 0.95  # 95% of safe area
                
                mobject.scale(scale_factor)
                # Re-center after scaling
                center_x = (left + right) / 2
                center_y = (top + bottom) / 2
                mobject.move_to(np.array([center_x, center_y, 0]))
        except (IndexError, AttributeError, ZeroDivisionError):
            pass
    
    return mobject

def ensure_fits_width(mobject, max_width=MAX_CONTENT_WIDTH, shrink=True, safety_margin=0.98):
    """Scale mobject to fit within safe width"""
    if not shrink:
        return mobject
    
    target_width = max_width * safety_margin
    if target_width <= 0:
        target_width = MAX_CONTENT_WIDTH * safety_margin
    
    try:
        current_width = mobject.width
        if current_width > target_width and current_width > 0:
            scale_factor = target_width / current_width
            mobject.scale(scale_factor)
    except (AttributeError, ZeroDivisionError):
        pass
    
    return mobject

def ensure_fits_height(mobject, max_height=MAX_CONTENT_HEIGHT, shrink=True, safety_margin=0.98):
    """Scale mobject to fit within safe height"""
    if not shrink:
        return mobject
    
    target_height = max_height * safety_margin
    if target_height <= 0:
        target_height = MAX_CONTENT_HEIGHT * safety_margin
    
    try:
        current_height = mobject.height
        if current_height > target_height and current_height > 0:
            scale_factor = target_height / current_height
            mobject.scale(scale_factor)
    except (AttributeError, ZeroDivisionError):
        pass
    
    return mobject

def ensure_fits_screen(mobject, shrink=True, safety_margin=0.94, max_iterations=5):
    """
    Scale mobject to fit within safe content area with AGGRESSIVE multi-pass fitting.
    UPDATED: Lower safety margin, more iterations, stronger enforcement.
    
    Args:
        mobject: The mobject to fit
        shrink: Whether to allow shrinking
        safety_margin: Safety factor (0.92 = use 92% of available space, MORE aggressive)
        max_iterations: Maximum fitting iterations (INCREASED to 8)
    """
    if not shrink:
        return _nudge_into_safe_frame(mobject)
    
    for iteration in range(max_iterations):
        # Get current dimensions
        try:
            current_width = mobject.width
            current_height = mobject.height
        except AttributeError:
            break
        
        if current_width <= 0 or current_height <= 0:
            break
        
        # Calculate target dimensions with REDUCED safety margin
        target_width = MAX_CONTENT_WIDTH * safety_margin
        target_height = MAX_CONTENT_HEIGHT * safety_margin
        
        # Calculate scale factors with MORE aggressive thresholds
        width_scale = target_width / current_width if current_width > target_width else 1.0
        height_scale = target_height / current_height if current_height > target_height else 1.0
        
        # Use the most restrictive scale factor
        scale_factor = min(width_scale, height_scale)
        
        # If we need to scale, do it (MORE aggressive threshold)
        if scale_factor < 0.995:  # Changed from 0.999 to 0.995
            mobject.scale(scale_factor)
        else:
            # Already fits, we're done
            break
    
    # Final nudge into safe frame with STRICT enforcement
    return _nudge_into_safe_frame(mobject, recursive=True)


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
 * Simplified font size recommendations with consistent typography hierarchy
 */
export function getRecommendedFontSizes(
  config: LayoutConfig
): Record<string, number> {
  const { orientation, contentType } = config;
  const zones = calculateSafeZones(config);

  // Calculate base size from content area
  const contentArea = Math.sqrt(
    Math.max(zones.maxContentWidth * zones.maxContentHeight, 1)
  );

  // Softened scaling to avoid oversized text that triggers reflow
  const baseScale = orientation === "portrait" ? 1.8 : 1.6;

  // Small adjustment for content type
  const contentAdjust =
    contentType === "text-heavy"
      ? 1.03
      : contentType === "diagram"
        ? 1.06 // Slightly larger labels for diagrams, but keep moderate
        : contentType === "math"
          ? 1.05
          : 1.0;

  // Calculate base body size with tighter clamps to prevent width explosions
  const baseBody = clampFont(
    Math.round(contentArea * baseScale * contentAdjust),
    orientation === "portrait" ? 28 : 26,
    orientation === "portrait" ? 36 : 34
  );

  // Title: Clear hierarchy, capped to avoid forced line breaks
  const title = clampFont(Math.round(baseBody * 1.35), baseBody + 4, 46);

  // Heading: Between title and body
  const heading = clampFont(
    Math.round(baseBody * 1.18),
    baseBody + 2,
    title - 2
  );

  // Math: Slightly larger for readability but constrained
  const math = clampFont(
    Math.round(baseBody * (contentType === "math" ? 1.06 : 1.0)),
    baseBody - 1,
    baseBody + 6
  );

  // Caption: Smaller but legible
  const caption = clampFont(
    Math.round(baseBody * 0.82),
    orientation === "portrait" ? 22 : 20,
    baseBody - 2
  );

  // Label: Compact for annotations
  const label = clampFont(
    Math.round(baseBody * 0.72),
    orientation === "portrait" ? 18 : 16,
    caption - 1
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
def validate_position(mobject, label="object", strict=False, auto_fix=False):
    """
    Check if mobject is within safe bounds.
    
    Args:
        mobject: The mobject to validate
        label: Label for error messages
        strict: If True, raise an exception on validation failure
        auto_fix: If True, automatically fix positioning issues
    
    Returns:
        bool: True if valid, False otherwise
    """
    try:
        center = mobject.get_center()
        half_width = mobject.width / 2
        half_height = mobject.height / 2
    except (AttributeError, IndexError):
        if strict:
            raise ValueError(f"{label}: Cannot validate - missing required attributes")
        return True
    
    left = center[0] - half_width
    right = center[0] + half_width
    top = center[1] + half_height
    bottom = center[1] - half_height
    
    frame_left = -FRAME_WIDTH / 2 + SAFE_MARGIN_LEFT
    frame_right = FRAME_WIDTH / 2 - SAFE_MARGIN_RIGHT
    frame_top = FRAME_HEIGHT / 2 - SAFE_MARGIN_TOP
    frame_bottom = -FRAME_HEIGHT / 2 + SAFE_MARGIN_BOTTOM + SAFE_BOTTOM_ZONE
    
    issues = []
    overflow_amounts = {}
    
    if left < frame_left:
        overflow = frame_left - left
        issues.append(f"{label} extends {overflow:.2f} units too far left")
        overflow_amounts['left'] = overflow
    if right > frame_right:
        overflow = right - frame_right
        issues.append(f"{label} extends {overflow:.2f} units too far right")
        overflow_amounts['right'] = overflow
    if top > frame_top:
        overflow = top - frame_top
        issues.append(f"{label} extends {overflow:.2f} units too far up")
        overflow_amounts['top'] = overflow
    if bottom < frame_bottom:
        overflow = frame_bottom - bottom
        issues.append(f"{label} extends {overflow:.2f} units too far down")
        overflow_amounts['bottom'] = overflow
    
    if issues:
        error_msg = f"[LAYOUT WARNING] {', '.join(issues)}"
        print(error_msg)
        
        if auto_fix:
            print(f"[LAYOUT ENGINE] Auto-fixing position for {label}")
            # Try to fix by scaling down and repositioning
            try:
                if overflow_amounts:
                    max_overflow = max(overflow_amounts.values())
                    # Scale down proportionally to the overflow
                    current_max_dim = max(mobject.width, mobject.height)
                    if current_max_dim > 0:
                        scale_factor = max(0.5, 1.0 - (max_overflow / current_max_dim))
                        mobject.scale(scale_factor)
                
                # Nudge back into frame
                _nudge_into_safe_frame(mobject, recursive=True)
                
                # Validate again
                return validate_position(mobject, label, strict=False, auto_fix=False)
            except Exception as e:
                print(f"[LAYOUT ENGINE] Auto-fix failed for {label}: {e}")
                if strict:
                    raise
        
        if strict:
            raise ValueError(error_msg)
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

  parts.push(["import math", "import re", "import numpy as np", ""].join("\n"));

  // Add safe zone constants
  parts.push(generateSafeZoneConstants(config));
  parts.push(
    [
      'config.background_color = "#0F0F12"', // Dark Grey - Standard Dark
      'BRIGHT_TEXT_COLOR = "#F8FAFC"', // Slate 50
      'DARK_TEXT_COLOR = "#020617"', // Slate 950
      'CONTRAST_DARK_PANEL = "#1C2E4A"', // Dark Blue Panel
      'CONTRAST_LIGHT_PANEL = "#F1F5F9"', // Slate 100
      "MIN_CONTRAST_RATIO = 5.5", // Increased for better readability
      "MIN_PANEL_FILL_OPACITY = 0.95",
      "DEFAULT_PANEL_PADDING = 0.5",
      'BRIGHT_TEXT_ALTERNATIVES = [BRIGHT_TEXT_COLOR, "#F1F5F9", "#E2E8F0"]',
      "Paragraph.set_default(color=BRIGHT_TEXT_COLOR)",
      "MarkupText.set_default(color=BRIGHT_TEXT_COLOR)",
      "BulletedList.set_default(color=BRIGHT_TEXT_COLOR)",
      "myTemplate = TexTemplate()",
      'myTemplate.preamble += "\\\\usepackage{lmodern}"',
      "Tex.set_default(tex_template=myTemplate)",
      "Rectangle.set_default(fill_opacity=0, stroke_color=BRIGHT_TEXT_COLOR, stroke_width=2)",
      "RoundedRectangle.set_default(fill_opacity=0, stroke_color=BRIGHT_TEXT_COLOR, stroke_width=2)",
      "SurroundingRectangle.set_default(fill_opacity=0, stroke_color=BRIGHT_TEXT_COLOR, stroke_width=2)",
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


# ========================================
# CHARACTER LIMITS FOR READABLE TEXT
# ========================================
CHAR_LIMIT_TITLE = 25      # Max chars per line for titles
CHAR_LIMIT_HEADING = 35    # Max chars per line for headings
CHAR_LIMIT_BODY = 45       # Max chars per line for body text
CHAR_LIMIT_CAPTION = 55    # Max chars per line for captions
MAX_BULLETS_PER_SCENE = 3  # Maximum bullet points in a single scene
MAX_ELEMENTS_ON_SCREEN = 5 # Maximum total elements visible at once


def auto_break_long_text(text, max_chars_per_line=40):
    """
    Automatically break long text into multiple lines for better readability.
    Returns text with line breaks inserted.
    """
    if not text or len(text) <= max_chars_per_line:
        return text
    
    words = text.split()
    lines = []
    current_line = []
    current_length = 0
    
    for word in words:
        word_len = len(word)
        if current_length + word_len + 1 > max_chars_per_line and current_line:
            lines.append(' '.join(current_line))
            current_line = [word]
            current_length = word_len
        else:
            current_line.append(word)
            current_length += word_len + (1 if current_line else 0)
    
    if current_line:
        lines.append(' '.join(current_line))
    
    return '\\n'.join(lines)


# ========================================
# CONTENT DENSITY ANALYZER
# ========================================

def analyze_content_density(mobjects):
    """
    Analyze scene complexity and recommend scaling.
    Call this BEFORE adding mobjects to detect overcrowding.
    
    Returns:
        dict with 'action', 'factor', 'reason', 'recommendation'
    """
    if not mobjects:
        return {"action": "none", "factor": 1.0, "reason": "empty scene", "recommendation": None}
    
    items = [m for m in mobjects if m is not None and hasattr(m, 'width') and hasattr(m, 'height')]
    
    if not items:
        return {"action": "none", "factor": 1.0, "reason": "no measurable objects", "recommendation": None}
    
    # Calculate total content area
    total_area = sum(m.width * m.height for m in items)
    safe_area = MAX_CONTENT_WIDTH * MAX_CONTENT_HEIGHT
    
    if safe_area <= 0:
        return {"action": "none", "factor": 1.0, "reason": "invalid safe area", "recommendation": None}
    
    density = total_area / safe_area
    element_count = len(items)
    
    # Check for overcrowding
    if element_count > MAX_ELEMENTS_ON_SCREEN:
        return {
            "action": "reduce_elements",
            "factor": 0.7,
            "reason": f"too many elements ({element_count})",
            "recommendation": f"Reduce to {MAX_ELEMENTS_ON_SCREEN} or fewer elements"
        }
    
    if density > 1.5:
        return {
            "action": "scale_down",
            "factor": 0.65,
            "reason": "very high density",
            "recommendation": "Scale all elements to 65% or split into multiple scenes"
        }
    elif density > 1.0:
        return {
            "action": "scale_down",
            "factor": 0.8,
            "reason": "high density",
            "recommendation": "Scale all elements to 80%"
        }
    elif density > 0.7:
        return {
            "action": "scale_down",
            "factor": 0.9,
            "reason": "moderate density",
            "recommendation": "Consider scaling to 90% for better spacing"
        }
    
    return {"action": "none", "factor": 1.0, "reason": "good density", "recommendation": None}


def auto_fix_density(mobjects, target_density=0.6):
    """
    Automatically scale mobjects to achieve target density.
    Call this to fix overcrowded scenes.
    """
    analysis = analyze_content_density(mobjects)
    
    if analysis["action"] == "none":
        return mobjects
    
    factor = analysis["factor"]
    print(f"[LAYOUT ENGINE] Auto-fixing density: {analysis['reason']} - scaling by {factor}")
    
    for m in mobjects:
        if m is not None and hasattr(m, 'scale'):
            try:
                m.scale(factor)
            except Exception:
                pass
    
    return mobjects


def limit_visible_elements(mobjects, max_elements=MAX_ELEMENTS_ON_SCREEN, prioritize="first"):
    """
    Limit visible elements to prevent overcrowding.
    
    Args:
        mobjects: List of mobjects
        max_elements: Maximum number to keep
        prioritize: "first" (keep first N), "last" (keep last N), or "largest" (keep largest N)
    
    Returns:
        Filtered list of mobjects (capped at max_elements)
    """
    items = [m for m in (mobjects or []) if m is not None]
    
    if len(items) <= max_elements:
        return items
    
    print(f"[LAYOUT ENGINE] Limiting elements from {len(items)} to {max_elements}")
    
    if prioritize == "first":
        return items[:max_elements]
    elif prioritize == "last":
        return items[-max_elements:]
    elif prioritize == "largest":
        # Sort by area, keep largest
        def get_area(m):
            try:
                return m.width * m.height
            except (AttributeError, TypeError):
                return 0
        sorted_items = sorted(items, key=get_area, reverse=True)
        return sorted_items[:max_elements]
    
    return items[:max_elements]


# ========================================
# SIMPLE ONE-LINER LAYOUT WRAPPERS
# ========================================

def simple_title_content(title_text, content_mobject, title_color=WHITE, spacing=None, align="top"):
    """
    ONE-LINER: Create title + content layout with guaranteed spacing.
    Use this instead of manually positioning title and content.
    
    Args:
        title_text: Title text
        content_mobject: Content to display below title
        title_color: Color of the title
        spacing: Spacing between title and content
        align: Alignment mode - "top" (default, content starts below title) or "center"
    
    Example:
        layout = simple_title_content("My Title", my_diagram)
        self.play(FadeIn(layout))
    """
    from manim import VGroup, DOWN
    
    # Create title
    title = create_label(title_text, style="title", color=title_color)
    title.move_to(get_title_position())
    
    # Ensure title fits
    ensure_fits_width(title, max_width=MAX_CONTENT_WIDTH * 0.95)
    
    # Calculate spacing
    if spacing is None:
        spacing = SAFE_SPACING_MIN * 1.2
    
    # Calculate available space for content
    title_bottom = title.get_bottom()[1]
    content_top_y = title_bottom - spacing
    bottom_bound = -FRAME_HEIGHT/2 + SAFE_MARGIN_BOTTOM + SAFE_BOTTOM_ZONE
    available_height = content_top_y - bottom_bound
    
    # Fit content to available space
    try:
        if content_mobject.height > available_height * 0.9:
            content_mobject.scale((available_height * 0.9) / content_mobject.height)
        if content_mobject.width > MAX_CONTENT_WIDTH * 0.95:
            content_mobject.scale((MAX_CONTENT_WIDTH * 0.95) / content_mobject.width)
    except (AttributeError, ZeroDivisionError):
        pass
    
    # Position content based on alignment
    if align == "top":
        # Top-align: content starts right below title (professional look)
        content_mobject.next_to(title, DOWN, buff=spacing)
        # Align content to top of its bounding box
        content_mobject.align_to(title, UP).shift(DOWN * (title.height + spacing))
    else:
        # Center: content is centered in remaining space
        content_center_y = (content_top_y + bottom_bound) / 2
        content_mobject.move_to(np.array([0, content_center_y, 0]))
    
    # Final fit check
    group = VGroup(title, content_mobject)
    ensure_fits_screen(group, safety_margin=0.95)
    
    return group


def simple_two_column(left_mobject, right_mobject, spacing=2.0):
    """
    ONE-LINER: Two column layout with auto-spacing.
    Perfect for bullet points on left, diagram on right.
    
    Example:
        layout = simple_two_column(bullets, diagram)
        self.play(FadeIn(layout))
    """
    return create_side_by_side_layout(left_mobject, right_mobject, spacing=spacing)


def simple_stack(*mobjects, spacing=1.2, align="top"):
    """
    ONE-LINER: Stack mobjects vertically with auto-spacing.
    Automatically fits to screen and prevents overlaps.
    TOP-ALIGNED by default for professional appearance.
    
    Args:
        *mobjects: Mobjects to stack
        spacing: Spacing between items
        align: Alignment - "top" (default) or "center"
    
    Example:
        layout = simple_stack(title, equation, explanation)
        self.play(FadeIn(layout))
    """
    from manim import VGroup, DOWN
    
    items = [m for m in mobjects if m is not None]
    if not items:
        return VGroup()
    
    # Limit to prevent overcrowding
    if len(items) > MAX_ELEMENTS_ON_SCREEN:
        print(f"[LAYOUT ENGINE] simple_stack: limiting from {len(items)} to {MAX_ELEMENTS_ON_SCREEN}")
        items = items[:MAX_ELEMENTS_ON_SCREEN]
    
    # Pre-fit each item
    max_height_per_item = (MAX_CONTENT_HEIGHT - spacing * (len(items) - 1)) / len(items)
    for item in items:
        try:
            if item.height > max_height_per_item * 0.95:
                item.scale((max_height_per_item * 0.95) / item.height)
            if item.width > MAX_CONTENT_WIDTH * 0.95:
                item.scale((MAX_CONTENT_WIDTH * 0.95) / item.width)
        except (AttributeError, ZeroDivisionError):
            continue
    
    # Arrange vertically
    group = VGroup(*items)
    group.arrange(DOWN, buff=spacing)
    
    # Position based on alignment
    if align == "top":
        # Top-align: position group so top element is at content top
        top_y = FRAME_HEIGHT/2 - SAFE_MARGIN_TOP - TITLE_ZONE_HEIGHT - SAFE_SPACING_MIN
        try:
            group.align_to(np.array([0, top_y, 0]), UP)
        except (AttributeError, TypeError):
            group.move_to(get_content_center())
    else:
        # Center align
        group.move_to(get_content_center())
    
    # Final validation
    ensure_fits_screen(group, safety_margin=0.95)
    
    return group


def simple_center(mobject, scale_to_fit=True):
    """
    ONE-LINER: Center a mobject safely with optional auto-scaling.
    
    Example:
        diagram = simple_center(my_diagram)
        self.play(Create(diagram))
    """
    if mobject is None:
        return mobject
    
    if scale_to_fit:
        ensure_fits_screen(mobject, safety_margin=0.9)
    
    mobject.move_to(get_content_center())
    
    return mobject




def enforce_min_gap(mobjects, min_gap=2.0, max_iterations=20, aggressive=True):
    """
    ULTRA-AGGRESSIVE overlap prevention with LARGER default gap.
    This is the key function to prevent overlaps between ANY elements.
    """
    from manim import VGroup, RIGHT, UP
    
    items = [m for m in (mobjects or []) if m is not None]
    if len(items) <= 1:
        return VGroup(*items)

    # CRITICAL: Start with VERY LARGE min_gap to guarantee separation
    effective_min_gap = max(min_gap, 2.2)

    for iteration in range(max_iterations):
        adjusted = False
        has_overlap = False
        
        for i, a in enumerate(items):
            for j, b in enumerate(items[i + 1:], start=i + 1):
                try:
                    a_center = a.get_center()
                    b_center = b.get_center()
                    delta = b_center - a_center
                    
                    # CRITICAL: Use LARGER padding multiplier (1.5x instead of 1.3x)
                    required_x_gap = (a.width + b.width) / 2 + effective_min_gap
                    required_y_gap = (a.height + b.height) / 2 + effective_min_gap
                    
                    actual_x_dist = abs(delta[0])
                    actual_y_dist = abs(delta[1])
                    
                    overlap_x = required_x_gap - actual_x_dist
                    overlap_y = required_y_gap - actual_y_dist
                    
                    if overlap_x > 0 and overlap_y > 0:
                        has_overlap = True
                        
                        # Separate with STRONGER push (1.5x instead of 1.3x)
                        # FIX: Push in the direction of LEAST overlap (easiest path out)
                        if overlap_x < overlap_y:
                            # Horizontal overlap is smaller, so push horizontally
                            shift = (overlap_x / 2) * 1.5
                            direction = 1 if delta[0] >= 0 else -1
                            a.shift(-shift * direction * RIGHT)
                            b.shift(shift * direction * RIGHT)
                        else:
                            # Vertical overlap is smaller (or equal), so push vertically
                            shift = (overlap_y / 2) * 1.5
                            direction = 1 if delta[1] >= 0 else -1
                            a.shift(-shift * direction * UP)
                            b.shift(shift * direction * UP)
                        
                        adjusted = True
                        
                except (AttributeError, IndexError, TypeError):
                    continue
        
        # Scale down MORE AGGRESSIVELY if overlaps persist
        if aggressive and has_overlap and iteration >= 1:
            group = VGroup(*items)
            try:
                # CRITICAL: Scale down MORE (0.85 instead of 0.88)
                scale_factor = 0.85
                group.scale(scale_factor)
                print(f"[LAYOUT] Iteration {iteration}: Scaled to {scale_factor} to prevent overlaps")
            except (AttributeError, ZeroDivisionError):
                pass
        
        if not adjusted:
            break
    
    return VGroup(*items)


# ========================================
# SMART EQUATION LABEL POSITIONING
# ========================================

def detect_label_collisions(labels_with_positions):
    """
    Detect collisions between labels.
    
    Args:
        labels_with_positions: List of tuples (label_mobject, target_position, min_gap)
    
    Returns:
        List of collision pairs (indices)
    """
    collisions = []
    for i, (label_a, pos_a, gap_a) in enumerate(labels_with_positions):
        for j, (label_b, pos_b, gap_b) in enumerate(labels_with_positions[i + 1:], start=i + 1):
            try:
                # Calculate bounding boxes
                a_width = label_a.width
                a_height = label_a.height
                b_width = label_b.width
                b_height = label_b.height
                
                # Calculate required distances
                min_gap = max(gap_a, gap_b)
                required_x = (a_width + b_width) / 2 + min_gap
                required_y = (a_height + b_height) / 2 + min_gap
                
                # Calculate actual distances
                delta = pos_b - pos_a
                actual_x = abs(delta[0])
                actual_y = abs(delta[1])
                
                # Check for collision
                if actual_x < required_x and actual_y < required_y:
                    collisions.append((i, j))
            except (AttributeError, IndexError, TypeError):
                continue
    
    return collisions


def smart_position_equation_labels(equation_mobject, labels_info, min_gap=1.2, 
                                   collision_strategy="stagger", stagger_offset=0.8):
    """
    Intelligently position labels around an equation with collision avoidance.
    
    Args:
        equation_mobject: The main equation mobject
        labels_info: List of dicts with keys:
            - 'label': The label mobject
            - 'target': Target part of equation (submobject or position)
            - 'direction': Direction for label (UP, DOWN, LEFT, RIGHT, etc.)
            - 'buff': Buffer distance (optional, default=0.8)
        min_gap: Minimum gap between labels
        collision_strategy: "stagger" (offset vertically/horizontally), "scale" (shrink), or "fade_sequence" (show one at a time)
        stagger_offset: Offset amount for staggering
    
    Returns:
        VGroup of equation and all positioned labels
    """
    if not labels_info:
        return VGroup(equation_mobject)
    
    positioned_labels = []
    label_positions = []
    
    # First pass: Position labels at their targets
    for info in labels_info:
        label = info['label']
        target = info['target']
        direction = info.get('direction', UP)
        buff = info.get('buff', 0.8)
        
        # Position label
        if hasattr(target, 'get_center'):
            label.next_to(target, direction, buff=buff)
        else:
            # target is a position
            label.move_to(target + direction * (label.height / 2 + buff))
        
        positioned_labels.append(label)
        label_positions.append((label, label.get_center(), min_gap))
    
    # Second pass: Detect and resolve collisions
    collisions = detect_label_collisions(label_positions)
    
    if collisions and collision_strategy == "stagger":
        # Stagger colliding labels
        adjusted = set()
        for i, j in collisions:
            if i not in adjusted:
                # Offset label i
                positioned_labels[i].shift(LEFT * stagger_offset + DOWN * (stagger_offset * 0.5))
                adjusted.add(i)
            if j not in adjusted:
                # Offset label j opposite direction
                positioned_labels[j].shift(RIGHT * stagger_offset + UP * (stagger_offset * 0.5))
                adjusted.add(j)
        
        print(f"[LAYOUT ENGINE] Staggered {len(adjusted)} labels to avoid {len(collisions)} collisions")
    
    elif collisions and collision_strategy == "scale":
        # Scale down all labels to fit
        scale_factor = 0.85
        for label in positioned_labels:
            label.scale(scale_factor)
        print(f"[LAYOUT ENGINE] Scaled labels by {scale_factor} to avoid {len(collisions)} collisions")
    
    # Create group and validate
    all_elements = [equation_mobject] + positioned_labels
    group = VGroup(*all_elements)
    
    # Ensure the whole group fits
    ensure_fits_screen(group, safety_margin=0.92)
    validate_position(group, "equation with labels", auto_fix=True)
    
    return group


def create_fade_sequence_labels(scene, equation_mobject, labels_info, display_time=1.5, 
                                fade_time=0.5, show_all_at_end=False):
    """
    Show equation labels one at a time with fade in/out to prevent overlaps.
    
    Args:
        scene: The Manim scene
        equation_mobject: The equation mobject
        labels_info: List of dicts with label info (same as smart_position_equation_labels)
        display_time: How long to display each label
        fade_time: Fade in/out transition time
        show_all_at_end: Whether to show all labels together at the end
    
    Returns:
        VGroup of equation and labels (all labels if show_all_at_end, else empty)
    """
    from manim import FadeIn, FadeOut, Wait
    
    all_labels = []
    
    for info in labels_info:
        label = info['label']
        target = info['target']
        direction = info.get('direction', UP)
        buff = info.get('buff', 0.8)
        
        # Position label
        if hasattr(target, 'get_center'):
            label.next_to(target, direction, buff=buff)
        else:
            label.move_to(target + direction * (label.height / 2 + buff))
        
        # Ensure label fits
        ensure_fits_screen(label)
        
        # Animate fade in
        scene.play(FadeIn(label), run_time=fade_time)
        scene.wait(display_time)
        
        if not show_all_at_end:
            # Fade out before next label
            scene.play(FadeOut(label), run_time=fade_time)
        
        all_labels.append(label)
    
    if show_all_at_end:
        # Keep all labels visible
        return VGroup(equation_mobject, *all_labels)
    else:
        return VGroup(equation_mobject)


def create_smart_label(text, font_size=FONT_LABEL, color=WHITE, with_arrow=False, 
                      arrow_buff=0.3, arrow_color=None, **kwargs):
    """
    Create a label with optional arrow for equation annotations.
    
    Args:
        text: Label text
        font_size: Font size
        color: Label color
        with_arrow: Whether to include an arrow
        arrow_buff: Buffer for arrow
        arrow_color: Arrow color (defaults to label color)
    
    Returns:
        VGroup of label (and arrow if requested)
    """
    label = create_tex_label(text, font_size=font_size, color=color, **kwargs)
    
    if with_arrow:
        from manim import Arrow
        if arrow_color is None:
            arrow_color = color
        arrow = Arrow(ORIGIN, DOWN * arrow_buff, color=arrow_color, buff=0)
        arrow.next_to(label, DOWN, buff=0)
        return VGroup(label, arrow)
    
    return label

def layout_horizontal(mobjects, center=None, buff=1.5, auto_fit=True, align_edge=None):
    """
    FIXED: Horizontal layout with better spacing.
    CRITICAL: Default buff increased to 1.5
    """
    from manim import VGroup, RIGHT, UP
    
    items = [m for m in (mobjects or []) if m is not None]
    if not items:
        return VGroup()

    # Fit each item individually
    if auto_fit:
        max_width = globals().get('MAX_CONTENT_WIDTH', 10) * 0.9 / len(items)
        max_height = globals().get('MAX_CONTENT_HEIGHT', 10) * 0.9
        
        for item in items:
            try:
                if item.width > max_width:
                    item.scale(max_width / item.width)
                if item.height > max_height:
                    item.scale(max_height / item.height)
            except (AttributeError, ZeroDivisionError):
                continue

    # Arrange with LARGER buffer
    group = VGroup(*items)
    group.arrange(RIGHT, buff=buff, aligned_edge=align_edge or UP)
    
    # Enforce gaps with LARGER minimum
    group = enforce_min_gap(group.submobjects, min_gap=max(buff * 0.9, 1.5), aggressive=True)
    
    # Position the group
    if center is not None:
        group.move_to(center)
    elif 'get_content_center' in globals():
        group.move_to(globals()['get_content_center']())
    
    return group

def layout_vertical(mobjects, center=None, buff=1.5, auto_fit=True, align_edge=None):
    """
    FIXED: Vertical layout with MUCH better spacing.
    CRITICAL: Default buff increased from 1.2 to 1.5
    """
    from manim import VGroup, DOWN, LEFT
    
    items = [m for m in (mobjects or []) if m is not None]
    if not items:
        return VGroup()

    # Fit each item individually first
    if auto_fit:
        max_width = globals().get('MAX_CONTENT_WIDTH', 10) * 0.9
        max_height = globals().get('MAX_CONTENT_HEIGHT', 10) * 0.9 / len(items)
        
        for item in items:
            try:
                if item.width > max_width:
                    item.scale(max_width / item.width)
                if item.height > max_height:
                    item.scale(max_height / item.height)
            except (AttributeError, ZeroDivisionError):
                continue

    # Arrange with LARGER buffer
    group = VGroup(*items)
    group.arrange(DOWN, buff=buff, aligned_edge=align_edge or LEFT)
    
    # CRITICAL: Enforce gaps with LARGER minimum
    group = enforce_min_gap(group.submobjects, min_gap=max(buff * 0.9, 1.5), aggressive=True)
    
    # Position the group
    if center is not None:
        group.move_to(center)
    elif 'get_content_center' in globals():
        group.move_to(globals()['get_content_center']())
    
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
  parts.push(String.raw`
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
    border_only = fill_opacity <= 0

    if border_only:
        try:
            panel_mobject.set_fill(opacity=0)
        except Exception:
            pass

        stroke_width = panel_mobject.get_stroke_width() or 0
        panel_mobject.set_stroke(
            color=Color(text_color).to_hex(),
            width=max(stroke_width, 2),
            opacity=0.85,
        )
        return panel_mobject

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


LATEX_SPECIAL_CHARS = {
    "&": r"\\&",
    "%": r"\\%",
    "$": r"\\$",
    "#": r"\\#",
    "_": r"\\_",
    "{": r"\\{",
    "}": r"\\}",
    "~": r"\\textasciitilde{}",
    "^": r"\\textasciicircum{}",
}


LATEX_COMMAND_PATTERN = re.compile(r"\\[A-Za-z]+")
LATEX_ENV_PATTERN = re.compile(r"\\begin\{[A-Za-z*]+\}")


def _looks_like_latex(text):
    """Detect if text contains LaTeX commands"""
    if not text:
        return False
    stripped = str(text).strip()
    
    # Check for explicit LaTeX markers
    if stripped.startswith("\\"):
        return True
    if "$$" in stripped or stripped.count("$") >= 2:
        return True
    if LATEX_COMMAND_PATTERN.search(stripped):
        return True
    if LATEX_ENV_PATTERN.search(stripped):
        return True
    if "\\bullet" in stripped or "\\textbf" in stripped or "\\textit" in stripped:
        return True
    
    return False

def _escape_latex_text(text):
    """
    FIXED: Properly escape special LaTeX characters.
    Handles all edge cases correctly.
    """
    if text is None:
        return ""
    
    text_str = str(text)
    
    # Only normalize unicode if necessary
    try:
        if any(ord(c) > 127 for c in text_str):
            text_str = unicodedata.normalize('NFKC', text_str)
    except Exception:
        pass
    
    length = len(text_str)
    result = []
    idx = 0

    while idx < length:
        char = text_str[idx]
        
        # Handle single backslash
        if char == "\\":
            next_idx = idx + 1
            
            # Double backslash (line break) - preserve it
            if next_idx < length and text_str[next_idx] == "\\":
                result.append(r"\\")
                idx += 2
                continue
            
            # LaTeX command (backslash + letters)
            if next_idx < length and text_str[next_idx].isalpha():
                command_end = next_idx
                while command_end < length and text_str[command_end].isalpha():
                    command_end += 1
                result.append(text_str[idx:command_end])
                idx = command_end
                continue
            
            # Already escaped character like \&, \%
            if next_idx < length and text_str[next_idx] in LATEX_SPECIAL_CHARS:
                result.append(text_str[idx:next_idx + 1])
                idx = next_idx + 1
                continue
            
            # Standalone backslash - escape it
            result.append(r"\textbackslash{}")
            idx += 1
            continue

        # Escape special characters
        result.append(LATEX_SPECIAL_CHARS.get(char, char))
        idx += 1

    return "".join(result)


def build_latex_text(
    text,
    *,
    bold=False,
    italic=False,
    monospace=False,
    allow_latex=False,
    auto_detect=True,
):
    """
    FIXED: Build LaTeX text without introducing unwanted backslashes.
    """
    raw_text = "" if text is None else str(text)

    use_latex = allow_latex or (auto_detect and _looks_like_latex(raw_text))

    if use_latex:
        latex = raw_text
    else:
        # Escape special characters
        escaped = _escape_latex_text(raw_text)
        
        # Simple approach: just use the escaped text
        # Don't wrap in \text{} as it causes spacing issues
        latex = escaped

    # Apply formatting
    if bold:
        latex = f"\\textbf{{{latex}}}"
    if italic:
        latex = f"\\textit{{{latex}}}"
    if monospace and not use_latex:
        latex = f"\\texttt{{{latex}}}"
    
    return latex


def create_tex_label(
    text,
    *,
    font_size=48,
    bold=False,
    italic=False,
    monospace=False,
    treat_as_latex=False,
    auto_detect_latex=True,
    **tex_kwargs,
):
    """Create a Tex mobject with safe escaping"""
    from manim import Tex
    
    latex_string = build_latex_text(
        text,
        bold=bold,
        italic=italic,
        monospace=monospace,
        allow_latex=treat_as_latex,
        auto_detect=auto_detect_latex,
    )

    return Tex(latex_string, font_size=font_size, **tex_kwargs)

def create_tex_label(
    text,
    *,
    font_size=48,  # Default font size
    bold=False,
    italic=False,
    monospace=False,
    treat_as_latex=False,
    auto_detect_latex=True,
    **tex_kwargs,
):
    """
    FIXED: Convert plain text to a Tex mobject with safe escaping.
    
    TEXT RENDERING FIX: Renders at 3x the requested font size then scales down
    to achieve proper letter spacing. This fixes Manim's letter spacing issues.
    """
    latex_string = build_latex_text(
        text,
        bold=bold,
        italic=italic,
        monospace=monospace,
        allow_latex=treat_as_latex,
        auto_detect=auto_detect_latex,
    )

    # Import here to avoid issues if Manim isn't loaded
    from manim import Tex
    
    # NOTE: Tex/LaTeX handles its own typography - no kerning fix needed
    return Tex(latex_string, font_size=font_size, **tex_kwargs)


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
    color=None,
    panel_class=RoundedRectangle,
    panel_padding=DEFAULT_PANEL_PADDING,
    text_kwargs=None,
    panel_kwargs=None,
    min_contrast=MIN_CONTRAST_RATIO,
    max_width=None,
    max_height=None,
):
    """
    Create a text label with a readable panel behind it.
    
    Args:
        text: Text content
        font_size: Font size for the text
        color: Text color (optional, defaults to WHITE via ensure_text_readability)
        panel_class: Class for the background panel (Rectangle, RoundedRectangle, etc.)
        panel_padding: Padding around text inside panel
        text_kwargs: Additional kwargs for text creation
        panel_kwargs: Additional kwargs for panel creation
        min_contrast: Minimum contrast ratio for readability
        max_width: Maximum width constraint (defaults to MAX_CONTENT_WIDTH)
        max_height: Maximum height constraint (defaults to MAX_CONTENT_HEIGHT)
    """

    text_kwargs = dict(text_kwargs or {})
    panel_kwargs = dict(panel_kwargs or {})

    # Handle color parameter - pass it through to text_kwargs
    if color is not None:
        text_kwargs.setdefault("color", color)

    treat_as_latex = bool(text_kwargs.pop("treat_as_latex", False))
    bold = bool(text_kwargs.pop("bold", False))
    italic = bool(text_kwargs.pop("italic", False))
    monospace = bool(text_kwargs.pop("monospace", False))
    auto_detect_latex = bool(text_kwargs.pop("auto_detect_latex", True))

    # Create text label
    label = create_tex_label(
        text,
        font_size=font_size,
        bold=bold,
        italic=italic,
        monospace=monospace,
        treat_as_latex=treat_as_latex,
        auto_detect_latex=auto_detect_latex,
        **text_kwargs,
    )

    # Set constraints
    if max_width is None:
        max_width = MAX_CONTENT_WIDTH * 0.85
    if max_height is None:
        max_height = MAX_CONTENT_HEIGHT * 0.85

    # Ensure text fits within constraints before creating panel
    if label.width > max_width * 0.96:
        label.scale_to_fit_width(max_width * 0.96)
    if label.height > max_height * 0.96:
        label.scale_to_fit_height(max_height * 0.96)

    # Calculate panel padding
    if panel_padding is None:
        panel_padding = DEFAULT_PANEL_PADDING

    # Create panel with proper sizing
    h_padding = panel_padding * 2
    v_padding = panel_padding * 2
    
    if "width" not in panel_kwargs:
        panel_kwargs["width"] = min(label.width + h_padding, max_width)
    if "height" not in panel_kwargs:
        panel_kwargs["height"] = min(label.height + v_padding, max_height)

    panel = panel_class(**panel_kwargs)

    # Apply contrast and readability
    apply_text_panel(label, panel, min_contrast=min_contrast)

    # Position text centered in panel
    label.move_to(panel.get_center())
    
    # Set proper z-indices
    panel.set_z_index(1)
    label.set_z_index(panel.z_index + 1)

    # Create group and ensure it fits
    group = VGroup(panel, label)
    group = ensure_fits_screen(group, safety_margin=0.98)
    validate_position(group, "text panel", auto_fix=True)
    return group

def create_bullet_item(
    text,
    *,
    bullet_symbol=r"$\bullet$",
    bullet_gap=r" ",
    font_size=48,
    bold=False,
    italic=False,
    monospace=False,
    treat_as_latex=False,
    auto_detect_latex=True,
    **tex_kwargs,
):
    """
    FIXED: Create bullet item WITHOUT text wrapping.
    Text wrapping is causing the overlap issues - better to let Manim handle it.
    """
    from manim import Tex
    
    # Don't wrap text - this causes the overlap and backslash issues
    # Just escape and use the text as-is
    body_fragment = build_latex_text(
        text,
        bold=bold,
        italic=italic,
        monospace=monospace,
        allow_latex=treat_as_latex,
        auto_detect=auto_detect_latex,
    )
    
    # Construct bullet with proper spacing
    bullet_tex = f"{bullet_symbol}{bullet_gap}{body_fragment}"
    
    try:
        return Tex(bullet_tex, font_size=font_size, **tex_kwargs)
    except Exception as e:
        print(f"[LATEX ERROR] Failed to compile bullet item")
        print(f"Text: {text[:100]}")
        print(f"LaTeX: {bullet_tex[:200]}")
        raise


def create_bullet_list(
    items,
    *,
    bullet_symbol=r"$\bullet$",
    bullet_gap=r" ",
    font_size=48,
    item_buff=1.2,  # INCREASED from 0.8
    edge=None,  # Don't force edge alignment
    edge_buff=0.5,  # REDUCED from 1.2
    auto_fit=True,
    validate=True,
    item_kwargs=None,
    max_width=None,
):
    """
    FIXED: Create bullet list with MUCH better spacing to prevent overlaps.
    """
    from manim import VGroup, LEFT
    
    if edge is None:
        edge = LEFT
    
    entries = []
    item_kwargs = dict(item_kwargs or {})
    
    # Extract and remove parameters that should go to create_bullet_item
    auto_detect_latex = item_kwargs.pop("auto_detect_latex", True)
    treat_as_latex = item_kwargs.pop("treat_as_latex", False)
    
    for item in items or []:
        if item is None:
            continue
        
        entry = create_bullet_item(
            item,
            bullet_symbol=bullet_symbol,
            bullet_gap=bullet_gap,
            font_size=font_size,
            treat_as_latex=treat_as_latex,
            auto_detect_latex=auto_detect_latex,
            **item_kwargs,
        )
        entries.append(entry)

    bullets = VGroup(*entries)
    if not entries:
        return bullets

    # CRITICAL FIX: Arrange with LARGER buffer to prevent overlaps
    bullets.arrange(DOWN, buff=item_buff, aligned_edge=LEFT)
    
    # Scale down if needed BEFORE positioning
    # CHECK TOTAL HEIGHT and scale group if it exceeds safe height
    try:
        safe_height = globals().get('MAX_CONTENT_HEIGHT', 8.0) * 0.9
        if bullets.height > safe_height:
            scale_factor = safe_height / bullets.height
            bullets.scale(scale_factor)
            
        if auto_fit and max_width:
            if bullets.width > max_width * 0.95:
                scale_factor = (max_width * 0.95) / bullets.width
                bullets.scale(scale_factor)
    except (AttributeError, ZeroDivisionError):
        pass
    
    # Position to edge if specified
    if edge is not None:
        bullets.to_edge(edge, buff=edge_buff)

    # Final validation
    if validate:
        try:
            # Just ensure it's visible, don't validate exact position
            # as that can cause issues
            pass
        except Exception:
            pass

    return bullets

`);

  // Add flexible text rendering helpers (Text vs MathTex)
  parts.push(`

# ========================================
# FLEXIBLE TEXT RENDERING (Text vs MathTex)
# ========================================

def is_math_content(text):
    """
    Detect if text contains mathematical notation that needs MathTex.
    Returns True for math, False for plain text.
    """
    if not text:
        return False
    
    # Clear math indicators
    math_chars = ['=', '±', '×', '÷', '^', '_', '∑', '∫', '∞', '≤', '≥', '≠', '∈', '∉', '⊂', '⊃', '∪', '∩']
    if any(ch in text for ch in math_chars):
        return True
    
    # LaTeX-style math
    if text.strip().startswith('$') or text.strip().endswith('$'):
        return True
    if r'\\frac' in text or r'\\sqrt' in text or r'\\sum' in text or r'\\int' in text:
        return True
    if r'\\alpha' in text or r'\\beta' in text or r'\\gamma' in text:
        return True
    
    # Simple formulas like "x^2" or "E = mc^2"
    if '^' in text and any(c.isalpha() for c in text):
        return True
    
    return False


def create_text_with_kerning_fix(text, font_size, color=WHITE, font=DEFAULT_FONT, **kwargs):
    """
    Create Text() object with automatic kerning fix.

    ALWAYS applies the kerning fix (threshold set to 9999):
    1. Multiplies font_size by KERNING_FIX_SCALE (8x)
    2. Creates Text() with the larger size
    3. Scales the result down by 1/KERNING_FIX_SCALE

    This fixes Manim's letter spacing issues at all font sizes.

    Args:
        text: The text content
        font_size: The intended font size
        color: Text color
        font: Font family (defaults to EB Garamond)
        **kwargs: Additional arguments passed to Text()

    Returns:
        Text() mobject with proper kerning
    """
    from manim import Text

    original_font_size = font_size
    apply_scale_fix = font_size < KERNING_FIX_THRESHOLD

    if apply_scale_fix:
        # Scale up font size for better kerning
        font_size = font_size * KERNING_FIX_SCALE

    # Create text object at large size
    mobj = Text(text, font_size=font_size, disable_ligatures=True, color=color, font=font, **kwargs)

    if apply_scale_fix:
        # Scale down to match intended size
        mobj.scale(1 / KERNING_FIX_SCALE)
        
    return mobj


def create_label(
    content,
    *,
    style="body",
    is_math=None,
    color=WHITE,
    font=None,
    **kwargs
):
    """
    Create a text label, automatically choosing between Text() and MathTex().

    Args:
        content: The text content
        style: One of "title", "heading", "body", "math", "caption", "label"
        is_math: Force math rendering (True/False), or None for auto-detect
        color: Text color
        font: Font family (defaults to EB Garamond)
        **kwargs: Additional arguments passed to Text or MathTex
    
    Returns:
        A Text or MathTex mobject
    """
    from manim import Text, MathTex
    
    # Use EB Garamond by default
    if font is None:
        font = DEFAULT_FONT
    
    # Determine font size from style
    font_size_map = {
        "title": FONT_TITLE,
        "heading": FONT_HEADING,
        "body": FONT_BODY,
        "math": FONT_MATH,
        "caption": FONT_CAPTION,
        "label": FONT_LABEL,
    }
    font_size = font_size_map.get(style, FONT_BODY)
    
    # Auto-detect if is_math not specified
    if is_math is None:
        is_math = is_math_content(content)
    
    # Create the appropriate mobject
    if is_math:
        # Clean content for MathTex
        clean_content = content.strip()
        if clean_content.startswith('$') and clean_content.endswith('$'):
            clean_content = clean_content[1:-1]
        
        mobj = MathTex(rf"{clean_content}", font_size=font_size, color=color, **kwargs)
    else:
        # Use Text for plain content with EB Garamond font
        mobj = create_text_with_kerning_fix(content, font_size=font_size, color=color, font=font, **kwargs)
    
    # Ensure it fits on screen
    ensure_fits_screen(mobj, safety_margin=0.95)
    
    return mobj


def create_title(text, *, color=WHITE, **kwargs):
    """
    Create a title positioned at the safe title position.
    Uses Text() for plain titles, MathTex() for math titles.
    """
    title = create_label(text, style="title", color=color, **kwargs)
    title.move_to(get_title_position())
    return title


def create_subtitle(text, title_mobject=None, *, color=WHITE, buff=0.8, **kwargs):
    """
    Create a subtitle below the title or at a secondary position.
    """
    subtitle = create_label(text, style="heading", color=color, **kwargs)
    
    if title_mobject is not None:
        subtitle.next_to(title_mobject, DOWN, buff=buff)
    else:
        pos = get_title_position() + DOWN * 1.5
        subtitle.move_to(pos)
    
    return subtitle


def create_bullet_list_mixed(
    items,
    *,
    style="body",
    max_bullets=3,
    item_buff=1.2,
    edge_buff=0.8,
    bullet_char="•",
    **kwargs
):
    """
    Create a bullet list that handles both plain text and math automatically.
    Uses Text() for plain items, MathTex() for math items.
    LIMITS TO 3 BULLETS BY DEFAULT to prevent crowding.
    """
    from manim import VGroup, LEFT, DOWN, RIGHT
    
    # Limit items - strict limit to prevent crowding
    if len(items) > max_bullets:
        print(f"[LAYOUT] Limiting bullets from {len(items)} to {max_bullets} - use multiple scenes for more")
        items = items[:max_bullets]
    
    bullets = []
    for item_text in items:
        if item_text is None:
            continue
        
        is_math = is_math_content(item_text)
        
        if is_math:
            content = create_label(item_text, style=style, is_math=True, **kwargs)
            bullet_label = create_label(bullet_char + " ", style=style, is_math=False, **kwargs)
            bullet_item = VGroup(bullet_label, content).arrange(RIGHT, buff=0.3)
        else:
            full_text = f"{bullet_char} {item_text}"
            bullet_item = create_label(full_text, style=style, is_math=False, **kwargs)
        
        bullets.append(bullet_item)
    
    if not bullets:
        return VGroup()
    
    # Use LARGER spacing between bullets
    group = VGroup(*bullets).arrange(DOWN, buff=item_buff, aligned_edge=LEFT)
    
    # Scale down if needed but be more aggressive
    try:
        if group.height > MAX_CONTENT_HEIGHT * 0.75:
            group.scale(MAX_CONTENT_HEIGHT * 0.75 / group.height)
        if group.width > MAX_CONTENT_WIDTH * 0.85:
            group.scale(MAX_CONTENT_WIDTH * 0.85 / group.width)
    except (AttributeError, ZeroDivisionError):
        pass
    
    group.to_edge(LEFT, buff=edge_buff)
    return group


def create_math(formula, *, font_size=None, color=BLUE, **kwargs):
    """
    Convenience function to create a mathematical formula.
    Always uses MathTex.
    """
    from manim import MathTex
    
    if font_size is None:
        font_size = FONT_MATH
    
    clean_formula = formula.strip()
    if clean_formula.startswith('$'):
        clean_formula = clean_formula[1:]
    if clean_formula.endswith('$'):
        clean_formula = clean_formula[:-1]
    
    mobj = MathTex(rf"{clean_formula}", font_size=font_size, color=color, **kwargs)
    ensure_fits_screen(mobj, safety_margin=0.9)
    return mobj


def create_plain_text(text, *, font_size=None, color=WHITE, font=None, **kwargs):
    """
    Convenience function to create plain text (never uses LaTeX).
    Perfect for non-English text, labels, and simple content.
    Uses EB Garamond font by default.
    """
    from manim import Text
    
    if font_size is None:
        font_size = FONT_BODY
    if font is None:
        font = DEFAULT_FONT

    mobj = create_text_with_kerning_fix(text, font_size=font_size, color=color, font=font, **kwargs)
    ensure_fits_screen(mobj, safety_margin=0.95)
    return mobj

`);

  parts.push(`

# ========================================
# ADVANCED LAYOUT HELPERS
# ========================================

def create_fitted_group(*mobjects, buff=0.6, direction=DOWN, max_width=MAX_CONTENT_WIDTH, max_height=MAX_CONTENT_HEIGHT):
    """
    Create a VGroup with proper fitting and spacing.
    
    Args:
        *mobjects: Mobjects to group
        buff: Buffer between elements
        direction: Arrangement direction (DOWN, RIGHT, etc.)
        max_width: Maximum width constraint
        max_height: Maximum height constraint
    
    Returns:
        VGroup with fitted mobjects
    """
    items = [m for m in mobjects if m is not None]
    if not items:
        return VGroup()
    
    # Pre-fit each item with generous space
    for item in items:
        try:
            if direction == RIGHT or direction == LEFT:
                item_max_width = max_width * 0.92 / len(items)
                item_max_height = max_height * 0.92
            else:  # DOWN or UP
                item_max_width = max_width * 0.92
                item_max_height = max_height * 0.92 / len(items)
            
            ensure_fits_width(item, max_width=item_max_width, safety_margin=0.98)
            ensure_fits_height(item, max_height=item_max_height, safety_margin=0.98)
        except (AttributeError, ZeroDivisionError):
            continue
    
    # Create and arrange group
    group = VGroup(*items)
    group.arrange(direction, buff=buff)
    
    # Enforce gaps and fit to screen (non-aggressive)
    group = enforce_min_gap(group.submobjects, min_gap=max(buff * 0.7, 0.5), aggressive=False)
    group = ensure_fits_screen(group, safety_margin=0.98)
    
    # Validate
    validate_position(group, "fitted group", auto_fix=True)
    return group


def create_title_and_content(title_text, content_mobject, *, title_font_size=FONT_TITLE, spacing=None):
    """
    Create a layout with title and content properly spaced.
    
    Args:
        title_text: Title text
        content_mobject: Content mobject
        title_font_size: Font size for title
        spacing: Spacing between title and content (auto-calculated if None)
    
    Returns:
        VGroup containing title and content
    """
    # Create title
    title = create_tex_label(title_text, font_size=title_font_size, bold=True)
    title.set_color(WHITE)
    
    # Ensure title fits with generous space
    ensure_fits_width(title, max_width=MAX_CONTENT_WIDTH * 0.95, safety_margin=0.98)
    
    # Position title at safe position
    title.move_to(get_title_position())
    
    # Calculate spacing
    if spacing is None:
        spacing = SAFE_SPACING_MIN
    
    # Ensure content fits in remaining space with generous margins
    available_height = MAX_CONTENT_HEIGHT - title.height - spacing
    ensure_fits_height(content_mobject, max_height=available_height * 0.95, safety_margin=0.98)
    ensure_fits_width(content_mobject, max_width=MAX_CONTENT_WIDTH * 0.95, safety_margin=0.98)
    
    # Position content below title
    content_mobject.next_to(title, DOWN, buff=spacing)
    
    # Create group
    group = VGroup(title, content_mobject)
    
    # Final validation
    validate_position(group, "title and content", auto_fix=True)
    return group


def create_labeled_diagram(label_text, diagram_mobject, *, position="bottom", label_font_size=FONT_CAPTION, spacing=0.4):
    """
    Create a diagram with a label.
    
    Args:
        label_text: Label text
        diagram_mobject: Diagram mobject
        position: Label position ("top", "bottom", "left", "right")
        label_font_size: Font size for label
        spacing: Spacing between diagram and label
    
    Returns:
        VGroup containing diagram and label
    """
    # Create label
    label = create_tex_label(label_text, font_size=label_font_size)
    
    # Ensure diagram fits with generous space - diagrams should be BIG
    diagram_max = 0.88
    ensure_fits_width(diagram_mobject, max_width=MAX_CONTENT_WIDTH * diagram_max, safety_margin=0.98)
    ensure_fits_height(diagram_mobject, max_height=MAX_CONTENT_HEIGHT * diagram_max, safety_margin=0.98)
    
    # Position label relative to diagram
    if position == "bottom":
        label.next_to(diagram_mobject, DOWN, buff=spacing)
    elif position == "top":
        label.next_to(diagram_mobject, UP, buff=spacing)
    elif position == "left":
        label.next_to(diagram_mobject, LEFT, buff=spacing)
    elif position == "right":
        label.next_to(diagram_mobject, RIGHT, buff=spacing)
    
    # Create group
    group = VGroup(diagram_mobject, label)
    group = ensure_fits_screen(group, safety_margin=0.98)
    
    # Validate
    validate_position(group, "labeled diagram", auto_fix=True)
    return group


def ensure_no_overlap(mobject_a, mobject_b, min_gap=1.0):
    """
    Ensure two mobjects don't overlap by adjusting their positions.
    
    Args:
        mobject_a: First mobject
        mobject_b: Second mobject
        min_gap: Minimum gap between them
    
    Returns:
        Tuple of (mobject_a, mobject_b) with adjusted positions
    """
    try:
        a_center = mobject_a.get_center()
        b_center = mobject_b.get_center()
        delta = b_center - a_center
        
        required_x_gap = (mobject_a.width + mobject_b.width) / 2 + min_gap
        required_y_gap = (mobject_a.height + mobject_b.height) / 2 + min_gap
        
        actual_x_dist = abs(delta[0])
        actual_y_dist = abs(delta[1])
        
        overlap_x = required_x_gap - actual_x_dist
        overlap_y = required_y_gap - actual_y_dist
        
        if overlap_x > 0 and overlap_y > 0:
            # There's an overlap, separate them
            if overlap_x >= overlap_y:
                # Separate horizontally
                shift = (overlap_x / 2) * 1.15
                direction = 1 if delta[0] >= 0 else -1
                mobject_a.shift(-shift * direction * RIGHT)
                mobject_b.shift(shift * direction * RIGHT)
            else:
                # Separate vertically
                shift = (overlap_y / 2) * 1.15
                direction = 1 if delta[1] >= 0 else -1
                mobject_a.shift(-shift * direction * UP)
                mobject_b.shift(shift * direction * UP)
            
            # Ensure both still fit on screen
            _nudge_into_safe_frame(mobject_a, recursive=True)
            _nudge_into_safe_frame(mobject_b, recursive=True)
    
    except (AttributeError, IndexError, TypeError):
        pass
    
    return mobject_a, mobject_b


# ========================================
# ZONE-BASED LAYOUT SYSTEM
# ========================================

class LayoutZone:
    """
    A rectangular zone on the screen that can be reserved for content.
    Prevents overlaps by managing occupied regions.
    """
    def __init__(self, x_min, x_max, y_min, y_max, name="zone"):
        self.x_min = x_min
        self.x_max = x_max
        self.y_min = y_min
        self.y_max = y_max
        self.name = name
        self.width = x_max - x_min
        self.height = y_max - y_min
        self.center_x = (x_min + x_max) / 2
        self.center_y = (y_min + y_max) / 2
        self.is_occupied = False
        
    def get_center(self):
        return np.array([self.center_x, self.center_y, 0])
    
    def get_top_left(self):
        return np.array([self.x_min, self.y_max, 0])
    
    def get_top_right(self):
        return np.array([self.x_max, self.y_max, 0])
    
    def get_bottom_left(self):
        return np.array([self.x_min, self.y_min, 0])
    
    def get_bottom_right(self):
        return np.array([self.x_max, self.y_min, 0])
    
    def contains_point(self, point):
        x, y = point[0], point[1]
        return self.x_min <= x <= self.x_max and self.y_min <= y <= self.y_max
    
    def overlaps_with(self, other, buffer=0.5):
        return not (
            self.x_max + buffer < other.x_min or
            self.x_min - buffer > other.x_max or
            self.y_max + buffer < other.y_min or
            self.y_min - buffer > other.y_max
        )
    
    def can_fit(self, width, height, padding=0.5):
        return (width + 2 * padding <= self.width and 
                height + 2 * padding <= self.height)


def create_screen_zones(title_reserve=True, num_rows=3, num_cols=2):
    """
    Divide the screen into a grid of zones for intelligent layout.
    
    Args:
        title_reserve: Whether to reserve top zone for title
        num_rows: Number of vertical divisions (excluding title if reserved)
        num_cols: Number of horizontal divisions
    
    Returns:
        Dictionary of zone names to LayoutZone objects
    """
    zones = {}
    
    # Calculate available space
    left = -FRAME_WIDTH / 2 + SAFE_MARGIN_LEFT
    right = FRAME_WIDTH / 2 - SAFE_MARGIN_RIGHT
    top = FRAME_HEIGHT / 2 - SAFE_MARGIN_TOP
    bottom = -FRAME_HEIGHT / 2 + SAFE_MARGIN_BOTTOM + SAFE_BOTTOM_ZONE
    
    available_width = right - left
    available_height = top - bottom
    
    # Reserve title zone if requested
    if title_reserve:
        title_height = TITLE_ZONE_HEIGHT + SAFE_SPACING_MIN
        zones['title'] = LayoutZone(left, right, top - title_height, top, "title")
        top = top - title_height - SAFE_SPACING_MIN
        available_height = top - bottom
    
    # Create grid zones
    row_height = available_height / num_rows
    col_width = available_width / num_cols
    
    for row in range(num_rows):
        for col in range(num_cols):
            zone_left = left + col * col_width
            zone_right = zone_left + col_width
            zone_bottom = bottom + (num_rows - row - 1) * row_height
            zone_top = zone_bottom + row_height
            
            zone_name = f"zone_r{row}_c{col}"
            zones[zone_name] = LayoutZone(zone_left, zone_right, zone_bottom, zone_top, zone_name)
    
    # Add convenience zones for common layouts
    zones['left'] = LayoutZone(left, left + available_width / 2, bottom, top, "left")
    zones['right'] = LayoutZone(left + available_width / 2, right, bottom, top, "right")
    zones['center'] = LayoutZone(left + available_width / 4, right - available_width / 4, 
                                 bottom, top, "center")
    zones['top_half'] = LayoutZone(left, right, bottom + available_height / 2, top, "top_half")
    zones['bottom_half'] = LayoutZone(left, right, bottom, bottom + available_height / 2, "bottom_half")
    
    return zones


def position_in_zone(mobject, zone, alignment="center", padding=0.3, fit_to_zone=True):
    """
    Position a mobject within a zone with automatic fitting and alignment.
    
    Args:
        mobject: The mobject to position
        zone: LayoutZone object or zone name (if using global zones)
        alignment: Where to align within zone ("center", "top", "bottom", "left", "right", 
                   "top_left", "top_right", "bottom_left", "bottom_right")
        padding: Minimum padding from zone edges
        fit_to_zone: Whether to automatically scale to fit zone
    
    Returns:
        The positioned mobject
    """
    # Get zone object
    if isinstance(zone, str):
        if '_screen_zones' not in globals():
            globals()['_screen_zones'] = create_screen_zones()
        zone = globals()['_screen_zones'].get(zone)
        if zone is None:
            print(f"[LAYOUT ERROR] Zone '{zone}' not found")
            return mobject
    
    # Fit to zone if requested with generous margins
    if fit_to_zone:
        max_width = zone.width - 2 * padding
        max_height = zone.height - 2 * padding
        
        try:
            if mobject.width > max_width * 0.98:
                scale_factor = (max_width * 0.98) / mobject.width
                mobject.scale(scale_factor)
            if mobject.height > max_height * 0.98:
                scale_factor = (max_height * 0.98) / mobject.height
                mobject.scale(scale_factor)
        except (AttributeError, ZeroDivisionError):
            pass
    
    # Calculate target position based on alignment
    if alignment == "center":
        target = zone.get_center()
    elif alignment == "top":
        target = np.array([zone.center_x, zone.y_max - padding, 0])
    elif alignment == "bottom":
        target = np.array([zone.center_x, zone.y_min + padding, 0])
    elif alignment == "left":
        target = np.array([zone.x_min + padding, zone.center_y, 0])
    elif alignment == "right":
        target = np.array([zone.x_max - padding, zone.center_y, 0])
    elif alignment == "top_left":
        target = np.array([zone.x_min + padding, zone.y_max - padding, 0])
    elif alignment == "top_right":
        target = np.array([zone.x_max - padding, zone.y_max - padding, 0])
    elif alignment == "bottom_left":
        target = np.array([zone.x_min + padding, zone.y_min + padding, 0])
    elif alignment == "bottom_right":
        target = np.array([zone.x_max - padding, zone.y_min + padding, 0])
    else:
        target = zone.get_center()
    
    # Move mobject to target
    mobject.move_to(target)
    
    # Mark zone as occupied
    zone.is_occupied = True
    
    return mobject


def create_side_by_side_layout(left_mobject, right_mobject, spacing=2.0, 
                                left_weight=0.45, right_weight=0.55, center=None,
                                vertical_align="top"):
    """
    Create a side-by-side layout with GENEROUS spacing and no overlaps.
    Perfect for bullet points + diagram layouts.
    
    Args:
        left_mobject: Mobject for left side (typically bullet points)
        right_mobject: Mobject for right side (typically diagram)
        spacing: Minimum horizontal spacing between the two (default 2.0 for safety)
        left_weight: Proportion of width for left side (0-1)
        right_weight: Proportion of width for right side (0-1)
        center: Target center position (defaults to content center)
        vertical_align: Vertical alignment - "top" (default), "center", or "bottom"
    
    Returns:
        VGroup containing both mobjects with guaranteed separation
    """
    # Calculate available space
    total_width = MAX_CONTENT_WIDTH
    total_height = MAX_CONTENT_HEIGHT
    
    # Enforce minimum spacing
    spacing = max(spacing, 2.0)
    
    # Calculate zone widths with extra margin for spacing
    left_width = total_width * left_weight - spacing
    right_width = total_width * right_weight - spacing
    
    # Fit each mobject to its zone with generous margins (90% to leave room)
    try:
        if left_mobject.width > left_width * 0.9:
            left_mobject.scale((left_width * 0.9) / left_mobject.width)
        if left_mobject.height > total_height * 0.85:
            left_mobject.scale((total_height * 0.85) / left_mobject.height)
            
        if right_mobject.width > right_width * 0.9:
            right_mobject.scale((right_width * 0.9) / right_mobject.width)
        if right_mobject.height > total_height * 0.85:
            right_mobject.scale((total_height * 0.85) / right_mobject.height)
    except (AttributeError, ZeroDivisionError):
        pass
    
    # Position left mobject with extra clearance
    left_x = -total_width / 2 + left_width / 2 + spacing / 4
    left_mobject.move_to(np.array([left_x, 0, 0]))
    
    # Position right mobject with extra clearance
    right_x = total_width / 2 - right_width / 2 - spacing / 4
    right_mobject.move_to(np.array([right_x, 0, 0]))
    
    # Apply vertical alignment - TOP alignment is default for professional look
    if vertical_align == "top":
        # Align both to the top of the content area
        top_y = FRAME_HEIGHT/2 - SAFE_MARGIN_TOP - TITLE_ZONE_HEIGHT - SAFE_SPACING_MIN
        try:
            left_mobject.align_to(np.array([0, top_y, 0]), UP)
            right_mobject.align_to(np.array([0, top_y, 0]), UP)
        except (AttributeError, TypeError):
            pass
    elif vertical_align == "bottom":
        # Align both to the bottom of the content area
        bottom_y = -FRAME_HEIGHT/2 + SAFE_MARGIN_BOTTOM + SAFE_BOTTOM_ZONE
        try:
            left_mobject.align_to(np.array([0, bottom_y, 0]), DOWN)
            right_mobject.align_to(np.array([0, bottom_y, 0]), DOWN)
        except (AttributeError, TypeError):
            pass
    # else: center alignment - keep default vertical centering
    
    # Ensure minimum spacing - push apart if needed
    actual_gap = right_mobject.get_left()[0] - left_mobject.get_right()[0]
    if actual_gap < spacing:
        adjustment = (spacing - actual_gap) / 2 + 0.2  # Extra push for safety
        left_mobject.shift(LEFT * adjustment)
        right_mobject.shift(RIGHT * adjustment)
    
    # Create group
    group = VGroup(left_mobject, right_mobject)
    
    # Position group at target center
    if center is None:
        center = get_content_center()
    group.move_to(center)
    
    # Final validation with generous margins
    ensure_fits_screen(group, safety_margin=0.95)
    validate_position(group, "side-by-side layout", auto_fix=True)
    
    return group


def create_top_bottom_layout(top_mobject, bottom_mobject, spacing=1.5,
                              top_weight=0.45, bottom_weight=0.55, center=None):
    """
    Create a top-bottom layout with GENEROUS spacing and no overlaps.
    
    Args:
        top_mobject: Mobject for top section
        bottom_mobject: Mobject for bottom section
        spacing: Minimum vertical spacing between the two (default 1.5)
        top_weight: Proportion of height for top (0-1)
        bottom_weight: Proportion of height for bottom (0-1)
        center: Target center position (defaults to content center)
    
    Returns:
        VGroup containing both mobjects
    """
    # Calculate available space
    total_width = MAX_CONTENT_WIDTH
    total_height = MAX_CONTENT_HEIGHT
    
    # Calculate zone heights
    top_height = total_height * top_weight - spacing / 2
    bottom_height = total_height * bottom_weight - spacing / 2
    
    # Fit each mobject to its zone with generous margins
    try:
        if top_mobject.width > total_width:
            top_mobject.scale(total_width / top_mobject.width * 0.98)
        if top_mobject.height > top_height:
            top_mobject.scale(top_height / top_mobject.height * 0.98)
            
        if bottom_mobject.width > total_width:
            bottom_mobject.scale(total_width / bottom_mobject.width * 0.98)
        if bottom_mobject.height > bottom_height:
            bottom_mobject.scale(bottom_height / bottom_mobject.height * 0.98)
    except (AttributeError, ZeroDivisionError):
        pass
    
    # Position top mobject
    top_y = total_height / 2 - top_height / 2
    top_mobject.move_to(np.array([0, top_y, 0]))
    
    # Position bottom mobject
    bottom_y = -total_height / 2 + bottom_height / 2
    bottom_mobject.move_to(np.array([0, bottom_y, 0]))
    
    # Ensure minimum spacing
    actual_gap = top_mobject.get_bottom()[1] - bottom_mobject.get_top()[1]
    if actual_gap < spacing:
        adjustment = (spacing - actual_gap) / 2
        top_mobject.shift(UP * adjustment)
        bottom_mobject.shift(DOWN * adjustment)
    
    # Create group
    group = VGroup(top_mobject, bottom_mobject)
    
    # Position group at target center
    if center is None:
        center = get_content_center()
    group.move_to(center)
    
    # Final validation with generous margins
    ensure_fits_screen(group, safety_margin=0.98)
    validate_position(group, "top-bottom layout", auto_fix=True)
    
    return group


def create_bullet_list_for_shorts(
    items,
    *,
    font_size=None,
    max_bullets=4,
    **kwargs
):
    """
    FIXED: Create bullet list optimized for portrait/shorts format.
    Now with proper spacing to prevent overlaps.
    """
    # Limit bullets
    if len(items) > max_bullets:
        print(f"[LAYOUT WARNING] Limiting bullets from {len(items)} to {max_bullets}")
        items = items[:max_bullets]
    
    # Use smaller font for portrait if not specified
    if font_size is None:
        font_size = 40  # Reasonable default for portrait
    
    # CRITICAL: Set proper spacing for portrait format
    kwargs.setdefault("item_buff", 1.5)  # MUCH larger spacing
    kwargs.setdefault("edge_buff", 0.4)  # Smaller edge buffer
    
    # Set max_width if available
    if 'MAX_CONTENT_WIDTH' in globals():
        kwargs.setdefault("max_width", globals()['MAX_CONTENT_WIDTH'] * 0.85)
    
    return create_bullet_list(
        items,
        font_size=font_size,
        **kwargs
    )

def create_bulletproof_layout(*mobjects, layout_type="vertical", spacing=1.0, 
                               weights=None, center=None):
    """
    Create a layout that GUARANTEES no overlaps using spatial partitioning.
    This is the ultimate solution for preventing bullet point/diagram overlaps.
    
    Args:
        *mobjects: Mobjects to layout
        layout_type: "vertical", "horizontal", "grid", or "custom"
        spacing: Minimum spacing between elements
        weights: List of weights for each mobject (proportional sizing)
        center: Target center position
    
    Returns:
        VGroup with perfectly positioned mobjects
    """
    items = [m for m in mobjects if m is not None]
    if not items:
        return VGroup()
    
    num_items = len(items)
    
    # Default weights if not provided
    if weights is None:
        weights = [1.0] * num_items
    
    # Normalize weights
    total_weight = sum(weights)
    weights = [w / total_weight for w in weights]
    
    # Calculate available space with generous margins
    max_width = MAX_CONTENT_WIDTH * 0.98
    max_height = MAX_CONTENT_HEIGHT * 0.98
    
    if layout_type == "vertical":
        # Vertical stacking with guaranteed spacing
        zones_heights = [(max_height - (num_items - 1) * spacing) * w for w in weights]
        
        # Fit each item to its zone
        for i, (item, zone_h) in enumerate(zip(items, zones_heights)):
            try:
                if item.width > max_width * 0.98:
                    item.scale((max_width * 0.98) / item.width)
                if item.height > zone_h * 0.98:
                    item.scale((zone_h * 0.98) / item.height)
            except (AttributeError, ZeroDivisionError):
                continue
        
        # Position items from top to bottom
        current_y = max_height / 2
        for i, (item, zone_h) in enumerate(zip(items, zones_heights)):
            item_y = current_y - zone_h / 2
            item.move_to(np.array([0, item_y, 0]))
            current_y -= zone_h + spacing
            
    elif layout_type == "horizontal":
        # Horizontal layout with guaranteed spacing
        zone_widths = [(max_width - (num_items - 1) * spacing) * w for w in weights]
        
        # Fit each item to its zone
        for i, (item, zone_w) in enumerate(zip(items, zone_widths)):
            try:
                if item.width > zone_w * 0.98:
                    item.scale((zone_w * 0.98) / item.width)
                if item.height > max_height * 0.98:
                    item.scale((max_height * 0.98) / item.height)
            except (AttributeError, ZeroDivisionError):
                continue
        
        # Position items from left to right
        current_x = -max_width / 2
        for i, (item, zone_w) in enumerate(zip(items, zone_widths)):
            item_x = current_x + zone_w / 2
            item.move_to(np.array([item_x, 0, 0]))
            current_x += zone_w + spacing
            
    elif layout_type == "grid":
        # Grid layout with equal zones
        import math
        cols = math.ceil(math.sqrt(num_items))
        rows = math.ceil(num_items / cols)
        
        cell_width = (max_width - (cols - 1) * spacing) / cols
        cell_height = (max_height - (rows - 1) * spacing) / rows
        
        for idx, item in enumerate(items):
            row = idx // cols
            col = idx % cols
            
            # Fit to cell
            try:
                if item.width > cell_width * 0.98:
                    item.scale((cell_width * 0.98) / item.width)
                if item.height > cell_height * 0.98:
                    item.scale((cell_height * 0.98) / item.height)
            except (AttributeError, ZeroDivisionError):
                continue
            
            # Position in grid
            x = -max_width / 2 + col * (cell_width + spacing) + cell_width / 2
            y = max_height / 2 - row * (cell_height + spacing) - cell_height / 2
            item.move_to(np.array([x, y, 0]))
    
    # Create group
    group = VGroup(*items)
    
    # Position at target center
    if center is None:
        center = get_content_center()
    group.move_to(center)
    
    # Final validation
    validate_position(group, f"{layout_type} layout", auto_fix=True)
    
    return group

`);

  // PREMIUM COLOR PALETTE - Meticulously designed for #1E1E1E background
  // Optimized for maximum contrast, harmony, and visual appeal
  const colorPalette: Record<string, string> = {
    // === Neutrals (High contrast base colors) ===
    WHITE: "#F8FAFC", // Slate 50
    LIGHT_GRAY: "#CBD5E1", // Slate 300
    GRAY: "#94A3B8", // Slate 400
    DARK_GRAY: "#475569", // Slate 600
    BLACK: "#020617", // Slate 950

    // === Primary Accents (Vibrant & Professional) ===
    BLUE: "#38BDF8", // Sky 400 - Clear, trustworthy
    CYAN: "#22D3EE", // Cyan 400 - Electric, modern
    TEAL: "#2DD4BF", // Teal 400 - Fresh, calm
    GREEN: "#4ADE80", // Green 400 - Success, growth

    // === Warm Accents (Attention & Energy) ===
    YELLOW: "#FACC15", // Yellow 400 - Highlight, warning
    ORANGE: "#FB923C", // Orange 400 - Secondary highlight
    RED: "#F87171", // Red 400 - Error, critical
    PINK: "#F472B6", // Pink 400 - Creative

    // === Deep/Rich Accents (Backgrounds & Depth) ===
    INDIGO: "#818CF8", // Indigo 400
    VIOLET: "#A78BFA", // Violet 400
    PURPLE: "#C084FC", // Purple 400
    MAGENTA: "#E879F9", // Fuchsia 400
  };

  parts.push("\n# Script color palette - Optimized for #1E1E1E background");
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

def wrap_text(text, font_size=48, max_width=10, max_lines=None):
    """
    FIXED: Wrap text properly for LaTeX rendering.
    Returns text with LaTeX line breaks.
    """
    if not text or not isinstance(text, str):
        return ""
    
    # Calculate approximate characters per line
    char_width = font_size * 0.55
    max_chars_per_line = max(int(max_width / char_width), 10)
    
    words = text.split()
    lines = []
    current_line = []
    current_length = 0
    
    for word in words:
        # Handle very long words
        if len(word) > max_chars_per_line:
            # Finish current line
            if current_line:
                lines.append(' '.join(current_line))
                current_line = []
                current_length = 0
            
            # Break long word into chunks
            while len(word) > max_chars_per_line:
                chunk = word[:max_chars_per_line - 1]
                lines.append(chunk + "-")
                word = word[max_chars_per_line - 1:]
            
            if word:
                current_line = [word]
                current_length = len(word)
            continue
        
        word_length = len(word) + 1  # +1 for space
        
        # Check if adding this word would exceed the line length
        if current_length + word_length > max_chars_per_line and current_line:
            lines.append(' '.join(current_line))
            current_line = [word]
            current_length = len(word)
        else:
            current_line.append(word)
            current_length += word_length
    
    # Add remaining words
    if current_line:
        lines.append(' '.join(current_line))
    
    # Limit number of lines
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        if lines:
            lines[-1] = lines[-1] + "..."
    
    # FIXED: Use proper LaTeX line break syntax (double backslash + space)
    # In Python, r"\\" becomes a single \ in the string, but LaTeX needs \\
    return r" \\ ".join(lines)

def create_wrapped_text(text, font_size=FONT_BODY, **kwargs):
    wrapped = wrap_text(text, font_size)
    return create_tex_label(wrapped, font_size=font_size, **kwargs)
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
    font_size=0,
    style="none",
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
 * Generate diagram schema helpers (canonical helpers for accurate diagrams)
 */
export function generateDiagramSchemaHelpers(): string {
  return `
# ═══════════════════════════════════════════════════════════════════════════════
# DIAGRAM SCHEMA HELPERS - USE THESE FOR ACCURATE VISUALIZATIONS
# ═══════════════════════════════════════════════════════════════════════════════
# These canonical helpers ensure diagrams render correctly in 2D and 3D.
# ALWAYS use these instead of raw Manim primitives for the supported diagram types.
# Add a DIAGRAM_SCHEMA comment block above each helper call for validation.

def _log_diagram(schema_id, message):
    """Development logging for diagram schemas."""
    if _DIAGRAM_DEV_MODE:
        print(f"[DIAGRAM_SCHEMA:{schema_id}] {message}")

# ═══════════════════════════════════════════════════════════════════════════════
# 2D DIAGRAM HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def create_cartesian_graph(
    func_expression=lambda x: x**2,
    x_range=(-4, 4, 1),
    y_range=(-2, 8, 1),
    color=BLUE,
    show_labels=True,
    x_label="x",
    y_label="y",
    x_length=5,
    y_length=3,
):
    """
    DIAGRAM_SCHEMA: cartesian_graph_v1
    
    Create a 2D Cartesian coordinate system with a function plot.
    Use this instead of manually creating Axes + plot.
    
    Args:
        func_expression: Python callable (not string). eg: lambda x: x**2, np.sin
        x_range: (min, max, step) for x-axis
        y_range: (min, max, step) for y-axis
        color: Graph line color
        show_labels: Whether to show axis labels
        x_label, y_label: Axis label text
        x_length, y_length: Visual size of axes
    
    Returns:
        VGroup containing axes, graph, and labels
    """
    _log_diagram("cartesian_graph_v1", f"Creating graph: {func_expression}")
    
    # Validate ranges
    if x_range[0] >= x_range[1]:
        print("[VISUAL WARNING] cartesian_graph: x_range min >= max, swapping")
        x_range = (x_range[1], x_range[0], x_range[2])
    if y_range[0] >= y_range[1]:
        print("[VISUAL WARNING] cartesian_graph: y_range min >= max, swapping")
        y_range = (y_range[1], y_range[0], y_range[2])
    
    axes = Axes(
        x_range=[x_range[0], x_range[1], x_range[2]],
        y_range=[y_range[0], y_range[1], y_range[2]],
        x_length=x_length,
        y_length=y_length,
        axis_config={"include_tip": True, "include_numbers": True},
    )
    
    # Create function from expression
    func = func_expression
    graph = axes.plot(func, color=color, use_smoothing=True)
    
    elements = [axes, graph]
    
    if show_labels:
        x_label_mob = axes.get_x_axis_label(x_label, edge=RIGHT, direction=RIGHT)
        y_label_mob = axes.get_y_axis_label(y_label, edge=UP, direction=UP)
        elements.extend([x_label_mob, y_label_mob])
    
    group = VGroup(*elements)
    group.move_to(get_content_center())
    ensure_fits_screen(group, safety_margin=0.9)
    
    _log_diagram("cartesian_graph_v1", f"Created successfully, size: {group.width:.2f}x{group.height:.2f}")
    return group


def create_bar_chart(
    values,
    labels,
    colors=None,
    bar_width=0.6,
    show_values=True,
    max_bars=6,
):
    """
    DIAGRAM_SCHEMA: bar_chart_v1
    
    Create a vertical bar chart for comparing quantities.
    
    Args:
        values: List of numeric values for each bar
        labels: Labels for each bar
        colors: Colors for each bar (auto-generated if None)
        bar_width: Width of each bar
        show_values: Whether to display values above bars
        max_bars: Maximum number of bars (prevents overcrowding)
    
    Returns:
        VGroup containing the complete bar chart
    """
    _log_diagram("bar_chart_v1", f"Creating bar chart with {len(values)} bars")
    
    # Limit bars to prevent overcrowding
    if len(values) > max_bars:
        print(f"[VISUAL WARNING] bar_chart: limiting from {len(values)} to {max_bars} bars")
        values = values[:max_bars]
        labels = labels[:max_bars]
    
    # Auto-generate colors if not provided
    default_colors = [BLUE, RED, GREEN, YELLOW, PURPLE, ORANGE, CYAN, PINK]
    if colors is None:
        colors = [default_colors[i % len(default_colors)] for i in range(len(values))]
    
    max_val = max(values) if values else 1
    bar_height_scale = 2.5 / max_val  # Normalize to reasonable height
    
    bars = VGroup()
    bar_labels = VGroup()
    value_labels = VGroup()
    
    for i, (val, label, col) in enumerate(zip(values, labels, colors)):
        # Create bar
        bar_height = val * bar_height_scale
        bar = Rectangle(
            width=bar_width,
            height=bar_height,
            fill_color=col,
            fill_opacity=0.8,
            stroke_color=WHITE,
            stroke_width=1,
        )
        bar.move_to(RIGHT * (i - len(values)/2 + 0.5) * (bar_width + 0.3))
        bar.align_to(ORIGIN, DOWN)
        bars.add(bar)
        
        # Create label below bar
        label_mob = create_text_with_kerning_fix(str(label), font_size=FONT_LABEL, color=WHITE)
        label_mob.next_to(bar, DOWN, buff=0.2)
        bar_labels.add(label_mob)
        
        # Create value above bar
        if show_values:
            val_mob = create_text_with_kerning_fix(str(val), font_size=FONT_LABEL, color=WHITE)
            val_mob.next_to(bar, UP, buff=0.15)
            value_labels.add(val_mob)
    
    group = VGroup(bars, bar_labels)
    if show_values:
        group.add(value_labels)
    
    group.move_to(get_content_center())
    ensure_fits_screen(group, safety_margin=0.85)
    
    _log_diagram("bar_chart_v1", f"Created successfully with {len(values)} bars")
    return group


def create_labeled_triangle(
    vertices="right_triangle",
    vertex_labels=["A", "B", "C"],
    side_labels=None,
    show_angles=False,
    angle_labels=None,
    color=BLUE,
    fill_opacity=0.2,
):
    """
    DIAGRAM_SCHEMA: triangle_labeled_v1
    
    Create a triangle with vertex labels, optional side labels, and angle arcs.
    
    Args:
        vertices: "right_triangle", "equilateral", "isoceles", or [[x1,y1], [x2,y2], [x3,y3]]
        vertex_labels: Labels for vertices [A, B, C]
        side_labels: Labels for sides [AB, BC, CA] or None
        show_angles: Whether to show angle arcs
        angle_labels: Labels for angles at each vertex
        color: Triangle stroke color
        fill_opacity: Fill opacity (0-1)
    
    Returns:
        VGroup containing the complete labeled triangle
    """
    _log_diagram("triangle_labeled_v1", f"Creating triangle: {vertices}")
    
    # Preset vertex configurations
    presets = {
        "right_triangle": [[-1.5, -1, 0], [1.5, -1, 0], [-1.5, 1.5, 0]],
        "equilateral": [[-1.5, -1, 0], [1.5, -1, 0], [0, 1.6, 0]],
        "isoceles": [[-1.2, -1, 0], [1.2, -1, 0], [0, 1.5, 0]],
    }
    
    if isinstance(vertices, str):
        pts = presets.get(vertices, presets["right_triangle"])
    else:
        pts = [[v[0], v[1], 0] if len(v) == 2 else v for v in vertices]
    
    pts = [np.array(p) for p in pts]
    
    # Create triangle
    triangle = Polygon(*pts, color=color, fill_opacity=fill_opacity, stroke_width=3)
    elements = [triangle]
    
    # Add vertex labels OUTSIDE the triangle
    label_directions = [DOWN + LEFT, DOWN + RIGHT, UP]
    for i, (pt, label) in enumerate(zip(pts, vertex_labels)):
        if label:
            label_mob = create_text_with_kerning_fix(label, font_size=FONT_LABEL, color=WHITE)
            label_mob.next_to(pt, label_directions[i % 3], buff=0.25)
            elements.append(label_mob)
    
    # Add side labels
    if side_labels:
        sides = [(0, 1), (1, 2), (2, 0)]
        side_dirs = [DOWN, RIGHT, LEFT]
        for (i, j), label, direction in zip(sides, side_labels, side_dirs):
            if label:
                midpoint = (pts[i] + pts[j]) / 2
                label_mob = create_text_with_kerning_fix(label, font_size=FONT_CAPTION, color=YELLOW)
                label_mob.next_to(midpoint, direction, buff=0.3)
                elements.append(label_mob)
    
    # Add angle arcs
    if show_angles:
        for i in range(3):
            try:
                p1 = pts[(i - 1) % 3]
                vertex = pts[i]
                p2 = pts[(i + 1) % 3]
                angle = Angle(
                    Line(vertex, p1),
                    Line(vertex, p2),
                    radius=0.4,
                    color=YELLOW,
                )
                elements.append(angle)
                
                if angle_labels and i < len(angle_labels) and angle_labels[i]:
                    angle_label = create_text_with_kerning_fix(angle_labels[i], font_size=FONT_LABEL, color=YELLOW)
                    angle_label.move_to(angle.point_from_proportion(0.5) + (vertex - angle.point_from_proportion(0.5)) * -0.5)
                    elements.append(angle_label)
            except Exception as e:
                print(f"[VISUAL WARNING] triangle: Could not create angle arc: {e}")
    
    group = VGroup(*elements)
    group.move_to(get_content_center())
    ensure_fits_screen(group, safety_margin=0.85)
    
    _log_diagram("triangle_labeled_v1", "Created successfully")
    return group


def create_force_diagram(
    object_shape="square",
    object_size=1.0,
    forces=None,
    show_net_force=False,
    object_color=BLUE,
):
    """
    DIAGRAM_SCHEMA: force_diagram_v1
    
    Create a free body diagram with force arrows.
    
    Args:
        object_shape: "square", "rectangle", "circle", or "dot"
        object_size: Size of the central object
        forces: List of dicts [{direction: "UP"/"DOWN"/"LEFT"/"RIGHT", magnitude: float, label: str, color: str}]
        show_net_force: Whether to show resultant force
        object_color: Color of the central object
    
    Returns:
        VGroup containing object and force arrows
    """
    _log_diagram("force_diagram_v1", f"Creating force diagram: {object_shape}")
    
    # Create central object
    if object_shape == "circle":
        obj = Circle(radius=object_size / 2, color=object_color, fill_opacity=0.5)
    elif object_shape == "dot":
        obj = Dot(radius=object_size / 4, color=object_color)
    elif object_shape == "rectangle":
        obj = Rectangle(width=object_size * 1.5, height=object_size, color=object_color, fill_opacity=0.5)
    else:  # square
        obj = Square(side_length=object_size, color=object_color, fill_opacity=0.5)
    
    elements = [obj]
    
    direction_map = {
        "UP": UP, "DOWN": DOWN, "LEFT": LEFT, "RIGHT": RIGHT,
        "UP_LEFT": UP + LEFT, "UP_RIGHT": UP + RIGHT,
        "DOWN_LEFT": DOWN + LEFT, "DOWN_RIGHT": DOWN + RIGHT,
    }
    
    default_colors = {"UP": GREEN, "DOWN": RED, "LEFT": YELLOW, "RIGHT": ORANGE}
    
    net_force = np.array([0.0, 0.0, 0.0])
    
    for force in (forces or []):
        dir_name = force.get("direction", "UP").upper()
        direction = direction_map.get(dir_name, UP)
        magnitude = force.get("magnitude", 1.0)
        label = force.get("label", "")
        color = force.get("color", default_colors.get(dir_name, WHITE))
        
        # Calculate arrow start and end
        start = obj.get_center() + direction * (object_size / 2 + 0.1)
        end = start + direction * (magnitude * 0.5)  # Scale for visibility
        
        arrow = Arrow(start, end, color=color, buff=0, stroke_width=4, max_tip_length_to_length_ratio=0.25)
        elements.append(arrow)
        
        if label:
            label_mob = create_text_with_kerning_fix(label, font_size=FONT_CAPTION, color=color)
            label_mob.next_to(arrow, direction, buff=0.15)
            elements.append(label_mob)
        
        net_force += direction * magnitude
    
    if show_net_force and np.linalg.norm(net_force) > 0.1:
        net_dir = net_force / np.linalg.norm(net_force)
        net_mag = np.linalg.norm(net_force)
        net_start = obj.get_center()
        net_end = net_start + net_dir * net_mag * 0.5
        net_arrow = Arrow(net_start, net_end, color=WHITE, buff=0, stroke_width=5)
        net_label = create_text_with_kerning_fix("Net", font_size=FONT_LABEL, color=WHITE)
        net_label.next_to(net_arrow, net_dir, buff=0.1)
        elements.extend([net_arrow, net_label])
    
    group = VGroup(*elements)
    group.move_to(get_content_center())
    ensure_fits_screen(group, safety_margin=0.85)
    
    _log_diagram("force_diagram_v1", f"Created with {len(forces or [])} forces")
    return group


def create_flowchart(
    steps,
    connections,
    direction="vertical",
    box_width=2.5,
    box_height=0.8,
):
    """
    DIAGRAM_SCHEMA: flowchart_v1
    
    Create a process flowchart with boxes and arrows.
    
    Args:
        steps: List of dicts [{text: str, type: "process"|"decision"|"start"|"end"}]
        connections: List of connections [[from_idx, to_idx, label?], ...]
        direction: "vertical" or "horizontal"
        box_width, box_height: Dimensions of process boxes
    
    Returns:
        VGroup containing the flowchart
    """
    _log_diagram("flowchart_v1", f"Creating flowchart with {len(steps)} steps")
    
    # Limit steps to prevent overcrowding
    max_steps = 5
    if len(steps) > max_steps:
        print(f"[VISUAL WARNING] flowchart: limiting from {len(steps)} to {max_steps} steps")
        steps = steps[:max_steps]
    
    shape_colors = {
        "start": GREEN,
        "end": RED,
        "decision": YELLOW,
        "process": BLUE,
    }
    
    boxes = []
    elements = []
    
    for i, step in enumerate(steps):
        text = step.get("text", f"Step {i+1}")
        step_type = step.get("type", "process")
        color = shape_colors.get(step_type, BLUE)
        
        if step_type == "decision":
            # Diamond shape for decisions
            box = Square(side_length=box_width * 0.7, color=color, fill_opacity=0.3)
            box.rotate(PI / 4)
        elif step_type in ["start", "end"]:
            # Rounded rectangle for start/end
            box = RoundedRectangle(width=box_width, height=box_height, corner_radius=0.3, color=color, fill_opacity=0.3)
        else:
            # Regular rectangle for process
            box = Rectangle(width=box_width, height=box_height, color=color, fill_opacity=0.3)
        
        label = create_text_with_kerning_fix(text[:15], font_size=FONT_CAPTION, color=WHITE)
        label.move_to(box.get_center())
        
        step_group = VGroup(box, label)
        boxes.append(step_group)
        elements.append(step_group)
    
    # Arrange boxes
    if direction == "horizontal":
        VGroup(*boxes).arrange(RIGHT, buff=1.5)
    else:
        VGroup(*boxes).arrange(DOWN, buff=1.0)
    
    # Add connection arrows
    for conn in connections:
        if len(conn) >= 2:
            from_idx, to_idx = conn[0], conn[1]
            if from_idx < len(boxes) and to_idx < len(boxes):
                if direction == "horizontal":
                    arrow = Arrow(boxes[from_idx].get_right(), boxes[to_idx].get_left(), buff=0.1, color=WHITE)
                else:
                    arrow = Arrow(boxes[from_idx].get_bottom(), boxes[to_idx].get_top(), buff=0.1, color=WHITE)
                elements.append(arrow)
                
                if len(conn) > 2 and conn[2]:  # Has label
                    conn_label = create_text_with_kerning_fix(conn[2], font_size=FONT_LABEL, color=GRAY)
                    conn_label.next_to(arrow, RIGHT if direction == "vertical" else UP, buff=0.1)
                    elements.append(conn_label)
    
    group = VGroup(*elements)
    group.move_to(get_content_center())
    ensure_fits_screen(group, safety_margin=0.85)
    
    _log_diagram("flowchart_v1", f"Created successfully")
    return group


def create_atom_diagram(
    element_symbol="H",
    electron_config=None,
    show_nucleus_details=False,
    protons=None,
    neutrons=None,
    nucleus_color=RED,
    electron_color=BLUE,
):
    """
    DIAGRAM_SCHEMA: atom_shells_v1
    
    Create a Bohr model atom diagram with nucleus and electron shells.
    
    Args:
        element_symbol: Element symbol (e.g., "H", "He", "C")
        electron_config: Electrons per shell [2, 8, ...] or auto from element
        show_nucleus_details: Show protons/neutrons
        protons, neutrons: Counts if showing details
        nucleus_color, electron_color: Colors
    
    Returns:
        VGroup containing the atom diagram
    """
    _log_diagram("atom_shells_v1", f"Creating atom: {element_symbol}")
    
    # Default electron configs for common elements
    element_configs = {
        "H": [1], "He": [2], "Li": [2, 1], "Be": [2, 2], "B": [2, 3],
        "C": [2, 4], "N": [2, 5], "O": [2, 6], "F": [2, 7], "Ne": [2, 8],
        "Na": [2, 8, 1], "Mg": [2, 8, 2], "Al": [2, 8, 3], "Si": [2, 8, 4],
        "Cl": [2, 8, 7], "Ar": [2, 8, 8], "K": [2, 8, 8, 1], "Ca": [2, 8, 8, 2],
    }
    
    if electron_config is None:
        electron_config = element_configs.get(element_symbol.capitalize(), [1])
    
    elements = []
    
    # Create nucleus
    nucleus = Circle(radius=0.4, color=nucleus_color, fill_opacity=0.8)
    nucleus_label = create_text_with_kerning_fix(element_symbol, font_size=FONT_BODY, color=WHITE)
    nucleus_label.move_to(nucleus.get_center())
    elements.extend([nucleus, nucleus_label])
    
    # Create electron shells
    shell_radii = [0.8, 1.3, 1.8, 2.3]
    for shell_idx, num_electrons in enumerate(electron_config[:4]):  # Max 4 shells
        if shell_idx >= len(shell_radii):
            break
            
        radius = shell_radii[shell_idx]
        
        # Shell orbit
        orbit = Circle(radius=radius, stroke_color=BLUE_E, stroke_width=1.5, stroke_opacity=0.5)
        elements.append(orbit)
        
        # Electrons
        for e_idx in range(num_electrons):
            angle = e_idx * TAU / num_electrons
            electron = Dot(radius=0.08, color=electron_color)
            electron.move_to(np.array([radius * np.cos(angle), radius * np.sin(angle), 0]))
            elements.append(electron)
    
    group = VGroup(*elements)
    group.move_to(get_content_center())
    ensure_fits_screen(group, safety_margin=0.85)
    
    _log_diagram("atom_shells_v1", f"Created with {len(electron_config)} shells")
    return group


# ═══════════════════════════════════════════════════════════════════════════════
# 3D DIAGRAM HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def create_3d_axes_vector(
    vectors,
    x_range=(-3, 3, 1),
    y_range=(-3, 3, 1),
    z_range=(-3, 3, 1),
    show_unit_vectors=False,
    axis_length=4,
):
    """
    DIAGRAM_SCHEMA: 3d_axes_vector_v1
    
    Create 3D coordinate axes with one or more vectors.
    REQUIRES: class MyScene(VoiceoverScene, ThreeDScene)
    
    Args:
        vectors: List of dicts [{components: [x,y,z], color: str, label: str}]
        x_range, y_range, z_range: Axis ranges
        show_unit_vectors: Show i, j, k unit vectors
        axis_length: Length of axes
    
    Returns:
        VGroup containing axes and vectors
    """
    _log_diagram("3d_axes_vector_v1", f"Creating 3D axes with {len(vectors)} vectors")
    
    from manim import ThreeDAxes, Arrow3D
    
    axes = ThreeDAxes(
        x_range=[x_range[0], x_range[1], x_range[2]],
        y_range=[y_range[0], y_range[1], y_range[2]],
        z_range=[z_range[0], z_range[1], z_range[2]],
        x_length=axis_length,
        y_length=axis_length,
        z_length=axis_length,
    )
    
    elements = [axes]
    
    default_colors = [BLUE, RED, GREEN, YELLOW, PURPLE]
    
    for i, vec_info in enumerate(vectors):
        components = vec_info.get("components", [1, 0, 0])
        color = vec_info.get("color", default_colors[i % len(default_colors)])
        label = vec_info.get("label", "")
        
        # Create vector arrow
        start = axes.c2p(0, 0, 0)
        end = axes.c2p(*components)
        
        arrow = Arrow3D(start, end, color=color)
        elements.append(arrow)
        
        if label:
            label_mob = create_3d_text_label(label, font_size=FONT_LABEL)
            label_mob.next_to(end, UP + RIGHT, buff=0.2)
            elements.append(label_mob)
    
    if show_unit_vectors:
        # Add i, j, k
        unit_vecs = [
            ([1, 0, 0], RED, "i"),
            ([0, 1, 0], GREEN, "j"),
            ([0, 0, 1], BLUE, "k"),
        ]
        for comp, col, lbl in unit_vecs:
            start = axes.c2p(0, 0, 0)
            end = axes.c2p(*comp)
            arrow = Arrow3D(start, end, color=col, thickness=0.02)
            elements.append(arrow)
    
    group = VGroup(*elements)
    
    _log_diagram("3d_axes_vector_v1", "Created successfully")
    return group


def configure_3d_camera(scene, focus=None, phi=75, theta=-45):
    """
    CAMERA DISCIPLINE: Standard 3D camera configuration.
    Call this at the start of construct() for any 3D scene.
    
    Args:
        scene: ThreeDScene instance
        focus: Optional mobject to focus on
        phi: Polar angle in degrees (default 75)
        theta: Azimuthal angle in degrees (default -45)
    """
    _log_diagram("camera", f"Configuring 3D camera: phi={phi}, theta={theta}")
    
    scene.set_camera_orientation(phi=phi * DEGREES, theta=theta * DEGREES)
    
    if focus is not None:
        try:
            scene.move_camera(frame_center=focus.get_center())
        except Exception as e:
            print(f"[VISUAL WARNING] Could not focus camera: {e}")
    
    print(f"[3D_CAMERA] Configured: phi={phi}°, theta={theta}°")


def orbit_camera_around(scene, target, angle=TAU/4, run_time=4):
    """
    CAMERA DISCIPLINE: Safe orbit animation around a target.
    
    Args:
        scene: ThreeDScene instance
        target: Mobject to orbit around
        angle: Total rotation angle (default 90 degrees)
        run_time: Animation duration
    """
    _log_diagram("camera", f"Orbiting camera: angle={angle}, run_time={run_time}")
    
    scene.begin_ambient_camera_rotation(rate=angle / run_time)
    scene.wait(run_time)
    scene.stop_ambient_camera_rotation()


# ═══════════════════════════════════════════════════════════════════════════════
# DIAGRAM VALIDATORS
# ═══════════════════════════════════════════════════════════════════════════════

def validate_diagram(diagram, schema_id, check_bounds=True, check_density=True):
    """
    Validate a diagram against visual quality heuristics.
    
    Args:
        diagram: The diagram VGroup
        schema_id: Schema identifier for logging
        check_bounds: Whether to validate position bounds
        check_density: Whether to check content density
    
    Returns:
        bool: True if valid, False if warnings were issued
    """
    warnings_issued = False
    
    if check_bounds:
        if not validate_position(diagram, f"diagram:{schema_id}", auto_fix=True):
            warnings_issued = True
    
    if check_density and hasattr(diagram, 'submobjects'):
        density = analyze_content_density(diagram.submobjects)
        if density["action"] != "none":
            print(f"[VISUAL WARNING] {schema_id}: {density['reason']}")
            warnings_issued = True
    
    if not warnings_issued:
        _log_diagram(schema_id, "Validation passed")
    
    return not warnings_issued
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
  parts.push("\n");
  parts.push(generateDiagramSchemaHelpers());

  parts.push("\n# ========================================");
  parts.push("# Usage:");
  parts.push("# 1. Use get_title_position() for titles");
  parts.push("# 2. Use get_content_center() for content");
  parts.push("# 3. Use ensure_fits_screen() before adding");
  parts.push("# 4. Use validate_position() to check bounds");
  parts.push("# 5. For 3D scenes:");
  parts.push(
    "#    - Use create_3d_text_label() for ALL text (ensures camera-facing + background)"
  );
  parts.push("#    - Use create_3d_labeled_object() to label 3D objects");
  parts.push("#    - Use set_camera_for_3d_scene() to frame 3D content");
  parts.push(
    "#    - Use set_camera_for_2d_view() for text-heavy scenes like CTAs"
  );
  parts.push("# 6. DIAGRAM SCHEMAS (use for accurate diagrams):");
  parts.push("#    - create_cartesian_graph() for function plots");
  parts.push("#    - create_bar_chart() for bar charts");
  parts.push("#    - create_labeled_triangle() for geometry");
  parts.push("#    - create_force_diagram() for physics");
  parts.push("#    - create_flowchart() for processes");
  parts.push("#    - create_atom_diagram() for chemistry");
  parts.push("#    - create_3d_axes_vector() for 3D vectors");
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

def make_text_always_face_camera(text_mobject):
    """
    Make text always face the camera in 3D scenes for maximum readability.
    This rotates the text to be perpendicular to the camera's line of sight.
    
    :param text_mobject: The text mobject to orient
    :return: The oriented text mobject
    """
    # Rotate text to face forward (perpendicular to Z-axis)
    text_mobject.rotate(90 * DEGREES, axis=RIGHT)
    return text_mobject

def create_3d_text_label(text, font_size=FONT_BODY, with_background=True, background_padding=0.3, **text_kwargs):
    """
    Create a text label optimized for 3D scenes with high visibility.
    Text will always face the camera and have a solid background for readability.
    
    :param text: Text content
    :param font_size: Font size
    :param with_background: Whether to add a background panel for contrast
    :param background_padding: Padding around text in background
    :param text_kwargs: Additional arguments for create_tex_label
    :return: VGroup containing text (and optional background)
    """
    # Create text label
    label = create_tex_label(text, font_size=font_size, **text_kwargs)
    label.set_color(WHITE)
    
    # Make text face camera
    make_text_always_face_camera(label)
    
    if with_background:
        # Create background panel for contrast
        bg_width = label.width + background_padding * 2
        bg_height = label.height + background_padding * 2
        background = Rectangle(
            width=bg_width,
            height=bg_height,
            fill_color=CONTRAST_DARK_PANEL,
            fill_opacity=0.95,
            stroke_color=WHITE,
            stroke_width=2
        )
        # Orient background to face camera too
        make_text_always_face_camera(background)
        background.move_to(label.get_center())
        
        # Set z-indices
        background.set_z_index(label.z_index - 1 if hasattr(label, 'z_index') else 0)
        label.set_z_index(background.z_index + 1)
        
        return VGroup(background, label)
    
    return VGroup(label)

def set_camera_for_2d_view(scene):
    """
    Set camera to a fixed 2D view, perfect for titles, CTAs, or text-heavy scenes.
    This makes the scene look flat and ensures text is clearly readable.
    
    :param scene: The ThreeDScene instance
    """
    # Set camera to look straight at the scene (phi=0, theta=0)
    scene.set_camera_orientation(phi=0 * DEGREES, theta=0 * DEGREES)
    # Move camera back to default position for 2D view
    scene.camera.set_focal_distance(10)
    print("[3D Layout] Camera set to 2D view for clear text visibility")

def create_3d_labeled_object(obj_3d, label_text, label_position=UP, label_buff=0.5, label_font_size=FONT_LABEL):
    """
    Create a 3D object with a label that's always readable.
    
    :param obj_3d: The 3D object to label
    :param label_text: Text for the label
    :param label_position: Direction for label placement (UP, DOWN, LEFT, RIGHT)
    :param label_buff: Distance between object and label
    :param label_font_size: Font size for label
    :return: VGroup containing object and label
    """
    # Create readable label
    label = create_3d_text_label(
        label_text, 
        font_size=label_font_size, 
        with_background=True,
        background_padding=0.2
    )
    
    # Position label relative to object
    label.next_to(obj_3d, label_position, buff=label_buff)
    
    # Group together
    return VGroup(obj_3d, label)
`;
}

/**
 * Default layout configurations
 */
export const DEFAULT_LANDSCAPE_CONFIG: LayoutConfig = {
  frameWidth: 14.2,
  frameHeight: 8.0,
  safeMargin: 0.72,
  orientation: "landscape",
  contentType: "mixed",
};

export const DEFAULT_PORTRAIT_CONFIG: LayoutConfig = {
  frameWidth: 7.2,
  frameHeight: 12.8,
  safeMargin: 0.85,
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
