# Diagram Examples Library

This folder contains verified diagram examples using the diagram schema helpers.

## Purpose

These examples serve as:
1. **Reference implementations** for each diagram type
2. **Templates** that can be copied and adapted
3. **Test cases** for visual validation

## Available Diagram Types

### 2D Diagrams

| Schema | Helper Function | Examples |
|--------|-----------------|----------|
| `cartesian_graph_v1` | `create_cartesian_graph()` | quadratic, sine wave, linear |
| `bar_chart_v1` | `create_bar_chart()` | simple comparison |
| `triangle_labeled_v1` | `create_labeled_triangle()` | pythagorean, equilateral |
| `force_diagram_v1` | `create_force_diagram()` | object on surface, tension |
| `flowchart_v1` | `create_flowchart()` | simple process, decision flow |
| `atom_shells_v1` | `create_atom_diagram()` | carbon, sodium |

### 3D Diagrams

| Schema | Helper Function | Examples |
|--------|-----------------|----------|
| `3d_axes_vector_v1` | `create_3d_axes_vector()` | single vector, basis vectors |

### Illustrations

| Schema | Examples |
|--------|----------|
| `illustration_v1` | sun, moon, star, earth, tree, cloud, water_drop, lightning, heart, firework, cell |

## Usage Pattern

Every diagram example follows this pattern:

```python
# DIAGRAM_SCHEMA: <schema_id>
# DESCRIPTION: Brief description
# TOPICS: comma, separated, tags

# Create the diagram using the helper
diagram = create_<diagram_type>(
    param1=value1,
    param2=value2,
    ...
)

# Animate it
self.play(Create(diagram), run_time=2.0)
self.wait(0.5)
```

## 3D Diagrams

For 3D diagrams, the scene must inherit from `ThreeDScene`:

```python
class MyScene(VoiceoverScene, ThreeDScene):
    def construct(self):
        # ... setup ...
        
        vectors = create_3d_axes_vector(...)
        configure_3d_camera(self, focus=vectors)
        self.play(Create(vectors))
```

## File Structure

```
docs/diagrams/
├── catalog.json              # Index of all examples
├── README.md                 # This file
├── cartesian_graph/
│   ├── quadratic_basic.py
│   ├── sine_wave.py
│   └── linear_function.py
├── bar_chart/
│   └── simple_comparison.py
├── triangle/
│   ├── right_triangle_pythagorean.py
│   └── equilateral_angles.py
├── force_diagram/
│   ├── object_on_surface.py
│   └── tension_and_weight.py
├── flowchart/
│   ├── simple_process.py
│   └── decision_flow.py
├── atom/
│   ├── carbon_atom.py
│   └── sodium_atom.py
├── 3d_vector/
│   ├── single_vector.py
│   └── basis_vectors.py
└── illustrations/
    ├── sun.py
    ├── moon.py
    ├── star.py
    ├── earth.py
    ├── tree.py
    ├── cloud.py
    ├── water_drop.py
    ├── lightning.py
    ├── heart.py
    ├── firework.py
    └── cell.py
```

## Adding New Examples

1. Create a new `.py` file in the appropriate subfolder
2. Add the `DIAGRAM_SCHEMA`, `DESCRIPTION`, and `TOPICS` comment headers
3. Use the corresponding helper function
4. Add an entry to `catalog.json`

## Helper Function Reference

See `src/lib/manim-layout-engine.ts` function `generateDiagramSchemaHelpers()` for the full implementation of each helper.
