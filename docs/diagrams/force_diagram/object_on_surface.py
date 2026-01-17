# DIAGRAM_SCHEMA: force_diagram_v1
# DESCRIPTION: Object on a surface with normal force and weight
# TOPICS: physics, forces, normal force, gravity

# Create a free body diagram of an object on a surface
diagram = create_force_diagram(
    object_shape="square",
    object_size=1.2,
    forces=[
        {"direction": "UP", "magnitude": 2.0, "label": "N", "color": GREEN},
        {"direction": "DOWN", "magnitude": 2.0, "label": "mg", "color": RED},
    ],
    show_net_force=False,
    object_color=BLUE,
)

# Animate the diagram
self.play(FadeIn(diagram), run_time=1.5)
self.wait(0.5)

# Add explanation text
explanation = create_label("Forces on a resting object", style="caption")
explanation.next_to(diagram, DOWN, buff=1.0)
self.play(FadeIn(explanation), run_time=0.8)
self.wait(0.5)
