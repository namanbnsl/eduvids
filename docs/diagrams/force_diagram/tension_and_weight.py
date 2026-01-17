# DIAGRAM_SCHEMA: force_diagram_v1
# DESCRIPTION: Hanging object with tension and weight
# TOPICS: physics, tension, hanging, equilibrium

# Create a free body diagram of a hanging object
diagram = create_force_diagram(
    object_shape="circle",
    object_size=1.0,
    forces=[
        {"direction": "UP", "magnitude": 2.5, "label": "T", "color": YELLOW},
        {"direction": "DOWN", "magnitude": 2.5, "label": "W", "color": RED},
    ],
    show_net_force=False,
    object_color=TEAL,
)

# Animate the diagram
self.play(FadeIn(diagram), run_time=1.5)
self.wait(0.5)
