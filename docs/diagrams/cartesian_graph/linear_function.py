# DIAGRAM_SCHEMA: cartesian_graph_v1
# DESCRIPTION: Linear function with positive slope (y = 2x + 1)
# TOPICS: linear, slope, y-intercept, algebra

# Create a linear function graph
graph = create_cartesian_graph(
    func=lambda x: 2 * x + 1,
    x_range=(-3, 3, 1),
    y_range=(-5, 7, 1),
    color=GREEN,
    show_labels=True,
    x_label="x",
    y_label="y",
)

# Animate the graph
self.play(Create(graph), run_time=1.5)
self.wait(0.5)
