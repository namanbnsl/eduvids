# DIAGRAM_SCHEMA: triangle_congruence_v1
# DESCRIPTION: Similar triangles with matching angle marks
# TOPICS: geometry, triangle, similarity, proportions, AA

# Create similar triangles diagram with proportions
triangles = create_triangle_congruence(
    mode="SIMILAR",
    tri1_vertices=[[-5, -1.5, 0], [-2.5, -1.5, 0], [-3.75, 0.5, 0]],
    tri2_vertices=[[1, -1.5, 0], [4.5, -1.5, 0], [2.75, 1.5, 0]],  # Larger triangle
    labels1=["A", "B", "C"],
    labels2=["D", "E", "F"],
    show_proportions=True,
    proportion_labels=["AB : DE = 1 : 1.4", "BC : EF = 1 : 1.4", "CA : FD = 1 : 1.4"],
    color1=BLUE,
    color2=ORANGE,
    fill_opacity=0.2,
)

# Animate the diagram
self.play(Create(triangles), run_time=2.0)
self.wait(0.5)
