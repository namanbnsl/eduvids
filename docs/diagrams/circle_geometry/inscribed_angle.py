# DIAGRAM_SCHEMA: circle_geometry_v1
# DESCRIPTION: Inscribed angle theorem - angle at circumference is half the central angle
# TOPICS: geometry, circle, inscribed angle, central angle, circle theorem

# Create a circle with inscribed and central angles
# Shows that inscribed angle is half the central angle subtending the same arc
circle_diagram = create_circle_geometry(
    radius=2.0,
    points_on_circle=[0, 60, 180],  # Three points: A at 0°, B at 60°, C at 180°
    point_labels=["A", "B", "C"],
    radii=[0, 2],  # Draw radii to points A and C
    central_angle=[0, 2, "2θ"],  # Central angle at center between A and C
    inscribed_angle=[0, 1, 2, "θ"],  # Inscribed angle at B subtending arc A-C
    color=BLUE,
    fill_opacity=0.1,
)

# Animate the diagram
self.play(Create(circle_diagram), run_time=2.0)
self.wait(0.5)
