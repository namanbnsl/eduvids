# DIAGRAM_SCHEMA: triangle_congruence_v1
# DESCRIPTION: SSS (Side-Side-Side) congruence - all three sides equal
# TOPICS: geometry, triangle, congruence, SSS, proof

# Create SSS congruence diagram with matching tick marks on all sides
triangles = create_triangle_congruence(
    mode="SSS",
    labels1=["A", "B", "C"],
    labels2=["D", "E", "F"],
    # Default side_marks will be [(0, 0, 1), (1, 1, 2), (2, 2, 3)]
    # showing 1 tick on first pair, 2 on second, 3 on third
    color1=BLUE,
    color2=GREEN,
    fill_opacity=0.2,
)

# Animate the diagram
self.play(Create(triangles), run_time=2.0)
self.wait(0.5)
