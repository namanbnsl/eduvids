# Manim Plugin System and Advanced Layout Engine

## Overview

This system provides **automatic plugin installation** and **advanced layout management** for Manim video rendering, eliminating common issues like content cutoff and enabling richer visualizations through plugins.

## Key Features

### 🔌 Automatic Plugin System

- **Zero Configuration**: Plugins are detected from your script and installed automatically
- **Validation**: Ensures plugins are used correctly with comprehensive checks
- **Caching**: Plugins are installed once per sandbox session and reused
- **Graceful Degradation**: If a plugin fails to install, rendering continues without it

### 📐 Advanced Layout Engine

- **Smart Safe Zones**: Dynamic calculation based on orientation and content type
- **Auto-Scaling**: Content automatically fitted to viewport with proper margins
- **Text Wrapping**: Automatic text wrapping helpers to prevent overflow
- **Position Validation**: Runtime checks to ensure content stays visible

## Available Plugins

### 1. manim-ml (Machine Learning)

**Purpose**: Neural network diagrams and ML visualizations

**Import**:
```python
from manim_ml.neural_network import NeuralNetwork, FeedForwardLayer
```

**Example**:
```python
class MLScene(Scene):
    def construct(self):
        nn = NeuralNetwork([
            FeedForwardLayer(3),
            FeedForwardLayer(5), 
            FeedForwardLayer(2)
        ])
        self.play(Create(nn))
```

**Best For**: Neural networks, deep learning, AI concepts

---

### 2. manim-physics (Physics Simulations)

**Purpose**: Physics simulations with rigid bodies, pendulums, and fields

**Import**:
```python
from manim_physics import *
```

**Requirements**: Must inherit from `SpaceScene`, `ElectricFieldScene`, or `MagneticFieldScene`

**Example**:
```python
class PhysicsScene(SpaceScene):
    def construct(self):
        circle = Circle().shift(UP)
        self.add(circle)
        self.make_rigid_body(circle)
        self.play(circle.animate.shift(DOWN * 3))
        self.wait(5)
```

**Best For**: Physics simulations, mechanics, electromagnetism

---

### 3. manim-data-structures (CS Visualizations)

**Purpose**: Visualize data structures like arrays, trees, graphs

**Import**:
```python
from manim_data_structures import *
```

**Example**:
```python
class DSScene(Scene):
    def construct(self):
        arr = Array([1, 2, 3, 4, 5])
        self.play(Create(arr))
        self.play(arr.animate_elem_highlight(2))
```

**Best For**: Algorithms, data structures, CS education

---

### 4. manim-chemistry (Chemical Diagrams)

**Purpose**: Molecular structures and chemical reactions

**Import**:
```python
from manim_chemistry import *
```

**Example**:
```python
class ChemScene(Scene):
    def construct(self):
        molecule = ChemWithName("H2O", "Water")
        self.play(Create(molecule))
```

**Best For**: Chemistry, molecular structures, reactions

---

### 5. manim-slides (Presentation Mode)

**Purpose**: Create structured presentations with slide transitions

**Import**:
```python
from manim_slides import Slide
```

**Requirements**: Inherit from `Slide`, call `next_slide()` between slides

**Example**:
```python
class SlideExample(Slide):
    def construct(self):
        title = Text("Introduction")
        self.play(Write(title))
        self.next_slide()
        
        content = Text("Content here")
        self.play(FadeIn(content))
```

**Best For**: Structured lessons, presentations, step-by-step tutorials

---

## Layout System

### Auto-Injected Helpers

Every script automatically gets these layout helpers injected:

#### Constants

```python
# Frame dimensions
FRAME_WIDTH = 14.2
FRAME_HEIGHT = 8.0

# Safe zone margins (orientation-aware)
SAFE_MARGIN_TOP = 0.55
SAFE_MARGIN_BOTTOM = 0.55
SAFE_MARGIN_LEFT = 0.5
SAFE_MARGIN_RIGHT = 0.5

# Content area
MAX_CONTENT_WIDTH = 13.2
MAX_CONTENT_HEIGHT = 5.65
TITLE_ZONE_HEIGHT = 1.5

# Font sizes (auto-adjusted for orientation)
FONT_TITLE = 40
FONT_HEADING = 32
FONT_BODY = 28
FONT_CAPTION = 24
FONT_LABEL = 20
```

#### Helper Functions

##### `get_title_position()`
Returns the safe position for titles (top with margin).

```python
title = Text("My Title", font_size=FONT_TITLE)
title.move_to(get_title_position())
```

##### `get_content_center()`
Returns the safe center position for content (below title zone).

```python
content = VGroup(...)
content.move_to(get_content_center())
```

##### `ensure_fits_screen(mobject)`
Auto-scales a mobject to fit within safe content area.

```python
diagram = VGroup(...)
ensure_fits_screen(diagram)  # Automatically scales if too large
```

##### `ensure_fits_width(mobject, max_width=MAX_CONTENT_WIDTH)`
Scales mobject to fit within max width.

##### `ensure_fits_height(mobject, max_height=MAX_CONTENT_HEIGHT)`
Scales mobject to fit within max height.

##### `validate_position(mobject, label="object")`
Checks if mobject is within safe bounds, prints warnings if not.

```python
validate_position(text, "title")  # Prints warning if out of bounds
```

##### `wrap_text(text, font_size=FONT_BODY, max_width=MAX_CONTENT_WIDTH)`
Auto-wraps text to fit within width, returns string with newlines.

##### `create_wrapped_text(text, font_size=FONT_BODY, **kwargs)`
Creates a Text mobject with automatic wrapping.

```python
text = create_wrapped_text(
    "This is a very long sentence that will be automatically wrapped",
    font_size=FONT_BODY
)
```

### Usage Pattern

**Standard Pattern** (Use this in all animations):

```python
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService

class MyScene(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        
        # 1. Create title using helper
        title = Text("Topic Name", font_size=FONT_TITLE, color=WHITE)
        title.move_to(get_title_position())
        
        # 2. Create content
        content = VGroup(
            Text("Point 1", font_size=FONT_BODY),
            Text("Point 2", font_size=FONT_BODY),
        ).arrange(DOWN, buff=0.8)
        
        # 3. Ensure it fits
        ensure_fits_screen(content)
        content.move_to(get_content_center())
        
        # 4. Validate (optional but recommended)
        validate_position(content, "content")
        
        # 5. Animate
        self.play(FadeIn(title))
        self.play(FadeIn(content))
```

## How It Works

### Plugin Detection & Installation

1. **Detection**: System scans script for plugin imports
2. **Validation**: Checks that plugins are used correctly (inheritance, method calls)
3. **Installation**: Runs `pip install` for detected plugins in E2B sandbox
4. **Caching**: Tracks installed plugins per sandbox to avoid reinstalling

### Layout Injection

1. **Content Analysis**: Detects content type (text-heavy, diagram, math, mixed)
2. **Config Generation**: Creates layout config based on orientation and content
3. **Code Injection**: Inserts helper functions after imports, before class definition
4. **Safe Zones**: Calculates optimal margins and content areas

### Validation Pipeline

```
Input Script
    ↓
Plugin Detection
    ↓
Plugin Validation → (errors stop here)
    ↓
Plugin Installation → (warnings if fails, continues)
    ↓
Layout Injection
    ↓
Script Enhancement
    ↓
Write to Sandbox
    ↓
Standard Manim Pipeline
```

## Configuration

### Portrait vs Landscape

The system automatically adjusts for orientation:

**Landscape** (default):
- Frame: 14.2 × 8.0
- Larger content area
- Standard font sizes

**Portrait** (shorts):
- Frame: 7.2 × 12.8  
- Tighter horizontal margins
- Slightly smaller fonts
- More vertical space for scrolling content

### Content Types

System detects and optimizes for:

- **text-heavy**: Extra horizontal margins, optimized for reading
- **diagram**: Uniform margins, balanced layout
- **math**: Extra horizontal space for formulas
- **mixed**: Balanced approach (default)

## Best Practices

### ✅ DO

1. **Always use layout helpers** for positioning
   ```python
   title.move_to(get_title_position())
   content.move_to(get_content_center())
   ```

2. **Call ensure_fits_screen()** before displaying complex content
   ```python
   ensure_fits_screen(diagram)
   ```

3. **Use recommended font sizes** from constants
   ```python
   title = Text("Title", font_size=FONT_TITLE)
   body = Text("Body", font_size=FONT_BODY)
   ```

4. **Validate positions** for critical content
   ```python
   validate_position(important_text, "key_concept")
   ```

5. **Use text wrapping** for long content
   ```python
   text = create_wrapped_text("Long text here...")
   ```

### ❌ DON'T

1. **Don't hardcode positions** without helpers
   ```python
   # BAD
   title.move_to(UP * 3.5)
   
   # GOOD
   title.move_to(get_title_position())
   ```

2. **Don't skip ensure_fits_screen()** for large content
   ```python
   # BAD
   huge_diagram = VGroup(...)
   self.play(Create(huge_diagram))  # May overflow!
   
   # GOOD
   huge_diagram = VGroup(...)
   ensure_fits_screen(huge_diagram)
   self.play(Create(huge_diagram))
   ```

3. **Don't ignore plugin requirements**
   ```python
   # BAD - manim-physics without SpaceScene
   from manim_physics import *
   class MyScene(Scene):  # Wrong!
   
   # GOOD
   from manim_physics import *
   class MyScene(SpaceScene):  # Correct!
   ```

4. **Don't create text wider than MAX_CONTENT_WIDTH**
   ```python
   # BAD
   text = Text("Very long text that goes on and on...", font_size=48)
   
   # GOOD
   text = create_wrapped_text("Very long text that goes on and on...", font_size=FONT_BODY)
   ```

## Troubleshooting

### Plugin Not Installing

**Symptom**: Plugin installation fails
**Solution**: 
- Check plugin exists and name is correct
- Check compatibility with manim version
- Script will continue without plugin (warning logged)

### Content Still Cut Off

**Symptom**: Elements still going off-screen
**Solution**:
1. Make sure you're calling `ensure_fits_screen()`
2. Check you're using layout helpers for positioning
3. Validate position with `validate_position()`
4. Consider splitting into multiple animations

### Validation Errors

**Symptom**: Plugin validation fails
**Solution**:
- Check plugin inheritance requirements (e.g., SpaceScene for physics)
- Ensure required methods are called (e.g., next_slide() for slides)
- Follow plugin-specific usage patterns

### Text Overflow

**Symptom**: Text too wide or tall
**Solution**:
1. Use `create_wrapped_text()` for automatic wrapping
2. Or manually split text into VGroup with multiple lines
3. Use appropriate font sizes (FONT_BODY, FONT_CAPTION)
4. Call `ensure_fits_width()` or `ensure_fits_height()`

## Advanced Usage

### Custom Safe Zones

The system calculates safe zones automatically, but you can reference them:

```python
# Custom positioning using safe margins
custom_pos = np.array([
    SAFE_MARGIN_LEFT,
    FRAME_HEIGHT/2 - SAFE_MARGIN_TOP - 1,
    0
])
```

### Content Type Override

Content type is detected automatically, but layout adapts based on your actual usage of helpers.

### Multiple Plugins

You can use multiple plugins in one script:

```python
from manim import *
from manim_voiceover import VoiceoverScene
from manim_ml.neural_network import NeuralNetwork, FeedForwardLayer
from manim_data_structures import Array

class MultiPluginScene(VoiceoverScene):
    def construct(self):
        # Use both plugins
        nn = NeuralNetwork([...])
        arr = Array([1, 2, 3])
```

## API Reference

See:
- `src/lib/manim-plugins.ts` - Plugin registry and validation
- `src/lib/manim-layout-engine.ts` - Layout configuration and helpers
- `src/lib/e2b.ts` - Integration with rendering pipeline

## Examples

### Example 1: Math Formula with Auto-Layout

```python
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService

class FormulaScene(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        
        # Title
        title = Text("Quadratic Formula", font_size=FONT_TITLE)
        title.move_to(get_title_position())
        
        # Formula
        formula = MathTex(
            r"x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}",
            font_size=FONT_BODY * 1.2
        )
        ensure_fits_screen(formula)
        formula.move_to(get_content_center())
        
        self.play(FadeIn(title))
        self.play(Write(formula))
```

### Example 2: Neural Network with Plugin

```python
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService
from manim_ml.neural_network import NeuralNetwork, FeedForwardLayer

class NNScene(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        
        title = Text("Neural Network", font_size=FONT_TITLE)
        title.move_to(get_title_position())
        
        nn = NeuralNetwork([
            FeedForwardLayer(3, node_radius=0.15),
            FeedForwardLayer(5, node_radius=0.15),
            FeedForwardLayer(2, node_radius=0.15)
        ])
        ensure_fits_screen(nn)
        nn.move_to(get_content_center())
        
        self.play(FadeIn(title))
        self.play(Create(nn))
```

### Example 3: Data Structures

```python
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService
from manim_data_structures import Array

class ArrayScene(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        
        title = Text("Array Visualization", font_size=FONT_TITLE)
        title.move_to(get_title_position())
        
        arr = Array([1, 2, 3, 4, 5])
        ensure_fits_screen(arr)
        arr.move_to(get_content_center())
        
        self.play(FadeIn(title))
        self.play(Create(arr))
        self.play(arr.animate_elem_highlight(2))
```

## Future Enhancements

Potential improvements:
- [ ] More plugins (manim-editor, manim-fonts, etc.)
- [ ] Custom plugin registry from config
- [ ] Per-plugin version pinning
- [ ] Layout templates (presentation, tutorial, demonstration)
- [ ] Advanced collision detection
- [ ] Automatic font size optimization
- [ ] Multi-language text wrapping support

## Support

For issues:
1. Check logs for plugin installation errors
2. Verify plugin usage matches requirements
3. Ensure layout helpers are being called
4. Use validate_position() to debug positioning issues

For plugin-specific issues, refer to plugin documentation:
- manim-ml: https://github.com/helblazer811/ManimML
- manim-physics: https://github.com/Matheart/manim-physics
- manim-data-structures: https://github.com/drageelr/manim-data-structures
- manim-chemistry: https://github.com/UnMolDeQuimica/manim-chemistry
- manim-slides: https://github.com/jeertmans/manim-slides
