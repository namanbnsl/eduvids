# DIAGRAM_SCHEMA: triangle_labeled_v1
# DESCRIPTION: Obtuse triangle with all angles labeled - demonstrates interior angle fix
# TOPICS: geometry, triangle, obtuse, angles, interior angle

# Create an obtuse triangle where angle highlighting could previously show reflex angles
# The interior angle fix ensures the smaller (correct) angle arc is always drawn
triangle = create_labeled_triangle(
    vertices=[[-2, -1, 0], [2, -1, 0], [-1, 1.5, 0]],  # Obtuse triangle
    vertex_labels=["A", "B", "C"],
    side_labels=None,
    show_angles=True,
    angle_labels=["110°", "35°", "35°"],
    color=PURPLE,
    fill_opacity=0.25,
)

# Animate the triangle
self.play(Create(triangle), run_time=2.0)
self.wait(0.5)
