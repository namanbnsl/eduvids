# DIAGRAM_SCHEMA: cartesian_graph_v1
# DESCRIPTION: Basic quadratic function y = x^2
# TOPICS: functions, quadratic, parabola, math

# Create a quadratic function graph
graph = create_cartesian_graph(
    func=lambda x: x**2,
    x_range=(-3, 3, 1),
    y_range=(0, 9, 1),
    color=BLUE,
    show_labels=True,
    x_label="x",
    y_label="y",
)

# Animate the graph
self.play(Create(graph), run_time=2.0)
self.wait(0.5)
