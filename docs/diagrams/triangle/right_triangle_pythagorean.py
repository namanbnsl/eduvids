# DIAGRAM_SCHEMA: triangle_labeled_v1
# DESCRIPTION: Right triangle with Pythagorean theorem labels
# TOPICS: geometry, pythagorean, right triangle

# Create a right triangle with side labels for Pythagorean theorem
triangle = create_labeled_triangle(
    vertices="right_triangle",
    vertex_labels=["A", "B", "C"],
    side_labels=["a", "b", "c"],
    show_angles=True,
    angle_labels=["", "", "90°"],
    color=BLUE,
    fill_opacity=0.2,
)

# Animate the triangle
self.play(Create(triangle), run_time=2.0)
self.wait(0.5)

# Optionally add the formula below
formula = MathTex(r"a^2 + b^2 = c^2", font_size=FONT_BODY, color=YELLOW)
formula.next_to(triangle, DOWN, buff=1.0)
self.play(Write(formula), run_time=1.0)
self.wait(0.5)
