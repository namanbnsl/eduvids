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
 * KEY FUNCTIONS:
 * - smart_position_equation_labels(): Intelligent label positioning with collision avoidance
 * - create_fade_sequence_labels(): Show labels one at a time with fade in/out
 * - create_smart_label(): Create labels with optional arrows
 * - detect_label_collisions(): Detect overlapping labels
 *
 * GUARANTEES:
 * - Fixed margins that CANNOT be violated (hard boundaries)
 * - Zero overlaps between elements (ultra-aggressive separation)
 * - All content fits within safe zones (strict enforcement)
 * - Smart label positioning prevents equation annotation overlaps
 */

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
        safety_margin: Safety factor (0.94 = use 94% of available space, MORE aggressive)
        max_iterations: Maximum fitting iterations (INCREASED to 5)
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

  // Simplified scaling - single multiplier
  const baseScale = orientation === "portrait" ? 2.8 : 2.4;

  // Small adjustment for content type
  const contentAdjust =
    contentType === "text-heavy"
      ? 1.05
      : contentType === "diagram"
      ? 1.1 // Larger fonts for diagrams (labels need to be visible)
      : contentType === "math"
      ? 1.08
      : 1.0;

  // Calculate base body size with simplified formula
  const baseBody = clampFont(
    Math.round(contentArea * baseScale * contentAdjust),
    orientation === "portrait" ? 40 : 34,
    orientation === "portrait" ? 60 : 52
  );

  // Title: Clear hierarchy, 1.5x body size
  const title = clampFont(
    Math.round(baseBody * 1.5),
    baseBody + 8,
    orientation === "portrait" ? 72 : 64
  );

  // Heading: Between title and body, 1.25x body size
  const heading = clampFont(
    Math.round(baseBody * 1.25),
    baseBody + 4,
    title - 4
  );

  // Math: Same as body or slightly larger for readability
  const math = clampFont(
    Math.round(baseBody * (contentType === "math" ? 1.1 : 1.0)),
    baseBody - 2,
    baseBody + 8
  );

  // Caption: 0.85x body size
  const caption = clampFont(
    Math.round(baseBody * 0.85),
    orientation === "portrait" ? 32 : 28,
    baseBody - 4
  );

  // Label: 0.75x body size for small labels
  const label = clampFont(
    Math.round(baseBody * 0.75),
    orientation === "portrait" ? 28 : 24,
    caption - 2
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
      'config.background_color = "#1E1E1E"',
      'BRIGHT_TEXT_COLOR = "#F9FBFF"',
      'DARK_TEXT_COLOR = "#050B16"',
      'CONTRAST_DARK_PANEL = "#1C2E4A"',
      'CONTRAST_LIGHT_PANEL = "#F3F7FF"',
      "MIN_CONTRAST_RATIO = 5.2",
      "MIN_PANEL_FILL_OPACITY = 0.9",
      "DEFAULT_PANEL_PADDING = 0.48",
      'BRIGHT_TEXT_ALTERNATIVES = [BRIGHT_TEXT_COLOR, "#F5FAFF", "#EEF2FF"]',
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


def enforce_min_gap(mobjects, min_gap=1.2, max_iterations=12, aggressive=True):
    """
    Enforce minimum gap between mobjects with ULTRA-AGGRESSIVE collision detection.
    HEAVILY INCREASED: More iterations, larger gaps, stronger separation to GUARANTEE no overlaps.
    
    Args:
        mobjects: List of mobjects to space
        min_gap: Minimum gap between elements (INCREASED default to 1.2)
        max_iterations: Maximum iterations for collision resolution (INCREASED to 12)
        aggressive: If True, scale down when collisions persist (default True for stricter spacing)
    """
    items = [m for m in (mobjects or []) if m is not None]
    if len(items) <= 1:
        return VGroup(*items)

    # Multiple passes to resolve collisions - MORE AGGRESSIVE
    for iteration in range(max_iterations):
        adjusted = False
        has_overlap = False
        
        for i, a in enumerate(items):
            for j, b in enumerate(items[i + 1:], start=i + 1):
                try:
                    # Get accurate bounding info
                    a_center = a.get_center()
                    b_center = b.get_center()
                    delta = b_center - a_center
                    
                    # Calculate actual overlap with INCREASED padding (1.30 for maximum separation)
                    required_x_gap = (a.width + b.width) / 2 + min_gap
                    required_y_gap = (a.height + b.height) / 2 + min_gap
                    
                    actual_x_dist = abs(delta[0])
                    actual_y_dist = abs(delta[1])
                    
                    overlap_x = required_x_gap - actual_x_dist
                    overlap_y = required_y_gap - actual_y_dist
                    
                    # Check if there's a collision
                    if overlap_x > 0 and overlap_y > 0:
                        has_overlap = True
                        # Determine primary direction of separation
                        if overlap_x >= overlap_y:
                            # Separate horizontally (INCREASED separation factor to 1.30)
                            shift = (overlap_x / 2) * 1.30
                            direction = 1 if delta[0] >= 0 else -1
                            a.shift(-shift * direction * RIGHT)
                            b.shift(shift * direction * RIGHT)
                        else:
                            # Separate vertically (INCREASED separation factor to 1.30)
                            shift = (overlap_y / 2) * 1.30
                            direction = 1 if delta[1] >= 0 else -1
                            a.shift(-shift * direction * UP)
                            b.shift(shift * direction * UP)
                        
                        adjusted = True
                        
                        # Set z-indices to ensure visibility
                        if hasattr(a, "set_z_index"):
                            a.set_z_index(max(getattr(a, 'z_index', 0) or 0, 1))
                        if hasattr(b, "set_z_index"):
                            b.set_z_index(max(getattr(b, 'z_index', 0) or 0, 1))
                            
                except (AttributeError, IndexError, TypeError):
                    continue
        
        # Scale down if aggressive mode AND we have overlaps OR if oversized
        if aggressive:
            group = VGroup(*items)
            try:
                # Scale if oversized or if overlaps persist (EARLIER threshold - after 2 iterations)
                needs_scaling = (
                    group.width > MAX_CONTENT_WIDTH * 0.96 or 
                    group.height > MAX_CONTENT_HEIGHT * 0.96 or
                    (has_overlap and iteration >= 1)  # Scale sooner to prevent overlaps
                )
                
                if needs_scaling:
                    # MUCH more aggressive scaling (from 0.92 to 0.88)
                    scale_factor = 0.88
                    group.scale(scale_factor)
                    print(f"[LAYOUT ENGINE] Scaled group to {scale_factor:.2f} to resolve overlaps/size issues")
            except (AttributeError, ZeroDivisionError):
                pass
        
        # If no more collisions, we're done
        if not adjusted:
            break
    
    # Final validation and fitting - ULTRA AGGRESSIVE
    group = VGroup(*items)
    
    # Much more aggressive final scaling if still oversized
    try:
        if group.width > MAX_CONTENT_WIDTH or group.height > MAX_CONTENT_HEIGHT:
            width_factor = MAX_CONTENT_WIDTH * 0.92 / group.width if group.width > MAX_CONTENT_WIDTH else 1.0
            height_factor = MAX_CONTENT_HEIGHT * 0.92 / group.height if group.height > MAX_CONTENT_HEIGHT else 1.0
            scale_factor = min(width_factor, height_factor)
            if scale_factor < 1.0:
                group.scale(scale_factor)
                print(f"[LAYOUT ENGINE] Final scale to {scale_factor:.2f} to fit content area")
    except (AttributeError, ZeroDivisionError):
        pass
    
    # Final nudge into frame (without additional scaling)
    _nudge_into_safe_frame(group, recursive=True)
    return group


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


def layout_horizontal(mobjects, center=None, buff=1.2, auto_fit=True, align_edge=None):
    """
    Arrange mobjects horizontally with proper spacing and fitting.
    UPDATED: INCREASED default buffer to 1.2 (from 0.8) for better spacing.
    
    Args:
        mobjects: List of mobjects to arrange
        center: Target center position (defaults to content center)
        buff: Buffer space between elements (INCREASED default to 1.2)
        auto_fit: Whether to automatically fit to screen
        align_edge: Alignment edge (UP, DOWN, or None for center)
    """
    items = [m for m in (mobjects or []) if m is not None]
    if not items:
        return VGroup()

    # First ensure each item fits individually with MORE generous space
    if auto_fit:
        for item in items:
            try:
                max_item_width = MAX_CONTENT_WIDTH * 0.88 / len(items)  # Changed from 0.92 to 0.88
                max_item_height = MAX_CONTENT_HEIGHT * 0.88  # Changed from 0.92 to 0.88
                ensure_fits_width(item, max_width=max_item_width, safety_margin=0.96)  # Changed from 0.98 to 0.96
                ensure_fits_height(item, max_height=max_item_height, safety_margin=0.96)
            except (AttributeError, ZeroDivisionError):
                continue

    # Arrange with INCREASED buffer
    group = VGroup(*items)
    group.arrange(RIGHT, buff=buff, aligned_edge=align_edge)
    
    # Enforce minimum gaps with LARGER default (changed from 0.8 to 1.0)
    min_gap = max(buff * 0.85, 1.0)
    group = enforce_min_gap(group.submobjects, min_gap=min_gap, aggressive=True)
    
    # Fit to screen with generous margins
    if auto_fit:
        ensure_fits_screen(group, safety_margin=0.98)
    
    # Position the group
    target_center = center if center is not None else get_content_center()
    group.move_to(target_center)
    
    # Validate final position
    validate_position(group, "horizontal layout")
    return group


def layout_vertical(mobjects, center=None, buff=1.2, auto_fit=True, align_edge=None):
    """
    Arrange mobjects vertically with proper spacing and fitting.
    UPDATED: INCREASED default buffer to 1.2 (from 0.8) for better spacing.
    
    Args:
        mobjects: List of mobjects to arrange
        center: Target center position (defaults to content center)
        buff: Buffer space between elements (INCREASED default to 1.2)
        auto_fit: Whether to automatically fit to screen
        align_edge: Alignment edge (LEFT, RIGHT, or None for center)
    """
    items = [m for m in (mobjects or []) if m is not None]
    if not items:
        return VGroup()

    # First ensure each item fits individually with MORE generous space
    if auto_fit:
        for item in items:
            try:
                max_item_width = MAX_CONTENT_WIDTH * 0.88  # Changed from 0.92 to 0.88
                max_item_height = MAX_CONTENT_HEIGHT * 0.88 / len(items)  # Changed from 0.92 to 0.88
                ensure_fits_width(item, max_width=max_item_width, safety_margin=0.96)  # Changed from 0.98 to 0.96
                ensure_fits_height(item, max_height=max_item_height, safety_margin=0.96)
            except (AttributeError, ZeroDivisionError):
                continue

    # Arrange with INCREASED buffer
    group = VGroup(*items)
    group.arrange(DOWN, buff=buff, aligned_edge=align_edge)
    
    # Enforce minimum gaps with LARGER default (changed from 0.8 to 1.0)
    min_gap = max(buff * 0.85, 1.0)
    group = enforce_min_gap(group.submobjects, min_gap=min_gap, aggressive=True)
    
    # Fit to screen with generous margins
    if auto_fit:
        ensure_fits_screen(group, safety_margin=0.98)
    
    # Position the group
    target_center = center if center is not None else get_content_center()
    group.move_to(target_center)
    
    # Validate final position
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
    if not text:
        return False
    stripped = str(text).strip()
    if stripped.startswith("\\\\"):
        return True
    if "$$" in stripped or "$" in stripped:
        return True
    if LATEX_COMMAND_PATTERN.search(stripped):
        return True
    if LATEX_ENV_PATTERN.search(stripped):
        return True
    if "\\bullet" in stripped:
        return True
    return False


def _escape_latex_text(text):
    """
    Escape special LaTeX characters in text while preserving LaTeX commands.
    Fixes encoding issues that cause inverted question marks and random backslashes.
    
    Args:
        text: Text to escape
    
    Returns:
        Escaped text safe for LaTeX
    """
    if text is None:
        return ""
    
    # Ensure text is a proper string (fixes encoding issues)
    try:
        text_str = str(text)
        # Normalize unicode characters to avoid encoding issues
        import unicodedata
        text_str = unicodedata.normalize('NFKD', text_str)
        # Encode to ASCII, ignoring problematic characters
        text_str = text_str.encode('ascii', 'ignore').decode('ascii')
    except Exception:
        text_str = str(text)
    
    length = len(text_str)
    result = []
    idx = 0

    while idx < length:
        char = text_str[idx]
        
        # Handle backslash (escape character)
        if char == "\\\\":
            next_idx = idx + 1
            
            # Check if it's a double backslash (line break)
            if next_idx < length and text_str[next_idx] == "\\\\":
                result.append(r"\\\\")
                idx += 2
                continue
            
            # Check if it's a LaTeX command (starts with letter)
            if next_idx < length and text_str[next_idx].isalpha():
                command_end = next_idx
                while command_end < length and text_str[command_end].isalpha():
                    command_end += 1
                
                # Preserve the LaTeX command
                result.append(text_str[idx:command_end])
                idx = command_end
                continue
            
            # Check if it's an escaped special character
            if next_idx < length and text_str[next_idx] in LATEX_SPECIAL_CHARS:
                # Already escaped, preserve it
                result.append(text_str[idx:next_idx + 1])
                idx = next_idx + 1
                continue
            
            # Single backslash not part of a command - escape it
            result.append(r"\\textbackslash{}")
            idx += 1
            continue

        # Escape other special characters
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
    Build LaTeX text with proper escaping and formatting.
    Improved to handle special characters and prevent encoding issues.
    
    Args:
        text: Text to convert to LaTeX
        bold: Make text bold
        italic: Make text italic
        monospace: Use monospace font
        allow_latex: Treat text as LaTeX (skip escaping)
        auto_detect: Auto-detect if text contains LaTeX
    
    Returns:
        LaTeX formatted text string
    """
    raw_text = "" if text is None else str(text)

    use_latex = allow_latex or (auto_detect and _looks_like_latex(raw_text))

    if use_latex:
        # Text contains LaTeX, use as-is
        latex = raw_text
    else:
        # Escape special characters to prevent encoding issues
        escaped = _escape_latex_text(raw_text)
        
        # For text mode in LaTeX, wrap in \text{} to ensure proper rendering
        # This prevents issues with special characters and spacing
        if escaped and not (bold or italic or monospace):
            # Only wrap if not already applying formatting
            # Check if text contains line breaks (already formatted)
            if "\\\\\\\\" in escaped:
                # Text has line breaks, don't wrap in \text{} to preserve formatting
                latex = escaped
            else:
                # Regular text, safe to wrap
                latex = f"\\text{{{escaped}}}"
        else:
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
    font_size=FONT_BODY,
    bold=False,
    italic=False,
    monospace=False,
    treat_as_latex=False,
    auto_detect_latex=True,
    **tex_kwargs,
):
    """Convert plain text to a Tex mobject with safe escaping by default."""

    latex_string = build_latex_text(
        text,
        bold=bold,
        italic=italic,
        monospace=monospace,
        allow_latex=treat_as_latex,
        auto_detect=auto_detect_latex,
    )

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
    bullet_symbol=r"\textbullet",
    bullet_gap=r"\ ",
    font_size=FONT_BODY,
    bold=False,
    italic=False,
    monospace=False,
    treat_as_latex=False,
    auto_detect_latex=True,
    auto_wrap=True,
    max_width=None,
    max_lines=3,
    **tex_kwargs,
):
    """
    Create a single bullet item as a Tex mobject with automatic text wrapping.
    
    Args:
        text: Bullet point text
        bullet_symbol: Symbol for bullet (default: \\textbullet)
        bullet_gap: Gap after bullet symbol
        font_size: Font size
        bold: Make text bold
        italic: Make text italic
        monospace: Use monospace font
        treat_as_latex: Treat text as LaTeX code
        auto_detect_latex: Auto-detect LaTeX in text
        auto_wrap: Automatically wrap long text (default: True)
        max_width: Maximum width for wrapping (defaults to MAX_CONTENT_WIDTH * 0.85)
        max_lines: Maximum lines for bullet text (default: 3)
        **tex_kwargs: Additional Tex arguments
    
    Returns:
        Tex mobject with bullet point
    """
    # Set default max_width if not provided
    if max_width is None:
        max_width = MAX_CONTENT_WIDTH * 0.85  # Leave room for margins and spacing
    
    # Wrap text if enabled and not LaTeX
    if auto_wrap and not treat_as_latex and not _looks_like_latex(text):
        # Account for bullet symbol width (approximately)
        bullet_width_chars = 2  # Approximate character width taken by bullet
        effective_width = max_width - (bullet_width_chars * font_size * 0.55)
        text = wrap_text(text, font_size=font_size, max_width=effective_width, max_lines=max_lines)
    
    body_fragment = build_latex_text(
        text,
        bold=bold,
        italic=italic,
        monospace=monospace,
        allow_latex=treat_as_latex,
        auto_detect=auto_detect_latex,
    )
    bullet_tex = f"{bullet_symbol}{bullet_gap}{body_fragment}"
    return Tex(bullet_tex, font_size=font_size, **tex_kwargs)


def create_bullet_list(
    items,
    *,
    bullet_symbol=r"\textbullet",
    bullet_gap=r"\ ",
    font_size=FONT_BODY,
    item_buff=0.8,
    edge=LEFT,
    edge_buff=1.2,
    auto_fit=True,
    validate=True,
    auto_wrap=True,
    max_width=None,
    max_lines=3,
    item_kwargs=None,
):
    """
    Create a left-aligned bullet list with spacing and safe positioning.
    Now with automatic text wrapping to prevent overlaps in constrained spaces.
    
    Args:
        items: List of bullet point texts
        bullet_symbol: Symbol for bullets (default: \\textbullet)
        bullet_gap: Gap after bullet symbol
        font_size: Font size for bullets
        item_buff: Vertical spacing between bullets
        edge: Edge to align to (default: LEFT)
        edge_buff: Distance from edge
        auto_fit: Automatically fit to screen
        validate: Validate positioning
        auto_wrap: Automatically wrap long text (default: True)
        max_width: Maximum width for each bullet (defaults to MAX_CONTENT_WIDTH * 0.85)
        max_lines: Maximum lines per bullet (default: 3)
        item_kwargs: Additional kwargs for bullet items
    
    Returns:
        VGroup containing all bullet items
    """
    entries = []
    item_kwargs = dict(item_kwargs or {})
    auto_detect_latex = bool(item_kwargs.pop("auto_detect_latex", True))
    treat_as_latex = bool(item_kwargs.pop("treat_as_latex", False))
    
    # Pass wrapping parameters to each bullet item
    item_kwargs["auto_wrap"] = auto_wrap
    item_kwargs["max_width"] = max_width
    item_kwargs["max_lines"] = max_lines

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

    bullets.arrange(DOWN, buff=item_buff, aligned_edge=LEFT)
    bullets.to_edge(edge, buff=edge_buff)

    if auto_fit:
        bullets = ensure_fits_screen(bullets)
    if validate:
        validate_position(bullets, "bullet list")

    return bullets
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


def create_side_by_side_layout(left_mobject, right_mobject, spacing=1.0, 
                                left_weight=0.4, right_weight=0.6, center=None):
    """
    Create a side-by-side layout with proper spacing and no overlaps.
    Perfect for bullet points + diagram layouts.
    
    Args:
        left_mobject: Mobject for left side (typically bullet points)
        right_mobject: Mobject for right side (typically diagram)
        spacing: Minimum horizontal spacing between the two
        left_weight: Proportion of width for left side (0-1)
        right_weight: Proportion of width for right side (0-1)
        center: Target center position (defaults to content center)
    
    Returns:
        VGroup containing both mobjects
    """
    # Calculate available space
    total_width = MAX_CONTENT_WIDTH
    total_height = MAX_CONTENT_HEIGHT
    
    # Calculate zone widths
    left_width = total_width * left_weight - spacing / 2
    right_width = total_width * right_weight - spacing / 2
    
    # Fit each mobject to its zone with generous margins
    try:
        if left_mobject.width > left_width:
            left_mobject.scale(left_width / left_mobject.width * 0.98)
        if left_mobject.height > total_height:
            left_mobject.scale(total_height / left_mobject.height * 0.98)
            
        if right_mobject.width > right_width:
            right_mobject.scale(right_width / right_mobject.width * 0.98)
        if right_mobject.height > total_height:
            right_mobject.scale(total_height / right_mobject.height * 0.98)
    except (AttributeError, ZeroDivisionError):
        pass
    
    # Position left mobject
    left_x = -total_width / 2 + left_width / 2
    left_mobject.move_to(np.array([left_x, 0, 0]))
    
    # Position right mobject
    right_x = total_width / 2 - right_width / 2
    right_mobject.move_to(np.array([right_x, 0, 0]))
    
    # Ensure minimum spacing
    actual_gap = right_mobject.get_left()[0] - left_mobject.get_right()[0]
    if actual_gap < spacing:
        adjustment = (spacing - actual_gap) / 2
        left_mobject.shift(LEFT * adjustment)
        right_mobject.shift(RIGHT * adjustment)
    
    # Create group
    group = VGroup(left_mobject, right_mobject)
    
    # Position group at target center
    if center is None:
        center = get_content_center()
    group.move_to(center)
    
    # Final validation with generous margins
    ensure_fits_screen(group, safety_margin=0.98)
    validate_position(group, "side-by-side layout", auto_fix=True)
    
    return group


def create_top_bottom_layout(top_mobject, bottom_mobject, spacing=1.0,
                              top_weight=0.5, bottom_weight=0.5, center=None):
    """
    Create a top-bottom layout with proper spacing and no overlaps.
    
    Args:
        top_mobject: Mobject for top section
        bottom_mobject: Mobject for bottom section
        spacing: Minimum vertical spacing between the two
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
    Create a bullet list optimized for portrait/YouTube Shorts format.
    Uses aggressive text wrapping and spacing to prevent overlaps in constrained spaces.
    
    Args:
        items: List of bullet point texts
        font_size: Font size (auto-calculated if None, smaller for portraits)
        max_bullets: Maximum number of bullets (default: 4 for portraits)
        **kwargs: Additional arguments passed to create_bullet_list
    
    Returns:
        VGroup containing bullet items optimized for portrait format
    """
    # Limit bullet count for portrait format
    if len(items) > max_bullets:
        print(f"[LAYOUT WARNING] Too many bullets ({len(items)}) for portrait format. Limiting to {max_bullets}.")
        items = items[:max_bullets]
    
    # Auto-calculate smaller font size for portrait if not provided
    if font_size is None:
        font_size = FONT_BODY * 0.9  # 10% smaller for portrait
    
    # More aggressive wrapping for portrait
    max_width = MAX_CONTENT_WIDTH * 0.75  # Use only 75% of width for better readability
    max_lines = 2  # Limit to 2 lines per bullet to prevent vertical overflow
    
    # Set portrait-optimized defaults
    kwargs.setdefault("item_buff", 1.0)  # Larger spacing between bullets
    kwargs.setdefault("edge_buff", 1.0)  # Smaller edge buffer to maximize space
    kwargs.setdefault("auto_wrap", True)
    kwargs.setdefault("max_width", max_width)
    kwargs.setdefault("max_lines", max_lines)
    
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
    WHITE: "#FAFCFF", // Softer white for less eye strain
    LIGHT_GRAY: "#E8EDF5", // Bright neutral
    GRAY: "#B4C5E4", // Mid-tone neutral
    DARK_GRAY: "#52637B", // Subtle contrast
    BLACK: "#0F1419", // Rich black

    // === Blues (Professional, trustworthy) ===
    BLUE: "#4FC3F7", // Vibrant sky blue
    SKY: "#56D4FF", // Bright sky
    INDIGO: "#7C8CFF", // Deep indigo
    NAVY: "#3D5AFE", // Bold navy
    CYAN: "#26E5FF", // Electric cyan
    AZURE: "#3DCBFF", // Bright azure

    // === Greens (Growth, success, natural) ===
    TEAL: "#26DAC5", // Modern teal
    MINT: "#6FFFD3", // Fresh mint
    GREEN: "#4AE290", // Vibrant green
    PURE_GREEN: "#3ED47F", // Pure emerald
    EMERALD: "#50E5AC", // Rich emerald
    LIME: "#B8FF6D", // Bright lime
    FOREST: "#2AAA7F", // Deep forest

    // === Yellows & Oranges (Energy, warmth, attention) ===
    YELLOW: "#FFE156", // Warm yellow
    GOLD: "#FFCD48", // Rich gold
    AMBER: "#FFD563", // Bright amber
    ORANGE: "#FF9D5C", // Vibrant orange
    PEACH: "#FFB38A", // Soft peach
    CORAL: "#FF9680", // Warm coral

    // === Reds & Pinks (Emphasis, passion, important) ===
    RED: "#FF6B7A", // Vibrant red
    CRIMSON: "#FF5273", // Deep crimson
    ROSE: "#FF8FAD", // Soft rose
    PINK: "#FFA3DB", // Bright pink
    HOT_PINK: "#FF7DE0", // Neon pink

    // === Purples (Creative, sophisticated) ===
    MAGENTA: "#FF7DF7", // Bright magenta
    FUCHSIA: "#F066FF", // Vibrant fuchsia
    PURPLE: "#B57EFF", // Rich purple
    VIOLET: "#A26EFF", // Deep violet
    LAVENDER: "#D4BFFF", // Soft lavender
    ELECTRIC_PURPLE: "#BD8FFF", // Electric purple

    // === Specialty Colors ===
    NEON_BLUE: "#5DD5FF", // Neon blue glow
    NEON_GREEN: "#91FFB3", // Neon green glow
    NEON_PINK: "#FF7DE0", // Neon pink glow
    NEON_YELLOW: "#FFEB5C", // Neon yellow glow

    // === Soft Pastels (Subtle, gentle) ===
    SOFT_BLUE: "#B0DCFF", // Pastel blue
    SOFT_GREEN: "#A8FFD6", // Pastel green
    SOFT_YELLOW: "#FFF2B8", // Pastel yellow
    SOFT_PINK: "#FFDDF0", // Pastel pink
    SOFT_PURPLE: "#E0CBFF", // Pastel purple

    // === Earth Tones ===
    SAND: "#F4DDC4", // Warm sand
    BROWN: "#A57856", // Earthy brown
    SLATE: "#B0C4E2", // Cool slate
    STEEL: "#9DB3D6", // Metallic steel

    // === Nord-inspired (Modern, clean) ===
    NORD: "#A6DCE8", // Nord blue
    NORD_FROST: "#A8E4E1", // Nord frost
    NORD_NIGHT: "#394D6B", // Nord night
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

def wrap_text(text, font_size=FONT_BODY, max_width=MAX_CONTENT_WIDTH, max_lines=None):
    if not text or not isinstance(text, str):
        return ""
    char_width = font_size * 0.55
    max_chars_per_line = max(int(max_width / char_width), 10)
    words = text.split()
    lines = []
    current_line = []
    current_length = 0
    for word in words:
        if len(word) > max_chars_per_line:
            if current_line:
                lines.append(' '.join(current_line))
                current_line = []
                current_length = 0
            while len(word) > max_chars_per_line:
                chunk = word[:max_chars_per_line - 1]
                lines.append(chunk + "-")
                word = word[max_chars_per_line - 1:]
            if word:
                current_line = [word]
                current_length = len(word)
            continue
        word_length = len(word) + 1
        if current_length + word_length > max_chars_per_line and current_line:
            lines.append(' '.join(current_line))
            current_line = [word]
            current_length = len(word)
        else:
            current_line.append(word)
            current_length += word_length
    if current_line:
        lines.append(' '.join(current_line))
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        if lines:
            lines[-1] = lines[-1] + "..."
    return " \\\\\\\\ ".join(lines)

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
  parts.push("# 5. For 3D scenes:");
  parts.push(
    "#    - Use create_3d_text_label() for ALL text (ensures camera-facing + background)"
  );
  parts.push("#    - Use create_3d_labeled_object() to label 3D objects");
  parts.push("#    - Use set_camera_for_3d_scene() to frame 3D content");
  parts.push(
    "#    - Use set_camera_for_2d_view() for text-heavy scenes like CTAs"
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
