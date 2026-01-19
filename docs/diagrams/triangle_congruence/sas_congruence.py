# DIAGRAM_SCHEMA: triangle_congruence_v1
# DESCRIPTION: SAS (Side-Angle-Side) congruence - two sides and included angle equal
# TOPICS: geometry, triangle, congruence, SAS, proof

# Create SAS congruence diagram with matching marks
triangles = create_triangle_congruence(
    mode="SAS",
    labels1=["A", "B", "C"],
    labels2=["P", "Q", "R"],
    # Default for SAS: side_marks=[(0, 0, 1), (2, 2, 2)], angle_marks=[(0, 0, 1)]
    # Two sides marked, plus the included angle
    color1=BLUE,
    color2=TEAL,
    fill_opacity=0.2,
)

# Animate the diagram
self.play(Create(triangles), run_time=2.0)
self.wait(0.5)
