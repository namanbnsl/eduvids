# DIAGRAM_SCHEMA: triangle_labeled_v1
# DESCRIPTION: Equilateral triangle with angle labels
# TOPICS: geometry, equilateral, angles

# Create an equilateral triangle showing all 60° angles
triangle = create_labeled_triangle(
    vertices="equilateral",
    vertex_labels=["A", "B", "C"],
    side_labels=None,
    show_angles=True,
    angle_labels=["60°", "60°", "60°"],
    color=GREEN,
    fill_opacity=0.25,
)

# Animate the triangle
self.play(Create(triangle), run_time=2.0)
self.wait(0.5)
