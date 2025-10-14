# Manim Plugins & Layout - Quick Start Guide

## 🚀 Quick Start (30 seconds)

### Using Layout Helpers

**Before (Manual Positioning - Error Prone)**:
```python
title = Text("My Title", font_size=48)
title.to_edge(UP, buff=0.5)
content = VGroup(...).move_to(ORIGIN)
```

**After (Auto-Layout - Safe)**:
```python
title = Text("My Title", font_size=FONT_TITLE)
title.move_to(get_title_position())

content = VGroup(...)
ensure_fits_screen(content)  # Auto-scale!
content.move_to(get_content_center())
```

### Using Plugins

Just import them - they install automatically:

```python
# Neural networks
from manim_ml.neural_network import NeuralNetwork, FeedForwardLayer

# Physics simulations  
from manim_physics import *

# Data structures
from manim_data_structures import Array, Tree

# Chemistry
from manim_chemistry import ChemWithName

# Slides
from manim_slides import Slide
```

## 📦 Available Plugins

| Plugin | Best For | Key Classes |
|--------|----------|-------------|
| **manim-ml** | AI/ML concepts | `NeuralNetwork`, `FeedForwardLayer` |
| **manim-physics** | Physics sims | `SpaceScene`, `make_rigid_body()` |
| **manim-data-structures** | Algorithms | `Array`, `Tree`, `Graph`, `LinkedList` |
| **manim-chemistry** | Chemistry | `ChemWithName`, molecule structures |
| **manim-slides** | Presentations | `Slide`, `next_slide()` |

## 🎯 Common Patterns

### Pattern 1: Standard Layout

```python
class MyScene(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        
        # Title (auto-positioned)
        title = Text("Topic", font_size=FONT_TITLE)
        title.move_to(get_title_position())
        
        # Content (auto-scaled and positioned)
        content = VGroup(...)
        ensure_fits_screen(content)
        content.move_to(get_content_center())
        
        # Animate
        self.play(FadeIn(title))
        self.play(FadeIn(content))
```

### Pattern 2: Text Wrapping

```python
# Long text? Wrap it!
long_text = create_wrapped_text(
    "This is a very long sentence that would normally overflow",
    font_size=FONT_BODY
)
```

### Pattern 3: Position Validation

```python
# Check if something is in bounds
diagram = create_complex_diagram()
ensure_fits_screen(diagram)
diagram.move_to(get_content_center())
validate_position(diagram, "diagram")  # Prints warning if out of bounds
```

### Pattern 4: Neural Network

```python
from manim_ml.neural_network import NeuralNetwork, FeedForwardLayer

class NNScene(Scene):
    def construct(self):
        nn = NeuralNetwork([
            FeedForwardLayer(3),
            FeedForwardLayer(5),
            FeedForwardLayer(2)
        ])
        ensure_fits_screen(nn)
        self.play(Create(nn))
```

### Pattern 5: Physics Simulation

```python
from manim_physics import *

class PhysicsScene(SpaceScene):  # Must inherit SpaceScene!
    def construct(self):
        ball = Circle(radius=0.5, color=BLUE)
        self.make_rigid_body(ball)  # Physics-enabled
        self.add(ball.shift(UP * 2))
        self.wait(5)
```

### Pattern 6: Data Structures

```python
from manim_data_structures import Array

class ArrayScene(Scene):
    def construct(self):
        arr = Array([1, 2, 3, 4, 5])
        ensure_fits_screen(arr)
        self.play(Create(arr))
        self.play(arr.animate_elem_highlight(2))
```

## ⚙️ Auto-Injected Helpers

These are **automatically available** in every script:

### Constants
- `FRAME_WIDTH`, `FRAME_HEIGHT`
- `MAX_CONTENT_WIDTH`, `MAX_CONTENT_HEIGHT`
- `FONT_TITLE`, `FONT_HEADING`, `FONT_BODY`, `FONT_CAPTION`, `FONT_LABEL`
- `SAFE_MARGIN_TOP/BOTTOM/LEFT/RIGHT`

### Functions
- `get_title_position()` - Where to put titles
- `get_content_center()` - Where to put content
- `ensure_fits_screen(mobject)` - Auto-scale to fit
- `ensure_fits_width(mobject)` - Scale to fit width
- `ensure_fits_height(mobject)` - Scale to fit height
- `validate_position(mobject, label)` - Check if in bounds
- `wrap_text(text, font_size)` - Auto-wrap text
- `create_wrapped_text(text, font_size)` - Create wrapped Text mobject

## 🐛 Debugging

### Content Cut Off?

1. **Add ensure_fits_screen()**:
   ```python
   content = VGroup(...)
   ensure_fits_screen(content)  # ← Add this!
   ```

2. **Use layout helpers**:
   ```python
   # Instead of arbitrary positioning
   content.move_to(get_content_center())  # ← Use this!
   ```

3. **Validate**:
   ```python
   validate_position(content, "my_content")  # ← Check bounds
   ```

### Plugin Not Working?

1. **Check inheritance** (for physics):
   ```python
   class MyScene(SpaceScene):  # ← Must use SpaceScene!
   ```

2. **Check method calls** (for slides):
   ```python
   class MyScene(Slide):  # ← Must use Slide
       def construct(self):
           self.next_slide()  # ← Must call this!
   ```

3. **Check imports**:
   ```python
   from manim_ml.neural_network import NeuralNetwork  # ← Full path
   ```

### Text Too Wide?

```python
# Use auto-wrapping
text = create_wrapped_text("Long text here", FONT_BODY)
```

## 📊 Comparison

### Without System

```python
# Manual, error-prone
title = Text("Title", font_size=48)
title.to_edge(UP, buff=0.5)

content = Text("Long text that might overflow", font_size=36)
content.move_to(ORIGIN)
# Might get cut off! 😱

# No plugins, have to build everything from scratch
# Neural network? Build it manually with Circles and Lines...
```

### With System

```python
# Automatic, safe
title = Text("Title", font_size=FONT_TITLE)
title.move_to(get_title_position())

content = create_wrapped_text("Long text that might overflow", FONT_BODY)
ensure_fits_screen(content)  # Auto-scales!
content.move_to(get_content_center())
# Always fits! ✅

# Plugins available
from manim_ml.neural_network import NeuralNetwork
nn = NeuralNetwork([3, 5, 2])
# Done! 🎉
```

## 🎓 Learning Path

1. **Start with layout helpers**
   - Use `get_title_position()` and `get_content_center()`
   - Always call `ensure_fits_screen()` for complex content
   
2. **Add validation**
   - Use `validate_position()` to debug positioning
   - Check console warnings
   
3. **Explore plugins**
   - Start with manim-data-structures (simplest)
   - Try manim-ml for visual impact
   - Use manim-physics for interactive demos
   
4. **Master text handling**
   - Use `create_wrapped_text()` for long text
   - Use font constants (FONT_TITLE, FONT_BODY, etc.)
   - Keep text width under MAX_CONTENT_WIDTH

## 💡 Pro Tips

1. **Always start with layout helpers** - They handle orientation, margins, scaling
2. **Validate early** - Call validate_position() during development
3. **Use font constants** - They adapt to orientation automatically
4. **Choose the right plugin** - Check "Best For" in docs
5. **Test with shorts** - Portrait mode is stricter, tests your layout

## 📚 Full Documentation

See [MANIM_PLUGINS_AND_LAYOUT.md](./MANIM_PLUGINS_AND_LAYOUT.md) for:
- Complete API reference
- All plugin examples
- Advanced usage patterns
- Troubleshooting guide
- Layout configuration details

## ✅ Checklist

Every animation should:
- [ ] Use `get_title_position()` for titles
- [ ] Use `get_content_center()` for content
- [ ] Call `ensure_fits_screen()` for complex content
- [ ] Use font constants (FONT_TITLE, FONT_BODY, etc.)
- [ ] Validate critical positions with `validate_position()`
- [ ] Follow plugin requirements (inheritance, methods)
- [ ] Test in both landscape and portrait if applicable

## 🔥 Quick Examples

### Minimal Working Example
```python
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService

class QuickDemo(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        
        title = Text("Hello", font_size=FONT_TITLE)
        title.move_to(get_title_position())
        
        content = Text("World", font_size=FONT_BODY)
        content.move_to(get_content_center())
        
        self.play(FadeIn(title))
        self.play(FadeIn(content))
```

### With Plugin
```python
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService
from manim_ml.neural_network import NeuralNetwork, FeedForwardLayer

class PluginDemo(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        
        nn = NeuralNetwork([3, 5, 2])
        ensure_fits_screen(nn)
        nn.move_to(get_content_center())
        
        self.play(Create(nn))
```

---

**That's it!** Start using layout helpers and plugins in your next animation. 🚀
